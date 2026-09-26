import type { PrIntent, PrIntentResponse, UnifiedDiff } from '@devdigest/shared';
import { INTENT_LIMITS } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import {
  LLM_MAX_RETRIES,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
} from './constants.js';
import { computeConfidence } from './confidence.js';
import { clampClassification, IntentClassification, toIncidentalChanges } from './domain.js';
import { hunksFromFiles, hunksFromRawDiff, type FileHunkHeaders } from './hunks.js';
import {
  extractDocRefs,
  extractIssueRefs,
  extractTicketKeys,
  isPrAddedDoc,
  normalizeRepoPath,
  resolveDocRef,
} from './links.js';
import type { IntentContext, IntentDeps } from './ports.js';
import { buildIntentPrompt, type ClassifierSource } from './prompt.js';
import { deriveRuleRiskAreas, mergeRiskAreas } from './risk-areas.js';

/**
 * Intent service: collect sources (never diff bodies) → fenced classifier
 * prompt → one structured LLM call → evidence-tier confidence → merge risk
 * areas → upsert `pr_intent`. Stored once per PR; a review run reuses the
 * stored row and derives only when none exists (D1/D2).
 */

type EmitFn = (kind: 'info' | 'tool' | 'result' | 'error', msg: string, data?: unknown) => void;
const NOOP_EMIT: EmitFn = () => {};

export interface DeriveOptions {
  /** The run's already-loaded diff — hunk headers when `pr_files` is empty. */
  diff?: UnifiedDiff;
  onEvent?: EmitFn;
}

export interface ForRunInput {
  workspaceId: string;
  prId: string;
  diff?: UnifiedDiff;
}

export interface ForRunResult {
  intent: PrIntent;
  stale: boolean;
}

export class IntentService {
  constructor(private deps: IntentDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const ctx = await this.requireContext(workspaceId, prId);
    return {
      intent: ctx.stored ?? null,
      stale: ctx.stored ? ctx.stored.head_sha !== ctx.pull.headSha : false,
      current_head_sha: ctx.pull.headSha,
    };
  }

  /** Manual path (the card's Derive / Re-derive buttons): always derives. */
  async derive(workspaceId: string, prId: string, opts: DeriveOptions = {}): Promise<PrIntent> {
    const ctx = await this.requireContext(workspaceId, prId);
    return this.runDerive(workspaceId, ctx, opts);
  }

  /**
   * Run path (D1): NEVER throws. Reuses a stored intent (no LLM call); derives
   * only when none is stored. Any failure — no key, LLM error, GitHub error —
   * is fail-open (D9): logs a reason and returns `null` so the review continues
   * without an intent section.
   */
  async forRun(input: ForRunInput, onEvent?: EmitFn): Promise<ForRunResult | null> {
    const emit = onEvent ?? NOOP_EMIT;
    try {
      const ctx = await this.deps.store.context(input.workspaceId, input.prId);
      if (!ctx) {
        emit('info', 'intent skipped: pull request not found');
        return null;
      }
      if (ctx.stored) {
        const stale = ctx.stored.head_sha !== ctx.pull.headSha;
        const shortSha = (ctx.stored.head_sha ?? '?').slice(0, 7);
        emit('result', `intent reused (derived for ${shortSha}${stale ? ', stale' : ''})`);
        return { intent: ctx.stored, stale };
      }
      const intent = await this.runDerive(input.workspaceId, ctx, {
        diff: input.diff,
        onEvent,
      });
      return { intent, stale: false };
    } catch (err) {
      emit('info', `intent skipped: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async requireContext(workspaceId: string, prId: string): Promise<IntentContext> {
    const ctx = await this.deps.store.context(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  private async runDerive(
    workspaceId: string,
    ctx: IntentContext,
    opts: DeriveOptions,
  ): Promise<PrIntent> {
    const { pull, repo, files } = ctx;
    const emit = opts.onEvent ?? NOOP_EMIT;
    const now = this.deps.now ?? Date.now;
    const started = now();
    const repoRef = { owner: repo.owner, name: repo.name };
    const bodyText = pull.body?.trim() ?? '';
    const searchText = `${pull.title}\n${bodyText}\n${pull.branch}`;

    emit('tool', 'Deriving PR intent…');

    let github: Awaited<ReturnType<IntentDeps['github']>> | null = null;
    try {
      github = await this.deps.github();
    } catch {
      github = null;
    }

    const sources: ClassifierSource[] = [];
    sources.push({
      id: 'title',
      kind: 'title',
      ref: 'title',
      status: 'used',
      text: pull.title.slice(0, INTENT_LIMITS.titleChars),
    });
    if (bodyText.length > 0) {
      sources.push({
        id: 'body',
        kind: 'body',
        ref: 'body',
        status: 'used',
        text: bodyText.slice(0, INTENT_LIMITS.bodyChars),
        truncated: bodyText.length > INTENT_LIMITS.bodyChars,
      });
    }

    const [issueSources, docSources] = await Promise.all([
      this.collectIssueSources(pull, repo, repoRef, searchText, github),
      this.collectDocSources(pull, files, repoRef, bodyText, github),
    ]);
    sources.push(...issueSources);
    sources.push(...docSources);

    for (const [i, key] of extractTicketKeys(searchText).entries()) {
      sources.push({ id: `ticket-${i}`, kind: 'ticket', ref: key, status: 'unreachable' });
    }

    // ---- files / hunk headers (D11) ----
    const fileHunks: FileHunkHeaders[] =
      files.length > 0
        ? hunksFromFiles(files)
        : opts.diff
          ? hunksFromRawDiff(opts.diff)
          : [];

    // ---- prompt ----
    const promptResult = buildIntentPrompt(sources, fileHunks);
    const systemPrompt = await this.deps.systemPrompt();
    const sizes = promptResult.sections.map((s) => `${s.label} ${s.chars}`).join(' · ');
    const tokenEstimate = this.deps.tokenizer.count(systemPrompt + promptResult.user);
    emit('info', `intent prompt: ${sizes} · ≈${tokenEstimate} tokens (tokenizer estimate)`);

    const sourceSummary = promptResult.sources
      .map((s) => `${s.kind === 'ticket' ? s.ref : s.kind}${s.via ? ` (${s.via})` : ''} ${s.status}`)
      .join(' · ');
    emit('info', `intent sources: ${sourceSummary}`);

    // ---- classifier call ----
    const choice = await this.deps.resolveModel(workspaceId);
    emit('info', `intent model: ${choice.provider}/${choice.model}`);
    const llm = await this.deps.llm(choice.provider);
    let result;
    try {
      result = await llm.completeStructured<IntentClassification>({
        model: choice.model,
        schema: IntentClassification,
        schemaName: 'IntentClassification',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptResult.user },
        ],
        temperature: LLM_TEMPERATURE,
        maxTokens: LLM_MAX_TOKENS,
        maxRetries: LLM_MAX_RETRIES,
        timeoutMs: LLM_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `The intent model call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const clamped = clampClassification(result.data);
    const ruleAreas = deriveRuleRiskAreas(files);
    const riskAreas = mergeRiskAreas(ruleAreas, clamped.modelRiskAreas);

    const linkedSources = promptResult.sources.filter(
      (s) => s.kind === 'issue' || s.kind === 'doc' || s.kind === 'ticket',
    );
    const confidence = computeConfidence(pull.body, linkedSources);
    // Incidental hunks need a STATED goal to be measured against — with an inferred
    // intent (no body/issue/doc) the goal is a guess, so nothing is marked incidental.
    const incidental =
      confidence.basis === 'documented' ? toIncidentalChanges(result.data, promptResult.hunks) : [];

    const intent: PrIntent = {
      pr_id: pull.id,
      summary: clamped.summary,
      in_scope: clamped.inScope,
      out_of_scope: clamped.outOfScope,
      confidence_tier: confidence.tier,
      basis: confidence.basis,
      missing_context: confidence.missingContext,
      sources: promptResult.sources,
      risk_areas: riskAreas,
      incidental_changes: incidental,
      provider: choice.provider,
      model: result.model || choice.model,
      head_sha: pull.headSha,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      derived_at: new Date(now()).toISOString(),
    };

    await this.deps.store.upsert(pull.id, intent);

    const durationMs = Math.max(0, Math.round(now() - started));
    emit(
      'result',
      `intent derived (${durationMs}ms): tier ${confidence.tier.toUpperCase()} (${confidence.basis}${
        confidence.missingContext ? ', missing context' : ''
      }) · ${clamped.inScope.length} in / ${clamped.outOfScope.length} out · ` +
        `${incidental.length} incidental hunk(s) · ` +
        `${result.tokensIn}→${result.tokensOut} tokens` +
        (result.costUsd != null ? ` · $${result.costUsd.toFixed(4)}` : ''),
    );

    return intent;
  }

  /** D6: GraphQL is authoritative on the default branch; otherwise (or when it
   *  yields nothing) fall back to the regex refs, marked `via: 'regex'`. */
  private async collectIssueSources(
    pull: IntentContext['pull'],
    repo: IntentContext['repo'],
    repoRef: { owner: string; name: string },
    searchText: string,
    github: Awaited<ReturnType<IntentDeps['github']>> | null,
  ): Promise<ClassifierSource[]> {
    const onDefaultBranch = pull.base === repo.defaultBranch;

    interface Candidate {
      ref: string;
      number: number;
      sameRepo: boolean;
      via: 'graphql' | 'regex';
      graphqlText?: string;
    }

    let candidates: Candidate[] = [];
    if (onDefaultBranch && github) {
      try {
        const closing = await github.closingIssues(repoRef, pull.number);
        candidates = closing.map((issue) => ({
          ref: `#${issue.number}`,
          number: issue.number,
          sameRepo: true,
          via: 'graphql',
          graphqlText: `${issue.title}\n\n${issue.body ?? ''}`,
        }));
      } catch {
        candidates = [];
      }
    }
    if (candidates.length === 0) {
      candidates = extractIssueRefs(searchText, repoRef).map((r) => ({
        ref: r.repo ? `${r.repo}#${r.number}` : `#${r.number}`,
        number: r.number,
        sameRepo: r.sameRepo,
        via: 'regex',
      }));
    }

    const slice = candidates.slice(0, INTENT_LIMITS.maxIssues);
    const results = await Promise.allSettled(
      slice.map(async (c, i): Promise<ClassifierSource> => {
        const id = `issue-${i}`;
        if (c.via === 'graphql' && c.graphqlText !== undefined) {
          const text = c.graphqlText.slice(0, INTENT_LIMITS.issueChars);
          return {
            id,
            kind: 'issue',
            ref: c.ref,
            status: 'used',
            via: 'graphql',
            text,
            truncated: c.graphqlText.length > INTENT_LIMITS.issueChars,
          };
        }
        if (!c.sameRepo || !github) {
          return { id, kind: 'issue', ref: c.ref, status: 'unreachable', via: 'regex' };
        }
        try {
          const issue = await github.getIssue(repoRef, c.number);
          const full = `${issue.title}\n\n${issue.body ?? ''}`;
          return {
            id,
            kind: 'issue',
            ref: c.ref,
            status: 'used',
            via: 'regex',
            text: full.slice(0, INTENT_LIMITS.issueChars),
            truncated: full.length > INTENT_LIMITS.issueChars,
          };
        } catch (err) {
          const status = err instanceof AppError && err.statusCode === 404 ? 'not_found' : 'unreachable';
          return { id, kind: 'issue', ref: c.ref, status, via: 'regex' };
        }
      }),
    );
    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }

  /** D4/D5: same-repo docs at the head SHA only; other hosts/repos are unreachable. */
  private async collectDocSources(
    pull: IntentContext['pull'],
    files: IntentContext['files'],
    repoRef: { owner: string; name: string },
    bodyText: string,
    github: Awaited<ReturnType<IntentDeps['github']>> | null,
  ): Promise<ClassifierSource[]> {
    interface Candidate {
      raw: string;
      path: string | null;
      sameRepo: boolean;
      via: 'link' | 'pr_added';
    }

    const candidates: Candidate[] = [];
    for (const raw of extractDocRefs(bodyText)) {
      const resolved = resolveDocRef(raw, repoRef);
      candidates.push({ raw, path: resolved.path, sameRepo: resolved.sameRepo, via: 'link' });
    }
    for (const f of files) {
      if (isPrAddedDoc(f.path)) {
        candidates.push({
          raw: f.path,
          path: normalizeRepoPath(f.path),
          sameRepo: true,
          via: 'pr_added',
        });
      }
    }

    const seen = new Set<string>();
    const deduped = candidates.filter((c) => {
      const key = c.path ?? c.raw;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const slice = deduped.slice(0, INTENT_LIMITS.maxDocs);

    const results = await Promise.allSettled(
      slice.map(async (c, i): Promise<ClassifierSource> => {
        const id = `doc-${i}`;
        const ref = c.path ?? c.raw;
        if (!c.sameRepo || !c.path) {
          return { id, kind: 'doc', ref: c.raw, status: 'unreachable', via: c.via };
        }
        if (github) {
          try {
            const res = await github.getFileContent(repoRef, c.path, pull.headSha);
            if ('status' in res) {
              return { id, kind: 'doc', ref, status: res.status, via: c.via };
            }
            const truncated = res.content.length > INTENT_LIMITS.docChars;
            return {
              id,
              kind: 'doc',
              ref,
              status: 'used',
              via: c.via,
              text: res.content.slice(0, INTENT_LIMITS.docChars),
              truncated,
            };
          } catch {
            return { id, kind: 'doc', ref, status: 'unreachable', via: c.via };
          }
        }
        // No GitHub token: fall back to the clone's checked-out HEAD.
        try {
          const text = await this.deps.git.readFile(repoRef, c.path);
          if (Buffer.byteLength(text, 'utf8') > INTENT_LIMITS.docMaxBytes) {
            return { id, kind: 'doc', ref, status: 'too_large', via: 'clone-head' };
          }
          const truncated = text.length > INTENT_LIMITS.docChars;
          return {
            id,
            kind: 'doc',
            ref,
            status: 'used',
            via: 'clone-head',
            text: text.slice(0, INTENT_LIMITS.docChars),
            truncated,
          };
        } catch {
          return { id, kind: 'doc', ref, status: 'not_found', via: 'clone-head' };
        }
      }),
    );
    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }
}
