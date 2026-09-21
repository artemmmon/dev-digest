/* /skills — the Skills Lab: skill cards on the left, the selected skill's tabs on the right. The
   selection lives in ?skill=<id> (`new` = an empty draft) and the tab in ?tab=; leaving a skill
   with unsaved edits asks first. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { useSkills, useToggleSkill } from "@/lib/hooks/skills";
import { useSearchParamState, useSearchParamsUpdate } from "@/lib/use-search-param-state";
import { NEW_SKILL, SELECTION_PARAM, TAB_PARAM } from "../constants";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillDetail, parseTab } from "../SkillDetail";
import { SkillList } from "../SkillList";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const toggle = useToggleSkill();
  const [param] = useSearchParamState(SELECTION_PARAM, null);
  const [tabParam] = useSearchParamState(TAB_PARAM, null);
  const setParams = useSearchParamsUpdate();
  // Another skill keeps the open tab; a draft, a new skill and a delete start again on Config.
  const showSkill = (id: string | null, keepTab = false) =>
    setParams({ [SELECTION_PARAM]: id, ...(keepTab ? {} : { [TAB_PARAM]: null }) });
  const [importing, setImporting] = React.useState(false);
  const dirty = React.useRef(false);

  usePageCrumb([{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]);

  if (isError) return <ErrorState fullScreen body={t("page.loadError")} onRetry={() => refetch()} />;

  const all = skills ?? [];
  const drafting = param === NEW_SKILL;
  // An empty or stale ?skill= (deleted skill, old link) falls back to the first skill.
  const selected = drafting ? null : (all.find((sk) => sk.id === param) ?? all[0] ?? null);

  /** Run `go` unless it would drop unsaved edits the user wants to keep. */
  const guarded = (go: () => void) => {
    if (!dirty.current || window.confirm(t("detail.discardConfirm"))) go();
  };
  const select = (id: string) => guarded(() => showSkill(id, true));
  const create = () => guarded(() => showSkill(NEW_SKILL));
  const openImport = () => guarded(() => setImporting(true));

  // A new version (a save that changed the body, a restore) remounts the detail so its draft is reseeded.
  const editorKey = drafting ? NEW_SKILL : `${selected?.id ?? "none"}:${selected?.version ?? 0}`;
  const showEditor = drafting || selected;

  return (
    <div style={s.page}>
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onSaved={(skill) => {
            setImporting(false);
            showSkill(skill.id);
          }}
        />
      )}
      <SkillList
        skills={all}
        loading={isLoading}
        selectedId={selected?.id ?? null}
        onSelect={select}
        onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
        onCreate={create}
        onImport={openImport}
      />
      <div style={s.main}>
        {isLoading && (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={300} />
          </div>
        )}
        {!isLoading && showEditor && (
          <SkillDetail
            key={editorKey}
            skill={selected}
            tab={parseTab(tabParam, "config")}
            onTab={(tab) => setParams({ [TAB_PARAM]: tab === "config" ? null : tab })}
            onCreated={(created) => showSkill(created.id)}
            onDeleted={() => showSkill(null)}
            onDirtyChange={(d) => {
              dirty.current = d;
            }}
          />
        )}
        {!isLoading && !showEditor && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={create}
          />
        )}
      </div>
    </div>
  );
}
