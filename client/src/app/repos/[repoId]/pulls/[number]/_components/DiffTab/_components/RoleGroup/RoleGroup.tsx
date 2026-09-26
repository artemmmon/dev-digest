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
  const [hovered, setHovered] = React.useState(false);
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...unstyledButton, ...s.header(hovered, open), width: "100%" }}
      >
        <Icon.ChevronRight size={14} style={chevronFor(open)} />
        <span style={s.colorSquare(meta.color)} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.desc}>{t(meta.descKey)}</span>
        <span style={s.right}>
          {showCounter && count > 0 && (
            <span style={s.counter} aria-label={t("smartDiff.filesWithFindings", { count })}>
              <span style={s.counterDot} />
              {count}
            </span>
          )}
          <span style={s.filesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
        </span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
