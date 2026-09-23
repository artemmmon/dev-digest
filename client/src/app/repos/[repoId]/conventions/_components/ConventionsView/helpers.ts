import type { ConventionCandidate, ConventionScanReport } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ERROR_CODE_NETWORK, ERROR_CODE_NO_API_KEY, ERROR_CODE_SCAN_IN_PROGRESS, SHORT_SHA_LENGTH } from "./constants";

/** Pending (most confident first) and accepted candidates. A rejected one never reaches the page. */
export function splitByStatus(candidates: ConventionCandidate[]): {
  pending: ConventionCandidate[];
  accepted: ConventionCandidate[];
} {
  const byConfidence = (a: ConventionCandidate, b: ConventionCandidate) => b.confidence - a.confidence;
  return {
    pending: candidates.filter((c) => c.status === "pending").sort(byConfidence),
    accepted: candidates.filter((c) => c.status === "accepted").sort(byConfidence),
  };
}

/** Ids that go into the next skill: every accepted candidate the user has not switched off. */
export function defaultSelection(accepted: ConventionCandidate[], excluded: ReadonlySet<string>): string[] {
  return accepted.filter((c) => !excluded.has(c.id)).map((c) => c.id);
}

export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : null;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago", "yesterday", "just now" — `now` is injectable for tests. */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diff = then - now;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, "second");
}

export interface ReportView {
  files: number;
  kept: number;
  raw: number;
  lineCorrected: number;
  /** Only reasons that dropped something. */
  dropped: { reason: keyof ConventionScanReport["dropped"]; count: number }[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** `null` when the provider reported no cost. */
  costUsd: number | null;
  seconds: number;
  sampled: string[];
  configFiles: string[];
}

/** The scan report reduced to what the page shows. */
export function formatReport(report: ConventionScanReport): ReportView {
  const dropped = (Object.entries(report.dropped) as [keyof ConventionScanReport["dropped"], number][])
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ reason, count }));
  return {
    files: report.sampled_files.length,
    kept: report.kept,
    raw: report.raw_candidates,
    lineCorrected: report.line_corrected,
    dropped,
    model: `${report.provider}/${report.model}`,
    tokensIn: report.tokens_in,
    tokensOut: report.tokens_out,
    costUsd: report.cost_usd ?? null,
    seconds: Math.round(report.duration_ms / 100) / 10,
    sampled: report.sampled_files,
    configFiles: report.config_files,
  };
}

/** Which dedicated message a failed scan gets; `null` → show the server's own message. */
export function scanErrorKind(error: unknown): "noApiKey" | "scanInProgress" | "network" | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === ERROR_CODE_SCAN_IN_PROGRESS || error.status === 409) return "scanInProgress";
  if (error.code === ERROR_CODE_NO_API_KEY) return "noApiKey";
  if (error.code === ERROR_CODE_NETWORK) return "network";
  return null;
}
