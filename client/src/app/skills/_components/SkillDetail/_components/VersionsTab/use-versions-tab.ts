/* useVersionsTab — data and actions behind VersionsTab: the version list, which row's diff is
   open, and Restore (which saves an older body again as a NEW version, after the user confirms
   in a ConfirmDialog: `askRestore` opens it, `restore` runs it, `cancelRestore` closes it). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { notify } from "@/lib/toast";

export function useVersionsTab(skill: Skill) {
  const t = useTranslations("skills");
  const { data: versions, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [open, setOpen] = React.useState<number | null>(null);
  const [asking, setAsking] = React.useState<SkillVersion | null>(null);

  const toggleDiff = (version: number) => setOpen((cur) => (cur === version ? null : version));

  const askRestore = (v: SkillVersion) => setAsking(v);
  const cancelRestore = () => setAsking(null);

  const restore = () => {
    const v = asking;
    if (!v) return;
    // mutateAsync: the restore changes the version, which remounts the detail and drops per-call callbacks.
    update
      .mutateAsync({ id: skill.id, patch: { body: v.body, message: t("versions.restoredMessage", { version: v.version }) } })
      .then((saved) => notify.success(t("versions.restoredToast", { from: v.version, to: saved.version })))
      .catch(() => {})
      .finally(() => setAsking(null));
  };

  return {
    versions,
    isError,
    refetch,
    open,
    toggleDiff,
    asking,
    askRestore,
    cancelRestore,
    restore,
    restoring: update.isPending,
  };
}
