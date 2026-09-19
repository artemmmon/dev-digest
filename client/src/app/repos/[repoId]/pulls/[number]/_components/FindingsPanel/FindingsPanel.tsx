/* FindingsPanel — severity counters + filter, hide-low-confidence, j/k navigation
   and the FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SeverityFilterPills } from "../SeverityFilterPills";
import { useFindingAction } from "@/lib/hooks/reviews";
import { countBySeverity, type CountedSeverity } from "@/lib/severity-counts";
import { KEY_TO_ACTION } from "./constants";
import { filterBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<CountedSeverity | null>(null);
  const [focusRaw, setFocusIdx] = React.useState(0);

  // Counters are taken from the full visible set, the list from the filtered one, so a
  // pill's number always equals the number of cards it shows.
  const visible = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(visible), [visible]);
  const shown = React.useMemo(() => filterBySeverity(visible, severity), [visible, severity]);

  // The j/k cursor stays inside the list when filtering shrinks it — derived, not synced by an effect.
  const focusIdx = Math.min(focusRaw, Math.max(shown.length - 1, 0));

  // j/k navigation + a/d shortcuts on the focused finding (keyboard). The listener is
  // bound once and reads the latest values through a ref, so it isn't re-bound every render.
  const latest = React.useRef({ shown, focusIdx, prId, mutate: action.mutate });
  React.useEffect(() => {
    latest.current = { shown, focusIdx, prId, mutate: action.mutate };
  });
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const { shown: list, focusIdx: idx, prId: id, mutate } = latest.current;
      if (e.key === "j") setFocusIdx(Math.min(idx + 1, list.length - 1));
      else if (e.key === "k") setFocusIdx(Math.max(idx - 1, 0));
      else if (KEY_TO_ACTION[e.key] && list[idx]) {
        mutate({ findingId: list[idx]!.id, action: KEY_TO_ACTION[e.key]!, prId: id });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityFilterPills counts={counts} active={severity} onToggle={setSeverity} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
