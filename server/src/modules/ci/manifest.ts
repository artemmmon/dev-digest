import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import { AgentManifest, MANIFEST_VERSION } from '@devdigest/shared';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/** The agent fields the manifest is built from. */
export interface ManifestSource {
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  version: number;
}

/**
 * Build the manifest and check it against the shared `AgentManifest` schema, the
 * same one the runner re-validates (AC-19, AC-20). `skillSlugs` are the slugs of the
 * enabled bound skills in binding order. A schema failure is refused with the
 * field errors (paths and schema messages only, never the offending values).
 */
export function buildManifest(agent: ManifestSource, skillSlugs: string[]): AgentManifest {
  const parsed = AgentManifest.safeParse({
    manifest_version: MANIFEST_VERSION,
    agent_version: agent.version,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
  if (!parsed.success) {
    throw new ValidationError(
      'The agent manifest is not valid',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}

/**
 * Serialize with the YAML library only: the system prompt and the skill slugs reach
 * the file as quoted/escaped YAML values, never by string interpolation.
 */
export function manifestYaml(manifest: AgentManifest): string {
  return stringify(manifest);
}

/** Hash of the manifest text, stored on the installation to detect an outdated export. */
export function manifestSha256(yamlText: string): string {
  return createHash('sha256').update(yamlText, 'utf8').digest('hex');
}
