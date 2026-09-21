/* VersionsTab — every saved body of a skill, newest first, with the message written at save time.
   Diff compares a version with the current body; Restore saves that body again as a NEW version
   (history is never rewritten), so it is blocked while the Config tab has unsaved edits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { dayOf, lineDiff } from "./helpers";
import { s } from "./styles";
import { useVersionsTab } from "./use-versions-tab";

const SIGN = { same: " ", add: "+", del: "−" } as const;

export function VersionsTab({ skill, dirty }: { skill: Skill; dirty: boolean }) {
  const t = useTranslations("skills");
  const { versions, isError, refetch, open, toggleDiff, restore, restoring } = useVersionsTab(skill);

  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  if (!versions) return <Skeleton height={120} />;

  const label = (v: SkillVersion) => v.message ?? (v.version === 1 ? t("versions.initial") : t("versions.untitled", { version: v.version }));

  return (
    <div>
      <div style={s.headRow}>
        <h3 style={s.h3}>{t("versions.title")}</h3>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.sub}>{t("versions.subtitle")}</p>
      {dirty && <p style={s.sub}>{t("versions.dirtyNote")}</p>}
      <ul style={s.list}>
        {versions.map((v) => {
          const current = v.version === skill.version;
          const expanded = open === v.version;
          return (
            <li key={v.version} style={s.item}>
              <div style={s.row}>
                <span className="mono" style={s.version}>
                  {t("detail.version", { version: v.version })}
                </span>
                <div style={s.text}>
                  <div style={s.message}>{label(v)}</div>
                  <div className="tnum" style={s.date}>
                    {dayOf(v.created_at)}
                  </div>
                </div>
                <div style={s.actions}>
                  {current ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                      {t("versions.current")}
                    </Badge>
                  ) : (
                    <>
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="Eye"
                        aria-expanded={expanded}
                        aria-label={t("versions.diffLabel", { version: v.version })}
                        onClick={() => toggleDiff(v.version)}
                      >
                        {t("versions.diff")}
                      </Button>
                      <Button
                        kind="ghost"
                        size="sm"
                        icon="History"
                        aria-label={t("versions.restoreLabel", { version: v.version })}
                        title={dirty ? t("versions.dirtyNote") : undefined}
                        disabled={dirty || restoring}
                        onClick={() => restore(v)}
                      >
                        {t("versions.restore")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {expanded && !current && (
                <>
                  <div style={s.diffHint}>{t("versions.diffHint", { version: v.version })}</div>
                  <div className="mono" role="list" aria-label={t("versions.diffLabel", { version: v.version })} style={s.diff}>
                    {lineDiff(skill.body, v.body).map((l, i) => (
                      <div key={i} role="listitem" data-kind={l.kind} style={s.line(l.kind)}>
                        <span aria-hidden="true" style={s.sign}>
                          {SIGN[l.kind]}
                        </span>
                        <span>{l.text || " "}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
