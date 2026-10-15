/* CompareView — Compare modal for two counted runs of one agent (design: `screen_skills.jsx`
   RunCompare): older / newer / change for recall, precision, citation accuracy and cost (AC-46), a
   version summary (AC-48), a word diff of the system prompts (AC-47), the cases that flipped between
   pass and fail (AC-49) and the "Case sets differ" banner (AC-50). The prompts are text from the
   server and render as text inside <del>/<ins>, never as HTML or markdown. Escape closes and focus
   returns to the element that opened it (NFR-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, SectionLabel, Skeleton } from "@devdigest/ui";
import type { EvalCompare } from "@devdigest/shared";
import {
  EVAL_METRICS,
  METRIC_COLOR,
  NO_VALUE,
  deltaPoints,
  formatMetric,
} from "@/components/eval";
import { formatCost } from "@/lib/format-cost";
import { useEvalCompare } from "@/lib/hooks";
import { COMPARE_METRIC_LABEL, COMPARE_WIDTH } from "./constants";
import { skillChanges, wordDiff } from "./helpers";
import { s } from "./styles";

export interface CompareViewProps {
  /** The two runs to compare; the server decides which one is the older. */
  a: string;
  b: string;
  onClose: () => void;
}

/** A cost change smaller than this (USD) counts as none. */
const COST_EPSILON = 1e-9;

export function CompareView({ a, b, onClose }: CompareViewProps) {
  const t = useTranslations("eval");
  const compare = useEvalCompare(a, b);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Escape closes; focus moves into the dialog on open and goes back to the opener on close.
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  });
  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const data = compare.data;
  const title = data
    ? t("compare.title", { older: data.older.run.agent_version, newer: data.newer.run.agent_version })
    : t("compare.heading");

  return (
    <Modal
      width={COMPARE_WIDTH}
      title={title}
      subtitle={t("compare.subtitle")}
      onClose={() => closeRef.current()}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={() => closeRef.current()}>
            {t("compare.close")}
          </Button>
        </div>
      }
    >
      <div ref={rootRef} style={s.body}>
        {compare.isError ? (
          <ErrorState body={t("compare.loadError")} onRetry={() => void compare.refetch()} />
        ) : !data ? (
          <div aria-busy="true" style={{ display: "grid", gap: 10 }}>
            <Skeleton height={64} />
            <Skeleton height={120} />
          </div>
        ) : (
          <CompareBody data={data} />
        )}
      </div>
    </Modal>
  );
}

function CompareBody({ data }: { data: EvalCompare }) {
  const t = useTranslations("eval");
  const { older, newer } = data;

  /** `▲ 3pt`, `▼ 2pt`, "no change", or `—` when either side has no value. */
  const pointsText = (delta: number | null) => {
    if (delta == null) return NO_VALUE;
    if (delta === 0) return t("compare.noChange");
    return t(delta > 0 ? "metricCards.deltaUp" : "metricCards.deltaDown", { points: Math.abs(delta) });
  };
  const costText = (delta: number | null) => {
    if (delta == null) return NO_VALUE;
    if (delta === 0) return t("compare.noChange");
    return t(delta > 0 ? "compare.changeUp" : "compare.changeDown", { value: formatCost(Math.abs(delta)) });
  };

  const costDelta =
    older.run.cost_usd != null && newer.run.cost_usd != null ? newer.run.cost_usd - older.run.cost_usd : null;
  const costChange = costDelta != null && Math.abs(costDelta) < COST_EPSILON ? 0 : costDelta;

  const skills = skillChanges(older.run.skill_versions, newer.run.skill_versions);
  const promptsKnown = older.system_prompt != null && newer.system_prompt != null;
  const tokens = promptsKnown ? wordDiff(older.system_prompt ?? "", newer.system_prompt ?? "") : [];
  const promptChanged = tokens.some((tk) => tk.kind !== "same");

  return (
    <>
      {data.case_sets_differ && (
        <div style={s.banner} data-testid="case-sets-differ">
          <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>
            <b style={s.bannerTitle}>{t("compare.casesDiffer")}</b>{" "}
            {t("compare.casesDifferDetail", { older: data.only_in_older, newer: data.only_in_newer })}
          </span>
        </div>
      )}

      <div style={s.metrics}>
        {EVAL_METRICS.map((metric) => {
          const delta = deltaPoints(newer.run[metric], older.run[metric]);
          return (
            <div key={metric} style={s.metric} data-testid={`compare-metric-${metric}`}>
              <div style={s.metricLabel}>{t(`compare.metrics.${COMPARE_METRIC_LABEL[metric]}`)}</div>
              <div style={s.metricRow}>
                <span className="tnum" style={s.oldValue} data-testid={`compare-older-${metric}`}>
                  <span className="sr-only">{t("compare.older")} </span>
                  {formatMetric(older.run[metric])}
                </span>
                <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
                <span className="tnum" style={s.newValue(METRIC_COLOR[metric])} data-testid={`compare-newer-${metric}`}>
                  <span className="sr-only">{t("compare.newer")} </span>
                  {formatMetric(newer.run[metric])}
                </span>
                <span
                  className="tnum"
                  style={s.change(delta == null || delta === 0 ? null : delta > 0)}
                  data-testid={`compare-change-${metric}`}
                >
                  <span className="sr-only">{t("compare.change")} </span>
                  {pointsText(delta)}
                </span>
              </div>
            </div>
          );
        })}
        <div style={s.metric} data-testid="compare-metric-cost">
          <div style={s.metricLabel}>{t("compare.metrics.cost")}</div>
          <div style={s.metricRow}>
            <span className="tnum" style={s.oldValue} data-testid="compare-older-cost">
              <span className="sr-only">{t("compare.older")} </span>
              {formatCost(older.run.cost_usd)}
            </span>
            <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
            <span className="tnum" style={s.newValue("var(--text-primary)")} data-testid="compare-newer-cost">
              <span className="sr-only">{t("compare.newer")} </span>
              {formatCost(newer.run.cost_usd)}
            </span>
            <span className="tnum" style={s.change(null)} data-testid="compare-change-cost">
              <span className="sr-only">{t("compare.change")} </span>
              {costText(costChange)}
            </span>
          </div>
        </div>
      </div>

      <section style={s.section} data-testid="compare-versions">
        <SectionLabel icon="Cpu">{t("compare.versionsHeading")}</SectionLabel>
        <dl style={{ ...s.dl, marginTop: 8 }}>
          <dt style={s.dt}>{t("compare.agentVersion")}</dt>
          <dd style={s.dd}>
            {t("runsTable.versionValue", { version: older.run.agent_version })} →{" "}
            {t("runsTable.versionValue", { version: newer.run.agent_version })}
          </dd>
          <dt style={s.dt}>{t("compare.model")}</dt>
          <dd style={s.dd}>
            {older.model ?? NO_VALUE} → {newer.model ?? NO_VALUE}
          </dd>
          <dt style={s.dt}>{t("compare.skills")}</dt>
          <dd style={s.dd}>
            {skills.length === 0 ? (
              t("compare.noSkillChanges")
            ) : (
              <ul style={s.skillList}>
                {skills.map((sk) => (
                  <li key={sk.skill_id}>
                    {sk.change === "changed"
                      ? t("compare.skillChanged", { name: sk.name, from: sk.from, to: sk.to })
                      : sk.change === "added"
                        ? t("compare.skillAdded", { name: sk.name, to: sk.to })
                        : t("compare.skillRemoved", { name: sk.name, from: sk.from })}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>

      <section style={s.section} data-testid="compare-prompt">
        <SectionLabel icon="FileText">{t("compare.promptHeading")}</SectionLabel>
        {!promptsKnown ? (
          <p style={{ ...s.muted, marginTop: 8 }}>{t("compare.promptUnavailable")}</p>
        ) : !promptChanged ? (
          <p style={{ ...s.muted, marginTop: 8 }}>{t("compare.promptUnchanged")}</p>
        ) : (
          <>
            <div style={{ ...s.legend, marginTop: 8 }}>
              <span style={s.legendItem}>
                <span style={s.swatch("var(--code-del)")} />
                {t("compare.legendRemoved")}
              </span>
              <span style={s.legendItem}>
                <span style={s.swatch("var(--code-add)")} />
                {t("compare.legendAdded")}
              </span>
            </div>
            <div className="mono" style={s.prompt}>
              {tokens.map((tk, i) =>
                tk.kind === "del" ? (
                  <del key={i} style={s.del}>
                    {tk.text}
                  </del>
                ) : tk.kind === "add" ? (
                  <ins key={i} style={s.ins}>
                    {tk.text}
                  </ins>
                ) : (
                  <span key={i}>{tk.text}</span>
                ),
              )}
            </div>
          </>
        )}
      </section>

      <section style={{ ...s.section, marginBottom: 0 }} data-testid="compare-flipped">
        <SectionLabel icon="Gauge">{t("compare.flippedHeading")}</SectionLabel>
        {data.flipped.length === 0 ? (
          <p style={{ ...s.muted, marginTop: 8 }}>{t("compare.noFlipped")}</p>
        ) : (
          <ul style={{ ...s.flippedList, marginTop: 8 }}>
            {data.flipped.map((f) => (
              <li key={f.case_id} style={s.flippedRow}>
                <span className="mono" style={s.flippedName}>
                  {f.name}
                </span>
                <span
                  style={{ fontWeight: 600, color: f.to === "pass" ? "var(--ok)" : "var(--crit)" }}
                  data-testid={`flipped-${f.case_id}`}
                >
                  {t("compare.flipped", {
                    from: t(`evalsTab.outcome.${f.from}`),
                    to: t(`evalsTab.outcome.${f.to}`),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
