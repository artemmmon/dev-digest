/* RepoStackLabel — one-line auto-detected stack summary ("Flutter · Dart 92% · dio"),
   shown wherever a repo's identity is shown (PR list header, PR detail header). */
"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { Repo } from "@/lib/types";
import { formatStack, otherFrameworks } from "./helpers";

const style: CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
};

export function RepoStackLabel({ stack }: { stack: Repo["stack"] | undefined }) {
  const t = useTranslations("shell");

  // `undefined` = the repo itself hasn't loaded yet — render nothing rather than flash.
  if (stack === undefined) return null;

  if (stack === null) {
    return (
      <span className="mono" style={style}>
        {t("repoStack.notDetected")}
      </span>
    );
  }

  const label = formatStack(stack);
  if (!label) return null;

  const others = otherFrameworks(stack);
  return (
    <span className="mono" style={style} title={others ? t("repoStack.alsoDetected", { names: others }) : undefined}>
      {label}
    </span>
  );
}
