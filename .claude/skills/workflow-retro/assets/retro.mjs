#!/usr/bin/env node
// Retrospective of an agent-pipeline run, computed from the Claude Code transcripts on disk:
// tokens, cache read, tool calls, duration and parallelism per agent, nested subagents included,
// plus the signals that point at an action (duplicated context, a file worth preloading, an
// overloaded role, too much concurrency).
//
//   node retro.mjs                              the newest session of this project, deep
//   node retro.mjs --session <id|path> ...      these sessions (repeatable)
//   node retro.mjs --plan docs/plans/06-x.md    every session of the project that mentions the plan
//   node retro.mjs --since <ISO> --until <ISO>  only requests inside the window
//   node retro.mjs --shallow                    main session only (what the parent's usage shows)
//   node retro.mjs --json                       the full result as JSON instead of Markdown
//   node retro.mjs --write --label <name> [--action "<text>"]
//                                               also write docs/retros/<date>-<label>.md and append
//                                               one row to docs/retros/ledger.md
//   --projects-dir <dir>  --cwd <dir>  --out-dir <dir>  --prices <file>     (tests, other layouts)
//
// Deep is the default because a parent's usage does not contain its children's: each subagent has
// its own transcript, <session>/subagents/agent-<id>.jsonl, with a .meta.json beside it.
// The transcript format is internal to Claude Code and undocumented: when no usage is found the
// script says so and exits 2 instead of printing zeros.
// Exit 0 ok · 2 nothing to measure / format not recognised · 3 usage.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Thresholds of the signals. A role is overloaded when it is both long and wide.
export const LIMITS = { overloadedRequests: 80, overloadedContext: 200_000, sharedReaders: 3, preloadShare: 0.6, earlyCalls: 6, concurrency: 4 };
const AGENT_TOOLS = ['Agent', 'Task'];
export const LEDGER_HEADER = [
  '| Date | Label | Sessions | Agents (depth) | Requests | Tool calls | Tokens | Cache read | Output | ≈ $ | Wall time | Agent time | Peak parallel | Top action |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];

const slug = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-');
const readLines = (file) =>
  readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });

// File paths a Bash command prints into the context: `cat a b`, `sed -n '1,40p' f`, `head -50 f`.
// Agents here read far more through Bash than through the Read tool, so both count as a read.
export function bashReads(command) {
  const found = [];
  for (const part of String(command).split(/&&|\|\||;|\n/)) {
    const words = (part.split('|')[0].match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^['"]|['"]$/g, ''));
    const at = words.findIndex((w) => ['cat', 'sed', 'head', 'tail', 'nl', 'less'].includes(w));
    if (at < 0 || (words[at] === 'sed' && !words.includes('-n'))) continue;
    for (const word of words.slice(at + 1)) {
      if (word.startsWith('-') || /^\d/.test(word) || /[*?$<>(){}]/.test(word) || /^\d*,?\d*p$/.test(word)) continue;
      if (word.includes('/')) found.push(word);
    }
  }
  return found;
}

const blockSize = (block) => (block.type === 'tool_use' ? JSON.stringify(block.input ?? {}).length : (block.text ?? block.thinking ?? '').length);

// One transcript → one agent record. A response is written as several lines (one per content
// block) that share a requestId and repeat the usage, so usage is taken once per request.
export function readAgent(file, base, window = {}) {
  const requests = new Map();
  const tools = {};
  const toolUseIds = new Set();
  const reads = [];
  let toolCalls = 0;
  let errors = 0;
  let model = null;
  for (const entry of readLines(file)) {
    const at = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
    if (window.since && at < window.since) continue;
    if (window.until && at > window.until) continue;
    if (entry.isApiErrorMessage) errors += 1;
    const message = entry.message;
    if (entry.type !== 'assistant' || !message || typeof message !== 'object') continue;
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type !== 'tool_use' || toolUseIds.has(block.id)) continue;
      toolUseIds.add(block.id);
      toolCalls += 1;
      tools[block.name] = (tools[block.name] ?? 0) + 1;
      if (block.name === 'Read' && typeof block.input?.file_path === 'string') reads.push({ path: block.input.file_path, order: toolCalls });
      if (block.name === 'Bash') for (const path of bashReads(block.input?.command)) reads.push({ path, order: toolCalls });
    }
    const usage = message.usage;
    if (!usage || message.model === '<synthetic>') continue;
    model = message.model ?? model;
    const key = entry.requestId ?? message.id ?? entry.uuid;
    const seen = requests.get(key) ?? { at, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, model: message.model, final: false, chars: 0 };
    // Only the line that carries a stop_reason has the final output count; the others repeat the
    // stream-start value. When a request has no such line, its output is estimated from its text.
    if (message.stop_reason) seen.final = true;
    for (const block of Array.isArray(message.content) ? message.content : []) seen.chars += blockSize(block);
    const max = (field, value) => { seen[field] = Math.max(seen[field], Number(value) || 0); };
    max('input', usage.input_tokens);
    max('output', usage.output_tokens);
    max('cacheRead', usage.cache_read_input_tokens);
    max('cacheWrite', usage.cache_creation_input_tokens);
    max('cacheWrite1h', usage.cache_creation?.ephemeral_1h_input_tokens);
    if (Number.isFinite(at)) seen.at = Math.min(Number.isFinite(seen.at) ? seen.at : at, at);
    requests.set(key, seen);
  }
  const list = [...requests.values()].sort((a, b) => a.at - b.at);
  let estimated = 0;
  for (const r of list) {
    if (r.final) continue;
    const guess = Math.ceil(r.chars / 4);
    if (guess > r.output) { r.output = guess; estimated += 1; }
  }
  const sum = (field) => list.reduce((total, r) => total + r[field], 0);
  const context = (r) => r.input + r.cacheRead + r.cacheWrite;
  // A request that reads nothing from cache although it is not the first one rewrote the context.
  const cold = list.filter((r, index) => index > 0 && context(r) > 20_000 && r.cacheRead < context(r) * 0.1);
  return {
    ...base, file, model, errors, tools, toolCalls, toolUseIds, reads, outputEstimated: estimated,
    requests: list.length,
    input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), cacheWrite1h: sum('cacheWrite1h'),
    firstContext: list.length ? context(list[0]) : 0,
    peakContext: list.reduce((peak, r) => Math.max(peak, context(r)), 0),
    coldRestarts: cold.length, coldTokens: cold.reduce((total, r) => total + r.cacheWrite, 0),
    start: list.length ? list[0].at : NaN, end: list.length ? list[list.length - 1].at : NaN,
  };
}

const total = (a) => a.input + a.output + a.cacheRead + a.cacheWrite;

export function costOf(agent, prices) {
  const key = Object.keys(prices).find((k) => !k.startsWith('$') && (agent.model ?? '').includes(k));
  if (!key) return null;
  const p = prices[key];
  const write5m = agent.cacheWrite - agent.cacheWrite1h;
  return (agent.input * p.input + agent.output * p.output + agent.cacheRead * p.cacheRead + write5m * p.cacheWrite5m + agent.cacheWrite1h * p.cacheWrite1h) / 1e6;
}

// Peak and time-weighted mean number of agents running at once (main sessions excluded).
export function parallelism(agents) {
  const spans = agents.filter((a) => a.depth > 0 && Number.isFinite(a.start) && a.end > a.start);
  const events = spans.flatMap((a) => [{ at: a.start, d: 1, a }, { at: a.end, d: -1, a }]).sort((x, y) => x.at - y.at || x.d - y.d);
  let running = 0, peak = 0, busy = 0, weighted = 0, last = null, peakAt = null;
  const live = new Set();
  let peakSet = [];
  for (const event of events) {
    if (last !== null && running > 0) { busy += event.at - last; weighted += running * (event.at - last); }
    running += event.d;
    if (event.d > 0) live.add(event.a); else live.delete(event.a);
    if (running > peak) { peak = running; peakAt = event.at; peakSet = [...live].map((a) => a.label); }
    last = event.at;
  }
  return { peak, mean: busy ? weighted / busy : 0, busyMs: busy, agentMs: spans.reduce((t, a) => t + (a.end - a.start), 0), peakAt, peakSet };
}

export function signals(agents, cwd) {
  const out = [];
  const rel = (path) => (cwd && isAbsolute(path) && !relative(cwd, path).startsWith('..') ? relative(cwd, path) : path);
  // Only files of the project are actionable; scratch files and images outside it are not.
  const inProject = (path) => !isAbsolute(rel(path)) && !rel(path).startsWith('..');
  const readers = new Map();
  for (const agent of agents) {
    agent.reads = agent.reads.filter((read) => inProject(read.path));
    const counts = new Map();
    for (const read of agent.reads) counts.set(rel(read.path), (counts.get(rel(read.path)) ?? 0) + 1);
    for (const [path, times] of counts) {
      const entry = readers.get(path) ?? { agents: [], repeats: [] };
      entry.agents.push(agent);
      if (times > 1) entry.repeats.push(`${agent.label} ×${times}`);
      readers.set(path, entry);
    }
  }
  const shared = [...readers].filter(([, e]) => e.agents.length >= LIMITS.sharedReaders).sort((a, b) => b[1].agents.length - a[1].agents.length);
  // Preload: most agents of one type open the same file among their first calls.
  const byType = new Map();
  for (const agent of agents.filter((a) => a.depth > 0)) byType.set(agent.type, [...(byType.get(agent.type) ?? []), agent]);
  const preloaded = new Set();
  for (const [type, group] of byType) {
    if (group.length < 2) continue;
    const early = new Map();
    for (const agent of group) {
      for (const path of new Set(agent.reads.filter((r) => r.order <= LIMITS.earlyCalls).map((r) => rel(r.path)))) early.set(path, (early.get(path) ?? 0) + 1);
    }
    for (const [path, n] of [...early].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      if (n / group.length < LIMITS.preloadShare || n < 2) continue;
      preloaded.add(path);
      out.push({ kind: 'preload', weight: n, text: `${n} of ${group.length} \`${type}\` agents read \`${path}\` in their first ${LIMITS.earlyCalls} calls`, action: `Preload it for \`${type}\` (a \`skills:\` entry, or the lines it needs in the prompt or plan) instead of ${n} separate Reads.` });
    }
  }
  for (const [path, entry] of shared.filter(([path]) => !preloaded.has(path)).slice(0, 5)) {
    const types = [...new Set(entry.agents.map((a) => a.type))];
    out.push({ kind: 'duplicate-context', weight: entry.agents.length, text: `\`${path}\` was read by ${entry.agents.length} agents (${types.join(', ')})`, action: 'Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.' });
  }
  for (const [path, entry] of [...readers].filter(([, e]) => e.repeats.length).slice(0, 5)) {
    out.push({ kind: 'duplicate-context', weight: 1, text: `\`${path}\` was read more than once by the same agent: ${entry.repeats.join(', ')}`, action: 'Read a file once; use an offset or `sed -n` for a second look.' });
  }
  for (const agent of agents) {
    if (agent.requests >= LIMITS.overloadedRequests && agent.peakContext >= LIMITS.overloadedContext) {
      out.push({ kind: 'overloaded-role', weight: total(agent), text: `\`${agent.label}\` made ${agent.requests} requests with a context that grew from ${fmt(agent.firstContext)} to ${fmt(agent.peakContext)} tokens (${fmt(total(agent))} in total)`, action: agent.depth === 0 ? 'Start a fresh main session from a short handoff note, and keep reports out of its context.' : 'Split the role: smaller step groups or a narrower task, each in a fresh agent.' });
    }
    if (agent.coldRestarts > 0) {
      out.push({ kind: 'cold-cache', weight: agent.coldTokens, text: `\`${agent.label}\` rewrote its context ${agent.coldRestarts} time(s) after the cache expired (${fmt(agent.coldTokens)} tokens written again)`, action: agent.depth === 0 ? 'After a break longer than the cache lifetime, continue in a new session instead of resuming.' : 'Do not leave a subagent waiting: its cache lives 5 minutes.' });
    }
  }
  const par = parallelism(agents);
  const errors = agents.reduce((n, a) => n + a.errors, 0);
  if (par.peak >= LIMITS.concurrency) {
    out.push({ kind: 'concurrency', weight: errors ? 1e12 : 0, text: `${par.peak} agents ran at once (${par.peakSet.slice(0, 6).join(', ')}${par.peakSet.length > 6 ? ', …' : ''}); ${errors} API error(s) in the run`, action: errors ? 'Reduce concurrency: API errors happened while agents overlapped. Send fewer agents per message.' : 'No errors at this concurrency: keep it. Reduce it only if rate limits or retries appear.' });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

function discover(opts) {
  const projectDir = join(opts.projectsDir, slug(opts.cwd));
  const all = existsSync(projectDir) ? readdirSync(projectDir).filter((f) => f.endsWith('.jsonl')).map((f) => join(projectDir, f)) : [];
  if (opts.sessions.length) {
    return opts.sessions.map((s) => (s.endsWith('.jsonl') ? resolve(s) : join(projectDir, `${s}.jsonl`)));
  }
  if (opts.plan) return all.filter((f) => readFileSync(f, 'utf8').includes(opts.plan));
  return all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 1);
}

export function collect(opts) {
  const files = discover(opts);
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`no such session transcript: ${missing.join(', ')}`);
  const window = { since: opts.since ? Date.parse(opts.since) : null, until: opts.until ? Date.parse(opts.until) : null };
  const agents = [];
  let unread = 0;
  for (const file of files) {
    const id = basename(file, '.jsonl');
    const main = readAgent(file, { id, label: `main:${id.slice(0, 8)}`, type: 'main', description: 'main session', depth: 0, session: id, parent: null }, window);
    agents.push(main);
    const dir = join(dirname(file), id, 'subagents');
    const children = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : [];
    if (opts.shallow) { unread += children.length; continue; }
    for (const child of children) {
      const agentId = basename(child, '.jsonl').replace(/^agent-/, '');
      const metaFile = join(dir, child.replace(/\.jsonl$/, '.meta.json'));
      let meta = {};
      try { meta = JSON.parse(readFileSync(metaFile, 'utf8')); } catch { /* an agent without meta is still counted */ }
      const type = meta.agentType ?? 'unknown';
      agents.push(readAgent(join(dir, child), { id: agentId, label: `${type}:${agentId.slice(-4)}`, type, description: meta.description ?? '', depth: Number(meta.spawnDepth) || 1, session: id, parent: null, toolUseId: meta.toolUseId ?? null }, window));
    }
  }
  // A subagent's parent is the transcript that holds the tool call which started it.
  for (const agent of agents) {
    if (agent.depth === 0) continue;
    const parent = agents.find((a) => a !== agent && agent.toolUseId && a.toolUseIds.has(agent.toolUseId));
    agent.parent = (parent ?? agents.find((a) => a.depth === 0 && a.session === agent.session)).label;
  }
  const measured = agents.filter((a) => a.requests > 0);
  if (measured.length === 0) {
    const error = new Error(files.length ? 'no usage found in the transcripts: empty window, or the transcript format changed.' : `no session transcripts for ${opts.cwd} under ${opts.projectsDir}.`);
    error.code = 2;
    throw error;
  }
  for (const agent of measured) {
    agent.total = total(agent);
    agent.cost = costOf(agent, opts.prices);
    agent.durationMs = agent.end - agent.start;
    const launched = AGENT_TOOLS.reduce((n, tool) => n + (agent.tools[tool] ?? 0), 0);
    agent.launched = launched;
  }
  for (const agent of measured) {
    // Subtree: the agent plus everything it started, at any depth.
    const subtree = (a) => [a, ...measured.filter((c) => c.parent === a.label).flatMap(subtree)];
    const branch = subtree(agent);
    agent.subtreeTotal = branch.reduce((t, a) => t + a.total, 0);
    agent.subtreeAgents = branch.length - 1;
  }
  const sumOf = (field) => measured.reduce((t, a) => t + (a[field] ?? 0), 0);
  const costs = measured.map((a) => a.cost);
  const start = Math.min(...measured.map((a) => a.start));
  const end = Math.max(...measured.map((a) => a.end));
  const par = parallelism(measured);
  const totals = {
    sessions: files.length, agents: measured.filter((a) => a.depth > 0).length, maxDepth: Math.max(...measured.map((a) => a.depth)),
    requests: sumOf('requests'), toolCalls: sumOf('toolCalls'), tokens: sumOf('total'), input: sumOf('input'), output: sumOf('output'),
    cacheRead: sumOf('cacheRead'), cacheWrite: sumOf('cacheWrite'), errors: sumOf('errors'), outputEstimated: sumOf('outputEstimated'),
    cost: costs.every((c) => c !== null) ? costs.reduce((t, c) => t + c, 0) : null, unpriced: measured.filter((a) => a.cost === null).map((a) => a.model),
    start, end, wallMs: end - start, agentMs: par.agentMs,
  };
  totals.cacheReadShare = totals.tokens ? totals.cacheRead / totals.tokens : 0;
  const main = measured.filter((a) => a.depth === 0);
  const children = measured.filter((a) => a.depth > 0);
  totals.mainTokens = main.reduce((t, a) => t + a.total, 0);
  totals.childTokens = children.reduce((t, a) => t + a.total, 0);
  return { mode: opts.shallow ? 'shallow' : 'deep', unread, files, agents: measured, totals, parallel: par, signals: signals(measured, opts.cwd) };
}

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
const time = (ms) => {
  if (!Number.isFinite(ms)) return '—';
  const minutes = Math.round(ms / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : minutes >= 1 ? `${minutes}m` : `${Math.round(ms / 1000)}s`;
};
const money = (c) => (c === null ? '—' : `$${c.toFixed(2)}`);
const pct = (share) => `${Math.round(share * 100)}%`;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export function render(result, label) {
  const { totals: t, parallel: p } = result;
  const lines = [`# Workflow retro: ${label}`, ''];
  lines.push(`Run: ${new Date(t.start).toISOString()} → ${new Date(t.end).toISOString()} · mode: ${result.mode} · sessions: ${result.files.map((f) => basename(f, '.jsonl').slice(0, 8)).join(', ')}`);
  if (result.mode === 'shallow') lines.push('', `> Shallow: ${result.unread} subagent transcript(s) were NOT read, so their tokens are missing below. Run without \`--shallow\` for the real total.`);
  lines.push('', '## Totals', '', '| Tokens | Cache read | Cache write | Input | Output | Requests | Tool calls | ≈ $ | Wall time | Agent time | Agents (max depth) | API errors |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  lines.push(`| ${fmt(t.tokens)} | ${fmt(t.cacheRead)} (${pct(t.cacheReadShare)}) | ${fmt(t.cacheWrite)} | ${fmt(t.input)} | ${fmt(t.output)} | ${t.requests} | ${t.toolCalls} | ${money(t.cost)} | ${time(t.wallMs)} | ${time(t.agentMs)} | ${t.agents} (${t.maxDepth}) | ${t.errors} |`);
  lines.push('', `Main session(s): ${fmt(t.mainTokens)} · subagents: ${fmt(t.childTokens)} (${pct(t.tokens ? t.childTokens / t.tokens : 0)} of the run; a parent's own usage does not show them).`);
  if (t.outputEstimated) lines.push(`Output of ${t.outputEstimated} of ${t.requests} requests is estimated from the length of the response (text ÷ 4): the transcript kept only their stream-start count. Input and cache numbers are exact.`);
  if (t.unpriced.length) lines.push(`No price for: ${[...new Set(t.unpriced)].join(', ')} — the dollar total is left out (\`assets/prices.json\`).`);
  lines.push('', '## Parallelism', '', `Peak: ${p.peak} agents at once${p.peak ? ` at ${new Date(p.peakAt).toISOString()} (${p.peakSet.join(', ')})` : ''} · mean while any agent ran: ${p.mean.toFixed(1)} · agent time ${time(p.agentMs)} inside ${time(p.busyMs)} of wall time.`);

  const byType = new Map();
  for (const a of result.agents) {
    const row = byType.get(a.type) ?? { n: 0, requests: 0, toolCalls: 0, total: 0, cacheRead: 0, output: 0, cost: 0, priced: true, ms: 0, peak: 0 };
    row.n += 1; row.requests += a.requests; row.toolCalls += a.toolCalls; row.total += a.total; row.cacheRead += a.cacheRead; row.output += a.output;
    row.ms += a.durationMs; row.peak = Math.max(row.peak, a.peakContext);
    if (a.cost === null) row.priced = false; else row.cost += a.cost;
    byType.set(a.type, row);
  }
  lines.push('', '## By role', '', '| Role | Runs | Requests | Tool calls | Tokens | Share | Cache read | Output | Peak context | Time | ≈ $ |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [type, r] of [...byType].sort((a, b) => b[1].total - a[1].total)) {
    lines.push(`| ${type} | ${r.n} | ${r.requests} | ${r.toolCalls} | ${fmt(r.total)} | ${pct(r.total / t.tokens)} | ${fmt(r.cacheRead)} | ${fmt(r.output)} | ${fmt(r.peak)} | ${time(r.ms)} | ${r.priced ? money(r.cost) : '—'} |`);
  }
  lines.push('', '## By agent', '', '| Agent | Parent | Depth | Model | Requests | Tool calls (top) | Tokens | With children | Cache read | Context first → peak | Time | ≈ $ | Task |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const a of [...result.agents].sort((x, y) => y.total - x.total)) {
    const top = Object.entries(a.tools).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, n]) => `${name} ${n}`).join(', ');
    lines.push(`| ${a.label} | ${a.parent ?? '—'} | ${a.depth} | ${(a.model ?? '—').replace(/^claude-/, '')} | ${a.requests} | ${a.toolCalls}${top ? ` (${top})` : ''} | ${fmt(a.total)} | ${a.subtreeAgents ? `${fmt(a.subtreeTotal)} (+${a.subtreeAgents})` : '—'} | ${fmt(a.cacheRead)} | ${fmt(a.firstContext)} → ${fmt(a.peakContext)} | ${time(a.durationMs)} | ${money(a.cost)} | ${(a.description || '').replace(/\|/g, '/').slice(0, 60)} |`);
  }
  lines.push('', '## Signals', '');
  if (result.signals.length === 0) lines.push('None found by the script.');
  for (const s of result.signals) lines.push(`- **${s.kind}** — ${s.text}. → ${s.action}`);
  lines.push('', '## Actions', '', '<!-- workflow-retro: replace this block with 3–5 concrete actions (file or agent · what to change · expected effect), taken from the signals above. -->', '');
  return lines.join('\n');
}

export function ledgerRow(result, label, action) {
  const { totals: t, parallel: p } = result;
  const top = (action ?? (result.signals[0] ? `${result.signals[0].kind}: ${result.signals[0].action}` : 'none')).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const sessions = result.files.map((f) => basename(f, '.jsonl').slice(0, 8)).join(' ');
  return `| ${day(t.start)} | ${label} | ${sessions} | ${t.agents} (${t.maxDepth}) | ${t.requests} | ${t.toolCalls} | ${fmt(t.tokens)} | ${pct(t.cacheReadShare)} | ${fmt(t.output)} | ${money(t.cost)} | ${time(t.wallMs)} | ${time(t.agentMs)} | ${p.peak} | ${top} |`;
}

export function write(result, label, action, outDir) {
  mkdirSync(outDir, { recursive: true });
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'run';
  const report = join(outDir, `${day(result.totals.start)}-${name}.md`);
  writeFileSync(report, render(result, label));
  const ledger = join(outDir, 'ledger.md');
  if (!existsSync(ledger)) {
    writeFileSync(ledger, ['# Retro ledger', '', 'One row per pipeline run, appended by the `workflow-retro` skill (`retro.mjs --write`). Read it top to bottom for the trend; the full report of a run is the file `<date>-<label>.md` beside this one. Dollars are list-price estimates.', '', ...LEDGER_HEADER, ''].join('\n'));
  }
  const row = ledgerRow(result, label, action);
  const existing = readFileSync(ledger, 'utf8');
  const key = row.split('|').slice(1, 4).join('|');
  // The same run and label is written once: a second --write replaces its row (the action may have been refined).
  const kept = existing.split('\n').filter((line) => line.split('|').slice(1, 4).join('|') !== key);
  if (kept.length !== existing.split('\n').length) writeFileSync(ledger, `${kept.join('\n').replace(/\n+$/, '')}\n${row}\n`);
  else appendFileSync(ledger, `${existing.endsWith('\n') ? '' : '\n'}${row}\n`);
  return { report, ledger, row };
}

function main(argv) {
  const many = (flag) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1]] : []));
  const one = (flag) => many(flag)[0] ?? null;
  const here = dirname(fileURLToPath(import.meta.url));
  const cwd = resolve(one('--cwd') ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  let prices = {};
  try { prices = JSON.parse(readFileSync(one('--prices') ?? join(here, 'prices.json'), 'utf8')); } catch { /* no prices: no dollars */ }
  const opts = { cwd, projectsDir: resolve(one('--projects-dir') ?? join(homedir(), '.claude', 'projects')), sessions: many('--session'), plan: one('--plan'), since: one('--since'), until: one('--until'), shallow: argv.includes('--shallow'), prices };
  for (const stamp of [opts.since, opts.until]) {
    if (stamp && Number.isNaN(Date.parse(stamp))) { process.stderr.write(`retro: "${stamp}" is not a date (use ISO, e.g. 2026-10-04T12:00:00Z).\n`); process.exit(3); }
  }
  let result;
  try { result = collect(opts); } catch (error) { process.stderr.write(`retro: ${error.message}\n`); process.exit(error.code === 2 ? 2 : 3); }
  const label = one('--label') ?? (opts.plan ? basename(opts.plan, '.md') : `session-${basename(result.files[0], '.jsonl').slice(0, 8)}`);
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, (key, value) => (value instanceof Set ? undefined : key === 'reads' ? undefined : value), 2)}\n`);
  } else process.stdout.write(`${render(result, label)}\n`);
  if (argv.includes('--write')) {
    const done = write(result, label, one('--action'), resolve(one('--out-dir') ?? join(cwd, 'docs', 'retros')));
    process.stderr.write(`retro: wrote ${relative(cwd, done.report)} and one row in ${relative(cwd, done.ledger)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
