/* SkillDetail — the right side of /skills: a header (name, type, version, delete) and the tabs
   Config · Preview · Stats · Versions. It owns the draft of the skill being edited, so Preview shows
   unsaved text and switching tabs loses nothing. The page remounts it (key) when another skill — or
   another version of the same one — is selected, which resets the draft. A skill someone else wrote
   is flagged in Config: its body becomes instructions inside every prompt that uses it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { useCreateSkill, useDeleteSkill, useToggleSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { notify } from "@/lib/toast";
import { EMPTY_DRAFT, changedFields, draftFromSkill, isDraftValid, type SkillDraft } from "../helpers";
import { DRAFT_TABS, TABS, type SkillTab } from "./constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onCreated,
  onDeleted,
  onDirtyChange,
}: {
  /** The saved skill being edited, or null for a new draft. */
  skill: Skill | null;
  tab: SkillTab;
  onTab: (tab: SkillTab) => void;
  onCreated: (skill: Skill) => void;
  onDeleted: () => void;
  /** Tells the page whether leaving would lose edits. */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toggle = useToggleSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => (skill ? draftFromSkill(skill) : EMPTY_DRAFT));
  const [message, setMessage] = React.useState("");

  const base = skill ? draftFromSkill(skill) : EMPTY_DRAFT;
  const patch = changedFields(base, draft);
  const dirty = Object.keys(patch).length > 0;
  const valid = isDraftValid(draft);
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const tabs = (skill ? TABS : DRAFT_TABS).map((k) => ({ key: k, label: t(`detail.tabs.${k}`) }));
  const active = tabs.some((x) => x.key === tab) ? tab : "config";

  const save = () => {
    if (!dirty || !valid || pending) return;
    if (!skill) {
      create.mutate(draft, {
        onSuccess: (created) => {
          notify.success(t("form.createdToast", { name: created.name }));
          onCreated(created);
        },
      });
      return;
    }
    // mutateAsync, not mutate + callbacks: a saved body changes the version, which remounts this
    // component, and per-call callbacks are dropped once it is unmounted. Errors are toasted globally.
    update
      .mutateAsync({
        id: skill.id,
        patch: { ...patch, ...(patch.body !== undefined && message.trim() ? { message } : {}) },
      })
      .then((saved) => {
        setDraft(draftFromSkill(saved));
        setMessage("");
        notify.success(t("form.savedToast", { name: saved.name, version: saved.version }));
      })
      .catch(() => {});
  };

  const discard = () => {
    setDraft(base);
    setMessage("");
  };

  const remove = () => {
    if (skill && window.confirm(t("detail.deleteConfirm", { name: skill.name }))) {
      del.mutate(skill.id, { onSuccess: onDeleted });
    }
  };

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h2 className="mono" style={s.title}>
          {skill ? skill.name : t("detail.newTitle")}
        </h2>
        {skill && <SkillTypeChip type={skill.type} />}
        {skill && (
          <Badge color="var(--text-secondary)" icon="GitCommit" mono>
            {t("detail.version", { version: skill.version })}
          </Badge>
        )}
        {skill && (
          <div style={s.actions}>
            <IconBtn icon="Trash" label={t("detail.delete")} danger onClick={del.isPending ? undefined : remove} />
          </div>
        )}
      </div>
      <Tabs tabs={tabs} value={active} onChange={(k) => onTab(k as SkillTab)} pad="0 28px" />

      <div style={s.content}>
        {active === "config" && (
          <ConfigTab
            skill={skill}
            form={{
              draft,
              onDraft: setDraft,
              message,
              onMessage: setMessage,
              dirty,
              bodyChanged: patch.body !== undefined,
              valid,
              pending,
              onSave: save,
              onDiscard: discard,
            }}
            onToggle={(enabled) => skill && toggle.mutate({ id: skill.id, enabled })}
          />
        )}
        {active === "preview" && (
          <div style={s.scroll}>
            <PreviewTab body={draft.body} />
          </div>
        )}
        {active === "stats" && skill && (
          <div style={s.scroll}>
            <StatsTab skill={skill} />
          </div>
        )}
        {active === "versions" && skill && (
          <div style={s.scroll}>
            <VersionsTab skill={skill} dirty={dirty} />
          </div>
        )}
      </div>
    </div>
  );
}
