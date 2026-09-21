/* /skills/<id> — one skill on its own page: a back link and the SkillDetail tabs (Config · Preview ·
   Stats · Versioning). The open tab lives in ?tab= (absent = Config). Leaving with unsaved edits asks
   first; deleting a skill (SkillDetail confirms) returns to the grid. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks/skills";
import { useSearchParamState } from "@/lib/use-search-param-state";
import { TAB_PARAM } from "../constants";
import { SkillDetail, parseTab } from "../SkillDetail";
import { s } from "./styles";

export function SkillPageView({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const [tabParam, setTab] = useSearchParamState(TAB_PARAM, null);
  const dirty = React.useRef(false);
  // After a delete the skill's query is gone; render nothing instead of flashing the error state.
  const [leaving, setLeaving] = React.useState(false);

  usePageCrumb([
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(skill ? [{ label: skill.name, mono: true }] : []),
  ]);

  if (leaving) return null;
  if (isError) return <ErrorState fullScreen body={t("page.detailLoadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.page}>
      <Link
        href="/skills"
        style={s.back}
        onClick={(e) => {
          if (dirty.current && !window.confirm(t("detail.discardConfirm"))) e.preventDefault();
        }}
      >
        <Icon.ChevronLeft size={13} />
        {t("page.back")}
      </Link>
      {isLoading || !skill ? (
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={300} />
        </div>
      ) : (
        <SkillDetail
          // A saved body (or a restore) is a new version: remount so the draft is reseeded.
          key={`${skill.id}:${skill.version}`}
          skill={skill}
          tab={parseTab(tabParam, "config")}
          onTab={(tab) => setTab(tab === "config" ? null : tab)}
          onDeleted={() => {
            setLeaving(true);
            router.push("/skills");
          }}
          onDirtyChange={(d) => {
            dirty.current = d;
          }}
        />
      )}
    </div>
  );
}
