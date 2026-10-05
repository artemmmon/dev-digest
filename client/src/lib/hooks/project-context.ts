/* hooks/project-context.ts — React Query hooks for the Project Context page and the Context tabs.
     GET /repos/:id/context                       → ProjectDocumentList
     GET /repos/:id/context/content?path=         → ProjectDocumentContent
     GET /agents/:id/context?repo_id=             → AgentContext
     PUT /agents/:id/context  { repo_id, paths }  → AgentContext
     GET /skills/:id/context?repo_id=             → SkillContext
   A skill's attachments are saved with the skill itself (`context` on the skill update). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type {
  AgentContext,
  ContextAttachmentInput,
  ProjectDocumentContent,
  ProjectDocumentList,
  SkillContext,
} from "@devdigest/shared";

/** Every project document of a repo, as found in its local checkout, with token and used-by counts. */
export function useProjectDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.projectDocs(repoId),
    queryFn: () => api.get<ProjectDocumentList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** One document's text (or why there is none). `path` is repo-relative. */
export function useProjectDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: keys.projectDoc(repoId, path),
    queryFn: () =>
      api.get<ProjectDocumentContent>(`/repos/${repoId}/context/content?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/** The agent's attached paths (stored order) and the ones it inherits from enabled skills. */
export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.agentContext(agentId, repoId),
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!agentId && !!repoId,
  });
}

/** The skill's attached paths (stored order) for one repo. */
export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.skillContext(skillId, repoId),
    queryFn: () => api.get<SkillContext>(`/skills/${skillId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!skillId && !!repoId,
  });
}

/**
 * Replace the agent's attachment list for one repo; array order is the prompt order. Optimistic:
 * the list takes the new order at once and returns to the previous one if the save fails (the
 * global mutation handler shows the error toast).
 */
export function useSetAgentContext(agentId: string, repoId: string) {
  const qc = useQueryClient();
  const key = keys.agentContext(agentId, repoId);
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<AgentContext>(`/agents/${agentId}/context`, { repo_id: repoId, paths } satisfies ContextAttachmentInput),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentContext>(key);
      if (previous) {
        const direct = new Set(paths);
        qc.setQueryData<AgentContext>(key, {
          paths,
          inherited: previous.inherited.filter((i) => !direct.has(i.path)),
        });
      }
      return { previous };
    },
    onError: (_err, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      // the agent's version and "used by N agents" moved
      qc.invalidateQueries({ queryKey: keys.agents() });
      qc.invalidateQueries({ queryKey: keys.agent(agentId) });
      qc.invalidateQueries({ queryKey: keys.projectDocs(repoId) });
    },
  });
}
