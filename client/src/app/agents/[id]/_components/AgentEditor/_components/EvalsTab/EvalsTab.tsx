/* EvalsTab — one agent's eval view (design artboard `agent-evals`): regression alert, metric cards,
   the case list with each case's outcome in the latest counted run, "Run all evals" with live
   `k / n cases` progress, the last 10 runs and a link to the full dashboard. "New eval case", Edit and
   Delete (with a confirmation naming the case) keep the case set (AC-52..AC-55). The server scores
   everything; the client only formats it. Server state stays in the query cache. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseOutcome, EvalCaseRecord } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CaseEditor,
  MetricCards,
  RegressionAlert,
  TrendChart,
  RunsTable,
  regressions,
  runProgress,
  seedFromCase,
} from "@/components/eval";
import { ApiError } from "@/lib/api";
import {
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCases,
  useEvalRuns,
  useStartEvalRun,
  useUpdateEvalCase,
} from "@/lib/hooks";
import { OUTCOME_VISUAL } from "./constants";
import { s } from "./styles";

/** What the Case Editor is open on: a blank case, or a stored one. */
type EditorTarget = { mode: "new" } | { mode: "edit"; item: EvalCaseRecord };

/** A server 4xx carries a fixed message to show as it is; anything else gets the generic text. */
const messageOf = (error: unknown, fallback: string): string | null =>
  error ? (error instanceof ApiError ? error.message : fallback) : null;

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const casesQ = useEvalCases(agent.id);
  const runsQ = useEvalRuns(agent.id);
  const start = useStartEvalRun(agent.id);
  const create = useCreateEvalCase(agent.id);
  const update = useUpdateEvalCase(agent.id);
  const remove = useDeleteEvalCase(agent.id);
  const [editor, setEditor] = React.useState<EditorTarget | null>(null);
  const [deleting, setDeleting] = React.useState<EvalCaseRecord | null>(null);
  const hintId = React.useId();

  const openEditor = (target: EditorTarget) => {
    create.reset();
    update.reset();
    setEditor(target);
  };
  const closeEditor = () => setEditor(null);
  const openDelete = (item: EvalCaseRecord) => {
    remove.reset();
    setDeleting(item);
  };

  if (casesQ.isError || runsQ.isError) {
    return (
      <ErrorState
        body={t("evalsTab.loadError")}
        onRetry={() => {
          void casesQ.refetch();
          void runsQ.refetch();
        }}
      />
    );
  }
  if (!casesQ.data || !runsQ.data) {
    return (
      <div style={s.wrap} aria-busy="true">
        <Skeleton height={20} width={200} />
        <Skeleton height={64} />
        <Skeleton height={180} />
      </div>
    );
  }

  const cases = casesQ.data;
  const { runs, latest_counted: latest, previous_counted: previous } = runsQ.data;
  const runningRun = runs.find((r) => r.status === "running") ?? null;
  const noCases = cases.length === 0;
  const ran = cases.filter((c) => c.latest.status !== "never_run").length;
  const passing = cases.filter((c) => c.latest.status === "pass").length;
  const allPassing = passing === ran;

  return (
    <div style={s.wrap}>
      <div style={s.sectionHead}>
        <SectionLabel icon="Gauge">{t("evalsTab.metricsTitle")}</SectionLabel>
        <Link href={`/eval/${agent.id}`} className="mono" style={s.link}>
          {t("evalsTab.dashboardLink")}
        </Link>
      </div>
      <RegressionAlert regressions={regressions(latest, previous)} />
      <MetricCards latest={latest} previous={previous} />
      <TrendChart agentId={agent.id} />
      <div style={s.note}>
        <Icon.Code size={12} />
        {t("evalsTab.scoringNote")}
      </div>

      <div style={s.casesHead}>
        <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
        {ran > 0 && (
          <Badge
            color={allPassing ? "var(--ok)" : "var(--warn)"}
            bg={allPassing ? "var(--ok-bg)" : "var(--warn-bg)"}
          >
            {t("evalsTab.passingSummary", { passed: passing, ran })}
          </Badge>
        )}
        <Badge color="var(--text-muted)">{t("evalsTab.casesCount", { count: cases.length })}</Badge>
        <div style={s.actions}>
          {noCases && (
            <span id={hintId} style={s.hint}>
              {t("evalsTab.addCaseFirst")}
            </span>
          )}
          <Button kind="primary" size="sm" icon="Plus" onClick={() => openEditor({ mode: "new" })}>
            {t("evalsTab.newCaseButton")}
          </Button>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            disabled={noCases || runningRun != null || start.isPending}
            loading={start.isPending}
            aria-describedby={noCases ? hintId : undefined}
            onClick={() => start.mutate()}
          >
            {runningRun
              ? t("evalsTab.runningProgress", { done: runProgress(runningRun), total: runningRun.cases_total })
              : t("evalsTab.runAll")}
          </Button>
        </div>
      </div>

      {noCases ? (
        <EmptyState icon="Gauge" title={t("evalsTab.emptyCases")} />
      ) : (
        <ul style={s.list}>
          {cases.map((c) => (
            <CaseRow
              key={c.id}
              item={c}
              onEdit={() => openEditor({ mode: "edit", item: c })}
              onDelete={() => openDelete(c)}
            />
          ))}
        </ul>
      )}

      <h2 style={{ ...s.h2, margin: "24px 0 12px" }}>{t("evalsTab.runsHeading")}</h2>
      {runs.length === 0 ? (
        <p style={s.empty}>{t("evalsTab.noRuns")}</p>
      ) : (
        <RunsTable runs={runs} />
      )}

      {editor?.mode === "new" && (
        <CaseEditor
          mode="new"
          agentName={agent.name}
          existingCases={cases}
          saving={create.isPending}
          error={messageOf(create.error, t("evalsTab.saveFailed"))}
          onSave={(body) => create.mutate(body, { onSuccess: closeEditor })}
          onClose={closeEditor}
        />
      )}
      {editor?.mode === "edit" && (
        <CaseEditor
          mode="edit"
          seed={seedFromCase(editor.item)}
          agentName={agent.name}
          existingCases={cases}
          saving={update.isPending}
          error={messageOf(update.error, t("evalsTab.saveFailed"))}
          onSave={(body) => update.mutate({ id: editor.item.id, body }, { onSuccess: closeEditor })}
          onClose={closeEditor}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("evalsTab.deleteTitle")}
          body={
            <>
              <p style={s.dialogText}>{t("evalsTab.deleteBody", { name: deleting.name })}</p>
              {remove.error && (
                <p role="alert" style={s.dialogError}>
                  {messageOf(remove.error, t("evalsTab.deleteFailed"))}
                </p>
              )}
            </>
          }
          confirmLabel={t("evalsTab.deleteConfirm")}
          danger
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function CaseRow({
  item,
  onEdit,
  onDelete,
}: {
  item: EvalCaseRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const { status, expected_count: expected, matched_count: got } = item.latest;
  const visual = OUTCOME_VISUAL[status];
  const I = Icon[visual.icon];
  const mustFind = item.expected_output.type === "must_find";
  return (
    <li style={s.row}>
      <I size={15} style={{ color: visual.color, flexShrink: 0 }} />
      <div style={s.rowMain}>
        <div style={s.rowTop}>
          <span className="mono" style={s.caseName}>
            {item.name}
          </span>
          <span style={s.typeBadge(mustFind)}>{t(`caseEditor.types.${item.expected_output.type}`)}</span>
        </div>
        <div style={s.outcome}>
          {outcomeLabel(status, t)}
          {(status === "pass" || status === "fail") && got != null && (
            <> · {t("evalsTab.expectedGot", { expected, got })}</>
          )}
        </div>
      </div>
      <div style={s.rowActions}>
        <IconBtn icon="Edit" label={t("evalsTab.editCase", { name: item.name })} size={26} onClick={onEdit} />
        <IconBtn
          icon="Trash"
          label={t("evalsTab.deleteCase", { name: item.name })}
          size={26}
          danger
          onClick={onDelete}
        />
      </div>
    </li>
  );
}

function outcomeLabel(status: EvalCaseOutcome, t: ReturnType<typeof useTranslations>): string {
  return status === "never_run" ? t("evalsTab.neverRun") : t(`evalsTab.outcome.${status}`);
}
