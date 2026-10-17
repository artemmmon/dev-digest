/* FileViewer — the right pane of the Preview step: the selected file's path and its contents. Only the
   workflow is editable (AC-16) and can be reset to the generated text (AC-17); a runner file shows its
   size instead of its contents (AC-15); any other file is read-only (AC-14). */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { MAX_WORKFLOW_CHARS } from "../../../../constants";
import { formatBytes } from "../../../../helpers";
import type { ExportWizardState } from "../../../../useExportWizard";
import { s } from "../../../../styles";

export function FileViewer({
  file,
  wizard,
  errorId,
}: {
  file: CiFile;
  wizard: ExportWizardState;
  /** The id of the invalid-YAML message, which the workflow editor points at while the text is invalid. */
  errorId: string;
}) {
  const t = useTranslations("ci");
  return (
    <div style={s.viewer}>
      <div style={s.viewerHead}>
        <span className="mono" style={s.viewerPath}>
          {file.path}
        </span>
        {file.editable && (
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
      <FileBody file={file} wizard={wizard} errorId={errorId} />
    </div>
  );
}

function FileBody({ file, wizard, errorId }: { file: CiFile; wizard: ExportWizardState; errorId: string }) {
  const t = useTranslations("ci");

  if (file.editable) {
    return (
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
    );
  }
  if (file.contents === null) {
    return <div style={s.runnerFile}>{t("wizard.preview.runnerFile", { size: formatBytes(file.bytes) })}</div>;
  }
  // A read-only textarea scrolls and takes focus, so the keyboard can read a long file.
  return <textarea className="mono" style={s.editor} value={file.contents} readOnly spellCheck={false} aria-label={file.path} />;
}
