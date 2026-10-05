import type { BlastRadius, BriefMissing, PrBrief, PrBriefResponse, Provider } from '@devdigest/shared';
import { BriefMissing as BriefMissingEnum } from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { extractHunkHeaders, newSideRanges } from '../_shared/hunks.js';
import { extractIssueRefs } from '../_shared/issue-refs.js';
import { fitToBudget } from './budget.js';
import {
  BRIEF_BUDGET,
  BRIEF_INPUT_CAPS,
  LLM_MAX_RETRIES,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  LLM_TRANSPORT_RETRIES,
} from './constants.js';
import { BriefModelAnswer, validateAnswer } from './domain.js';
import type { BriefContext, BriefDeps } from './ports.js';
import { renderBriefPrompt, type BriefBlastInput, type BriefInputs } from './prompt.js';

/**
 * Brief service: read the facts other modules own (never deriving anything) → fit them
 * to the input budget → one structured model call → check the answer against the PR's
 * own files and changed lines → store. One generation per PR runs at a time: a second
 * request joins the running one (the API is one process, so an in-memory map is the
 * whole answer; no database lock). Constructor takes `BriefDeps` only.
 */

/** Why a model call failed — the only detail a caller ever sees (spec NFR-8). */
type FailureReason = 'timeout' | 'rate_limited' | 'rejected' | 'invalid_answer' | 'request_failed';

const REASON_TEXT: Record<FailureReason, string> = {
  timeout: 'the request timed out',
  rate_limited: 'the provider is rate limiting requests',
  rejected: 'the provider rejected the request',
  invalid_answer: 'the answer did not match the expected format',
  request_failed: 'the request failed',
};

function classifyFailure(err: unknown): FailureReason {
  const status = (err as { status?: unknown } | null)?.status;
  const text = err instanceof Error ? `${err.name} ${err.message}` : '';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'rejected';
  if (/timeout|timed out|abort/i.test(text)) return 'timeout';
  if (/schema|validation|zod|json/i.test(text)) return 'invalid_answer';
  return 'request_failed';
}

function providerFailure(provider: Provider, reason: FailureReason): ExternalServiceError {
  return new ExternalServiceError(`The ${provider} model call failed: ${REASON_TEXT[reason]}.`, {
    provider,
    reason,
  });
}

const MISSING_ORDER = new Map<string, number>(BriefMissingEnum.options.map((v, i) => [v, i]));

export class BriefService {
  private inflight = new Map<string, Promise<PrBrief>>();

  constructor(private deps: BriefDeps) {}

  /** The stored brief (or null), `stale`, the current head SHA. No model call. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const ctx = await this.requireContext(workspaceId, prId);
    return {
      brief: ctx.stored ?? null,
      stale: ctx.stored ? ctx.stored.head_sha !== ctx.pull.headSha : false,
      current_head_sha: ctx.pull.headSha,
    };
  }

  /**
   * Generate (or regenerate) the brief for the PR's current head. A request that arrives
   * while one is running for the same PR joins it. The workspace check comes first, so a
   * caller never joins another workspace's promise.
   */
  async generate(workspaceId: string, prId: string): Promise<PrBrief> {
    const ctx = await this.requireContext(workspaceId, prId);
    const running = this.inflight.get(prId);
    if (running) return running;
    const started = this.run(workspaceId, ctx).finally(() => this.inflight.delete(prId));
    this.inflight.set(prId, started);
    return started;
  }

  private async requireContext(workspaceId: string, prId: string): Promise<BriefContext> {
    const ctx = await this.deps.store.context(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  private async run(workspaceId: string, ctx: BriefContext): Promise<PrBrief> {
    const { deps } = this;
    const now = deps.now ?? Date.now;
    const started = now();
    const { pull } = ctx;
    // One log line per generation, written from `finally`: ids and counts only, no text.
    const line: Record<string, unknown> = { prId: pull.id, repoId: pull.repoId, headSha: pull.headSha };
    let outcome: 'ok' | 'failed' = 'failed';
    try {
      const choice = await deps.resolveModel(workspaceId);
      line.provider = choice.provider;
      line.model = choice.model;
      const llm = await this.llmFor(choice.provider);

      const system = await deps.systemPrompt();
      if (deps.tokenizer.count(system) > BRIEF_INPUT_CAPS.systemTokens) {
        throw new ExternalServiceError('The brief system prompt is over its size cap.');
      }

      const { inputs, flags, blastPaths } = await this.collect(workspaceId, ctx);
      const fit = fitToBudget(inputs, system, (text) => deps.tokenizer.count(text));
      line.inputTokens = fit.tokens;
      if (fit.tokens > BRIEF_BUDGET.requestTokens) {
        throw new ExternalServiceError('The brief request does not fit the input budget.');
      }

      const missing = this.missingList(flags, fit.missing, fit.inputs);
      line.missing = missing;

      let result;
      try {
        result = await llm.completeStructured({
          model: choice.model,
          schema: BriefModelAnswer,
          schemaName: 'BriefModelAnswer',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: renderBriefPrompt(fit.inputs) },
          ],
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          maxRetries: LLM_MAX_RETRIES,
          transportRetries: LLM_TRANSPORT_RETRIES,
          timeoutMs: LLM_TIMEOUT_MS,
        });
      } catch (err) {
        if (err instanceof ConfigError) {
          throw new ConfigError(`No API key is configured for ${choice.provider}.`, {
            provider: choice.provider,
          });
        }
        if (err instanceof AppError) throw err;
        throw providerFailure(choice.provider, classifyFailure(err));
      }
      line.attempts = result.attempts;
      line.tokensIn = result.tokensIn;
      line.tokensOut = result.tokensOut;
      line.costUsd = result.costUsd;

      const answer = validateAnswer(result.data, {
        prPaths: new Set(ctx.files.map((f) => f.path)),
        blastPaths,
        rangesByPath: new Map(ctx.files.map((f) => [f.path, newSideRanges(f.patch ?? '')])),
      });
      line.droppedRisks = answer.droppedRisks;
      line.droppedFocus = answer.droppedFocus;

      const brief: PrBrief = {
        summary: answer.summary,
        risks: answer.risks,
        review_focus: answer.review_focus,
        head_sha: pull.headSha,
        generated_at: new Date(now()).toISOString(),
        provider: choice.provider,
        model: result.model || choice.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        missing,
      };
      await deps.store.save(pull.id, brief);
      outcome = 'ok';
      return brief;
    } catch (err) {
      line.errorCode = err instanceof AppError ? err.code : 'internal_error';
      throw err;
    } finally {
      line.durationMs = Math.max(0, Math.round(now() - started));
      deps.log.info({ ...line, outcome }, `pr brief generation ${outcome}`);
    }
  }

  private async llmFor(provider: Provider) {
    try {
      return await this.deps.llm(provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new ConfigError(`No API key is configured for ${provider}.`, { provider });
      }
      if (err instanceof AppError) throw err;
      throw providerFailure(provider, 'request_failed');
    }
  }

  /** Read every input once; a failed read leaves that input out and names it in `missing`. */
  private async collect(
    workspaceId: string,
    ctx: BriefContext,
  ): Promise<{ inputs: BriefInputs; flags: Set<BriefMissing>; blastPaths: Set<string> }> {
    const { pull, files } = ctx;
    const flags = new Set<BriefMissing>();

    const [intentRes, blastRes, documents, issue] = await Promise.all([
      this.deps.intent.get(workspaceId, pull.id).catch(() => null),
      this.deps.blast.forPull(workspaceId, pull.id).catch(() => null),
      this.deps.documents.candidateDocuments(workspaceId, pull.repoId).catch(() => []),
      this.readIssue(ctx),
    ]);

    const stored = intentRes?.intent ?? null;
    if (!stored) flags.add('intent');
    else if (intentRes?.stale) flags.add('intent_stale');

    const blast = blastRes && blastRes.blast.changed_symbols.length > 0 ? blastRes.blast : null;
    if (!blast) flags.add('blast');

    const description = pull.body?.trim() ?? '';
    if (description === '') flags.add('description');
    if (issue === null) flags.add('issue');

    const rows = [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: this.deps.roleOf(f.path),
        headers: f.patch ? extractHunkHeaders(f.patch) : [],
      }));

    return {
      flags,
      blastPaths: blast ? blastPaths(blast) : new Set<string>(),
      inputs: {
        title: pull.title,
        description: description === '' ? undefined : description,
        intent: stored
          ? {
              summary: stored.summary,
              in_scope: stored.in_scope,
              out_of_scope: stored.out_of_scope,
              risk_labels: stored.risk_areas.map((r) => r.label),
            }
          : undefined,
        blast: blast ? blastInput(blast) : undefined,
        files: rows,
        issue: issue ?? undefined,
        documents,
      },
    };
  }

  /**
   * The linked issue as one text: the PR's first closing issue, else the first same-repo
   * `#N` reference of title, description or branch. At most two GitHub requests; any failure
   * (no token, network, not found) is `null`.
   */
  private async readIssue(ctx: BriefContext): Promise<string | null> {
    const { pull, repo } = ctx;
    try {
      const github = await this.deps.github();
      const repoRef = { owner: repo.owner, name: repo.name };
      const closing = await github.closingIssues(repoRef, pull.number).catch(() => []);
      let issue = closing[0];
      if (!issue) {
        const text = `${pull.title}\n${(pull.body ?? '').slice(0, BRIEF_BUDGET.descriptionChars)}\n${pull.branch}`;
        const ref = extractIssueRefs(text, repoRef).find((r) => r.sameRepo);
        if (!ref) return null;
        issue = await github.getIssue(repoRef, ref.number);
      }
      return `${issue.title}\n\n${issue.body ?? ''}`;
    } catch {
      return null;
    }
  }

  /** The service's own flags, the budget's trims and the documents check, in contract order. */
  private missingList(flags: Set<BriefMissing>, trimmed: BriefMissing[], inputs: BriefInputs): BriefMissing[] {
    const all = new Set<BriefMissing>([...flags, ...trimmed]);
    if (inputs.documents.length === 0) all.add('specs');
    if (all.has('intent')) all.delete('intent_stale');
    return [...all].sort((a, b) => MISSING_ORDER.get(a)! - MISSING_ORDER.get(b)!);
  }
}

function blastInput(blast: BlastRadius): BriefBlastInput {
  const unique = (xs: string[]) => [...new Set(xs)];
  return {
    summary: blast.summary,
    symbols: blast.changed_symbols,
    callers: blast.downstream.flatMap((d) =>
      d.callers.map((c) => ({ symbol: d.symbol, name: c.name, file: c.file, line: c.line })),
    ),
    endpoints: unique(blast.downstream.flatMap((d) => d.endpoints_affected)),
    crons: unique(blast.downstream.flatMap((d) => d.crons_affected)),
  };
}

/** Files the blast radius names: changed-symbol files and listed callers' files. */
function blastPaths(blast: BlastRadius): Set<string> {
  return new Set([
    ...blast.changed_symbols.map((s) => s.file),
    ...blast.downstream.flatMap((d) => d.callers.map((c) => c.file)),
  ]);
}
