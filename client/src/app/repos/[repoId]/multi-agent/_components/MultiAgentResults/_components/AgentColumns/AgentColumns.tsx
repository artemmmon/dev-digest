/* AgentColumns — Columns mode: one column per agent run, in the agent's palette colour. The header
   shows the agent (Cpu icon, name), its state (running shows the elapsed time) and, once done,
   duration / cost and a score ring. A failed column shows its error; a done column lists its
   findings as compact cards; the footer opens the run trace. Names and error messages render as
   text. A 1 s tick runs only while some column is running. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, SEV, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { agentColor, agentTint } from "../../../../agent-palette";
import { elapsedSeconds, hasRunningColumn, lineRange, severityColor, STATE_COLOR } from "../../helpers";
import { s } from "./styles";

export function AgentColumns({
  columns,
  ranAt,
  onViewTrace,
}: {
  columns: AgentColumn[];
  /** When the run started: running columns show the time since then. */
  ranAt: string;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const ticking = hasRunningColumn(columns);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  return (
    <div style={s.wrap}>
      <div style={s.grid(columns.length)}>
        {columns.map((c, i) => {
          const color = STATE_COLOR[c.state];
          const accent = agentColor(i);
          const stateText =
            c.state === "running"
              ? `${t("state.running")} · ${t("state.elapsed", { seconds: elapsedSeconds(ranAt, now) })}`
              : t(`state.${c.state}`);
          return (
            <section key={c.run_id} style={s.col} aria-label={c.agent_name ?? t("column.unknownAgent")}>
              <div style={s.head(accent)}>
                <div style={s.headRow}>
                  <span style={s.icon(accent, agentTint(accent))} aria-hidden>
                    <Icon.Cpu size={16} />
                  </span>
                  <div style={s.headText}>
                    <div style={s.name}>{c.agent_name ?? t("column.unknownAgent")}</div>
                    {c.state === "done" && (
                      <div className="mono tnum" style={s.stats}>
                        {formatDurationMs(c.duration_ms)} · {formatCost(c.cost_usd)}
                      </div>
                    )}
                  </div>
                  {c.state === "done" && c.score != null && <CircularScore score={c.score} size={32} stroke={3.5} />}
                </div>
                <span style={s.state(color)}>
                  <span style={s.dot(color)} aria-hidden />
                  {stateText}
                </span>
              </div>
              <div style={s.body}>
                {c.state === "failed" && <div style={s.error}>{c.error}</div>}
                {c.state === "done" &&
                  c.findings.map((f) => {
                    const sev = SEV[f.severity as Severity];
                    const SevIcon = sev ? Icon[sev.icon] : null;
                    return (
                      <div key={f.id} style={s.finding(severityColor(f.severity))}>
                        <div style={s.findingHead}>
                          {SevIcon && (
                            <span role="img" aria-label={sev.label} title={sev.label} style={s.sevIcon(sev.c)}>
                              <SevIcon size={12} />
                            </span>
                          )}
                          <span style={s.findingTitle}>{f.title}</span>
                        </div>
                        <div className="mono" style={s.findingLoc}>
                          {f.file}:{lineRange(f.start_line, f.end_line)}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div style={s.foot}>
                <button type="button" style={s.traceBtn} onClick={() => onViewTrace(c.run_id)}>
                  {t("column.viewTrace", { count: c.findings.length })}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
