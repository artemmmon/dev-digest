/* CreateConventionSkillModal — turns the selected accepted conventions into a skill.
   The server drafts name/description/body; the user edits them, optionally picks an
   agent to link, and creates. Metadata (type, source, evidence files) is read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Markdown, Modal, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { ConventionSkillCreated } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { BODY_ROWS, DEFAULT_SKILL_NAME, MODAL_WIDTH, NO_AGENT } from "./constants";
import { agentOptions, buildCreatePayload, isFormComplete } from "./helpers";
import { s } from "./styles";

export interface CreateConventionSkillModalProps {
  repoId: string;
  repoName: string;
  /** The accepted candidates the skill is built from. */
  conventionIds: string[];
  onClose: () => void;
  onCreated: (created: ConventionSkillCreated) => void;
}

export function CreateConventionSkillModal({
  repoId,
  repoName,
  conventionIds: initialIds,
  onClose,
  onCreated,
}: CreateConventionSkillModalProps) {
  const t = useTranslations("conventions.createSkill");
  // Fixed for the lifetime of the modal, whatever the parent re-renders with.
  const [conventionIds] = React.useState(initialIds);
  const { data: agents } = useAgents();
  const draftMutation = useConventionSkillDraft(repoId);
  const create = useCreateConventionSkill(repoId);
  // The form shows the server's draft until the user edits a field (`null` = untouched).
  const draft = draftMutation.data ?? null;
  const [nameEdit, setNameEdit] = React.useState<string | null>(null);
  const [descriptionEdit, setDescriptionEdit] = React.useState<string | null>(null);
  const [bodyEdit, setBodyEdit] = React.useState<string | null>(null);
  const [agentId, setAgentId] = React.useState(NO_AGENT);
  const [preview, setPreview] = React.useState(false);
  const name = nameEdit ?? (draft?.name || DEFAULT_SKILL_NAME);
  const description = descriptionEdit ?? draft?.description ?? "";
  const body = bodyEdit ?? draft?.body ?? "";

  const { mutate: requestDraft } = draftMutation;
  const loadDraft = React.useCallback(() => {
    setNameEdit(null);
    setDescriptionEdit(null);
    setBodyEdit(null);
    requestDraft(conventionIds);
  }, [requestDraft, conventionIds]);

  // Draft on open (the ids are fixed for the lifetime of the modal). No "already started" guard:
  // in Strict Mode the first effect run's mutation loses its observer on the simulated unmount and
  // would stay pending forever; the second run's request is the one that lands. It is a read.
  React.useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const values = { name, description, body, agentId };
  const ready = draft != null;
  const canCreate = ready && isFormComplete(values) && !create.isPending;

  const submit = () => {
    create.mutate(buildCreatePayload(conventionIds, values), { onSuccess: onCreated });
  };

  const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      subtitle={t("subtitle", { count: conventionIds.length, repo: repoName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canCreate} loading={create.isPending}>
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {draftMutation.isPending && <div style={s.status}>{t("loadingDraft")}</div>}
        {draftMutation.isError && (
          <div role="alert" style={s.error}>
            {errorText(draftMutation.error, t("draftError"))}{" "}
            <Button kind="ghost" size="sm" onClick={loadDraft}>
              {t("retry")}
            </Button>
          </div>
        )}
        {ready && (
          <>
            <FormField label={t("fields.name")} required>
              <TextInput value={name} onChange={setNameEdit} mono aria-label={t("fields.name")} />
            </FormField>
            <FormField label={t("fields.description")} required>
              <TextInput value={description} onChange={setDescriptionEdit} aria-label={t("fields.description")} />
            </FormField>
            <FormField
              label={t("fields.body")}
              required
              right={
                <div style={s.toggleRow}>
                  <Button kind="tertiary" size="sm" active={!preview} aria-pressed={!preview} onClick={() => setPreview(false)}>
                    {t("tabs.write")}
                  </Button>
                  <Button kind="tertiary" size="sm" active={preview} aria-pressed={preview} onClick={() => setPreview(true)}>
                    {t("tabs.preview")}
                  </Button>
                </div>
              }
            >
              {preview ? (
                <div style={s.preview} data-testid="skill-body-preview">
                  <Markdown>{body}</Markdown>
                </div>
              ) : (
                <div role="group" aria-label={t("fields.body")}>
                  <Textarea value={body} onChange={setBodyEdit} rows={BODY_ROWS} mono />
                </div>
              )}
            </FormField>
            <FormField label={t("fields.agent")} hint={t("fields.agentHint")}>
              <div role="group" aria-label={t("fields.agent")}>
                <SelectInput
                  mono={false}
                  value={agentId}
                  onChange={setAgentId}
                  options={agentOptions(agents ?? [], t("fields.noAgent"))}
                />
              </div>
            </FormField>
            <dl style={s.meta}>
              <dt style={s.term}>{t("meta.type")}</dt>
              <dd style={s.value}>
                <Badge mono>{t("meta.typeValue")}</Badge>
              </dd>
              <dt style={s.term}>{t("meta.source")}</dt>
              <dd style={s.value}>
                <Badge mono>{t("meta.sourceValue")}</Badge>
              </dd>
              <dt style={s.term}>{t("meta.evidence")}</dt>
              <dd style={s.value}>
                {draft.evidence_files.length === 0 ? (
                  t("meta.noEvidence")
                ) : (
                  <ul className="mono" style={s.files}>
                    {draft.evidence_files.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
            {create.isError && (
              <div role="alert" style={{ ...s.error, marginTop: 16, marginBottom: 0 }}>
                {errorText(create.error, t("createError"))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
