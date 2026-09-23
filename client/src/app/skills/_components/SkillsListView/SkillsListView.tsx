/* /skills — the Skills Lab: a grid of skill cards. Clicking a card opens a side panel with the
   rendered skill (?skill=<id>, so it survives a reload); "Add" offers Create (a dialog, also
   reachable as ?create=1) and Import. Editing, versions and stats live on /skills/<id>. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { useDeleteSkill, useSkills, useToggleSkill } from "@/lib/hooks/skills";
import { useSearchParamState, useSearchParamsUpdate } from "@/lib/use-search-param-state";
import { CREATE_ON, CREATE_PARAM, SELECTION_PARAM } from "../constants";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillGrid } from "../SkillGrid";
import { SkillPreviewDrawer } from "../SkillPreviewDrawer";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const toggle = useToggleSkill();
  const del = useDeleteSkill();
  const [selectedParam] = useSearchParamState(SELECTION_PARAM, null);
  const [createParam] = useSearchParamState(CREATE_PARAM, null);
  const setParams = useSearchParamsUpdate();
  const [importing, setImporting] = React.useState(false);

  usePageCrumb([{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]);

  if (isError) return <ErrorState fullScreen body={t("page.loadError")} onRetry={() => refetch()} />;

  const all = skills ?? [];
  // A stale ?skill= (deleted skill, old link) simply opens nothing.
  const selected = all.find((sk) => sk.id === selectedParam) ?? null;
  const deletingId = del.isPending ? (del.variables ?? null) : null;

  const remove = (id: string) =>
    del.mutate(id, { onSuccess: () => id === selectedParam && setParams({ [SELECTION_PARAM]: null }) });

  return (
    <>
      <SkillGrid
        skills={all}
        loading={isLoading}
        selectedId={selected?.id ?? null}
        deletingId={deletingId}
        onSelect={(id) => setParams({ [SELECTION_PARAM]: id })}
        onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
        onDelete={remove}
        onCreate={() => setParams({ [CREATE_PARAM]: CREATE_ON })}
        onImport={() => setImporting(true)}
      />
      {selected && <SkillPreviewDrawer skill={selected} onClose={() => setParams({ [SELECTION_PARAM]: null })} />}
      {createParam === CREATE_ON && (
        <CreateSkillModal
          onClose={() => setParams({ [CREATE_PARAM]: null })}
          onCreated={(skill) => router.push(`/skills/${encodeURIComponent(skill.id)}`)}
        />
      )}
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onSaved={(skill) => {
            setImporting(false);
            setParams({ [SELECTION_PARAM]: skill.id });
          }}
        />
      )}
    </>
  );
}
