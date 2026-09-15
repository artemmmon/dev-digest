/* RunCostBadge — LLM spend of a review run / batch. Ported from CostBadge in
   docs/design/src/primitives.jsx. */
"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { formatCost } from "@/lib/format-cost";

type Props =
  | { variant: "compact"; costUsd: number | null | undefined }
  | { variant: "detailed"; costUsd: number | null | undefined; tokens: number | null };

const s = {
  compact: { fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 } satisfies CSSProperties,
  detailed: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

/**
 * `compact` — cost only ("$0.014"), for table cells.
 * `detailed` — tokens + cost ("9,119 tok · $0.0013"), for run cards.
 * No cost data renders "—" (never "$0.00").
 */
export function RunCostBadge(props: Props) {
  const t = useTranslations("common");
  const cost = formatCost(props.costUsd);

  if (props.variant === "detailed" && props.tokens != null) {
    return (
      <span className="mono tnum" style={s.detailed}>
        {t("cost.tokensAndCost", { tokens: props.tokens, cost })}
      </span>
    );
  }
  if (props.costUsd == null) {
    return (
      <span className="mono" style={s.empty}>
        {cost}
      </span>
    );
  }
  return (
    <span className="mono tnum" style={props.variant === "compact" ? s.compact : s.detailed}>
      {cost}
    </span>
  );
}
