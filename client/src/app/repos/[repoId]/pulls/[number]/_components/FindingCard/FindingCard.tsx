/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. The eval action ("Turn into eval case" / "In eval set" / the reason it is
   unavailable) is derived only from the server's markers on the finding. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  Badge,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "@/lib/github-urls";
import { rowClickProps, unstyledButton } from "@/lib/interactive";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  onTurnIntoEvalCase,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Open the Case Editor seeded from this finding (AC-2). */
  onTurnIntoEvalCase?: (f: FindingRecord) => void;
}) {
  const t = useTranslations("prReview");
  const te = useTranslations("eval");
  const reasonId = React.useId();
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div {...rowClickProps(() => setExpanded((e) => !e))} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((e) => !e)}
              style={{ ...unstyledButton, ...s.title(muted, dismissed) }}
            >
              {f.title}
            </button>
            <CategoryTag category={f.category as Category} />
            {f.kind === "out_of_scope" && (
              <Badge icon="Target">{t("finding.outOfScope")}</Badge>
            )}
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {f.eval_case_id ? (
              <span style={s.inEvalSet}>
                <Icon.FlaskConical size={14} />
                {te("findingCard.inEvalSet")}
              </span>
            ) : f.eval_unavailable_reason ? (
              <>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="FlaskConical"
                  disabled
                  aria-describedby={reasonId}
                >
                  {te("findingCard.turnIntoCase")}
                </Button>
                <span id={reasonId} style={s.evalReason}>
                  {te(`findingCard.reasons.${f.eval_unavailable_reason}`)}
                </span>
              </>
            ) : (
              <Button
                kind="ghost"
                size="sm"
                icon="FlaskConical"
                onClick={() => onTurnIntoEvalCase?.(f)}
              >
                {te("findingCard.turnIntoCase")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
