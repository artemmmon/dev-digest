/* ContextTab — the project documents attached to one skill for the active repository. Unlike the
   agent tab, nothing is saved on its own: the list is a draft held by SkillDetail and goes out with
   the skill's other edits in one Save (the footer here is the same Discard / Save as the Config tab).
   Any agent using the skill inherits the attached documents. Totals are computed by the shared list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ContextDocList } from "@/components/context-docs";
import { useProjectDocs } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { SERIALIZE_HEADING } from "./constants";
import { s } from "./styles";
import type { ContextForm } from "./types";

export function ContextTab({ form }: { form: ContextForm }) {
  const t = useTranslations("skills");
  const { activeRepo, reposLoaded } = useActiveRepo();
  const docsQ = useProjectDocs(form.repoId);
  const { dirty, valid, pending, onSave, onDiscard } = form;

  if (reposLoaded && !activeRepo) {
    return (
      <div style={s.tab}>
        <div style={s.scroll}>
          <div style={s.inner}>
            <div style={s.header}>
              <h2 style={s.h2}>{t("contextTab.title")}</h2>
            </div>
            <EmptyState icon="Folder" title={t("contextTab.noRepo")} />
          </div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode;
  if (form.loadFailed || docsQ.isError) {
    body = (
      <ErrorState
        body={t("contextTab.loadError")}
        onRetry={() => {
          form.onRetry();
          void docsQ.refetch();
        }}
      />
    );
  } else if (!activeRepo || !docsQ.data || !form.saved) {
    body = (
      <>
        <Skeleton height={20} width={200} />
        <Skeleton height={180} />
      </>
    );
  } else {
    body = (
      <>
        <div style={s.header}>
          <h2 style={s.h2}>{t("contextTab.title")}</h2>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {t("contextTab.attachedCount", { count: form.paths.length })}
          </Badge>
        </div>
        <p style={s.repo}>
          {t("contextTab.repo")}:{" "}
          <span className="mono" style={s.repoName}>
            {activeRepo.full_name}
          </span>
        </p>
        <p style={s.inherits}>{t("contextTab.inherits")}</p>
        <ContextDocList
          repoId={activeRepo.id}
          list={docsQ.data}
          attached={form.paths}
          onChange={form.onPaths}
          busy={pending}
          compact
        />
        {form.paths.length > 0 && (
          <div style={s.serialize}>
            <div style={s.serializeLabel}>{t("contextTab.serializesAs")}</div>
            <pre className="mono" style={s.serializePre}>
              {[SERIALIZE_HEADING, ...form.paths.map((p) => `- ${p}`)].join("\n")}
            </pre>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={s.tab}>
      <div style={s.scroll}>
        <div style={s.inner}>{body}</div>
      </div>
      <div style={s.footer}>
        {dirty && !valid && <span style={s.invalid}>{t("form.required")}</span>}
        <Button kind="ghost" onClick={onDiscard} disabled={!dirty || pending}>
          {t("config.discard")}
        </Button>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={!dirty || !valid} loading={pending}>
          {t("config.save")}
        </Button>
      </div>
    </div>
  );
}
