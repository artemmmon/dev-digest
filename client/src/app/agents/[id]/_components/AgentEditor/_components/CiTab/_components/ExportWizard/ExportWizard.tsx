/* ExportWizard — "Export to CI" (design `screen_export.jsx`): Target → Preview → Configure → Install, in a
   modal. The server generates the files; this component only walks the user through them. All state is in
   `useExportWizard` and is dropped on close, because the CI tab mounts the wizard only while it is open
   (AC-5). The kit Modal has no Escape, focus trap or focus return, so `useDialogA11y` adds them (NFR-7). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { TargetStep } from "./_components/TargetStep";
import { STEP_KEYS, WIZARD_WIDTH } from "./constants";
import { useDialogA11y } from "./useDialogA11y";
import { useExportWizard, type WizardPreset } from "./useExportWizard";
import { s } from "./styles";

export function ExportWizard({
  agent,
  preset,
  onClose,
}: {
  agent: Agent;
  /** The choices to start from ("Update CI config"); null opens a fresh wizard. */
  preset: WizardPreset | null;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const wizard = useExportWizard(agent, preset);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(rootRef, onClose, wizard.installPending || wizard.question !== null);

  const labels = STEP_KEYS.map((k) => t(`wizard.steps.${k}`));
  const last = wizard.step === STEP_KEYS.length - 1;
  const replaces = wizard.preview?.replaces ?? null;

  const body = {
    target: <TargetStep wizard={wizard} />,
    preview: <PreviewStep wizard={wizard} />,
    configure: <ConfigureStep wizard={wizard} />,
    install: <InstallStep wizard={wizard} />,
  }[wizard.stepKey];

  return (
    <>
      <Modal
        width={WIZARD_WIDTH}
        title={t("wizard.title")}
        subtitle={t("wizard.subtitle", { agentName: agent.name })}
        onClose={wizard.installPending ? undefined : onClose}
        footer={
          <div style={s.footer}>
            {wizard.done ? (
              <div style={s.footerRight}>
                <Button kind="primary" onClick={onClose}>
                  {t("wizard.close")}
                </Button>
              </div>
            ) : (
              <>
                {wizard.step > 0 && (
                  <Button kind="ghost" icon="ChevronLeft" disabled={wizard.installPending} onClick={wizard.back}>
                    {t("wizard.back")}
                  </Button>
                )}
                <div style={s.footerRight}>
                  {last ? (
                    <Button
                      kind="primary"
                      icon="Check"
                      disabled={!wizard.canInstall}
                      loading={wizard.installPending}
                      onClick={wizard.submit}
                    >
                      {wizard.installPending ? t("wizard.installing") : t("wizard.installButton")}
                    </Button>
                  ) : (
                    <Button
                      kind="primary"
                      iconRight="ArrowRight"
                      disabled={!wizard.canContinue}
                      loading={wizard.previewPending && wizard.step === 0}
                      onClick={wizard.next}
                    >
                      {t("wizard.continue")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        }
      >
        <div ref={rootRef}>
          <div className="sr-only" role="status" aria-live="polite">
            {t("wizard.stepStatus", { n: wizard.step + 1, total: STEP_KEYS.length, name: labels[wizard.step] })}
          </div>
          <div style={s.stepsBar}>
            <ExportWizardSteps step={wizard.step} labels={labels} />
          </div>
          <div style={s.body}>{body}</div>
        </div>
      </Modal>

      {wizard.question?.kind === "replace" && replaces && (
        <ConfirmDialog
          title={t("wizard.replace.title")}
          body={t("wizard.replace.body", { agentName: replaces.agent_name, repo: wizard.repo?.full_name ?? "" })}
          confirmLabel={t("wizard.replace.confirm")}
          onConfirm={wizard.confirmReplace}
          onCancel={wizard.cancelQuestion}
        />
      )}
      {wizard.question?.kind === "discard" && (
        <ConfirmDialog
          title={t("wizard.discard.title")}
          body={t("wizard.discard.body")}
          confirmLabel={t("wizard.discard.confirm")}
          danger
          onConfirm={wizard.confirmDiscard}
          onCancel={wizard.cancelQuestion}
        />
      )}
    </>
  );
}
