/* ReviewFocus — "Review focus — read these first": the brief's `file:line — reason` items in
   stored order, each a button that opens Files changed at that file and line. Not rendered when
   the brief has no items. File, line and reason are plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  /** Jump to a file and line in Files changed (or tell the user the file is not in the diff). */
  onOpenFile: (file: string, line: number) => void;
}

export function ReviewFocus({ items, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("brief");
  const [hovered, setHovered] = React.useState<number | null>(null);
  if (items.length === 0) return null;

  return (
    <section style={s.box} aria-labelledby="brief-review-focus">
      <div style={s.header}>
        <Icon.ListChecks size={14} style={{ color: "var(--accent)" }} />
        <h3 id="brief-review-focus" style={s.title}>
          {t("block.reviewFocus")}
        </h3>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>
      <ol style={s.list}>
        {items.map((item, i) => (
          <li key={`${item.file}:${item.line}-${i}`}>
            <button
              type="button"
              style={s.item(hovered === i)}
              title={t("focus.jumpTo", { file: item.file, line: item.line })}
              onClick={() => onOpenFile(item.file, item.line)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span aria-hidden style={s.arrow}>
                ▸
              </span>
              <span className="mono" style={s.where}>
                {item.file}:{item.line}
              </span>
              <span style={s.reason}>— {item.reason}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
