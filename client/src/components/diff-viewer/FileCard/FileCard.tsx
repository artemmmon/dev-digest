/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, colorForLanguage } from "../constants";
import { parsePatch, fileChip, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, type DiffFindingApi } from "../findings";
import { focusKey, type DiffFocus } from "../focus";
import { unstyledButton } from "@/lib/interactive";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OutOfPatchFindings } from "../OutOfPatchFindings";

/** Entries of a `Map<string, T[]>` anchored to a given parsed line (RIGHT=new, LEFT=old). */
function forLine<T>(ln: Line, matched: Map<string, T[]>): T[] {
  if (matched.size === 0) return [];
  const out: T[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  focus,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  focus?: DiffFocus;
}) {
  const t = useTranslations("shell");
  const chip = React.useMemo(() => fileChip(file.path), [file.path]);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const isFocused = focus?.path === file.path;
  const key = focusKey(focus);
  const defaultOpen =
    !chip?.generated && (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES;
  // A hand toggle is kept together with the focus it was made under, so a new
  // jump always opens the file again, and the user can still collapse it after.
  const [toggle, setToggle] = React.useState<{ key: string; open: boolean } | null>(null);
  const open = (toggle?.key === key ? toggle.open : null) ?? (isFocused || defaultOpen);

  // The jump line counts only when this file really shows it on its new side.
  const focusLine =
    isFocused && focus?.line != null && lines.some((l) => l.newNo === focus.line)
      ? focus.line
      : null;

  const cardRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLButtonElement>(null);
  // Highlight lasts about 2 s: the timer records which focus has faded.
  const [fadedKey, setFadedKey] = React.useState<string | null>(null);
  const highlightLine = fadedKey === key ? null : focusLine;

  React.useEffect(() => {
    if (!isFocused) return;
    // `line` is a validated positive integer, so the selector cannot be bent.
    const target =
      (focusLine != null
        ? cardRef.current?.querySelector<HTMLElement>(`[data-new-line="${focusLine}"]`)
        : null) ?? headerRef.current;
    // jsdom has no scrollIntoView.
    target?.scrollIntoView?.({ block: "center" });
    if (focusLine == null) return;
    const timer = setTimeout(() => setFadedKey(key), 2000);
    return () => clearTimeout(timer);
    // Scroll once per jump, not on every re-render of the card.
  }, [isFocused, focusLine, key]);

  // Keys the rendered lines can host a thread/finding on — shared by both slots.
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const fileFindings = React.useMemo(
    () => findings?.findings.filter((f) => f.file === file.path) ?? [],
    [findings, file.path],
  );
  const { matched: matchedFindings, outOfPatch } = React.useMemo(() => {
    if (fileFindings.length === 0)
      return { matched: new Map<string, FindingRecord[]>(), outOfPatch: [] };
    return partitionFindings(fileFindings, renderedKeys);
  }, [fileFindings, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div
      ref={cardRef}
      style={isFocused ? { ...s.fileCard, ...s.fileCardFocused } : s.fileCard}
      data-focused={isFocused ? "true" : undefined}
    >
      <button
        ref={headerRef}
        type="button"
        aria-expanded={open}
        onClick={() => setToggle({ key, open: !open })}
        style={{ ...unstyledButton, ...s.fileHeader, width: "100%" }}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {chip && (
          <span
            className="mono"
            style={s.langChip(colorForLanguage(chip.label))}
            title={
              chip.generated
                ? t("diffViewer.generatedTitle", { name: chip.name })
                : t("diffViewer.languageTitle", { name: chip.name })
            }
          >
            {chip.generated ? `${chip.label} · ${t("diffViewer.generatedSuffix")}` : chip.label}
          </span>
        )}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileFindings.length > 0 && (
          <span
            role="img"
            aria-label={t("diffViewer.fileHasFindings")}
            title={t("diffViewer.fileHasFindings")}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--crit)",
              flexShrink: 0,
            }}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </button>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={forLine(ln, matched)}
                commenting={commenting}
                lineFindings={forLine(ln, matchedFindings)}
                findings={findings}
                highlighted={highlightLine != null && ln.newNo === highlightLine}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.show && (
            <OutOfPatchFindings findings={outOfPatch} renderFinding={findings.renderFinding} />
          )}
        </div>
      )}
    </div>
  );
}
