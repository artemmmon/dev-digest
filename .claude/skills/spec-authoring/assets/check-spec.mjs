#!/usr/bin/env node
// Mechanical check of a feature spec against the spec-authoring skill's template and rules.
// It checks form only (header, sections, ids, EARS shape, traceability, provenance tags);
// whether a requirement is the right one is a human's call.
//
//   node check-spec.mjs                  every spec with a `Spec ID:` line in the spec folders
//   node check-spec.mjs <spec.md> ...    the given specs
//   node check-spec.mjs --root <dir>     scan another checkout (tests)
//   node check-spec.mjs --hook           PostToolUse hook: reads the payload on stdin, checks the
//                                        written spec, exit 2 with the errors on stderr
//
// Exit 0 = no errors (warnings allowed), 1 = errors, 2 = errors in hook mode.
// Legacy specs (no `Spec ID:` line) and folder README.md files are skipped.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', 'mcp'];
const STATUSES = ['draft', 'approved', 'implemented'];
const SECTIONS = [
  'Problem and user',
  'Goals / Non-goals',
  'User stories',
  'Workflow and module interactions',
  'Acceptance criteria (EARS)',
  'Edge cases',
  'Non-functional requirements',
  'Inputs and provenance',
  'Untrusted inputs',
  'Open questions',
];
const HEADER_FIELDS = ['Spec ID', 'Status', 'Supersedes', 'Packages', 'Sources'];

const ITEM = /^\s*(?:[-*]\s+)?\**(US|AC|EC|NFR|OQ)-(\d+)\**\s*(.*)$/;
const EARS =
  /^(?:WHERE .+?, )?(?:WHILE .+?, )?(?:WHEN .+?, |IF .+?, THEN )?[Tt]he \S.*? shall \S/;
const LOWERCASE_KEYWORD = /^(?:When|While|If|Where)\b/;
const STORY = /^As an? .+?, I want .+?, so that .+/;
const PROVENANCE = /\[(?:reused: [^\]]+|deterministic: [^\]]+|new: \d+ LLM calls?)\]/g;
const VAGUE =
  /\b(fast|quick|quickly|slow|user-friendly|friendly|appropriate|appropriately|easy|easily|simple|intuitive|efficient|efficiently|reasonable|seamless|robust|properly|correctly|as needed|if possible|etc)\b/i;
const CODE_PATH = /(?:^|[\s`(])((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|json|css))\b/;

const isNone = (lines) => lines.map((l) => l.text.trim()).filter(Boolean).join(' ') === 'None.';

// Splits the body into sections and drops fenced code (Mermaid diagrams, field lists).
function parse(text) {
  const lines = text.split('\n').map((raw, index) => ({ text: raw, line: index + 1 }));
  const header = [];
  const sections = [];
  let current = null;
  let fenced = false;
  for (const entry of lines) {
    if (/^\s*```/.test(entry.text)) {
      fenced = !fenced;
      if (current) current.hasContent = true;
      continue;
    }
    if (fenced) continue;
    const heading = /^## (.+?)\s*$/.exec(entry.text);
    if (heading) {
      current = { name: heading[1], line: entry.line, lines: [], hasContent: false };
      sections.push(current);
    } else if (current) {
      current.lines.push(entry);
      if (entry.text.trim() !== '') current.hasContent = true;
    } else {
      header.push(entry);
    }
  }
  return { header, sections };
}

// Items of one kind in a section; wrapped lines are joined to the item they continue.
function items(section, kind) {
  const found = [];
  let open = null;
  for (const entry of section.lines) {
    const match = ITEM.exec(entry.text);
    if (match) {
      open = { kind: match[1], n: Number(match[2]), id: `${match[1]}-${match[2]}`, rest: match[3], line: entry.line };
      found.push(open);
    } else if (open && entry.text.trim() !== '' && !entry.text.trim().startsWith('|')) {
      open.rest += ` ${entry.text.trim()}`;
    } else {
      open = null;
    }
  }
  return found.filter((item) => item.kind === kind);
}

function tableRows(section) {
  const rows = section.lines.filter((l) => l.text.trim().startsWith('|'));
  return rows
    .map((l) => ({ line: l.line, cells: l.text.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()) }))
    .filter((row, index) => index > 0 && !row.cells.every((c) => /^:?-+:?$/.test(c)));
}

const refs = (text, kind) => [...text.matchAll(new RegExp(`${kind}-(\\d+)`, 'g'))].map((m) => `${kind}-${m[1]}`);

export function checkSpec(text, fileName) {
  const problems = [];
  const error = (line, message) => problems.push({ level: 'error', line, message });
  const warning = (line, message) => problems.push({ level: 'warning', line, message });
  const { header, sections } = parse(text);

  // Header
  const title = header[0];
  if (!title || !/^# Spec: \S/.test(title.text)) error(1, 'the first line must be "# Spec: <feature name>".');
  const field = {};
  for (const name of HEADER_FIELDS) {
    const hit = header.find((l) => l.text.startsWith(`${name}:`));
    if (!hit) error(1, `header line "${name}:" is missing.`);
    else if (hit.text.slice(name.length + 1).trim() === '') error(hit.line, `header line "${name}:" is empty.`);
    else field[name] = { value: hit.text.slice(name.length + 1).trim(), line: hit.line };
  }
  const specId = field['Spec ID'] ? /^SPEC-(\d+)$/.exec(field['Spec ID'].value) : null;
  if (field['Spec ID'] && !specId) error(field['Spec ID'].line, 'Spec ID must be "SPEC-NN".');
  if (field.Status && !STATUSES.includes(field.Status.value)) {
    error(field.Status.line, `Status must be one of: ${STATUSES.join(' | ')}.`);
  }
  const name = /^(\d{2,})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(fileName);
  if (!name) error(1, `file name "${fileName}" must be NN-<feature-name>.md in kebab-case.`);
  else if (specId && Number(name[1]) !== Number(specId[1])) {
    error(field['Spec ID'].line, `Spec ID ${field['Spec ID'].value} does not match the file number ${name[1]}.`);
  }

  // Sections: all present, in order, none empty
  const names = sections.map((s) => s.name);
  for (const expected of SECTIONS) {
    if (!names.includes(expected)) error(1, `section "## ${expected}" is missing.`);
  }
  const known = sections.filter((s) => SECTIONS.includes(s.name));
  const order = known.map((s) => SECTIONS.indexOf(s.name));
  if (order.some((position, index) => index > 0 && position < order[index - 1])) {
    error(known[0].line, 'sections are out of order; follow the template.');
  }
  for (const section of sections) {
    if (!SECTIONS.includes(section.name)) error(section.line, `section "## ${section.name}" is not in the template.`);
    if (!section.hasContent) error(section.line, `section "## ${section.name}" is empty; write "None." when it has nothing.`);
  }
  const get = (sectionName) => sections.find((s) => s.name === sectionName);

  const unique = (list) => {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(item.id)) error(item.line, `${item.id} is used twice.`);
      seen.add(item.id);
    }
    return seen;
  };

  // User stories
  const storySection = get('User stories');
  const stories = storySection ? items(storySection, 'US') : [];
  const storyIds = unique(stories);
  if (storySection && stories.length === 0) error(storySection.line, 'no user stories; write "US-1: As a …, I want …, so that …".');
  for (const story of stories) {
    if (!STORY.test(story.rest.replace(/^[:\s]+/, ''))) {
      error(story.line, `${story.id} must read "As a <role>, I want <capability>, so that <benefit>.".`);
    }
  }

  // Acceptance criteria
  const acSection = get('Acceptance criteria (EARS)');
  const criteria = acSection ? items(acSection, 'AC') : [];
  const acIds = unique(criteria);
  if (acSection && criteria.length === 0) error(acSection.line, 'no acceptance criteria.');
  const served = new Set();
  for (const ac of criteria) {
    const head = /^\(([^)]*)\)\s*[:—–-]?\s*(.*)$/.exec(ac.rest);
    if (!head) {
      error(ac.line, `${ac.id} must name the stories it serves: "${ac.id} (US-1): …".`);
      continue;
    }
    const stories_ = refs(head[1], 'US');
    if (stories_.length === 0) error(ac.line, `${ac.id} names no user story.`);
    for (const id of stories_) {
      if (storyIds.has(id)) served.add(id);
      else error(ac.line, `${ac.id} refers to ${id}, which does not exist.`);
    }
    const body = head[2].trim();
    const shalls = body.match(/\bshall\b/gi) ?? [];
    if (shalls.length !== 1) error(ac.line, `${ac.id} has ${shalls.length} "shall"; a criterion has exactly one.`);
    if (LOWERCASE_KEYWORD.test(body)) error(ac.line, `${ac.id}: write the EARS keyword in capitals (WHEN, WHILE, IF … THEN, WHERE).`);
    else if (!EARS.test(body)) {
      error(ac.line, `${ac.id} matches no EARS pattern; clause order is WHERE, WHILE, WHEN or IF … THEN, "the <system> shall <response>".`);
    }
    const response = body.split(/\bshall\b/i)[1] ?? '';
    if (/\band\b/.test(response)) warning(ac.line, `${ac.id}: "and" after "shall" — one response per criterion; split it if these are two.`);
    const vague = VAGUE.exec(body);
    if (vague) warning(ac.line, `${ac.id}: "${vague[1]}" is not checkable; use a concrete value.`);
  }
  for (const story of stories) {
    if (!served.has(story.id)) error(story.line, `${story.id} has no acceptance criterion.`);
  }

  // Edge cases
  const ecSection = get('Edge cases');
  if (ecSection && ecSection.hasContent && !isNone(ecSection.lines)) {
    const cases = items(ecSection, 'EC');
    unique(cases);
    if (cases.length === 0) error(ecSection.line, 'edge cases must be "EC-1: <situation> → <expected behaviour> (AC-n)", or "None.".');
    for (const ec of cases) {
      if (!/→|->/.test(ec.rest)) error(ec.line, `${ec.id} must read "<situation> → <expected behaviour> (AC-n)".`);
      const tail = /\(([^()]*)\)\s*\.?\s*$/.exec(ec.rest);
      const covering = tail ? refs(tail[1], 'AC') : [];
      if (covering.length === 0) error(ec.line, `${ec.id} names no criterion that covers it; add a criterion or an open question.`);
      for (const id of covering) {
        if (!acIds.has(id)) error(ec.line, `${ec.id} refers to ${id}, which does not exist.`);
      }
    }
  }

  // Non-functional requirements
  const nfrSection = get('Non-functional requirements');
  if (nfrSection && nfrSection.hasContent && !isNone(nfrSection.lines)) {
    const nfrs = items(nfrSection, 'NFR');
    unique(nfrs);
    if (nfrs.length === 0) error(nfrSection.line, 'non-functional requirements must be "NFR-1: …", or "None.".');
    for (const nfr of nfrs) {
      const vague = VAGUE.exec(nfr.rest);
      if (vague) warning(nfr.line, `${nfr.id}: "${vague[1]}" is not measurable; use a concrete value.`);
    }
  }

  // Inputs and provenance
  const inputSection = get('Inputs and provenance');
  if (inputSection && inputSection.hasContent && !isNone(inputSection.lines)) {
    const rows = tableRows(inputSection);
    if (rows.length === 0) error(inputSection.line, 'inputs must be a table "Input | Provenance | Notes", or "None.".');
    for (const row of rows) {
      const tags = (row.cells[1] ?? '').match(PROVENANCE) ?? [];
      if (tags.length !== 1) {
        error(row.line, `input "${row.cells[0]}" needs exactly one provenance tag: [reused: …], [deterministic: …] or [new: N LLM call].`);
      } else if (tags[0].startsWith('[new:') && (row.cells[2] ?? '') === '') {
        error(row.line, `input "${row.cells[0]}" is [new: …]; say in Notes why nothing existing can serve.`);
      }
    }
  }

  // Untrusted inputs
  const untrustedSection = get('Untrusted inputs');
  if (untrustedSection && untrustedSection.hasContent && !isNone(untrustedSection.lines)) {
    const rows = tableRows(untrustedSection);
    if (rows.length === 0) error(untrustedSection.line, 'untrusted inputs must be a table "Input | Who controls it | Where it goes | Required handling", or "None.".');
    for (const row of rows) {
      if (row.cells.length < 4 || row.cells.slice(0, 4).some((c) => c === '')) {
        error(row.line, `untrusted input "${row.cells[0]}" needs all four cells filled, the required handling included.`);
      }
    }
  }

  // Open questions
  const oqSection = get('Open questions');
  if (oqSection && oqSection.hasContent && !isNone(oqSection.lines)) {
    const questions = items(oqSection, 'OQ');
    unique(questions);
    if (questions.length === 0) error(oqSection.line, 'open questions must be "OQ-1: <question> — default if unanswered: <assumption>", or "None.".');
    for (const oq of questions) {
      if (!/default if unanswered:\s*\S/.test(oq.rest)) error(oq.line, `${oq.id} needs "— default if unanswered: <assumption>".`);
    }
  }

  // What, not how: no code paths outside the header (Sources may name design files)
  for (const section of sections) {
    for (const entry of section.lines) {
      const path = CODE_PATH.exec(entry.text);
      if (path) error(entry.line, `"${path[1]}" is a code path; a spec names modules and packages, not files.`);
    }
  }

  return problems.sort((a, b) => a.line - b.line);
}

const hasSpecId = (text) => /^Spec ID:/m.test(text);

function specFolders(root) {
  return [join(root, 'specs'), ...PACKAGES.map((p) => join(root, p, 'specs'))].filter(existsSync);
}

function isSpecPath(root, file) {
  const parts = relative(root, file).split(sep);
  const inFolder = (parts.length === 2 && parts[0] === 'specs') || (parts.length === 3 && PACKAGES.includes(parts[0]) && parts[1] === 'specs');
  return inFolder && file.endsWith('.md') && basename(file) !== 'README.md';
}

function allSpecs(root) {
  return specFolders(root).flatMap((folder) =>
    readdirSync(folder)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => join(folder, f)),
  );
}

function main(argv) {
  const hook = argv.includes('--hook');
  const rootFlag = argv.indexOf('--root');
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  let root = rootFlag >= 0 ? resolve(argv[rootFlag + 1]) : defaultRoot;
  // The value after `--root` is not a spec path; without the flag every positional argument is one.
  const rootValue = rootFlag >= 0 ? rootFlag + 1 : -1;
  let files = argv.filter((a, i) => !a.startsWith('--') && i !== rootValue).map((f) => resolve(f));

  if (hook) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
      process.exit(0);
    }
    root = resolve(process.env.CLAUDE_PROJECT_DIR || payload.cwd || root);
    const path = payload.tool_input && payload.tool_input.file_path;
    if (typeof path !== 'string') process.exit(0);
    files = [resolve(root, path)].filter((f) => isSpecPath(root, f) && existsSync(f));
  } else if (files.length === 0) {
    files = allSpecs(root);
  }

  let errors = 0;
  let checked = 0;
  const ids = new Map();
  const out = hook ? process.stderr : process.stdout;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const shown = relative(root, file) || file;
    if (!hasSpecId(text)) {
      if (!hook && argv.some((a) => resolve(a) === file)) out.write(`${shown}: skipped — a legacy spec (no "Spec ID:" line)\n`);
      continue;
    }
    checked += 1;
    const problems = checkSpec(text, basename(file));
    const id = /^Spec ID:\s*(\S+)/m.exec(text);
    if (id && ids.has(id[1])) problems.push({ level: 'error', line: 1, message: `${id[1]} is also used by ${ids.get(id[1])}; NN is one sequence across all spec folders.` });
    else if (id) ids.set(id[1], shown);
    for (const problem of problems) {
      if (hook && problem.level !== 'error') continue;
      out.write(`${shown}:${problem.line}: ${problem.level}: ${problem.message}\n`);
      if (problem.level === 'error') errors += 1;
    }
  }
  if (hook) {
    if (errors > 0) out.write('spec check: fix these before you finish (rules: the spec-authoring skill).\n');
    process.exit(errors > 0 ? 2 : 0);
  }
  out.write(`spec check: ${checked} spec(s), ${errors} error(s)\n`);
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
