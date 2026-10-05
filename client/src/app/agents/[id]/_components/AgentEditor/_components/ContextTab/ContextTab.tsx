/* ContextTab — the project documents attached to one agent for the active repository. The list is
   the shared ContextDocList; every attach, detach and reorder replaces the agent's whole attachment
   list on the server at once (no save button). The hook shows the change immediately and takes it
   back, with an error toast, if the save fails. Counts and totals are computed while rendering. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocList } from "@/components/context-docs";
import { useAgentContext, useProjectDocs, useSetAgentContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { activeRepo, reposLoaded } = useActiveRepo();
  if (!reposLoaded) return <ContextSkeleton />;
  if (!activeRepo) return <EmptyState icon="Folder" title={t("context.noRepo")} />;
  return <RepoContext agent={agent} repoId={activeRepo.id} repoName={activeRepo.full_name} />;
}

function ContextSkeleton() {
  return (
    <div style={s.wrap}>
      <Skeleton height={20} width={200} />
      <Skeleton height={180} />
    </div>
  );
}

function RepoContext({ agent, repoId, repoName }: { agent: Agent; repoId: string; repoName: string }) {
  const t = useTranslations("agents");
  const docsQ = useProjectDocs(repoId);
  const ctxQ = useAgentContext(agent.id, repoId);
  const save = useSetAgentContext(agent.id, repoId);

  if (docsQ.isError || ctxQ.isError) {
    return (
      <ErrorState
        body={t("context.loadError")}
        onRetry={() => {
          void docsQ.refetch();
          void ctxQ.refetch();
        }}
      />
    );
  }
  if (!docsQ.data || !ctxQ.data) return <ContextSkeleton />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedCount", { attached: ctxQ.data.paths.length, total: docsQ.data.documents.length })}
        </Badge>
      </div>
      <p style={s.repo}>
        {t("context.repo")}:{" "}
        <span className="mono" style={s.repoName}>
          {repoName}
        </span>
      </p>
      <ContextDocList
        repoId={repoId}
        list={docsQ.data}
        attached={ctxQ.data.paths}
        inherited={ctxQ.data.inherited}
        onChange={(paths) => save.mutate(paths)}
        busy={save.isPending}
      />
    </div>
  );
}
