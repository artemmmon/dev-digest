import type { SmartDiffRole } from '@devdigest/shared';
import { matchesAny } from '../_shared/glob.js';
import { CLASSIFY_RULES, FALLBACK_ROLE } from './constants.js';

/**
 * Classify one changed-file path into a Smart Diff role (spec 09). Pure — no
 * I/O, no HTTP — so it can run before any review and be reused as a diff filter
 * by the reviewer prompt later (L08) without becoming a route dependency.
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of CLASSIFY_RULES) {
    if (matchesAny(path, rule.patterns)) return rule.role;
  }
  return FALLBACK_ROLE;
}
