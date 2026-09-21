/* ConventionCard — one candidate: category, rule, confidence, evidence link + numbered
   snippet, and Accept / Reject / Edit (inline). An accepted card gets Undo and a checkbox
   that picks it for the next skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Icon, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { RULE_MAX_LENGTH, RULE_MIN_LENGTH } from "./constants";
import { confidenceColor, confidencePct, evidenceLocation, numberSnippet, ruleProblem } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  /** Accepted → pending. */
  onUndo: () => void;
  onSaveRule: (rule: string) => void;
  /** Accepted cards only: whether the candidate goes into the next skill. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}

export function ConventionCard({
  candidate: c,
  onAccept,
  onReject,
  onUndo,
  onSaveRule,
  selected = false,
  onSelectedChange,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);
  const accepted = c.status === "accepted";
  const location = evidenceLocation(c.evidence_path, c.evidence_line, c.evidence_end_line);
  const pct = confidencePct(c.confidence);
  const problem = ruleProblem(draft);

  const startEdit = () => {
    setDraft(c.rule);
    setEditing(true);
  };
  const save = () => {
    if (problem) return;
    const next = draft.trim();
    if (next !== c.rule) onSaveRule(next);
    setEditing(false);
  };

  return (
    <article style={s.card(accepted)} aria-label={c.rule}>
      <div style={s.topRow}>
        <Badge>{t(`categories.${c.category}`)}</Badge>
        {accepted && (
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="CheckCircle">
            {t("card.accepted")}
          </Badge>
        )}
        <span style={s.spacer} />
        {accepted && onSelectedChange && (
          <Checkbox checked={selected} onChange={onSelectedChange} label={t("card.selectForSkill")} />
        )}
      </div>

      {editing ? (
        <div style={s.editBox}>
          <div role="group" aria-label={t("card.ruleLabel")}>
            <Textarea value={draft} onChange={setDraft} rows={3} />
          </div>
          {problem && (
            <div style={s.editError} role="alert">
              {problem === "tooShort"
                ? t("card.ruleTooShort", { min: RULE_MIN_LENGTH })
                : t("card.ruleTooLong", { max: RULE_MAX_LENGTH })}
            </div>
          )}
          <div style={s.editActions}>
            <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={problem != null}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p style={s.rule}>{c.rule}</p>
      )}

      <div style={s.evidence}>
        <div style={s.evidenceHead}>
          {c.evidence_url ? (
            <a
              href={c.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={s.link}
              aria-label={t("card.openOnGitHub", { location })}
            >
              {location}
              <Icon.ExternalLink size={12} />
            </a>
          ) : (
            <span className="mono" style={s.plainLocation}>
              {location}
            </span>
          )}
        </div>
        <pre className="mono" style={s.code} aria-label={t("card.snippetLabel", { location })}>
          {numberSnippet(c.evidence_snippet, c.evidence_line).map((line) => (
            <div key={line.n} style={s.codeLine}>
              <span aria-hidden="true" style={s.lineNo}>
                {line.n}
              </span>
              <span style={s.lineText}>{line.text || " "}</span>
            </div>
          ))}
        </pre>
      </div>

      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBar}>
          <ProgressBar value={pct} height={5} color={confidenceColor(c.confidence)} />
        </div>
        <span className="mono tnum" style={s.confidencePct}>
          {pct}%
        </span>
      </div>

      {!editing && (
        <div style={s.actions}>
          {accepted ? (
            <Button kind="ghost" size="sm" onClick={onUndo}>
              {t("card.undo")}
            </Button>
          ) : (
            <>
              <Button kind="primary" size="sm" icon="Check" onClick={onAccept}>
                {t("card.accept")}
              </Button>
              <Button kind="ghost" size="sm" icon="X" onClick={onReject}>
                {t("card.reject")}
              </Button>
            </>
          )}
          <Button kind="ghost" size="sm" icon="Edit" onClick={startEdit}>
            {t("card.edit")}
          </Button>
        </div>
      )}
    </article>
  );
}
