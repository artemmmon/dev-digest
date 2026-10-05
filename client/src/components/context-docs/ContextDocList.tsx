/* ContextDocList — the Context tab's list of a repository's project documents. One ordered list:
   the documents attached to the owner (an agent or a skill) first, in their stored order, each with
   a reorder grip (drag, or ArrowUp / ArrowDown on the grip); then the ones inherited through
   skills (read-only); then every other document by path. A stored path that is no longer a
   document is a "missing" row whose only control detaches it. The owner decides how to save:
   `onChange` gets the WHOLE new attachment list. Native HTML5 drag-and-drop, no library. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, Icon } from "@devdigest/ui";
import type { ProjectDocumentList } from "@devdigest/shared";
import { CONTEXT_TOKEN_SOFT_CAP } from "./constants";
import { DocPreviewDrawer } from "./DocPreviewDrawer";
import { DocTypeBadge } from "./DocTypeBadge";
import {
  formatTokens,
  matchesFilter,
  moveAttached,
  moveAttachedTo,
  orderRows,
  splitPath,
  toggleAttached,
  totalTokens,
  type DocRow,
  type InheritedDoc,
} from "./helpers";
import { s } from "./styles";

export interface ContextDocListProps {
  repoId: string;
  /** The repository's documents (the server's list, with `pattern` and `cloned`). */
  list: ProjectDocumentList;
  /** Attached paths in stored order. */
  attached: string[];
  /** Documents reached through skills (agents only); shown read-only. */
  inherited?: InheritedDoc[];
  /** Called with the whole new attachment list. */
  onChange: (paths: string[]) => void;
  /** A save is running: nothing can be changed until it settles. */
  busy?: boolean;
  compact?: boolean;
}

export function ContextDocList({ repoId, list, attached, inherited = [], onChange, busy, compact }: ContextDocListProps) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  // Indexes are positions in the FULL attached list (not the filtered view).
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null);
  const clearDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };
  // A keyboard move re-orders the DOM, which can drop focus from the grip that was pressed.
  const grips = React.useRef(new Map<string, HTMLButtonElement>());
  const refocus = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    if (refocus.current) grips.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  const rows = orderRows(list.documents, attached, inherited);
  const attachedIndex = new Map(attached.map((p, i) => [p, i]));
  const visible = rows.filter((r) => matchesFilter(r.path, filter));
  const previewRow = previewPath ? rows.find((r) => r.path === previewPath && r.doc) : undefined;
  const total = totalTokens(list.documents, [...attached, ...inherited.map((i) => i.path)]);
  const over = total > CONTEXT_TOKEN_SOFT_CAP;
  const canChange = !busy;

  const apply = (next: string[]) => {
    if (canChange && next !== attached) onChange(next);
  };
  const dropEdge = (i: number): "top" | "bottom" | null => {
    if (dragFrom === null || dropAt !== i || dropAt === dragFrom) return null;
    return dropAt < dragFrom ? "top" : "bottom";
  };
  const moveWithKey = (e: React.KeyboardEvent, path: string, i: number) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (!canChange) return;
    const next = moveAttached(attached, i, e.key === "ArrowUp" ? -1 : 1);
    if (next !== attached) refocus.current = path;
    apply(next);
  };

  if (!list.cloned) {
    return <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body", { pattern: list.pattern })} />;
  }

  const renderRow = (row: DocRow) => {
    const { dir, name } = splitPath(row.path);
    const i = attachedIndex.get(row.path) ?? -1;
    const isAttached = row.kind === "attached";
    const canDrag = isAttached && canChange;
    return (
      <li
        key={row.path}
        data-testid={`context-doc-${row.path}`}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!isAttached) return;
          // Firefox starts a drag only once data is set; jsdom has no dataTransfer.
          e.dataTransfer?.setData("text/plain", row.path);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          setDragFrom(i);
        }}
        onDragOver={(e) => {
          // Only an attached row is a drop target: no preventDefault elsewhere, so the browser refuses the drop.
          if (dragFrom === null || !isAttached) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          if (dropAt !== i) setDropAt(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null && isAttached) apply(moveAttachedTo(attached, dragFrom, i));
          clearDrag();
        }}
        onDragEnd={clearDrag}
        style={{ ...s.row(row.kind, !!compact), ...s.dragRow(dragFrom === i && isAttached, isAttached ? dropEdge(i) : null) }}
      >
        {isAttached ? (
          <button
            type="button"
            ref={(el) => {
              if (el) grips.current.set(row.path, el);
              else grips.current.delete(row.path);
            }}
            aria-label={t("list.moveHandle", { path: row.path })}
            title={t("list.dragHandle")}
            onKeyDown={(e) => moveWithKey(e, row.path, i)}
            style={s.grip(canChange)}
          >
            <Icon.Menu size={14} />
          </button>
        ) : (
          <span aria-hidden="true" style={s.gripSpacer} />
        )}
        {row.kind === "inherited" ? (
          <span aria-hidden="true" style={s.checkbox(true, true)}>
            <Icon.Check size={11} style={{ color: "#fff" }} />
          </span>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={row.kind !== "unattached"}
            aria-label={
              row.kind === "missing" ? t("list.detachLabel", { path: row.path }) : t("list.toggleLabel", { path: row.path })
            }
            disabled={!canChange}
            onClick={() => apply(toggleAttached(attached, row.path))}
            style={s.checkbox(row.kind !== "unattached", false)}
          >
            {row.kind !== "unattached" && <Icon.Check size={11} style={{ color: "#fff" }} />}
          </button>
        )}
        <span style={s.pathCell} title={row.path}>
          <span className="mono" style={s.pathName}>
            {name}
          </span>
          <span className="mono" style={s.pathDir}>
            {dir}
          </span>
        </span>
        {row.kind === "inherited" && <span style={s.via}>{t("list.viaSkill", { name: row.skillName ?? "" })}</span>}
        {row.kind === "missing" ? (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("list.missing")}
          </Badge>
        ) : (
          row.doc && <DocTypeBadge type={row.doc.type} />
        )}
        {row.doc && (
          <button
            type="button"
            aria-label={t("list.previewLabel", { path: row.path })}
            title={t("list.preview")}
            onClick={() => setPreviewPath(row.path)}
            style={s.preview}
          >
            <Icon.Eye size={13} />
            {!compact && t("list.preview")}
          </button>
        )}
      </li>
    );
  };

  return (
    <div style={s.wrap}>
      {previewRow?.doc && (
        <DocPreviewDrawer
          repoId={repoId}
          doc={previewRow.doc}
          attached={previewRow.kind === "attached"}
          onToggle={previewRow.kind === "inherited" || !canChange ? undefined : (path) => apply(toggleAttached(attached, path))}
          onClose={() => setPreviewPath(null)}
        />
      )}
      <p style={s.hint}>{t("list.orderHint")}</p>
      <div style={s.filter}>
        <Icon.Search size={13} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("list.filterPlaceholder")}
          aria-label={t("list.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>
      <ul style={s.list} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}>
        {visible.map(renderRow)}
        {visible.length === 0 && <li style={s.muted}>{t("list.noMatch", { q: filter.trim() })}</li>}
      </ul>
      <div style={s.footer}>
        <span className="mono" style={s.total(over)}>
          {t("tokens", { tokens: formatTokens(total) })}
        </span>
        {over && (
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
            {t("overCap", { cap: formatTokens(CONTEXT_TOKEN_SOFT_CAP) })}
          </Badge>
        )}
        <span style={s.footerNote}>{t("list.untrustedNote")}</span>
      </div>
    </div>
  );
}
