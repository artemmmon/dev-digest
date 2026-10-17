/* useExportWizard — all state of the Export Wizard. It lives in the wizard, which the CI tab mounts only
   while it is open, so closing drops every choice and edit (AC-5). The server generates the files; the
   client keeps only what the user chose and the workflow text they edited. "Edited" is derived by
   comparing that text with the generated one, never stored twice. */
"use client";

import React from "react";
import type { Agent, CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { useCiInstall, useCiPreview, useCiZip, useRepos, useSecretsStatus } from "@/lib/hooks";
import { DEFAULT_POST_AS, DEFAULT_TRIGGERS, STEP_KEYS } from "./constants";
import { installErrorText, isValidYaml, requestKey, toggleTrigger, workflowFile } from "./helpers";

/** Choices an "Update CI config" click starts with (AC-79). */
export interface WizardPreset {
  repoId: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
}

export type InstallMethod = "pr" | "zip";

/** A question the wizard is asking before it goes on. */
type Question =
  | { kind: "replace" }
  /** The workflow has manual edits and a Configure choice (or the repository) is about to regenerate it. */
  | { kind: "discard"; apply: () => void };

export function useExportWizard(agent: Agent, preset: WizardPreset | null) {
  const repos = useRepos();
  const secrets = useSecretsStatus();
  const preview = useCiPreview(agent.id);
  const install = useCiInstall(agent.id);
  const zip = useCiZip(agent.id);

  const [step, setStep] = React.useState(0);
  const [pickedRepoId, setPickedRepoId] = React.useState<string | null>(preset?.repoId ?? null);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>(preset?.triggers ?? [...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>(preset?.postAs ?? DEFAULT_POST_AS);
  const [edit, setEdit] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [pickedMethod, setPickedMethod] = React.useState<InstallMethod>("pr");
  const [replaceConfirmed, setReplaceConfirmed] = React.useState(false);
  const [question, setQuestion] = React.useState<Question | null>(null);
  /** The choices the current `preview.data` was generated for. */
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ method: InstallMethod; prUrl: string | null } | null>(null);

  // ---- derived ----
  const repoList = repos.data ?? [];
  const repo = repoList.find((r) => r.id === pickedRepoId) ?? repoList[0] ?? null;
  const repoId = repo?.id ?? "";
  const files = preview.data?.files ?? [];
  const generated = workflowFile(preview.data)?.contents ?? "";
  const workflowText = edit ?? generated;
  const edited = edit !== null && edit !== generated;
  const yamlValid = isValidYaml(workflowText);
  const selected = files.find((f) => f.path === selectedPath) ?? workflowFile(preview.data) ?? files[0] ?? null;
  const canOpenPr = secrets.data?.github === true;
  const method: InstallMethod = canOpenPr ? pickedMethod : "zip";
  const installPending = install.isPending || zip.isPending;
  const installError = installErrorText(method === "pr" ? install.error : zip.error);
  const key = requestKey(repoId, triggers, postAs);

  const canContinue =
    step === 0
      ? repo !== null && !preview.isPending
      : step === 1
        ? preview.data !== undefined
        : step === 2
          ? triggers.length > 0 && !preview.isPending && preview.data !== undefined
          : false;
  const canInstall = yamlValid && preview.data !== undefined && !installPending && !done;

  // ---- actions ----
  const generate = (next: { repoId: string; triggers: CiTrigger[]; postAs: CiPostAs }, onOk?: (p: CiPreview) => void) => {
    preview.mutate(
      { repo_id: next.repoId, triggers: next.triggers, post_as: next.postAs },
      {
        onSuccess: (p) => {
          setLoadedKey(requestKey(next.repoId, next.triggers, next.postAs));
          onOk?.(p);
        },
      },
    );
  };

  const goToPreview = (p: CiPreview | undefined, confirmed: boolean) => {
    if (p?.replaces && !confirmed) setQuestion({ kind: "replace" });
    else setStep(1);
  };

  /** Target → Preview: generate the files for the chosen repository (AC-10: ask first when it holds another agent). */
  const continueFromTarget = () => {
    if (!repo) return;
    const run = () => {
      setEdit(null);
      setReplaceConfirmed(false);
      generate({ repoId, triggers, postAs }, (p) => goToPreview(p, false));
    };
    if (preview.data && loadedKey === key) {
      goToPreview(preview.data, replaceConfirmed);
    } else if (edited) {
      setQuestion({ kind: "discard", apply: run });
    } else {
      run();
    }
  };

  const confirmReplace = () => {
    setReplaceConfirmed(true);
    setQuestion(null);
    setStep(1);
  };

  /** A Configure choice changed: regenerate the workflow from the current choices (AC-29), asking first when it has edits (AC-30). */
  const changeConfig = (patch: { triggers?: CiTrigger[]; postAs?: CiPostAs }) => {
    const apply = () => {
      const nextTriggers = patch.triggers ?? triggers;
      const nextPostAs = patch.postAs ?? postAs;
      setTriggers(nextTriggers);
      setPostAs(nextPostAs);
      if (nextTriggers.length === 0) return;
      setEdit(null);
      generate({ repoId, triggers: nextTriggers, postAs: nextPostAs });
    };
    if (edited) setQuestion({ kind: "discard", apply });
    else apply();
  };

  const toggleTriggerChoice = (trigger: CiTrigger) => changeConfig({ triggers: toggleTrigger(triggers, trigger) });

  const pickMethod = (next: InstallMethod) => {
    install.reset();
    zip.reset();
    setPickedMethod(next);
  };

  const submit = () => {
    if (!canInstall) return;
    const body = {
      repo_id: repoId,
      triggers,
      post_as: postAs,
      workflow: workflowText,
      confirm_replace: replaceConfirmed,
    };
    if (method === "pr") install.mutate(body, { onSuccess: (r) => setDone({ method: "pr", prUrl: r.pr_url }) });
    else zip.mutate(body, { onSuccess: () => setDone({ method: "zip", prUrl: null }) });
  };

  return {
    stepKey: STEP_KEYS[step] ?? STEP_KEYS[0],
    step,
    back: () => setStep((n) => Math.max(0, n - 1)),
    next: () => (step === 0 ? continueFromTarget() : setStep((n) => Math.min(STEP_KEYS.length - 1, n + 1))),
    canContinue,
    canInstall,
    // target
    repos: repoList,
    reposLoading: repos.isLoading,
    repo,
    pickRepo: setPickedRepoId,
    // preview
    preview: preview.data,
    previewPending: preview.isPending,
    previewError: preview.error,
    files,
    selected,
    selectFile: setSelectedPath,
    workflowText,
    editWorkflow: setEdit,
    resetWorkflow: () => setEdit(null),
    edited,
    yamlValid,
    // configure
    triggers,
    postAs,
    toggleTrigger: toggleTriggerChoice,
    pickPostAs: (value: CiPostAs) => changeConfig({ postAs: value }),
    // install
    method,
    pickMethod,
    canOpenPr,
    installPending,
    installError,
    submit,
    done,
    // questions
    question,
    confirmReplace,
    confirmDiscard: () => {
      if (question?.kind === "discard") question.apply();
      setQuestion(null);
    },
    cancelQuestion: () => setQuestion(null),
  };
}

export type ExportWizardState = ReturnType<typeof useExportWizard>;
