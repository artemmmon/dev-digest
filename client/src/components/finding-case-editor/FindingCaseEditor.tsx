/* FindingCaseEditor — "Turn into eval case" on the PR page. Finds the finding's agent (through its
   review) and the stored patch of its file (through the PR detail), seeds the shared Case Editor and
   saves the case for that agent. Nothing is stored until the user presses Save (AC-2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useEvalCases, useCreateEvalCase } from "@/lib/hooks/eval";
import { usePullDetail } from "@/lib/hooks/core";
import { usePrReviews } from "@/lib/hooks/reviews";
import { CaseEditor, buildCaseSeed } from "@/components/eval";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function FindingCaseEditor({
  finding,
  prId,
  onClose,
}: {
  finding: FindingRecord;
  prId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const detail = usePullDetail(prId);
  const reviews = usePrReviews(prId);

  const review = reviews.data?.find((r) => r.id === finding.review_id);
  const agentId = review?.agent_id ?? null;
  const cases = useEvalCases(agentId);
  const create = useCreateEvalCase(agentId, { prId });

  const patch = detail.data?.files.find((f) => f.path === finding.file)?.patch ?? null;
  const loaded = !!detail.data && !!reviews.data;

  // The PR page already holds the detail and the reviews, so this is rarely a wait.
  if (!loaded && !detail.isError && !reviews.isError) return null;

  if (!detail.data || !agentId || !patch) {
    return (
      <ConfirmDialog
        title={t("findingCard.turnIntoCase")}
        body={t("findingCard.caseUnavailable")}
        confirmLabel={t("findingCard.close")}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  const seed = buildCaseSeed(finding, patch, {
    pr_title: detail.data.title,
    pr_body: detail.data.body ?? "",
  });
  const error = create.error
    ? create.error instanceof ApiError
      ? create.error.message
      : t("findingCard.saveFailed")
    : null;

  return (
    <CaseEditor
      mode="seeded"
      seed={seed}
      agentName={review?.agent_name}
      existingCases={cases.data ?? []}
      saving={create.isPending}
      error={error}
      onSave={(body) => create.mutate(body, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
