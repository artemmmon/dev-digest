/* ImportSkillModal — import a skill from a .md or .zip, uploaded ("From file") or fetched
   by the server from a public https URL ("From URL"). Two steps: pick a source (the server
   extracts the skill's core and returns a preview — nothing is saved), then review and
   confirm. Only "Save skill" creates anything. Files inside an archive other than the
   skill's text are listed as not imported; executables are never run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Modal, Tabs } from "@devdigest/ui";
import type { Skill, SkillImportPreview, SkillSource } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, usePreviewSkillImport, usePreviewSkillImportUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { draftFromPreview, parseAppliesTo, type SkillDraft } from "../helpers";
import { SkillForm } from "../SkillForm";
import { UrlPicker } from "./_components/UrlPicker";
import { ACCEPT, IMPORT_TABS, type ImportTab } from "./constants";
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
  const previewUrl = usePreviewSkillImportUrl();
  const create = useCreateSkill();
  const [tab, setTab] = React.useState<ImportTab>("file");
  const [picked, setPicked] = React.useState<SkillImportPreview | null>(null);
  const [source, setSource] = React.useState<Extract<SkillSource, "imported_file" | "imported_url">>("imported_file");
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
            setSource("imported_file");
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

  const onFetchUrl = (url: string) => {
    setError(null);
    previewUrl.mutate(
      { url },
      {
        onSuccess: (p) => {
          setSource("imported_url");
          setPicked(p);
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : t("import.urlTab.failed")),
      },
    );
  };

  const changeTab = (key: string) => {
    setTab(key as ImportTab);
    setError(null);
  };

  const save = (draft: SkillDraft) =>
    create.mutate(
      {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        applies_to: parseAppliesTo(draft.appliesTo),
        source,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.confirmed", { name: skill.name }));
          onSaved(skill);
        },
      },
    );

  return (
    <Modal width={760} title={t("import.title")} subtitle={t("import.subtitle")} onClose={onClose}>
      {picked === null && (
        <Tabs
          pad="0 24px"
          value={tab}
          onChange={changeTab}
          tabs={IMPORT_TABS.map((key) => ({ key, label: t(`import.tabs.${key}`) }))}
        />
      )}
      <div style={s.body}>
        {picked === null && tab === "url" ? (
          <UrlPicker pending={previewUrl.isPending} error={error} onFetch={onFetchUrl} />
        ) : picked === null ? (
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
              cancelLabel={t(source === "imported_url" ? "import.backUrl" : "import.back")}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
