/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { useDeleteReview } from "@/lib/hooks/reviews";

const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

/** What a parent can ask of an accordion: open it and bring it into view. */
export interface ReviewRunHandle {
  reveal: () => void;
}

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  ref,
}: {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  ref?: React.Ref<ReviewRunHandle>;
}) {
  const t = useTranslations("prReview");
  const format = useFormatter();
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // The Timeline's "jump to this run" calls reveal() from its click handler — an
  // event, so it needs no effect watching props.
  React.useImperativeHandle(
    ref,
    () => ({
      reveal: () => {
        setOpen(true);
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }),
    [],
  );
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const verdictColor = review.verdict ? VERDICT_COLOR[review.verdict] ?? "var(--text-muted)" : "var(--text-muted)";
  const agentName = review.agent_name ?? t("reviewRun.agentFallback");
  const when = new Date(review.created_at);
  const bodyId = `review-run-body-${review.id}`;

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        marginBottom: 14,
        overflow: "hidden",
        scrollMarginTop: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", paddingRight: 12 }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 16px",
            cursor: "pointer",
            color: "var(--text-primary)",
            background: "none",
            border: "none",
            textAlign: "left",
            font: "inherit",
          }}
        >
          <Icon.Cpu size={15} style={{ color: "var(--text-muted)" }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{agentName}</span>
          {review.verdict && (
            <Badge color={verdictColor} bg="transparent">
              {t(`reviewRun.verdict.${review.verdict}`)}
            </Badge>
          )}
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {t("reviewRun.findings", { count: findings.length })}
            {blockers > 0 ? ` · ${t("reviewRun.blockers", { count: blockers })}` : ""}
          </span>
          <span style={{ flex: 1 }} />
          {review.score != null && (
            <Badge mono color="var(--text-secondary)">
              {review.score}
            </Badge>
          )}
          <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {Number.isNaN(when.getTime())
              ? review.created_at
              : format.dateTime(when, { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <Icon.ChevronDown
            size={16}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--text-muted)" }}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("reviewRun.deleteConfirm", { agent: agentName }))) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title={t("reviewRun.delete")}
          aria-label={t("reviewRun.delete")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>

      {open && (
        <div id={bodyId} style={{ padding: "0 16px 16px" }}>
          {review.verdict && (
            <div style={{ marginBottom: 16 }}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </div>
      )}
    </div>
  );
}

