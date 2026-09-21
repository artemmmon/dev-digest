/* SkillPreviewDrawer — a side panel over /skills: what a skill is (type, version, source, how many
   agents use it) and its body rendered as markdown, with a link to the full page. It shows the SAVED
   skill; editing lives on /skills/<id>. Which skill is open is the page's business (?skill=<id>). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Drawer, Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_SOURCE_ICON, SkillTypeChip } from "@/components/skill-type-chip";
import { DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillPreviewDrawer({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={<span className="mono">{skill.name}</span>}
      subtitle={skill.description}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Link
            href={`/skills/${encodeURIComponent(skill.id)}`}
            aria-label={t("previewDrawer.openLabel", { name: skill.name })}
            style={s.open}
          >
            {t("previewDrawer.open")}
            <Icon.ArrowRight size={14} />
          </Link>
        </div>
      }
    >
      <dl style={s.meta}>
        <div>
          <dt style={s.metaLabel}>{t("previewDrawer.type")}</dt>
          <dd style={s.metaValue}>
            <SkillTypeChip type={skill.type} />
          </dd>
        </div>
        <div>
          <dt style={s.metaLabel}>{t("previewDrawer.version")}</dt>
          <dd style={s.metaValue}>
            <Badge color="var(--text-secondary)" icon="GitCommit" mono>
              {t("detail.version", { version: skill.version })}
            </Badge>
          </dd>
        </div>
        <div>
          <dt style={s.metaLabel}>{t("previewDrawer.source")}</dt>
          <dd style={s.metaValue}>
            <SourceIcon size={12} />
            {t(`listItem.source.${skill.source}`)}
          </dd>
        </div>
        <div>
          <dt style={s.metaLabel}>{t("previewDrawer.agents")}</dt>
          <dd className="tnum" style={s.metaValue}>
            {t("listItem.agents", { count: skill.agent_count ?? 0 })}
          </dd>
        </div>
      </dl>
      <h3 style={s.bodyTitle}>{t("previewDrawer.body")}</h3>
      <div style={s.body}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <span style={s.empty}>{t("previewDrawer.noBody")}</span>}
      </div>
    </Drawer>
  );
}
