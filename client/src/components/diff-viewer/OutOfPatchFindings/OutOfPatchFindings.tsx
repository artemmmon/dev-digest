/* OutOfPatchFindings — footer list for findings whose start line isn't in the
   currently rendered diff (outside the patch's hunks). Same look as
   OutdatedComments, next to which it renders. */
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";

export function OutOfPatchFindings({
  findings,
  renderFinding,
}: {
  findings: FindingRecord[];
  renderFinding: (f: FindingRecord) => ReactNode;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>
        {t("smartDiff.outOfPatchTitle", { count: findings.length })}
      </span>
      {findings.map((f) => (
        <div key={f.id}>{renderFinding(f)}</div>
      ))}
    </div>
  );
}
