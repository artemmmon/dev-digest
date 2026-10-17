/* FailOnControl — "Fail CI on": when the CI run exits non-zero (AC-73..AC-75). A radio group (native
   radios, so arrow keys move the choice), saved as the agent's `ci_fail_on` through the agent update.
   "Any" is only offered while it is the stored value, e.g. set through the API (AC-74). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateCiFailOn } from "@/lib/hooks/ci";
import { FAIL_ON_OPTIONS } from "./constants";
import { s } from "./styles";

export function FailOnControl({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const update = useUpdateCiFailOn(agent.id);
  const [focused, setFocused] = React.useState<CiFailOn | null>(null);
  const hintId = React.useId();
  const name = React.useId();

  // While the save runs, show the pick rather than the stored value so the choice does not lag.
  const value: CiFailOn = update.pending ?? agent.ci_fail_on;
  const options = agent.ci_fail_on === "any" ? ([...FAIL_ON_OPTIONS, "any"] as const) : FAIL_ON_OPTIONS;

  return (
    <div style={s.box}>
      <div style={s.text}>
        <div id={`${hintId}-label`} style={s.label}>
          {t("failOn.label")}
        </div>
        <div id={hintId} style={s.hint}>
          {t("failOn.hint")}
        </div>
        {update.failed && (
          <div role="alert" style={s.error}>
            {t("failOn.saveFailed")}
          </div>
        )}
      </div>
      <div role="radiogroup" aria-labelledby={`${hintId}-label`} aria-describedby={hintId} style={s.group}>
        {options.map((option) => (
          <label key={option} style={s.option(value === option, focused === option)}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              disabled={update.saving}
              className="sr-only"
              onFocus={() => setFocused(option)}
              onBlur={() => setFocused(null)}
              onChange={() => update.save(option)}
            />
            {t(`failOn.options.${option}`)}
          </label>
        ))}
      </div>
    </div>
  );
}
