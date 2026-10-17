/* PreviewStep — step 2: every file the export writes (AC-13). Selecting one shows its contents (AC-14), a
   runner file shows its size instead (AC-15). Only the workflow is editable (AC-16); "Reset to generated"
   restores it (AC-17); text that is not YAML disables Install (AC-18). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ExportWizardState } from "../../useExportWizard";
import { s } from "../../styles";
import { FileViewer } from "./_components/FileViewer";

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
          <ul aria-labelledby={treeLabelId} style={s.fileList}>
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
        <FileViewer file={selected} wizard={wizard} errorId={errorId} />
      </div>
      {!wizard.yamlValid && (
        <p id={errorId} role="alert" style={s.error}>
          {t("wizard.preview.invalidYaml")}
        </p>
      )}
    </>
  );
}
