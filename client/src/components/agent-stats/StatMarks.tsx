/* StatMarks — the three text marks next to a figure: "DevDigest estimate", "partial", "small sample".
   Text, not colour alone, so they read in both themes (NFR-4). */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

/** Labels a cost figure as DevDigest's own estimate, not provider billing (AC-53). */
export function EstimateLabel() {
  const t = useTranslations("agentPerformance");
  return <span style={s.mark}>{t("marks.estimate")}</span>;
}

/** A cost figure that leaves out runs with no recorded cost. */
export function PartialMark() {
  const t = useTranslations("agentPerformance");
  return <span style={s.mark}>{t("marks.partial")}</span>;
}

/** An accept rate built on fewer than 10 decisions (AC-38). */
export function SmallSampleMark() {
  const t = useTranslations("agentPerformance");
  return <span style={s.mark}>{t("marks.smallSample")}</span>;
}
