"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, Button, Tabs } from "@devdigest/ui";
import { RunReviewDropdown } from "../RunReviewDropdown";
import { RepoStackLabel } from "@/components/repo-stack";
import { s } from "./styles";
import type { PrDetail, Repo } from "@/lib/types";

interface PrDetailHeaderProps {
  pr: PrDetail;
  prId: string | null;
  tab: string;
  findingsCount: number;
  /** github.com PR URL; null when the repo's full_name isn't known yet. */
  githubUrl?: string | null;
  /** `undefined` while the repo itself hasn't loaded yet. */
  repoStack?: Repo["stack"];
  onSetTab: (tab: string) => void;
  onRunStart: () => void;
  onRunsStarted: () => void;
}

export function PrDetailHeader({
  pr,
  prId,
  tab,
  findingsCount,
  githubUrl,
  repoStack,
  onSetTab,
  onRunStart,
  onRunsStarted,
}: PrDetailHeaderProps) {
  const t = useTranslations("prReview");
  const handleRunStart = useCallback(() => {
    onRunStart();
  }, [onRunStart]);

  const handleRunsStarted = useCallback(() => {
    onRunsStarted();
  }, [onRunsStarted]);

  const statusColor =
    pr.status === "merged"
      ? "var(--ok)"
      : pr.status === "closed"
        ? "var(--stale)"
        : "var(--warn)";

  // Publish this header's rendered height as a CSS variable on the shared ancestor,
  // so a sticky element further down the page (Smart Diff's RoleGroup headers) can
  // stick right below it instead of a hardcoded offset (jsdom has no ResizeObserver).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const target = el.parentElement ?? el;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) target.style.setProperty("--pr-header-h", `${entry.contentRect.height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} style={s.root}>
      <div style={s.titleRow}>
        <div style={s.titleCol}>
          <h1 style={s.h1}>
            <span className="mono" style={s.prNumber}>
              #{pr.number}
            </span>
            {pr.title}
          </h1>
          <div style={s.meta}>
            <span style={s.authorChip}>
              <Avatar name={pr.author} size={17} />
              {pr.author}
            </span>
            <span style={s.branchChip}>
              <Icon.GitBranch size={13} style={{ color: "var(--text-muted)" }} />
              <span className="mono" style={s.branchMono}>
                {pr.branch}
              </span>
              <Icon.ArrowRight size={11} />
              <span className="mono" style={s.branchMono}>
                {pr.base}
              </span>
            </span>
            <span className="mono tnum">
              <span style={{ color: "var(--code-add-text)" }}>+{pr.additions}</span>{" "}
              <span style={{ color: "var(--code-del-text)" }}>−{pr.deletions}</span>
            </span>
            <Badge dot bg="transparent" color={statusColor}>
              {pr.status}
            </Badge>
            <RepoStackLabel stack={repoStack} />
          </div>
        </div>
        <div style={s.actions}>
          <Button
            kind="ghost"
            size="sm"
            icon="ExternalLink"
            disabled={!githubUrl}
            onClick={() =>
              githubUrl && window.open(githubUrl, "_blank", "noopener,noreferrer")
            }
          >
            {t("header.viewOnGithub")}
          </Button>
          {prId && (
            <RunReviewDropdown
              prId={prId}
              warnMerged={pr.status === "merged" || pr.status === "closed"}
              onRunStart={handleRunStart}
              onRunsStarted={handleRunsStarted}
            />
          )}
        </div>
      </div>
      {(pr.status === "merged" || pr.status === "closed") && (
        <div style={s.staleBanner}>
          <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{t("header.closedBanner", { status: pr.status })}</span>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={onSetTab}
        pad="0"
        tabs={[
          { key: "overview", label: t("header.overview"), icon: "FileText" },
          { key: "findings", label: t("header.agentRuns"), icon: "AlertOctagon", count: findingsCount || undefined },
          { key: "diff", label: t("header.filesChanged"), icon: "Code", count: pr.files_count },
        ]}
      />
    </div>
  );
}
