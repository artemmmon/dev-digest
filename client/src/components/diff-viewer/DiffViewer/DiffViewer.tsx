/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import { type DiffFocus } from "../focus";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  focus,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** The file (and line) to open and scroll to, e.g. from a PR Brief jump. */
  focus?: DiffFocus;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} commenting={commenting} findings={findings} focus={focus} />
      ))}
    </div>
  );
}
