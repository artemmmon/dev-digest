/* RoleGroup — one Smart Diff role's collapsible section: sticky header (colour
   square, label, description, an always-visible finding counter, a file count)
   over a DiffViewer of that role's files. Groups with 0 files are never mounted
   (the caller filters them — empty roles are hidden on the client). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { unstyledButton } from "@/lib/interactive";
import { ROLE_META } from "../../constants";
import { countFilesWithFindings } from "../../helpers";
import { s, chevronFor } from "./styles";

export function RoleGroup({
  role,
  files,
  commenting,
  findings,
  showCounter,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** False while no review has run yet — the count would only ever read 0. */
  showCounter: boolean;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(meta.defaultOpen);
  const count = React.useMemo(
    () => countFilesWithFindings(files, findings?.findings ?? []),
    [files, findings],
  );

  return (
    <div style={s.wrap}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...unstyledButton, ...s.header, width: "100%" }}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.colorSquare(meta.color)} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.desc}>{t(meta.descKey)}</span>
        {showCounter && count > 0 && (
          <span style={s.counter} aria-label={t("smartDiff.filesWithFindings", { count })}>
            ● {count}
          </span>
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <DiffViewer files={files} commenting={commenting} findings={findings} />
        </div>
      )}
    </div>
  );
}
