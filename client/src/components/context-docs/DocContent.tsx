/* DocContent — a project document's text as markdown, or the reason there is none (missing, too
   large, unreadable), with loading and error states. Shared by the preview drawer and the page.
   The text is repository content: it only ever goes through the kit `Markdown`, never as raw HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { ProjectDocumentContent } from "@devdigest/shared";
import { s } from "./styles";

export interface DocContentProps {
  content: ProjectDocumentContent | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function DocContent({ content, isPending, isError, onRetry }: DocContentProps) {
  const t = useTranslations("context");
  if (isPending) {
    return (
      <div style={s.skeletonStack} role="status" aria-label={t("content.loading")}>
        <Skeleton height={20} width="40%" />
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton height={14} width="70%" />
      </div>
    );
  }
  if (isError || !content) return <ErrorState title={t("content.errorTitle")} body={t("content.loadError")} onRetry={onRetry} />;
  if (content.status !== "read" || content.content === null) {
    return <p style={s.notice}>{t(`content.status.${content.status}`)}</p>;
  }
  return (
    <div style={s.body}>
      <Markdown>{content.content}</Markdown>
    </div>
  );
}
