/* SkillGrid — the body of /skills: title, "Add" menu (Create / Import), search and one card per
   skill. It only reports what the user did; the page decides what selecting, creating,
   importing or deleting means. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillCard } from "./_components/SkillCard";
import { LOADING_CARDS } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillGrid({
  skills,
  loading,
  selectedId,
  deletingId,
  onSelect,
  onToggle,
  onDelete,
  onCreate,
  onImport,
}: {
  skills: Skill[];
  loading?: boolean;
  /** The skill whose preview is open. */
  selectedId: string | null;
  /** The skill being deleted right now, if any. */
  deletingId?: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills, search);
  const noMatch = !loading && skills.length > 0 && list.length === 0;

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h1 style={s.h1}>{t("page.heading")}</h1>
        <div style={s.search}>
          <Icon.Search size={13} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
        <Dropdown
          width={180}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("page.addSkill")}
            </Button>
          }
          items={[
            { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
            { label: t("page.menu.import"), icon: "Upload", onClick: onImport },
          ]}
        />
      </div>
      {loading ? (
        <div style={s.grid}>
          {Array.from({ length: LOADING_CARDS }, (_, i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={onCreate}
        />
      ) : (
        <ul style={s.grid}>
          {list.map((sk) => (
            <SkillCard
              key={sk.id}
              skill={sk}
              active={sk.id === selectedId}
              deleting={sk.id === deletingId}
              onSelect={() => onSelect(sk.id)}
              onToggle={(enabled) => onToggle(sk.id, enabled)}
              onDelete={() => onDelete(sk.id)}
            />
          ))}
        </ul>
      )}
      {/* Always mounted so screen readers announce the text when it appears. */}
      <p role="status" aria-live="polite" style={noMatch ? s.noMatch : undefined}>
        {noMatch ? t("page.noMatch", { q: search.trim() }) : null}
      </p>
    </div>
  );
}
