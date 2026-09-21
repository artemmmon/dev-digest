/* SkillList — the left column of /skills: title, "Add Skill" menu, search and one row per
   skill. It only reports what the user did; the page decides what selecting, creating or
   importing means (it may have unsaved edits to protect). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillListItem } from "./_components/SkillListItem";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillList({
  skills,
  loading,
  selectedId,
  onSelect,
  onToggle,
  onCreate,
  onImport,
}: {
  skills: Skill[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills, search);

  return (
    <div style={s.column}>
      <div style={s.head}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: onImport },
              { divider: true },
              { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
            ]}
          />
        </div>
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
      </div>
      {loading ? (
        <div style={s.loading}>
          <Skeleton height={70} />
          <Skeleton height={70} />
          <Skeleton height={70} />
        </div>
      ) : (
        <ul style={s.list}>
          {list.map((sk) => (
            <SkillListItem
              key={sk.id}
              skill={sk}
              active={sk.id === selectedId}
              onSelect={() => onSelect(sk.id)}
              onToggle={(enabled) => onToggle(sk.id, enabled)}
            />
          ))}
          {skills.length > 0 && list.length === 0 && (
            <li style={s.noMatch}>{t("page.noMatch", { q: search.trim() })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
