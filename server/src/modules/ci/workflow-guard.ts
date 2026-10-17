import { parse } from 'yaml';
import { ValidationError } from '../../platform/errors.js';
import { WORKFLOW_PATH } from './constants.js';

/** Triggers that run with the base repository's secrets on fork-controlled input. */
const FORBIDDEN_EVENTS = new Set(['pull_request_target', 'workflow_run']);
/** The only `permissions` scopes an edited workflow may grant, and the levels allowed for each. */
const ALLOWED_PERMISSIONS: Record<string, readonly string[]> = {
  contents: ['read', 'none'],
  'pull-requests': ['read', 'write', 'none'],
};
const FULL_SHA_PIN = /^[^@\s]+@[0-9a-fA-F]{40}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function refuse(rule: string): never {
  // The message is fixed text: it names the rule and the file, never the workflow content.
  throw new ValidationError(`The workflow ${WORKFLOW_PATH} ${rule}`, [
    { path: 'workflow', message: rule },
  ]);
}

function checkTriggers(on: unknown): void {
  const events: string[] = [];
  if (typeof on === 'string') events.push(on);
  else if (Array.isArray(on)) for (const e of on) events.push(String(e));
  else if (isRecord(on)) events.push(...Object.keys(on));
  if (events.some((e) => FORBIDDEN_EVENTS.has(e))) {
    refuse('must not use the pull_request_target or workflow_run trigger');
  }
}

function checkPermissions(block: unknown): void {
  if (block === undefined || block === null) return;
  if (!isRecord(block)) refuse('may grant only contents: read and pull-requests: read or write');
  for (const [scope, level] of Object.entries(block)) {
    const allowed = ALLOWED_PERMISSIONS[scope];
    if (!allowed || typeof level !== 'string' || !allowed.includes(level)) {
      refuse('may grant only contents: read and pull-requests: read or write');
    }
  }
}

function checkUses(uses: unknown): void {
  if (uses === undefined) return;
  if (typeof uses !== 'string') refuse('must pin every action to a full 40-character commit SHA');
  if (uses.startsWith('./')) return; // a local action ships in the repository itself
  if (!FULL_SHA_PIN.test(uses)) refuse('must pin every action to a full 40-character commit SHA');
}

/**
 * Server-side check of the EDITED workflow before it is committed or zipped. Refuses a
 * workflow that is not valid YAML, that listens to `pull_request_target` / `workflow_run`,
 * that grants a `permissions` scope beyond `contents: read` and `pull-requests: read|write`
 * (top level or per job; `read-all` / `write-all` too), or that uses an action not pinned to
 * a full commit SHA. Pure; throws a `ValidationError` with fixed text.
 */
export function assertSafeWorkflow(text: string): void {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    refuse('is not valid YAML');
  }
  if (!isRecord(doc)) refuse('is not valid YAML');

  checkTriggers(doc['on']);
  checkPermissions(doc['permissions']);

  const jobs = doc['jobs'];
  if (!isRecord(jobs)) return;
  for (const job of Object.values(jobs)) {
    if (!isRecord(job)) continue;
    checkPermissions(job['permissions']);
    checkUses(job['uses']);
    const steps = job['steps'];
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (isRecord(step)) checkUses(step['uses']);
    }
  }
}
