import { CONFIDENCE_SOLID, RULE_MAX_LENGTH, RULE_MIN_LENGTH } from "./constants";

/** Confidence 0..1 as a whole percent. */
export function confidencePct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

export function confidenceColor(confidence: number): string {
  return confidence >= CONFIDENCE_SOLID ? "var(--ok)" : "var(--warn)";
}

/** "path:line" or "path:start-end" — what the evidence link shows. */
export function evidenceLocation(path: string, line: number, endLine?: number | null): string {
  return endLine != null && endLine > line ? `${path}:${line}-${endLine}` : `${path}:${line}`;
}

/** The snippet split into lines, each with its file line number. */
export function numberSnippet(snippet: string, startLine: number): { n: number; text: string }[] {
  return snippet
    .replace(/\n+$/, "")
    .split("\n")
    .map((text, i) => ({ n: startLine + i, text }));
}

/** Why a reworded rule cannot be saved, or `null` when it can. */
export function ruleProblem(rule: string): "tooShort" | "tooLong" | null {
  const len = rule.trim().length;
  if (len < RULE_MIN_LENGTH) return "tooShort";
  if (len > RULE_MAX_LENGTH) return "tooLong";
  return null;
}
