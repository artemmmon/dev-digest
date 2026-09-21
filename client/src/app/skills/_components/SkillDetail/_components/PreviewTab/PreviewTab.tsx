/* PreviewTab — the body rendered as markdown, from the draft (unsaved edits included). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

export function PreviewTab({ body }: { body: string }) {
  const t = useTranslations("skills");
  return (
    <div>
      <h3 style={s.h3}>{t("previewTab.title")}</h3>
      <p style={s.sub}>{t("previewTab.subtitle")}</p>
      <div style={s.card}>
        {body.trim() ? <Markdown>{body}</Markdown> : <span style={s.empty}>{t("form.previewEmpty")}</span>}
      </div>
    </div>
  );
}
