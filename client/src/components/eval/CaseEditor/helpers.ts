/* CaseEditor/helpers.ts — seeding a case from a finding (AC-3, AC-4, AC-5) and the overlap check (AC-13). */
import type {
  EvalCaseMeta,
  EvalCaseRecord,
  EvalExpectation,
  EvalExpectationType,
  FindingRecord,
} from "@devdigest/shared";

/** The seeded name keeps at most this many slug characters (AC-4). */
export const NAME_SLUG_MAX = 34;
/** Used when a finding title leaves an empty slug (EC-5). */
export const NAME_SLUG_FALLBACK = "finding";

/** Lower-case kebab-case of a title: runs of anything but a-z / 0-9 become one `-`, ends trimmed. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `must-find-<slug>` or `no-<slug>`, the slug cut to its first 34 characters (AC-4, EC-5). */
export function seedName(type: EvalExpectationType, title: string): string {
  const slug = slugify(title).slice(0, NAME_SLUG_MAX) || NAME_SLUG_FALLBACK;
  return `${type === "must_find" ? "must-find" : "no"}-${slug}`;
}

/** An accepted or open finding seeds `must_find`; a dismissed one seeds `must_not_flag` (AC-3). */
export function seedType(finding: Pick<FindingRecord, "accepted_at" | "dismissed_at">): EvalExpectationType {
  return finding.dismissed_at && !finding.accepted_at ? "must_not_flag" : "must_find";
}

/** Everything the Case Editor starts from when opened on a finding. Frozen at mount. */
export interface CaseSeed {
  name: string;
  expected_output: EvalExpectation;
  input_diff: string;
  input_meta: EvalCaseMeta;
  /** The finding a seeded case comes from; null for a hand-written case. */
  source_finding_id: string | null;
  /** Set when editing a stored case, so the overlap warning skips it. */
  case_id?: string;
}

/** The empty starting point of a hand-written case (AC-52); lines 0 render as empty fields. */
export function emptyCaseSeed(): CaseSeed {
  return {
    name: "",
    expected_output: { type: "must_find", file: "", start_line: 0, end_line: 0 },
    input_diff: "",
    input_meta: { pr_title: "", pr_body: "" },
    source_finding_id: null,
  };
}

/** The starting point of an edit: a stored case as it is now. */
export function seedFromCase(c: EvalCaseRecord): CaseSeed {
  return {
    name: c.name,
    expected_output: c.expected_output,
    input_diff: c.input_diff,
    input_meta: c.input_meta,
    source_finding_id: c.source_finding_id,
    case_id: c.id,
  };
}

/**
 * Seed for a finding: the stored patch of its file headed by `--- a/<file>` and `+++ b/<file>` (AC-5),
 * the PR's title and body as they are now (AC-6), and the finding's file and lines as the expectation.
 */
export function buildCaseSeed(
  finding: Pick<FindingRecord, "id" | "title" | "file" | "start_line" | "end_line" | "accepted_at" | "dismissed_at">,
  patch: string,
  meta: EvalCaseMeta,
): CaseSeed {
  const type = seedType(finding);
  return {
    name: seedName(type, finding.title),
    expected_output: {
      type,
      file: finding.file,
      start_line: finding.start_line,
      end_line: finding.end_line,
    },
    input_diff: `--- a/${finding.file}\n+++ b/${finding.file}\n${patch}`,
    input_meta: meta,
    source_finding_id: finding.id,
  };
}

/**
 * Another case of the agent whose expectation is in the same file and shares a line with `expectation`
 * (bounds inclusive). `excludeId` skips the case being edited. Null when none overlaps (AC-13).
 */
export function overlappingCase(
  cases: readonly EvalCaseRecord[],
  expectation: Pick<EvalExpectation, "file" | "start_line" | "end_line">,
  excludeId?: string | null,
): EvalCaseRecord | null {
  return (
    cases.find(
      (c) =>
        c.id !== excludeId &&
        c.expected_output.file === expectation.file &&
        c.expected_output.start_line <= expectation.end_line &&
        expectation.start_line <= c.expected_output.end_line,
    ) ?? null
  );
}

/** A line number field: a whole number ≥ 1, else null. */
export function parseLine(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
