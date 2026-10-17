/* CiStatusBadge — a CI run's status (Succeeded / No findings / Failed). A Failed badge with a known
   reason is a focusable control that shows the reason as a tooltip on hover and on keyboard focus
   (AC-93); the reason is one of the fixed enum values, never text from GitHub or the result. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiFailureReason, CiRunStatus } from "@devdigest/shared";
import { s } from "./styles";

const VISUAL: Record<CiRunStatus, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

export function CiStatusBadge({
  status,
  reason,
}: {
  status: CiRunStatus;
  reason?: CiFailureReason | null;
}) {
  const t = useTranslations("ci");
  const [shown, setShown] = React.useState(false);
  const tipId = React.useId();
  const visual = VISUAL[status];
  const badge = (
    <Badge color={visual.color} bg={visual.bg} dot>
      {t(`runs.status.${status}`)}
    </Badge>
  );
  if (status !== "failed" || !reason) return badge;
  return (
    <span style={s.badgeWrap}>
      <button
        type="button"
        style={s.badgeButton}
        aria-describedby={shown ? tipId : undefined}
        onMouseEnter={() => setShown(true)}
        onMouseLeave={() => setShown(false)}
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setShown(false);
        }}
      >
        {badge}
      </button>
      {shown && (
        <span role="tooltip" id={tipId} style={s.tooltip}>
          {t(`runs.failureReason.${reason}`)}
        </span>
      )}
    </span>
  );
}
