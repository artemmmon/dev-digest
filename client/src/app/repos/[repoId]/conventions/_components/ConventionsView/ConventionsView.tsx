/* /repos/:repoId/conventions — Conventions extractor (N7, hw2). Scan the repo, review the
   candidates (accept / reject / edit), turn the accepted ones into a skill. Data comes from
   GET /repos/:id/conventions; the scan itself is a synchronous POST that can take a few minutes. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionSkillCreated } from "@devdigest/shared";
import { usePageCrumb } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { defaultSelection, formatWhen, scanErrorKind, shortSha, splitByStatus } from "./helpers";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionSection } from "./_components/ConventionSection";
import { CreateConventionSkillModal } from "./_components/CreateConventionSkillModal";
import { ScanReport } from "./_components/ScanReport";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [confirmingRescan, setConfirmingRescan] = React.useState(false);
  // The ids the open "Create skill" modal was started with; `null` = closed.
  const [skillIds, setSkillIds] = React.useState<string[] | null>(null);
  // Accepted candidates the user switched OFF for the next skill; everything else is selected.
  const [excluded, setExcluded] = React.useState<ReadonlySet<string>>(new Set());
  const [createdSkill, setCreatedSkill] = React.useState<ConventionSkillCreated | null>(null);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  usePageCrumb([{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]);

  if (repoNotFound) return <RepoNotFound />;

  const candidates = list.data?.candidates ?? [];
  const { pending, accepted } = splitByStatus(candidates);
  const selectedIds = defaultSelection(accepted, excluded);
  const scanning = extract.isPending;
  const lastScan = list.data?.last_scan ?? null;
  const sha = shortSha(lastScan?.commit_sha);

  const toggleSelected = (id: string, on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSkillCreated = (created: ConventionSkillCreated) => {
    // Clear the selection so the next skill is built from a different subset on purpose.
    setExcluded(new Set(accepted.map((c) => c.id)));
    setSkillIds(null);
    setCreatedSkill(created);
    toast.success(t("createSkill.created", { name: created.name }));
  };

  const scanError = extract.isError ? extract.error : null;
  const scanErrorText = scanError
    ? (() => {
        const kind = scanErrorKind(scanError);
        if (kind) return t(`page.errors.${kind}`);
        return scanError instanceof ApiError ? scanError.message : t("page.errors.generic");
      })()
    : null;

  return (
    <>
      {confirmingRescan && (
        <ConfirmDialog
          title={t("page.rescanConfirm.title")}
          body={t("page.rescanConfirm.body")}
          confirmLabel={t("page.rescanConfirm.confirm")}
          cancelLabel={t("page.rescanConfirm.cancel")}
          onConfirm={() => {
            setConfirmingRescan(false);
            extract.mutate();
          }}
          onCancel={() => setConfirmingRescan(false)}
        />
      )}
      {skillIds && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          conventionIds={skillIds}
          onClose={() => setSkillIds(null)}
          onCreated={onSkillCreated}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {lastScan ? (
                <>
                  <span title={new Date(lastScan.at).toLocaleString()}>
                    {t("page.lastScan", { when: formatWhen(lastScan.at) })}
                  </span>
                  {sha && (
                    <>
                      {" · "}
                      <span className="mono">{t("page.lastScanSha", { sha })}</span>
                    </>
                  )}
                </>
              ) : (
                t("page.subtitle")
              )}
            </p>
          </div>
          {list.isSuccess && (
            <div style={s.headerActions}>
              {accepted.length > 0 && (
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  disabled={selectedIds.length === 0 || scanning}
                  onClick={() => setSkillIds(selectedIds)}
                >
                  {t("page.createSkill")}
                </Button>
              )}
              {candidates.length === 0 ? (
                <Button kind="primary" size="sm" icon="Play" loading={scanning} onClick={() => extract.mutate()}>
                  {scanning ? t("page.scanning") : t("page.runScan")}
                </Button>
              ) : (
                <Button
                  kind="secondary"
                  size="sm"
                  icon="RefreshCw"
                  loading={scanning}
                  onClick={() => setConfirmingRescan(true)}
                >
                  {scanning ? t("page.scanning") : t("page.rescan")}
                </Button>
              )}
            </div>
          )}
        </div>

        {createdSkill && (
          <div role="status" style={s.notice}>
            <span style={s.noticeText}>{t("createSkill.created", { name: createdSkill.name })}</span>
            <Link href="/skills" style={s.noticeLink}>
              {t("createSkill.createdLink")}
            </Link>
            <Button kind="tertiary" size="sm" icon="X" aria-label={t("createSkill.dismiss")} onClick={() => setCreatedSkill(null)} />
          </div>
        )}

        {scanErrorText && (
          <div role="alert" style={s.alert}>
            <div style={s.alertTitle}>{t("page.errors.title")}</div>
            {scanErrorText}
          </div>
        )}

        {scanning ? (
          <div style={s.loading} role="status" aria-live="polite">
            <h2 style={s.loadingTitle}>{t("page.loading.title")}</h2>
            <p style={s.loadingHint}>{t("page.loading.body")}</p>
            <div style={s.skeletonStack}>
              {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
                <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
              ))}
            </div>
          </div>
        ) : list.isPending ? (
          <div style={s.skeletonStack}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => list.refetch()} />
        ) : (
          <>
            {extract.data && <ScanReport report={extract.data.report} />}
            {candidates.length === 0 ? (
              <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />
            ) : (
              <>
                {pending.length > 0 && (
                  <ConventionSection title={t("page.sections.pending")} count={pending.length}>
                    {pending.map((c) => (
                      <ConventionCard
                        key={c.id}
                        candidate={c}
                        onAccept={() => update.mutate({ id: c.id, patch: { status: "accepted" } })}
                        onReject={() => update.mutate({ id: c.id, patch: { status: "rejected" } })}
                        onUndo={() => update.mutate({ id: c.id, patch: { status: "pending" } })}
                        onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                      />
                    ))}
                  </ConventionSection>
                )}
                {pending.length === 0 && (
                  <EmptyState
                    icon="CheckCircle"
                    title={t("page.allReviewed.title")}
                    body={t("page.allReviewed.body")}
                  />
                )}
                {accepted.length > 0 && (
                  <ConventionSection
                    title={t("page.sections.accepted")}
                    count={accepted.length}
                    hint={t("page.selection", { selected: selectedIds.length, total: accepted.length })}
                  >
                    {accepted.map((c) => (
                      <ConventionCard
                        key={c.id}
                        candidate={c}
                        selected={!excluded.has(c.id)}
                        onSelectedChange={(on) => toggleSelected(c.id, on)}
                        onAccept={() => update.mutate({ id: c.id, patch: { status: "accepted" } })}
                        onReject={() => update.mutate({ id: c.id, patch: { status: "rejected" } })}
                        onUndo={() => update.mutate({ id: c.id, patch: { status: "pending" } })}
                        onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                      />
                    ))}
                  </ConventionSection>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
