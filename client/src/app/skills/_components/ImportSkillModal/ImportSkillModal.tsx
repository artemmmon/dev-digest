/* ImportSkillModal — import a skill from a .md or .zip. Two steps: pick a file (the server
   extracts the skill's core and returns a preview — nothing is saved), then review and
   confirm. Only "Save skill" creates anything. Files inside an archive other than the
   skill's text are listed as not imported; executables are never run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Modal } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, usePreviewSkillImport } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { draftFromPreview, type SkillDraft } from "../helpers";
import { SkillForm } from "../SkillForm";
import { ACCEPT } from "./constants";
import { checkPickedFile, readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const preview = usePreviewSkillImport();
  const create = useCreateSkill();
  const [picked, setPicked] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const problem = checkPickedFile(file);
    if (problem) {
      setError(t(`import.${problem}`));
      return;
    }
    setReading(file.name);
    try {
      const content_base64 = await readFileAsBase64(file);
      preview.mutate(
        { filename: file.name, content_base64 },
        {
          onSuccess: (p) => {
            setReading(null);
            setPicked(p);
          },
          onError: (e) => {
            setReading(null);
            setError(e instanceof ApiError ? e.message : t("import.readFailed"));
          },
        },
      );
    } catch {
      setReading(null);
      setError(t("import.readFailed"));
    }
  };

  const save = (draft: SkillDraft) =>
    create.mutate(
      { ...draft, source: "imported_file" },
      {
        onSuccess: (skill) => {
          toast.success(t("import.confirmed", { name: skill.name }));
          onSaved(skill);
        },
      },
    );

  return (
    <Modal width={760} title={t("import.title")} subtitle={t("import.subtitle")} onClose={onClose}>
      <div style={s.body}>
        {picked === null ? (
          <div style={s.pick}>
            <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              aria-label={t("import.pick")}
              onChange={(e) => {
                void onPick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button kind="primary" icon="Upload" loading={reading !== null} onClick={() => fileInput.current?.click()}>
              {reading ? t("import.reading", { name: reading }) : t("import.pick")}
            </Button>
            <span style={s.pickHint}>{t("import.pickHint")}</span>
            {error && (
              <div role="alert" style={s.error}>
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <div role="note" style={s.trust}>
              <Icon.AlertTriangle size={18} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={s.trustTitle}>{t("import.trustTitle")}</div>
                {t("import.trustBody")}
              </div>
            </div>
            <div style={s.sourceFile}>{t("import.sourceFile", { file: picked.source_file })}</div>
            {picked.ignored_files.length > 0 && (
              <div style={s.ignored}>
                <div style={s.ignoredTitle}>{t("import.ignoredTitle")}</div>
                <div style={s.ignoredHint}>{t("import.ignoredHint")}</div>
                <ul style={s.ignoredList}>
                  {picked.ignored_files.map((f) => (
                    <li key={f.path} style={s.ignoredRow}>
                      <span className="mono" style={s.ignoredPath}>
                        {f.path}
                      </span>
                      <Badge
                        color={f.reason === "executable" ? "var(--warn)" : "var(--text-muted)"}
                        bg={f.reason === "executable" ? "var(--warn-bg)" : undefined}
                      >
                        {t(`import.reason.${f.reason}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SkillForm
              initial={draftFromPreview(picked)}
              submitLabel={t("import.confirm")}
              pending={create.isPending}
              onSubmit={save}
              onCancel={() => setPicked(null)}
              cancelLabel={t("import.back")}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
