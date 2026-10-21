/* PeriodControl — "1 day" / "30 days" / "Custom range" for the Agent Performance page and the agent
   Stats tab. The applied selection comes from the URL (via `value`); only the custom dates being typed
   are local state. `onChange` fires for 1d/30d, or for a valid range — an invalid one shows a message
   and leaves the applied period (and its figures) alone (AC-8, AC-9). */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SelectInput, TextInput } from "@devdigest/ui";
import { todayLocal, validateCustomRange, type StatsPeriodSelection } from "@/lib/stats-period";
import { s } from "./styles";

const PERIOD_OPTIONS = ["1d", "30d", "custom"] as const;
type PeriodOption = (typeof PERIOD_OPTIONS)[number];

interface Draft {
  from: string;
  to: string;
}

export function PeriodControl({
  value,
  onChange,
}: {
  value: StatsPeriodSelection;
  onChange: (next: StatsPeriodSelection) => void;
}) {
  // The draft restarts whenever the applied selection changes (a valid range, back/forward navigation).
  const key = value.period === "custom" ? `custom:${value.from}:${value.to}` : value.period;
  return <PeriodControlInner key={key} value={value} onChange={onChange} />;
}

function PeriodControlInner({
  value,
  onChange,
}: {
  value: StatsPeriodSelection;
  onChange: (next: StatsPeriodSelection) => void;
}) {
  const t = useTranslations("agentPerformance");
  // `null` = a rolling period is selected; a draft = "Custom range" is open (applied or not).
  const [draft, setDraft] = useState<Draft | null>(
    value.period === "custom" ? { from: value.from, to: value.to } : null,
  );
  const today = todayLocal();

  const selected: PeriodOption = draft ? "custom" : (value.period as PeriodOption);
  const problem = draft && draft.from && draft.to ? validateCustomRange(draft.from, draft.to, today) : null;

  function pick(next: string) {
    if (next === "custom") {
      setDraft({ from: value.period === "custom" ? value.from : "", to: value.period === "custom" ? value.to : "" });
      return;
    }
    setDraft(null);
    onChange({ period: next === "1d" ? "1d" : "30d" });
  }

  function edit(patch: Partial<Draft>) {
    const next = { ...(draft ?? { from: "", to: "" }), ...patch };
    setDraft(next);
    if (next.from && next.to && validateCustomRange(next.from, next.to, today) === null) {
      onChange({ period: "custom", from: next.from, to: next.to });
    }
  }

  return (
    <div style={s.control}>
      <label style={s.field}>
        <span className="sr-only">{t("period.label")}</span>
        <SelectInput
          mono={false}
          value={selected}
          onChange={pick}
          options={PERIOD_OPTIONS.map((p) => ({ value: p, label: t(`period.options.${p}`) }))}
        />
      </label>
      {draft && (
        <>
          <label style={s.dateField}>
            <span style={s.fieldLabel}>{t("period.from")}</span>
            <TextInput
              type="date"
              mono={false}
              value={draft.from}
              max={today}
              onChange={(from) => edit({ from })}
              aria-invalid={problem ? true : undefined}
            />
          </label>
          <label style={s.dateField}>
            <span style={s.fieldLabel}>{t("period.to")}</span>
            <TextInput
              type="date"
              mono={false}
              value={draft.to}
              max={today}
              onChange={(to) => edit({ to })}
              aria-invalid={problem ? true : undefined}
            />
          </label>
          {problem && problem !== "missing" && (
            <p role="alert" style={s.error}>
              {t(`period.errors.${problem}`)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
