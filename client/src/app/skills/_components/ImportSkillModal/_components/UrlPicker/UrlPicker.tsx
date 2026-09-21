/* UrlPicker — the "From URL" step of the import dialog: one input and a Fetch button.
   It only collects the URL; the dialog owns the request and shows the preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, TextInput } from "@devdigest/ui";
import { s } from "./styles";

export function UrlPicker({
  pending,
  error,
  onFetch,
}: {
  pending: boolean;
  error: string | null;
  onFetch: (url: string) => void;
}) {
  const t = useTranslations("skills");
  const [url, setUrl] = React.useState("");
  const trimmed = url.trim();

  return (
    <form
      style={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !pending) onFetch(trimmed);
      }}
    >
      <div style={s.row}>
        <div style={s.field}>
          <TextInput
            mono
            value={url}
            onChange={setUrl}
            placeholder={t("import.urlTab.placeholder")}
            aria-label={t("import.urlTab.label")}
            inputMode="url"
            spellCheck={false}
          />
        </div>
        <Button kind="primary" icon="Link" type="submit" loading={pending} disabled={!trimmed}>
          {pending ? t("import.urlTab.fetching") : t("import.urlTab.fetch")}
        </Button>
      </div>
      <span style={s.hint}>{t("import.urlTab.hint")}</span>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
    </form>
  );
}
