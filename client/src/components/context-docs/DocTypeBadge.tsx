/* DocTypeBadge — the coloured type label (specs / docs / insights) of a project document. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectDocType } from "@devdigest/shared";
import { DOC_TYPE_COLOR } from "./constants";
import { s } from "./styles";

export function DocTypeBadge({ type }: { type: ProjectDocType }) {
  const t = useTranslations("context");
  return <span style={s.typeBadge(DOC_TYPE_COLOR[type])}>{t(`type.${type}`)}</span>;
}
