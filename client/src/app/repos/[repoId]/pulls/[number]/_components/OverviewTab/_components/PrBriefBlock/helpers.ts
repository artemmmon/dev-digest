/* helpers.ts — pure helpers for the PR Brief block: the missing-data notice and the
   "provider has no key" error. No JSX, no hooks. */
import type { BriefMissing } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

/** `missing` values for inputs the brief never had. */
const ABSENT: readonly BriefMissing[] = ["intent", "blast", "issue", "specs", "description"];
/** `missing` values for inputs that were cut to fit the input budget. */
const TRIMMED: readonly BriefMissing[] = [
  "specs_trimmed",
  "issue_trimmed",
  "description_trimmed",
  "callers_trimmed",
  "hunks_trimmed",
  "files_trimmed",
];

export interface MissingNotice {
  absent: BriefMissing[];
  intentStale: boolean;
  trimmed: BriefMissing[];
}

/** Split a brief's `missing` list into the three groups the notice words separately (spec OQ-8). */
export function missingNotice(missing: readonly BriefMissing[]): MissingNotice {
  return {
    absent: ABSENT.filter((m) => missing.includes(m)),
    intentStale: missing.includes("intent_stale"),
    trimmed: TRIMMED.filter((m) => missing.includes(m)),
  };
}

/** i18n key (under `brief`) naming one `missing` value in words. */
export function missingNameKey(value: BriefMissing): `notice.name.${BriefMissing}` {
  return `notice.name.${value}`;
}

/**
 * When the failure is "the chosen provider has no API key" (`config_error`), the provider the
 * server named in `details.provider` (null when it named none). `undefined` for any other error.
 */
export function noKeyProvider(error: unknown): string | null | undefined {
  if (!(error instanceof ApiError) || error.code !== "config_error") return undefined;
  const details = error.details as { provider?: unknown } | null | undefined;
  return typeof details?.provider === "string" && details.provider ? details.provider : null;
}
