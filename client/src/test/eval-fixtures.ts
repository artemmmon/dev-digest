/* Fixtures of the eval screens' tests: a run summary and a case record with sane defaults. */
import type { EvalCaseRecord, EvalRunSummary } from "@devdigest/shared";

export function evalRun(over: Partial<EvalRunSummary> & { id: string }): EvalRunSummary {
  return {
    agent_id: "ag1",
    agent_version: 1,
    skill_versions: [],
    status: "done",
    started_at: "2026-10-10T10:00:00.000Z",
    finished_at: "2026-10-10T10:05:00.000Z",
    cases_total: 4,
    cases_completed: 4,
    cases_errored: 0,
    cases_passed: 3,
    recall: 0.8,
    precision: 0.75,
    citation_accuracy: 0.9,
    unlabelled_findings: 0,
    cost_usd: 0.1234,
    ...over,
  };
}

export function evalCase(
  over: Partial<Omit<EvalCaseRecord, "latest">> & { id: string; latest?: Partial<EvalCaseRecord["latest"]> },
): EvalCaseRecord {
  const { latest, ...rest } = over;
  return {
    owner_kind: "agent",
    owner_id: "ag1",
    name: `case-${over.id}`,
    input_diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n+new",
    input_meta: { pr_title: "T", pr_body: "" },
    expected_output: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2 },
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-01T10:00:00.000Z",
    latest: { status: "never_run", expected_count: 1, matched_count: null, ...latest },
    ...rest,
  };
}
