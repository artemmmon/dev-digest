/* /repos/:repoId/context — what the repository's project documents are: every markdown file under a
   specs/, docs/ or insights/ folder of the local checkout, with its type, token count and how many
   agents use it, and the selected one rendered as markdown. Read-only: no document is created, edited,
   uploaded or deleted here. The refresh control re-reads the checkout; nothing is cached on the server. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { DocContent, DocTypeBadge, formatTokens } from "@/components/context-docs";
import { RepoNotFound } from "@/components/repo-not-found";
import { useProjectDoc, useProjectDocs } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useProjectDocs(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const documents = list.data?.documents ?? [];
  // Derived, not stored: a selection that left the list (after a refresh) falls back to the first document.
  const active = documents.find((d) => d.path === selected) ?? documents[0] ?? null;
  const doc = useProjectDoc(repoId, active?.path);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  usePageCrumb([{ label: repoName, mono: true }, { label: t("page.crumb") }]);

  if (repoNotFound) return <RepoNotFound />;

  const refreshing = list.isFetching || (!!active && doc.isFetching);
  const refresh = () => {
    void list.refetch();
    if (active) void doc.refetch();
  };

  const header = (
    <div style={s.header}>
      <div style={s.headerText}>
        <h1 style={s.h1}>
          {t("page.heading")}
          {" · "}
          <span className="mono" style={s.repo}>
            {repoName}
          </span>
        </h1>
        {list.data && (
          <p style={s.subtitle}>
            {t("page.pattern")}:{" "}
            <span className="mono" style={s.pattern}>
              {list.data.pattern}
            </span>
            {" · "}
            {t("page.docCount", { count: documents.length })}
          </p>
        )}
      </div>
      <Button
        kind="secondary"
        size="sm"
        icon="RefreshCw"
        loading={refreshing}
        disabled={refreshing}
        aria-label={t("page.refreshLabel")}
        onClick={refresh}
      >
        {refreshing ? t("page.refreshing") : t("page.refresh")}
      </Button>
    </div>
  );

  if (list.isPending) {
    return (
      <div style={s.page}>
        {header}
        <div style={s.skeletonStack} role="status" aria-label={t("content.loading")}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      </div>
    );
  }
  if (list.isError) {
    return (
      <div style={s.page}>
        {header}
        <div style={s.centered}>
          <ErrorState body={t("page.loadError")} onRetry={() => void list.refetch()} />
        </div>
      </div>
    );
  }
  if (!list.data.cloned) {
    return (
      <div style={s.page}>
        {header}
        <div style={s.centered}>
          <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />
        </div>
      </div>
    );
  }
  if (documents.length === 0) {
    return (
      <div style={s.page}>
        {header}
        <div style={s.centered}>
          <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body", { pattern: list.data.pattern })} />
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {header}
      <div style={s.split}>
        <nav style={s.rail} aria-label={t("page.listLabel")}>
          <ul style={s.railList}>
            {documents.map((d) => (
              <li key={d.path}>
                <button
                  type="button"
                  aria-current={d.path === active?.path ? "true" : undefined}
                  onClick={() => setSelected(d.path)}
                  style={s.item(d.path === active?.path)}
                >
                  <span className="mono" style={s.itemPath}>
                    {d.path}
                  </span>
                  <span style={s.itemMeta}>
                    <DocTypeBadge type={d.type} />
                    <span className="mono">{t("tokens", { tokens: formatTokens(d.tokens) })}</span>
                    <span>{t("usedBy", { count: d.used_by })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section style={s.main} aria-label={active?.path}>
          {active ? (
            <>
              <div style={s.mainHead}>
                <Icon.FileText size={15} />
                <span className="mono" style={s.mainPath}>
                  {active.path}
                </span>
                <DocTypeBadge type={active.type} />
                <span style={s.mainMeta}>
                  <Icon.Cpu size={13} />
                  {t("usedBy", { count: active.used_by })}
                </span>
                <span className="mono" style={s.mainMeta}>
                  {t("tokens", { tokens: formatTokens(active.tokens) })}
                </span>
              </div>
              <div style={s.content}>
                <DocContent
                  content={doc.data}
                  isPending={doc.isPending}
                  isError={doc.isError}
                  onRetry={() => void doc.refetch()}
                />
              </div>
            </>
          ) : (
            <p style={s.hint}>{t("page.selectPrompt")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
