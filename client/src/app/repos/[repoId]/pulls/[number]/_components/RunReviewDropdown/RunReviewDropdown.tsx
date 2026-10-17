/* RunReviewDropdown — the PR page's "Run Review" popover: a checklist of the enabled agents (all
   checked on open) and a Run button. One checked agent keeps the single-run flow (the runs stream
   on the PR page); two or more open the Multi-Agent Review page on the new batch. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { AgentChecklist } from "@/components/agent-checklist";
import { useAgents } from "@/lib/hooks/agents";
import { useReviewEstimates } from "@/lib/hooks/multi-agent";
import { useRunReview } from "@/lib/hooks/reviews";
import { POPOVER_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  prNumber,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  /** The PR's number: the Multi-Agent Review page is addressed as `?pr=<number>`. */
  prNumber: number;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const { data: agents } = useAgents();
  const { data: estimates } = useReviewEstimates();
  const run = useRunReview();
  const [open, setOpen] = React.useState(false);
  // `null` = untouched since the popover opened: every enabled agent is checked.
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  const checked = React.useMemo(() => picked ?? new Set(enabled.map((a) => a.id)), [picked, enabled]);
  const checkedAgents = enabled.filter((a) => checked.has(a.id));

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setPicked(null);
    setOpen((o) => !o);
  };
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const start = async () => {
    const agentIds = checkedAgents.map((a) => a.id);
    if (agentIds.length === 0) return;
    setOpen(false);
    // Only a single run streams on this page; a batch opens the Multi-Agent Review page.
    if (agentIds.length === 1) onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds });
      if (agentIds.length === 1) {
        onRunsStarted?.(res.runs.map((r) => r.run_id));
      } else {
        router.push(`/repos/${repoId}/multi-agent?pr=${prNumber}&run=${res.multi_agent_run_id}`);
      }
    } catch {
      // The mutation cache already toasted the error.
    } finally {
      onRunSettled?.();
    }
  };

  const runLabel =
    checkedAgents.length > 1
      ? t("runReview.runSelected", { count: checkedAgents.length })
      : checkedAgents.length === 1
        ? t("runReview.runOne", { name: checkedAgents[0]!.name })
        : t("runReview.selectAgent");

  return (
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={run.isPending}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div role="group" aria-label={t("runReview.runReview")} style={{ ...s.popover, width: POPOVER_WIDTH }}>
          {warnMerged && (
            <div style={s.warning}>
              <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
              <span>{t("runReview.mergedWarning")}</span>
            </div>
          )}
          {enabled.length === 0 ? (
            <div style={s.empty}>{t("runReview.noEnabledAgents")}</div>
          ) : (
            <AgentChecklist
              agents={enabled}
              checked={checked}
              onToggle={toggle}
              onSelectAll={() => setPicked(new Set(enabled.map((a) => a.id)))}
              onClearAll={() => setPicked(new Set())}
              estimates={estimates ?? []}
            />
          )}
          <div style={s.runRow}>
            <Button
              kind="primary"
              size="sm"
              full
              icon={checkedAgents.length > 1 ? "Users" : "Play"}
              disabled={checkedAgents.length === 0}
              onClick={start}
            >
              {runLabel}
            </Button>
          </div>
          <button type="button" style={s.configure} onClick={() => router.push("/agents")}>
            <Icon.Settings size={13} />
            {t("runReview.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
