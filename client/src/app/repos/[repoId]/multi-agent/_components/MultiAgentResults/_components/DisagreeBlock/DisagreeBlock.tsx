/* DisagreeBlock — "Where agents disagree": the run's finding groups (file, line range, title), one
   take per agent run (severity + title, "did not flag", "failed" or "running"), a "Show only
   conflicts" filter, and a take that opens the original finding (agent, rationale, suggested fix).
   The filtered list is derived during render. Titles are text; rationale / suggestion go through
   Markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, SectionLabel, Toggle } from "@devdigest/ui";
import type { GroupTake, MultiAgentFinding, MultiAgentRun } from "@devdigest/shared";
import { lineRange, severityColor } from "../../helpers";
import { s } from "./styles";

export function DisagreeBlock({ run }: { run: MultiAgentRun }) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  // Open takes, as "<group id>|<run id>".
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());

  const findings = React.useMemo(() => {
    const byId = new Map<string, MultiAgentFinding>();
    for (const c of run.columns) for (const f of c.findings) byId.set(f.id, f);
    return byId;
  }, [run.columns]);

  const conflicts = new Set(run.conflicts);
  const groups = onlyConflicts ? run.groups.filter((g) => conflicts.has(g.id)) : run.groups;

  const toggleTake = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const takeName = (take: GroupTake) => take.agent_name ?? t("column.unknownAgent");

  return (
    <div style={s.root}>
      <SectionLabel
        icon="Activity"
        right={
          <label style={s.toggle}>
            {t("disagree.onlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={15} />
          </label>
        }
      >
        {t("disagree.title")}
      </SectionLabel>

      {onlyConflicts && groups.length === 0 ? (
        <div style={s.empty}>{t("disagree.noConflicts")}</div>
      ) : (
        <div style={s.list}>
          {groups.map((g) => {
            const openTakes = g.takes.filter((tk) => tk.finding_id && open.has(`${g.id}|${tk.run_id}`));
            return (
              <div key={g.id} style={s.group}>
                <div style={s.groupHead}>
                  <Icon.Code size={13} style={{ color: "var(--text-muted)" }} />
                  <span className="mono" style={s.loc}>
                    {g.file}:{lineRange(g.start_line, g.end_line)}
                  </span>
                  <span style={s.groupTitle}>{g.title}</span>
                </div>
                <div style={s.takes(Math.max(g.takes.length, 1))}>
                  {g.takes.map((tk) => {
                    const flagged = tk.take === "flagged";
                    const label =
                      tk.take === "flagged"
                        ? (tk.severity ?? "")
                        : tk.take === "did_not_flag"
                          ? t("disagree.didNotFlag")
                          : tk.take === "failed"
                            ? t("disagree.failed")
                            : t("disagree.running");
                    const key = `${g.id}|${tk.run_id}`;
                    return (
                      <div key={tk.run_id} style={s.take}>
                        <div style={s.agent}>{takeName(tk)}</div>
                        <div style={s.takeRow}>
                          <span style={s.dot(flagged ? severityColor(tk.severity) : "var(--text-muted)")} aria-hidden />
                          <span style={s.verdict(flagged)}>{label}</span>
                        </div>
                        {flagged && tk.finding_id ? (
                          <button
                            type="button"
                            style={s.takeBtn}
                            aria-expanded={open.has(key)}
                            onClick={() => toggleTake(key)}
                          >
                            {tk.title}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {openTakes.map((tk) => {
                  const f = tk.finding_id ? findings.get(tk.finding_id) : undefined;
                  if (!f) return null;
                  return (
                    <div key={tk.run_id} style={s.detail}>
                      <div style={s.detailAgent}>{f.agent_name ?? t("column.unknownAgent")}</div>
                      <Markdown>{f.rationale}</Markdown>
                      {f.suggestion && (
                        <>
                          <div style={s.detailLabel}>{t("disagree.suggestedFix")}</div>
                          <Markdown>{f.suggestion}</Markdown>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
