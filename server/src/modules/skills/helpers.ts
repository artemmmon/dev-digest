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
    applies_to: row.appliesTo,
    ...(extra.agentCount !== undefined ? { agent_count: extra.agentCount } : {}),
    ...(extra.bodyTokens !== undefined ? { body_tokens: extra.bodyTokens } : {}),
  };
}

/**
 * Trim, dedupe and drop empty entries; an empty result is `null` ("always applies"),
 * never `[]` — so a stored skill/agent can't silently mean "applies to nothing".
 */
export function normalizeAppliesTo(patterns: string[] | null | undefined): string[] | null {
  if (!patterns) return null;
  const cleaned = [...new Set(patterns.map((p) => p.trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned : null;
}

export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}
