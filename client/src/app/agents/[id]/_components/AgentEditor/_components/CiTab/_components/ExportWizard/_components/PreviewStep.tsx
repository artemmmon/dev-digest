/* PreviewStep — step 2: every file the export writes (AC-13). Selecting one shows its contents (AC-14), a
   runner file shows its size instead (AC-15). Only the workflow is editable (AC-16); "Reset to generated"
   restores it (AC-17); text that is not YAML disables Install (AC-18). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import { MAX_WORKFLOW_CHARS } from "../constants";
import { formatBytes } from "../helpers";
import type { ExportWizardState } from "../useExportWizard";
import { s } from "../styles";

export function PreviewStep({ wizard }: { wizard: ExportWizardState }) {
  const t = useTranslations("ci");
  const { selected } = wizard;
  const errorId = React.useId();
  const treeLabelId = React.useId();

  if (!selected) return <p style={s.muted}>{t("wizard.generating")}</p>;

  return (
    <>
      <div style={s.split}>
        <div style={s.tree}>
          <div id={treeLabelId} style={s.treeLabel}>
            {t("wizard.preview.filesToCreate")}
          </div>
          <ul aria-labelledby={treeLabelId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {wizard.files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="mono"
                  style={s.treeRow(f.path === selected.path)}
                  aria-current={f.path === selected.path ? "true" : undefined}
                  onClick={() => wizard.selectFile(f.path)}
                >
                  <Icon.FileText
                    size={13}
                    style={{ color: f.path === selected.path ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }}
                  />
                  <span style={s.treePath}>{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div style={s.viewer}>
          <div style={s.viewerHead}>
            <span className="mono" style={s.viewerPath}>
              {selected.path}
            </span>
            {selected.editable && (
              <>
                <Badge color="var(--text-muted)" icon="Edit">
                  {t("wizard.preview.editable")}
                </Badge>
                <Button kind="ghost" size="sm" disabled={!wizard.edited} onClick={wizard.resetWorkflow}>
                  {t("wizard.preview.reset")}
                </Button>
              </>
            )}
          </div>
          {selected.editable ? (
            <textarea
              className="mono"
              style={s.editor}
              value={wizard.workflowText}
              maxLength={MAX_WORKFLOW_CHARS}
              spellCheck={false}
              aria-label={t("wizard.preview.workflowLabel")}
              aria-invalid={!wizard.yamlValid}
              aria-describedby={wizard.yamlValid ? undefined : errorId}
              onChange={(e) => wizard.editWorkflow(e.target.value)}
            />
          ) : selected.contents === null ? (
            <div style={s.runnerFile}>
              {t("wizard.preview.runnerFile", { size: formatBytes(selected.bytes) })}
            </div>
          ) : (
            // A read-only textarea scrolls and takes focus, so the keyboard can read a long file.
            <textarea className="mono" style={s.editor} value={selected.contents} readOnly spellCheck={false} aria-label={selected.path} />
          )}
        </div>
      </div>
      {!wizard.yamlValid && (
        <p id={errorId} role="alert" style={s.error}>
          {t("wizard.preview.invalidYaml")}
        </p>
      )}
    </>
  );
}
