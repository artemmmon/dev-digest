/* ConfirmDialog — the app's "are you sure?" step, on the kit Modal. Replaces window.confirm
   for destructive or hard-to-undo actions. It is controlled by mounting: render it while the
   question is open and unmount it from onConfirm / onCancel. The X, the backdrop and Escape
   all mean "cancel". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { CONFIRM_DIALOG_WIDTH } from "./constants";
import { s } from "./styles";

export interface ConfirmDialogProps {
  title: string;
  body?: React.ReactNode;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** The confirmed action is running: both buttons are locked and Escape does nothing. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations("common");
  const cancel = () => {
    if (!pending) onCancel();
  };

  // Keep the latest handler in a ref so the listener is bound once per mount.
  const cancelRef = React.useRef(cancel);
  React.useEffect(() => {
    cancelRef.current = cancel;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal
      width={CONFIRM_DIALOG_WIDTH}
      title={title}
      onClose={cancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={cancel} disabled={pending}>
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending} loading={pending}>
            {confirmLabel ?? t("actions.confirm")}
          </Button>
        </div>
      }
    >
      {body != null && <div style={s.body}>{body}</div>}
    </Modal>
  );
}
