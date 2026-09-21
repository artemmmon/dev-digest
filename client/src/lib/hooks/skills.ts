/* hooks/skills.ts — React Query hooks for the Skills page and the agent Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type {
  AgentSkillLink,
  Skill,
  SkillAgentUse,
  SkillImportPreview,
  SkillInput,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: keys.skills(),
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Saved bodies of a skill with their change messages, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** The agents that have this skill switched on. */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.skillAgents(id),
    queryFn: () => api.get<SkillAgentUse[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** A skill in the wire shape's input form; `source` is `imported_file` after an import. */
export type CreateSkillInput = SkillInput;

/** Resolves after the list has refetched, so a caller that selects the new skill finds it in the list. */
export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: async (data) => {
      qc.setQueryData(keys.skill(data.id), data);
      await qc.invalidateQueries({ queryKey: keys.skills() });
    },
  });
}

export interface UpdateSkillInput {
  id: string;
  /** `message` says what changed; the server stores it with the new version when the body changes. */
  patch: Partial<{ name: string; description: string; type: SkillType; body: string; message: string }>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.invalidateQueries({ queryKey: keys.skillVersions(data.id) });
      qc.setQueryData(keys.skill(data.id), data);
    },
  });
}

/** Global on/off. Agents that bind the skill see it disappear from their prompt. */
export function useToggleSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<Skill>(`/skills/${id}/enabled`, { enabled }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.invalidateQueries({ queryKey: keys.agents() });
      qc.setQueryData(keys.skill(data.id), data);
    },
  });
}

/** Resolves after the list has refetched, so the deleted skill is gone when the caller moves on. */
export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: async (_d, id) => {
      qc.removeQueries({ queryKey: keys.skill(id) });
      qc.invalidateQueries({ queryKey: keys.agents() });
      await qc.invalidateQueries({ queryKey: keys.skills() });
    },
  });
}

/**
 * Read a .md / .zip on the server and get back the extracted core. Saves nothing —
 * saving is a separate `useCreateSkill` after the user confirms. Errors show inline
 * in the import dialog, hence `silent`.
 */
export function usePreviewSkillImport() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SkillBindingInput {
  skill_id: string;
  enabled: boolean;
}

/**
 * Replace the agent's bindings; array order is the prompt order. Optimistic: the list
 * takes the new order at once (a dropped row must not snap back while the PUT runs) and
 * returns to the previous one if the save fails.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = keys.agentSkills(agentId);
  return useMutation({
    mutationFn: (skills: SkillBindingInput[]) =>
      api.put<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onMutate: async (skills) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        skills.map((b, order) => ({ agent_id: agentId, skill_id: b.skill_id, order, enabled: b.enabled })),
      );
      return { previous };
    },
    onError: (_err, _skills, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (links) => {
      qc.setQueryData(key, links);
      // the agent's version and its card's skill count moved
      qc.invalidateQueries({ queryKey: keys.agents() });
      qc.invalidateQueries({ queryKey: keys.agent(agentId) });
      // "used by N agents" on the skills page moved too
      qc.invalidateQueries({ queryKey: keys.skills() });
      qc.invalidateQueries({ queryKey: keys.skillScope() });
    },
  });
}
