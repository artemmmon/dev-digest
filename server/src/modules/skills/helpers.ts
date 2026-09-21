import type { Skill, SkillVersion } from '@devdigest/shared';
import type { SkillRecord, SkillVersionRecord } from './ports.js';

/** Map a persisted skill to the public `Skill` DTO; `extra` carries what the service computes. */
export function toSkillDto(
  row: SkillRecord,
  extra: { agentCount?: number; bodyTokens?: number } = {},
): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles,
    ...(extra.agentCount !== undefined ? { agent_count: extra.agentCount } : {}),
    ...(extra.bodyTokens !== undefined ? { body_tokens: extra.bodyTokens } : {}),
  };
}

export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}
