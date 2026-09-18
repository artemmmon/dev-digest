/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useRepos } from "@/lib/hooks";
import { usePageCrumb } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Button, Skeleton } from "@devdigest/ui";

export default function HomePage() {
  const t = useTranslations("common");
  const h = useTranslations("home");
  const router = useRouter();
  const { data: repos, isLoading, isError, refetch } = useRepos();
  usePageCrumb([{ label: h("crumb") }]);

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  return (
    <>
      <PageContainer title={h("title")} subtitle={h("subtitle")}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError ? (
          // API down ≠ "no repositories": telling the user to add a repo here
          // would send them to a form that can't work either.
          <ErrorState
            title={t("loadFailed.title")}
            body={t("loadFailed.body")}
            onRetry={() => refetch()}
          />
        ) : !repos || repos.length === 0 ? (
          <EmptyState
            icon="GitBranch"
            title={h("emptyTitle")}
            body={h("emptyBody")}
            cta={h("emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>{h("redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
              {h("open", { name: repos[0]!.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </>
  );
}
