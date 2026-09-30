/* BlastGraph — plain-SVG node-link drawing of ONE changed symbol (root → callers, plus the
   endpoints/cron jobs it reaches). A chip row picks the symbol. All labels are repo text:
   SVG <text>/<title> children only, never markup. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastDownstream } from "../../helpers";
import { graphLayout, type GraphNode } from "./helpers";
import { s } from "./styles";

const STROKE: Record<GraphNode["kind"], string> = {
  root: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

export function BlastGraph({ downstream }: { downstream: BlastDownstream[] }) {
  const t = useTranslations("blast");
  const [selected, setSelected] = React.useState<string | null>(null);

  const item = downstream.find((d) => d.symbol === selected) ?? downstream[0];
  if (!item) return <p style={s.empty}>{t("graph.empty")}</p>;
  const { width, height, nodeH, nodes, edges } = graphLayout(item);

  return (
    <div>
      {downstream.length > 1 && (
        <div style={s.chips} role="group" aria-label={t("symbolPicker.ariaLabel")}>
          {downstream.map((d) => (
            <button
              key={d.symbol}
              type="button"
              className="mono"
              aria-pressed={d.symbol === item.symbol}
              onClick={() => setSelected(d.symbol)}
              style={s.chip(d.symbol === item.symbol)}
            >
              {d.symbol}
            </button>
          ))}
        </div>
      )}
      <div style={s.scroll}>
        <svg
          role="img"
          aria-label={`${t("graph.ariaLabel")}: ${item.symbol}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
          style={s.svg(width)}
        >
          {edges.map(({ key, from, to, faint }) => {
            const mid = (from.x + to.x) / 2;
            return (
              <path
                key={key}
                d={`M${from.x + from.width / 2},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x - to.width / 2},${to.y}`}
                fill="none"
                stroke={faint ? "var(--border)" : "var(--border-strong)"}
                strokeWidth={1.5}
              />
            );
          })}
          {nodes.map((n) => (
            <g key={n.key} transform={`translate(${n.x - n.width / 2},${n.y - nodeH / 2})`}>
              <title>{n.title}</title>
              <rect
                width={n.width}
                height={nodeH}
                rx={6}
                fill="var(--bg-elevated)"
                stroke={STROKE[n.kind]}
                strokeWidth={1.25}
              />
              <text
                x={n.width / 2}
                y={nodeH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
                fill="var(--text-primary)"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={s.legend}>
        <span>
          <span aria-hidden style={s.dot("var(--accent)")}>●</span> {t("graph.legend.symbol")}
        </span>
        <span>
          <span aria-hidden style={s.dot("var(--border-strong)")}>●</span> {t("graph.legend.callers")}
        </span>
        <span>
          <span aria-hidden style={s.dot("var(--accent)")}>●</span> {t("graph.legend.endpoints")}
        </span>
        <span>
          <span aria-hidden style={s.dot("var(--warn)")}>●</span> {t("graph.legend.crons")}
        </span>
      </div>
    </div>
  );
}
