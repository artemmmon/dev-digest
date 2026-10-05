/* SkillDetail — the body of /skills/<id>: a header (name, type, version, delete) and the tabs
   Config · Context · Preview · Stats · Versioning. It owns the draft of the skill being edited, so Preview
   shows unsaved text and switching tabs loses nothing. The page remounts it (key) when another version of
   the skill is saved, which resets the draft. The Context tab's document list is part of the draft, but
   saving only that list does not make a new version, so no remount happens: the list draft is reset by
   hand after a save. A skill someone else wrote is flagged in Config: its body
   becomes instructions inside every prompt that uses it. Delete asks in a ConfirmDialog. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill, useToggleSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useSkillContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { notify } from "@/lib/toast";
import { changedFields, draftFromSkill, isDraftValid, type SkillDraft } from "../helpers";
import { sameList } from "./helpers";
import { TABS, type SkillTab } from "./constants";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onDeleted,
  onDirtyChange,
}: {
  /** The saved skill being edited. */
  skill: Skill;
  tab: SkillTab;
  onTab: (tab: SkillTab) => void;
  /** The skill was deleted (after the user confirmed). */
  onDeleted: () => void;
  /** Tells the page whether leaving would lose edits. */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toggle = useToggleSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => draftFromSkill(skill));
  const [message, setMessage] = React.useState("");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // The repository the context belongs to: the active one. The raw id can be a stale stored id that matches no repository.
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const contextQ = useSkillContext(skill.id, repoId);
  // `null` = untouched: the tab shows the saved list. Tied to the repo it was edited for, so
  // switching repository drops it instead of sending one repo's paths to another.
  const [contextDraft, setContextDraft] = React.useState<{ repoId: string; paths: string[] } | null>(null);

  const base = draftFromSkill(skill);
  const patch = changedFields(base, draft);
  const savedPaths = contextQ.data?.paths;
  const draftPaths = contextDraft && contextDraft.repoId === repoId ? contextDraft.paths : null;
  const contextChanged = draftPaths !== null && savedPaths !== undefined && !sameList(draftPaths, savedPaths);
  const dirty = Object.keys(patch).length > 0 || contextChanged;
  const valid = isDraftValid(draft);
  const pending = update.isPending;

  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const tabs = TABS.map((k) => ({ key: k, label: t(`detail.tabs.${k}`) }));
  const active = tabs.some((x) => x.key === tab) ? tab : "config";

  const save = () => {
    if (!dirty || !valid || pending) return;
    // mutateAsync, not mutate + callbacks: a saved body changes the version, which remounts this
    // component, and per-call callbacks are dropped once it is unmounted. Errors are toasted globally.
    update
      .mutateAsync({
        id: skill.id,
        patch: {
          ...patch,
          ...(patch.body !== undefined && message.trim() ? { message } : {}),
          ...(contextChanged && repoId && draftPaths ? { context: { repo_id: repoId, paths: draftPaths } } : {}),
        },
      })
      .then((saved) => {
        setDraft(draftFromSkill(saved));
        setContextDraft(null);
        setMessage("");
        notify.success(t("form.savedToast", { name: saved.name, version: saved.version }));
      })
      .catch(() => {});
  };

  const discard = () => {
    setDraft(base);
    setContextDraft(null);
    setMessage("");
  };

  const remove = () => del.mutate(skill.id, { onSuccess: onDeleted, onError: () => setConfirmingDelete(false) });

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h2 className="mono" style={s.title}>
          {skill.name}
        </h2>
        <SkillTypeChip type={skill.type} />
        <Badge color="var(--text-secondary)" icon="GitCommit" mono>
          {t("detail.version", { version: skill.version })}
        </Badge>
        <div style={s.actions}>
          <IconBtn icon="Trash" label={t("detail.delete")} danger onClick={() => setConfirmingDelete(true)} />
        </div>
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
            onToggle={(enabled) => toggle.mutate({ id: skill.id, enabled })}
          />
        )}
        {active === "context" && (
          <ContextTab
            form={{
              repoId,
              saved: savedPaths,
              loadFailed: contextQ.isError,
              onRetry: () => void contextQ.refetch(),
              paths: draftPaths ?? savedPaths ?? [],
              onPaths: (paths) => repoId && setContextDraft({ repoId, paths }),
              dirty,
              valid,
              pending,
              onSave: save,
              onDiscard: discard,
            }}
          />
        )}
        {active === "preview" && (
          <div style={s.scroll}>
            <PreviewTab body={draft.body} />
          </div>
        )}
        {active === "stats" && (
          <div style={s.scroll}>
            <StatsTab skill={skill} />
          </div>
        )}
        {active === "versions" && (
          <div style={s.scroll}>
            <VersionsTab skill={skill} dirty={dirty} />
          </div>
        )}
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          danger
          title={t("detail.deleteTitle")}
          body={t("detail.deleteConfirm", { name: skill.name })}
          confirmLabel={tc("actions.delete")}
          pending={del.isPending}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
