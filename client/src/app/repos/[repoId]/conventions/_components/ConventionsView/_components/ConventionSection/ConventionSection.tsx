/* ConventionSection — a titled group of cards (Pending / Accepted) with its count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export function ConventionSection({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  /** Optional line beside the title (e.g. how many accepted rules are selected). */
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("conventions");
  return (
    <section style={s.section} aria-label={title}>
      <div style={s.head}>
        <h2 style={s.title}>{title}</h2>
        <span style={s.count}>{t("page.sectionCount", { count })}</span>
        {hint && <span style={s.hint}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
