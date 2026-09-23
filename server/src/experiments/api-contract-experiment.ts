/**
 * API Contract Reviewer — control experiment "no skills vs 4 skills", in one command.
 *
 *   pnpm experiment:api-contract [--fixture <name>|all] [--runs 3] [--model <id>]
 *
 * For each control PR in `fixtures/api-contract/<name>/` (pr.diff + meta.json +
 * expected.json) it runs the seeded API Contract Reviewer prompt through the same
 * engine call as a studio review (`reviewPullRequest`, single-pass, same task line
 * and skill-block format), N times without skills and N times with the four
 * `docs/skill-samples/api-contract` skills, scores every run against the planted
 * changes and writes `hw/L02/experiment/<name>.md` + `<name>.json`.
 *
 * No DB, no GitHub. The OpenRouter key comes from ~/.devdigest/secrets.json (what the
 * Settings page saves) or OPENROUTER_API_KEY.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { Finding } from '@devdigest/shared';
import { OpenRouterProvider, parseUnifiedDiff, reviewPullRequest } from '@devdigest/reviewer-core';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { API_CONTRACT_REVIEWER_PROMPT } from '../db/seed-prompts.js';
import { skillBlockText, taskLine } from '../modules/reviews/helpers.js';
import { loadConfig } from '../platform/config.js';
import { type ExpectedChange, ExpectedChanges, LINE_SLACK, type ScoredRun, scoreRun } from './score.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const FIXTURES_DIR = join(HERE, 'fixtures/api-contract');
const SKILLS_DIR = join(REPO_ROOT, 'docs/skill-samples/api-contract');
const OUT_DIR = join(REPO_ROOT, 'hw/L02/experiment');

/** Prompt order of the four skills, as bound on the agent's Skills tab. */
const SKILL_NAMES = ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy'];
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

const Meta = z.object({
  title: z.string(),
  author: z.string(),
  description: z.string(),
  source: z.string(),
});
type Meta = z.infer<typeof Meta>;

type Mode = 'no-skills' | '4-skills';
type Skill = { name: string; text: string; tokens: number };
type RunRecord = ScoredRun & {
  mode: Mode;
  run: number;
  verdict: string;
  findings: Pick<Finding, 'severity' | 'title' | 'file' | 'start_line' | 'end_line'>[];
  dropped: number;
  costUsd: number | null;
  seconds: number;
  error?: string;
};

/** A SKILL.md → the prompt block the studio would build for it (frontmatter stripped). */
async function loadSkill(name: string, tokenizer: TiktokenTokenizer): Promise<Skill> {
  const raw = await readFile(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  const text = skillBlockText(name, body);
  return { name, text, tokens: tokenizer.count(text) };
}

async function loadFixture(name: string) {
  const dir = join(FIXTURES_DIR, name);
  const [diffText, meta, expected] = await Promise.all([
    readFile(join(dir, 'pr.diff'), 'utf8'),
    readFile(join(dir, 'meta.json'), 'utf8').then((s) => Meta.parse(JSON.parse(s))),
    readFile(join(dir, 'expected.json'), 'utf8').then((s) => ExpectedChanges.parse(JSON.parse(s))),
  ]);
  return { name, diff: parseUnifiedDiff(diffText), meta, expected };
}

async function runOnce(args: {
  fixture: Awaited<ReturnType<typeof loadFixture>>;
  mode: Mode;
  run: number;
  skills: Skill[];
  llm: OpenRouterProvider;
  model: string;
}): Promise<RunRecord> {
  const { fixture, mode, run, skills, llm, model } = args;
  const started = Date.now();
  const base = { mode, run };
  try {
    const outcome = await reviewPullRequest({
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      model,
      diff: fixture.diff,
      llm,
      strategy: 'single-pass',
      ...(mode === '4-skills' ? { skills: skills.map((s) => s.text) } : {}),
      prDescription: fixture.meta.description,
      task: taskLine({ number: 1, title: fixture.meta.title, author: fixture.meta.author }),
      sessionId: `experiment:${fixture.name}:${mode}:${run}`,
    });
    const findings = outcome.review.findings;
    return {
      ...base,
      ...scoreRun(findings, fixture.expected),
      verdict: outcome.review.verdict,
      findings: findings.map(({ severity, title, file, start_line, end_line }) => ({
        severity,
        title,
        file,
        start_line,
        end_line,
      })),
      dropped: outcome.dropped.length,
      costUsd: outcome.costUsd,
      seconds: (Date.now() - started) / 1000,
    };
  } catch (err) {
    // A failed run is reported as a failed row, not silently dropped from the table.
    return {
      ...base,
      caught: Object.fromEntries(fixture.expected.map((c) => [c.id, false])),
      full: false,
      extra: 0,
      policyMentions: 0,
      verdict: 'error',
      findings: [],
      dropped: 0,
      costUsd: null,
      seconds: (Date.now() - started) / 1000,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const yes = (b: boolean) => (b ? 'yes' : '**no**');
const usd = (n: number | null) => (n == null ? '—' : `$${n.toFixed(4)}`);

function summarise(runs: RunRecord[], mode: Mode, expected: ExpectedChange[]) {
  const rows = runs.filter((r) => r.mode === mode && !r.error);
  const perChange = expected.map((c) => rows.filter((r) => r.caught[c.id]).length);
  const cost = rows.reduce<number | null>(
    (sum, r) => (sum == null || r.costUsd == null ? null : sum + r.costUsd),
    0,
  );
  return {
    ok: rows.length,
    failed: runs.filter((r) => r.mode === mode && r.error).length,
    full: rows.filter((r) => r.full).length,
    perChange,
    extra: rows.reduce((n, r) => n + r.extra, 0),
    policy: rows.reduce((n, r) => n + r.policyMentions, 0),
    avgCost: cost == null || rows.length === 0 ? null : cost / rows.length,
  };
}

function report(args: {
  fixture: Awaited<ReturnType<typeof loadFixture>>;
  runs: RunRecord[];
  skills: Skill[];
  model: string;
  n: number;
  sha: string;
}): string {
  const { fixture, runs, skills, model, n, sha } = args;
  const { expected } = fixture;
  const noSkills = summarise(runs, 'no-skills', expected);
  const withSkills = summarise(runs, '4-skills', expected);
  const out: string[] = [];

  out.push(`# API Contract Reviewer — control PR \`${fixture.name}\``, '');
  out.push(`> Generated by \`pnpm experiment:api-contract --fixture ${fixture.name} --runs ${n}\``);
  out.push(`> (server/). Do not edit by hand — re-run the command.`, '');
  out.push(`- **PR**: "${fixture.meta.title}" — ${fixture.meta.source}`);
  out.push(`- **Fixture**: \`server/src/experiments/fixtures/api-contract/${fixture.name}/\``);
  out.push(`- **Agent prompt**: seeded \`API_CONTRACT_REVIEWER_PROMPT\` · **model**: \`${model}\` · single-pass`);
  out.push(`- **Date**: ${new Date().toISOString().slice(0, 10)} · **commit**: \`${sha}\` · **runs per mode**: ${n}`, '');

  out.push('## Planted changes', '');
  out.push('| id | Change | Covered by skill |', '|---|---|---|');
  for (const c of expected) out.push(`| \`${c.id}\` | ${c.label} | \`${c.skill}\` |`);
  out.push('');

  out.push('## Skill blocks in the prompt (4-skills mode)', '');
  out.push('| Skill | Tokens |', '|---|---|');
  for (const s of skills) out.push(`| \`${s.name}\` | ${s.tokens} |`);
  out.push(`| **total** | **${skills.reduce((n, s) => n + s.tokens, 0)}** |`, '');
  out.push('No-skills mode sends no skills section at all.', '');

  out.push('## Summary', '');
  out.push(`| | no skills | 4 skills |`, '|---|---|---|');
  out.push(`| All planted changes caught | ${noSkills.full}/${noSkills.ok} | ${withSkills.full}/${withSkills.ok} |`);
  expected.forEach((c, i) =>
    out.push(`| caught \`${c.id}\` | ${noSkills.perChange[i]}/${noSkills.ok} | ${withSkills.perChange[i]}/${withSkills.ok} |`),
  );
  out.push(`| Other findings (not a planted change), total | ${noSkills.extra} | ${withSkills.extra} |`);
  out.push(`| Findings mentioning deprecation / semver, total | ${noSkills.policy} | ${withSkills.policy} |`);
  out.push(`| Avg cost per run | ${usd(noSkills.avgCost)} | ${usd(withSkills.avgCost)} |`);
  if (noSkills.failed + withSkills.failed > 0) {
    out.push(`| Failed runs (excluded above) | ${noSkills.failed} | ${withSkills.failed} |`);
  }
  out.push('');

  out.push('## Runs', '');
  out.push(`| Mode | Run | ${expected.map((c) => `\`${c.id}\``).join(' | ')} | Verdict | Findings | Other | Cost | Time |`);
  out.push(`|---|---|${expected.map(() => '---|').join('')}---|---|---|---|---|`);
  for (const r of runs) {
    const cells = expected.map((c) => (r.error ? '—' : yes(r.caught[c.id] ?? false)));
    out.push(
      `| ${r.mode} | ${r.run} | ${cells.join(' | ')} | ${r.verdict} | ${r.findings.length} | ${r.extra} | ${usd(r.costUsd)} | ${r.seconds.toFixed(0)} s |`,
    );
  }
  out.push('');
  out.push(
    'A planted change counts as caught when a grounded finding cites one of its locations',
    `(± ${LINE_SLACK} lines) **and** names it (see \`keywords\` in \`expected.json\`). Findings dropped by the`,
    'citation gate never count. Full finding titles are in the `.json` next to this file.',
  );
  const errors = runs.filter((r) => r.error);
  if (errors.length > 0) {
    out.push('', '## Errors', '');
    for (const r of errors) out.push(`- ${r.mode} run ${r.run}: ${r.error}`);
  }
  return `${out.join('\n')}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string', default: 'all' },
      runs: { type: 'string', default: '3' },
      model: { type: 'string', default: DEFAULT_MODEL },
    },
  });
  const n = Number(values.runs);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);
  const model = values.model!;

  const available = (await readdir(FIXTURES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const names = values.fixture === 'all' ? available : [values.fixture!];
  for (const name of names) {
    if (!available.includes(name)) throw new Error(`Unknown fixture "${name}". Available: ${available.join(', ')}`);
  }

  const key = await new LocalSecretsProvider(loadConfig().secretsPath).get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY is not set (Settings page or server/.env)');
  const llm = new OpenRouterProvider(key);

  const tokenizer = new TiktokenTokenizer();
  const skills = await Promise.all(SKILL_NAMES.map((s) => loadSkill(s, tokenizer)));
  const sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();
  await mkdir(OUT_DIR, { recursive: true });

  for (const name of names) {
    const fixture = await loadFixture(name);
    const runs: RunRecord[] = [];
    for (const mode of ['no-skills', '4-skills'] as const) {
      for (let run = 1; run <= n; run++) {
        const r = await runOnce({ fixture, mode, run, skills, llm, model });
        runs.push(r);
        const caught = fixture.expected.filter((c) => r.caught[c.id]).length;
        console.log(
          `${name} · ${mode} · run ${run}: ${r.error ? `ERROR ${r.error}` : `${caught}/${fixture.expected.length} caught, ${r.extra} other`}`,
        );
      }
    }
    const md = report({ fixture, runs, skills, model, n, sha });
    await writeFile(join(OUT_DIR, `${name}.md`), md);
    await writeFile(
      join(OUT_DIR, `${name}.json`),
      `${JSON.stringify({ fixture: name, model, runsPerMode: n, commit: sha, skills: skills.map(({ name: s, tokens }) => ({ name: s, tokens })), runs }, null, 2)}\n`,
    );
    console.log(`→ hw/L02/experiment/${name}.md`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
