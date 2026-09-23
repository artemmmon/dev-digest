/* CreateSkillModal — write a skill from scratch: the SkillForm (name, description, type,
   markdown body) in a dialog. Only "Create skill" saves anything; the page decides where to go next. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { notify } from "@/lib/toast";
import { EMPTY_DRAFT, parseAppliesTo, type SkillDraft } from "../helpers";
import { SkillForm } from "../SkillForm";
import { CREATE_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const create = useCreateSkill();

  const save = (draft: SkillDraft) =>
    create.mutate(
      {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        applies_to: parseAppliesTo(draft.appliesTo),
      },
      {
        onSuccess: (skill) => {
          notify.success(t("form.createdToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );

  return (
    <Modal width={CREATE_MODAL_WIDTH} title={t("create.title")} subtitle={t("create.subtitle")} onClose={onClose}>
      <div style={s.body}>
        <SkillForm
          initial={EMPTY_DRAFT}
          submitLabel={t("form.create")}
          pending={create.isPending}
          onSubmit={save}
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
