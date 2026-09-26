/**
 * Public surface of the smart-diff module for other modules (onion-architecture
 * skill). Re-exports only the pure classifier — no service, no repository — so a
 * future consumer (the L08 reviewer prompt filter) never reaches into module
 * internals.
 */
export { classifyFile } from './classify.js';
export { SMART_DIFF_ROLE_ORDER, CLASSIFY_RULES } from './constants.js';
