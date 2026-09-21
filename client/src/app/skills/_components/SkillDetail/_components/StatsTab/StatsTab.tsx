/* StatsTab — how much a skill is used: the number of agents that have it switched on and who
   they are. Pull frequency, accept rate and findings by category are not shown: findings are
   not attributed to a single skill (later lesson). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "@/lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: agents, isError, refetch } = useSkillAgents(skill.id);
  const count = agents?.length ?? skill.agent_count ?? 0;

  return (
    <div>
      <div style={s.stats}>
        <div style={s.stat}>
          <div style={s.statLabel}>{t("stats.usedBy")}</div>
          <div style={s.statValue}>
            <span className="tnum" style={s.statNumber}>
              {count}
            </span>
            <span style={s.statUnit}>{t("stats.agents", { count })}</span>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>
          <Icon.Cpu size={13} />
          {t("stats.agentsUsing")}
        </h3>
        {isError ? (
          <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />
        ) : !agents ? (
          <Skeleton height={40} />
        ) : agents.length === 0 ? (
          <p style={s.muted}>{t("stats.none")}</p>
        ) : (
          <ul style={s.list}>
            {agents.map((a) => (
              <li key={a.id} style={s.row}>
                <span style={s.rowIcon}>
                  <Icon.Cpu size={13} />
                </span>
                <span style={s.rowName}>{a.name}</span>
                <Link href={`/agents/${a.id}?tab=skills`} style={s.open} aria-label={t("stats.open", { name: a.name })}>
                  {t("stats.openLabel")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
