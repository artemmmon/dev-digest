/* hooks/conventions.ts — React Query hooks for the Conventions page (scan, review, skill creation). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type {
  ConventionCandidate,
  ConventionList,
  ConventionPatch,
  ConventionScanResult,
  ConventionSkillCreate,
  ConventionSkillCreated,
  ConventionSkillDraft,
} from "@devdigest/shared";

/** A repo's candidates (pending + accepted; rejected ones are never returned) and its last scan. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.conventions(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run the LLM scan (10–60 s, synchronous on the server). The page shows the error inline
 * (no API key, a scan already running), hence `silent`. The report only exists in this
 * response, so callers read it from the mutation result.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: () => api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData<ConventionList>(keys.conventions(repoId), {
        candidates: data.candidates,
        last_scan: { at: new Date().toISOString(), commit_sha: data.report.commit_sha ?? null },
      });
      // reconcile with what the server kept (accepted candidates survive a rescan)
      qc.invalidateQueries({ queryKey: keys.conventions(repoId) });
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: ConventionPatch;
}

/** Applies a patch to the cached list: a rejected candidate leaves the view, others merge. */
function applyPatch(
  list: ConventionList,
  id: string,
  patch: ConventionPatch,
): ConventionList {
  return {
    ...list,
    candidates:
      patch.status === "rejected"
        ? list.candidates.filter((c) => c.id !== id)
        : list.candidates.map((c) =>
            c.id === id
              ? { ...c, ...(patch.status ? { status: patch.status } : {}), ...(patch.rule ? { rule: patch.rule } : {}) }
              : c,
          ),
  };
}

/**
 * Accept / reject / undo / reword one candidate. Optimistic: the card changes at once
 * (a rejected one disappears) and the list returns to the previous state if the save fails.
 */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = keys.conventions(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionList>(key);
      if (previous) qc.setQueryData<ConventionList>(key, applyPatch(previous, id, patch));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (saved) => {
      const current = qc.getQueryData<ConventionList>(key);
      if (!current) return;
      qc.setQueryData<ConventionList>(key, {
        ...current,
        candidates:
          saved.status === "rejected"
            ? current.candidates.filter((c) => c.id !== saved.id)
            : current.candidates.map((c) => (c.id === saved.id ? saved : c)),
      });
    },
  });
}

/** Assemble a skill (name, description, body, evidence files) from accepted candidates. Saves nothing. */
export function useConventionSkillDraft(repoId: string | null | undefined) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (convention_ids: string[]) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, { convention_ids }),
  });
}

/** Save the (possibly edited) draft as a skill; optionally link it to an agent. Errors show inline in the modal. */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: ConventionSkillCreate) =>
      api.post<ConventionSkillCreated>(`/repos/${repoId}/conventions/skills`, input),
    onSuccess: async (created) => {
      qc.invalidateQueries({ queryKey: keys.agents() });
      if (created.agent_id) {
        qc.invalidateQueries({ queryKey: keys.agent(created.agent_id) });
        qc.invalidateQueries({ queryKey: keys.agentSkills(created.agent_id) });
      }
      qc.invalidateQueries({ queryKey: keys.skillScope() });
      await qc.invalidateQueries({ queryKey: keys.skills() });
    },
  });
}
