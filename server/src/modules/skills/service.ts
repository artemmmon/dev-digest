import type { Skill, SkillAgentUse, SkillImportPreview, SkillInput, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { MAX_IMPORT_BYTES, URL_FETCH_TIMEOUT_MS } from './constants.js';
import { toSkillDto, toSkillVersionDto, normalizeAppliesTo } from './helpers.js';
import { parseSkillImport } from './import-parser.js';
import { normalizeSkillUrl } from './url.js';
import type { SkillRecord, SkillsServiceDeps } from './ports.js';

/**
 * Skills service. A skill is text only: name, directive description, type and a
 * markdown body. Nothing here executes a skill or anything inside an import.
 */

export type UpdateSkillInput = Partial<
  Pick<SkillInput, 'name' | 'description' | 'type' | 'body' | 'applies_to'>
> & {
  /** What changed; stored with the new version when the body changes. */
  message?: string;
};

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  private get store() {
    return this.deps.skills;
  }

  /** The DTO plus what is computed per read: token count of the body and how many agents use it. */
  private async toDto(workspaceId: string, row: SkillRecord, agentCount?: number): Promise<Skill> {
    const count = agentCount ?? (await this.deps.usage.agentsUsing(workspaceId, row.id)).length;
    return toSkillDto(row, { agentCount: count, bodyTokens: this.deps.tokenizer.count(row.body) });
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.store.list(workspaceId),
      this.deps.usage.agentCounts(workspaceId),
    ]);
    return Promise.all(rows.map((r) => this.toDto(workspaceId, r, counts.get(r.id) ?? 0)));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.store.getById(workspaceId, id);
    return row && this.toDto(workspaceId, row);
  }

  /** Saved bodies, newest first. */
  async versions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    return (await this.store.listVersions(workspaceId, id))?.map(toSkillVersionDto);
  }

  async agentsUsing(workspaceId: string, id: string): Promise<SkillAgentUse[] | undefined> {
    if (!(await this.store.getById(workspaceId, id))) return undefined;
    return this.deps.usage.agentsUsing(workspaceId, id);
  }

  async create(workspaceId: string, input: SkillInput): Promise<Skill> {
    const row = await this.store.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      appliesTo: normalizeAppliesTo(input.applies_to),
    });
    return this.toDto(workspaceId, row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.store.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.applies_to !== undefined ? { appliesTo: normalizeAppliesTo(patch.applies_to) } : {}),
      ...(patch.message !== undefined ? { message: patch.message } : {}),
    });
    return row && this.toDto(workspaceId, row);
  }

  async setEnabled(workspaceId: string, id: string, enabled: boolean): Promise<Skill | undefined> {
    const row = await this.store.setEnabled(workspaceId, id, enabled);
    return row && this.toDto(workspaceId, row);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.store.deleteById(workspaceId, id);
  }

  /** Extract the core of an uploaded file for confirmation. Saves nothing. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    const bytes = Uint8Array.from(Buffer.from(contentBase64, 'base64'));
    if (bytes.byteLength === 0) throw new ValidationError('The file is empty');
    if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError('The file is too large');
    return parseSkillImport({ filename, bytes }, this.deps.archive);
  }

  /** Same as `previewImport`, for a public https URL to a `.md` / `.zip`. Saves nothing. */
  async previewImportFromUrl(rawUrl: string): Promise<SkillImportPreview> {
    const { url, filename } = normalizeSkillUrl(rawUrl);
    const bytes = await this.deps.remote.fetch(url, {
      maxBytes: MAX_IMPORT_BYTES,
      timeoutMs: URL_FETCH_TIMEOUT_MS,
    });
    if (bytes.byteLength === 0) throw new ValidationError('The file is empty');
    if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError('The file is too large');
    return parseSkillImport({ filename, bytes }, this.deps.archive);
  }
}
