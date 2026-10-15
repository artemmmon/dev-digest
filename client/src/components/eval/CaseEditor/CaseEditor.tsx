/* CaseEditor — the eval case modal (design artboard `evalcase`). In `seeded` mode the diff and PR meta are
   read-only and come from a finding; the user edits the name and the expectation (type, file, lines). In
   `new` and `edit` modes the diff, PR title and PR body are editable too, with a +/- marked preview of the
   pasted diff (AC-52, AC-53). Everything the case holds is rendered as text, never as HTML. Escape closes and focus returns to the
   element that opened it. The caller owns saving: it gets the body and shows the server's error back. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, Tabs, TextInput } from "@devdigest/ui";
import type { EvalCaseRecord, EvalCaseSave, EvalExpectationType } from "@devdigest/shared";
import { CASE_NAME_MAX, CASE_EDITOR_WIDTH, CASE_DIFF_MAX } from "./constants";
import { emptyCaseSeed, overlappingCase, parseLine, type CaseSeed } from "./helpers";
import { s } from "./styles";

type TabKey = "diff" | "prMeta";

interface CaseEditorBaseProps {
  /** The agent's cases, for the overlap warning (AC-13); the case being edited is skipped. */
  existingCases: readonly EvalCaseRecord[];
  agentName?: string | null;
  saving?: boolean;
  /** A server error to show inline (a 4xx message is a fixed server text, rendered as text). */
  error?: string | null;
  onSave: (body: EvalCaseSave) => void;
  onClose: () => void;
}

/**
 * `seeded`: opened from a finding, diff and PR meta read-only. `edit`: an existing case, everything
 * editable (`seed` carries its id). `new`: an empty case written by hand.
 */
export type CaseEditorProps = CaseEditorBaseProps &
  (
    | { mode: "seeded"; seed: CaseSeed }
    | { mode: "edit"; seed: CaseSeed }
    | { mode: "new"; seed?: undefined }
  );

/** A numeric field's starting text: empty for an unset (0) line. */
const lineText = (n: number) => (n > 0 ? String(n) : "");

const TYPES: readonly EvalExpectationType[] = ["must_find", "must_not_flag"];

function diffLineKind(line: string): "add" | "del" | "hunk" | "plain" {
  if (line.startsWith("+++") || line.startsWith("---")) return "plain";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "plain";
}

export function CaseEditor({
  mode,
  seed,
  existingCases,
  agentName,
  saving,
  error,
  onSave,
  onClose,
}: CaseEditorProps) {
  const t = useTranslations("eval");
  // The seed is frozen at mount: a refetch of the PR must not rewrite what the user is editing.
  const [initial] = React.useState<CaseSeed>(() => seed ?? emptyCaseSeed());
  const editable = mode !== "seeded";
  const [name, setName] = React.useState(initial.name);
  const [type, setType] = React.useState<EvalExpectationType>(initial.expected_output.type);
  const [file, setFile] = React.useState(initial.expected_output.file);
  const [startLine, setStartLine] = React.useState(lineText(initial.expected_output.start_line));
  const [endLine, setEndLine] = React.useState(lineText(initial.expected_output.end_line));
  const [diff, setDiff] = React.useState(initial.input_diff);
  const [prTitle, setPrTitle] = React.useState(initial.input_meta.pr_title);
  const [prBody, setPrBody] = React.useState(initial.input_meta.pr_body);
  const [tab, setTab] = React.useState<TabKey>("diff");
  const rootRef = React.useRef<HTMLDivElement>(null);

  const start = parseLine(startLine);
  const end = parseLine(endLine);
  const trimmedName = name.trim();
  const trimmedFile = file.trim();
  const orderBroken = start != null && end != null && start > end;
  const diffTooLong = editable && diff.length > CASE_DIFF_MAX;
  const diffMissing = editable && diff.trim().length === 0;
  const valid =
    !diffTooLong &&
    !diffMissing &&
    trimmedName.length > 0 &&
    trimmedName.length <= CASE_NAME_MAX &&
    trimmedFile.length > 0 &&
    start != null &&
    end != null &&
    !orderBroken;

  const overlap =
    start != null && end != null && !orderBroken
      ? overlappingCase(
          existingCases,
          { file: trimmedFile, start_line: start, end_line: end },
          initial.case_id,
        )
      : null;

  // Close on Escape (unless a save is running); take focus in on open, give it back on close.
  const closeRef = React.useRef(() => {});
  React.useEffect(() => {
    closeRef.current = () => {
      if (!saving) onClose();
    };
  });
  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const submit = () => {
    if (!valid || saving) return;
    onSave({
      name: trimmedName,
      input_diff: editable ? diff : initial.input_diff,
      input_meta: editable ? { pr_title: prTitle, pr_body: prBody } : initial.input_meta,
      expected_output: { type, file: trimmedFile, start_line: start, end_line: end },
      source_finding_id: initial.source_finding_id,
    });
  };

  const negative = type === "must_not_flag";
  const lines = start != null && end != null ? (start === end ? `${start}` : `${start}-${end}`) : "?";
  const diffLines = (editable ? diff : initial.input_diff).split("\n");
  const subtitle =
    mode === "seeded"
      ? agentName
        ? t("caseEditor.seededSubtitleWithAgent", { agent: agentName })
        : t("caseEditor.seededSubtitle")
      : agentName
        ? t(mode === "new" ? "caseEditor.newSubtitleWithAgent" : "caseEditor.editSubtitleWithAgent", {
            agent: agentName,
          })
        : t(mode === "new" ? "caseEditor.newSubtitle" : "caseEditor.editSubtitle");

  return (
    <Modal
      width={CASE_EDITOR_WIDTH}
      title={
        mode === "new"
          ? t("caseEditor.newCase")
          : t("caseEditor.caseTitle", { name: trimmedName || initial.name })
      }
      subtitle={subtitle}
      onClose={() => closeRef.current()}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={() => closeRef.current()} disabled={saving}>
            {t("caseEditor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!valid} loading={saving}>
            {saving ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div ref={rootRef} style={s.grid}>
        {/* left: what the case replays — read-only in seeded mode */}
        <div style={s.leftColumn}>
          <div style={s.pad}>
            <div style={s.sectionTitle}>{t("caseEditor.inputLabel")}</div>
          </div>
          <Tabs
            tabs={[
              { key: "diff", label: t("caseEditor.tabs.diff") },
              { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
            ]}
            value={tab}
            onChange={(k) => setTab(k as TabKey)}
            pad="0 16px"
          />
          <div style={s.scroll}>
            {tab === "diff" ? (
              <>
                {editable && (
                  <>
                    <FormField label={t("caseEditor.diffEditLabel")} required>
                      <textarea
                        className="mono"
                        value={diff}
                        rows={8}
                        spellCheck={false}
                        placeholder={t("caseEditor.diffPlaceholder")}
                        aria-label={t("caseEditor.diffEditLabel")}
                        onChange={(e) => setDiff(e.target.value)}
                        style={s.textarea}
                      />
                    </FormField>
                    {diffTooLong && (
                      <div role="alert" style={s.fieldError}>
                        {t("caseEditor.diffTooLong", { max: CASE_DIFF_MAX })}
                      </div>
                    )}
                    {diff.trim().length > 0 && <div style={s.previewTitle}>{t("caseEditor.preview")}</div>}
                  </>
                )}
                {(!editable || diff.trim().length > 0) && (
                  <pre
                    className="mono"
                    style={s.diff}
                    aria-label={editable ? t("caseEditor.preview") : t("caseEditor.diffPreviewLabel")}
                  >
                    {diffLines.map((l, i) => (
                      <div key={i} style={s.diffLine(diffLineKind(l))}>
                        {l || " "}
                      </div>
                    ))}
                  </pre>
                )}
              </>
            ) : (
              <div>
                <FormField label={t("caseEditor.titleLabel")}>
                  {editable ? (
                    <TextInput
                      value={prTitle}
                      onChange={setPrTitle}
                      placeholder={t("caseEditor.titlePlaceholder")}
                      aria-label={t("caseEditor.titleLabel")}
                    />
                  ) : (
                    <div style={s.metaValue}>{initial.input_meta.pr_title}</div>
                  )}
                </FormField>
                <FormField label={t("caseEditor.bodyLabel")}>
                  {editable ? (
                    <textarea
                      value={prBody}
                      rows={5}
                      placeholder={t("caseEditor.bodyPlaceholder")}
                      aria-label={t("caseEditor.bodyLabel")}
                      onChange={(e) => setPrBody(e.target.value)}
                      style={s.textarea}
                    />
                  ) : initial.input_meta.pr_body ? (
                    <div style={s.metaValue}>{initial.input_meta.pr_body}</div>
                  ) : (
                    <div style={s.metaEmpty}>{t("caseEditor.bodyEmpty")}</div>
                  )}
                </FormField>
              </div>
            )}
          </div>
        </div>

        {/* right: the name and the expectation the run is scored against */}
        <div style={s.column}>
          <div style={s.rightBody}>
            <div style={s.banner(negative)} role="note">
              {negative ? (
                <Icon.XCircle size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              ) : (
                <Icon.Target size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
              )}
              <span style={s.bannerText}>
                <span style={s.bannerLabel(negative)}>
                  {negative ? t("caseEditor.negativeCase") : t("caseEditor.positiveCase")}
                </span>
                {negative
                  ? t("caseEditor.assertMustNotFlag", { file: trimmedFile || "?", lines })
                  : t("caseEditor.assertMustFind", { file: trimmedFile || "?", lines })}
              </span>
            </div>
            <div style={{ height: 14 }} />

            {error && (
              <div role="alert" style={s.notice("error")}>
                <Icon.AlertTriangle size={15} style={{ color: "var(--crit)", flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}
            {overlap && (
              <div role="status" style={s.notice("warn")}>
                <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>{t("caseEditor.overlapWarning", { name: overlap.name })}</span>
              </div>
            )}

            <FormField label={t("caseEditor.nameLabel")} required>
              <TextInput
                value={name}
                onChange={setName}
                mono
                placeholder={t("caseEditor.namePlaceholder")}
                aria-label={t("caseEditor.nameLabel")}
                maxLength={CASE_NAME_MAX}
              />
            </FormField>

            <FormField label={t("caseEditor.expectationLabel")}>
              <div role="group" aria-label={t("caseEditor.expectationLabel")} style={s.segment}>
                {TYPES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={type === value}
                    style={s.segmentButton(type === value)}
                    onClick={() => setType(value)}
                  >
                    {t(`caseEditor.types.${value}`)}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label={t("caseEditor.fileLabel")} required>
              <TextInput
                value={file}
                onChange={setFile}
                mono
                aria-label={t("caseEditor.fileLabel")}
              />
            </FormField>

            <div style={s.lines}>
              <FormField label={t("caseEditor.startLineLabel")} required>
                <TextInput
                  value={startLine}
                  onChange={setStartLine}
                  mono
                  inputMode="numeric"
                  aria-label={t("caseEditor.startLineLabel")}
                />
              </FormField>
              <FormField label={t("caseEditor.endLineLabel")} required>
                <TextInput
                  value={endLine}
                  onChange={setEndLine}
                  mono
                  inputMode="numeric"
                  aria-label={t("caseEditor.endLineLabel")}
                />
              </FormField>
            </div>
            {orderBroken && (
              <div role="alert" style={s.fieldError}>
                {t("caseEditor.lineOrderError")}
              </div>
            )}
            {(start == null || end == null) && (
              <div role="alert" style={s.fieldError}>
                {t("caseEditor.lineNumberError")}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
