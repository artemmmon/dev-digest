import { describe, it, expect } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type {
  ArchiveReader,
  InsertSkill,
  SkillRecord,
  SkillStore,
  SkillUsageReader,
  SkillVersionRecord,
  UpdateSkill,
} from '../src/modules/skills/ports.js';

/** SkillsService against an in-memory SkillStore (onion-architecture patterns §8). */

class InMemorySkillStore implements SkillStore {
  skills = new Map<string, SkillRecord>();
  bodies: Array<[string, number, string]> = [];
  versions = new Map<string, SkillVersionRecord[]>();
  private seq = 0;

  async list(ws: string) {
    return [...this.skills.values()].filter((s) => s.workspaceId === ws);
  }
  async getById(ws: string, id: string) {
    const s = this.skills.get(id);
    return s && s.workspaceId === ws ? s : undefined;
  }
  async insert(v: InsertSkill) {
    const s: SkillRecord = {
      id: `skill-${++this.seq}`,
      ...v,
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date(),
    };
    this.skills.set(s.id, s);
    this.bodies.push([s.id, 1, s.body]);
    this.versions.set(s.id, [{ version: 1, body: s.body, message: null, createdAt: new Date() }]);
    return s;
  }
  async update(ws: string, id: string, patch: UpdateSkill) {
    const s = await this.getById(ws, id);
    if (!s) return undefined;
    if (patch.body !== undefined && patch.body !== s.body) {
      s.version += 1;
      this.bodies.push([id, s.version, patch.body]);
      this.versions.get(id)!.unshift({
        version: s.version,
        body: patch.body,
        message: patch.message ?? null,
        createdAt: new Date(),
      });
    }
    const { message: _message, ...fields } = patch;
    Object.assign(s, fields);
    return s;
  }
  async listVersions(ws: string, id: string) {
    return (await this.getById(ws, id)) ? this.versions.get(id) : undefined;
  }
  async setEnabled(ws: string, id: string, enabled: boolean) {
    const s = await this.getById(ws, id);
    if (s) s.enabled = enabled;
    return s;
  }
  async deleteById(ws: string, id: string) {
    return (await this.getById(ws, id)) ? this.skills.delete(id) : false;
  }
}

const noArchive: ArchiveReader = {
  list: () => {
    throw new Error('not a zip');
  },
  readText: () => '',
};

class FakeUsage implements SkillUsageReader {
  /** skill id → agents with an enabled binding */
  using = new Map<string, Array<{ id: string; name: string }>>();
  async agentCounts() {
    return new Map([...this.using].map(([id, agents]) => [id, agents.length]));
  }
  async agentsUsing(_ws: string, skillId: string) {
    return this.using.get(skillId) ?? [];
  }
}

function setup() {
  const skills = new InMemorySkillStore();
  const usage = new FakeUsage();
  const tokenizer = { count: (text: string) => text.split(/\s+/).filter(Boolean).length };
  return { skills, usage, service: new SkillsService({ skills, archive: noArchive, usage, tokenizer }) };
}

const NEW = {
  name: 'branch-coverage',
  description: 'Use when reviewing tests: flag uncovered branches.',
  type: 'rubric' as const,
  body: '# Rules\nCheck branches.',
};

describe('SkillsService', () => {
  it('creates a skill as a DTO: manual source unless told otherwise, version 1, enabled', async () => {
    const { service } = setup();
    expect(await service.create('ws', NEW)).toMatchObject({
      name: 'branch-coverage',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });
    expect((await service.create('ws', { ...NEW, name: 'b', source: 'imported_file' })).source).toBe(
      'imported_file',
    );
  });

  it('a changed body makes a new version; other edits and an identical body do not', async () => {
    const { service, skills } = setup();
    const s = await service.create('ws', NEW);
    expect((await service.update('ws', s.id, { name: 'renamed' }))?.version).toBe(1);
    expect((await service.update('ws', s.id, { body: NEW.body }))?.version).toBe(1);
    expect((await service.update('ws', s.id, { body: 'new body' }))?.version).toBe(2);
    expect(skills.bodies.map(([, v]) => v)).toEqual([1, 2]);
  });

  it("does not see, edit, toggle or delete another workspace's skill", async () => {
    const { service } = setup();
    const s = await service.create('ws', NEW);
    expect(await service.get('other', s.id)).toBeUndefined();
    expect(await service.update('other', s.id, { name: 'x' })).toBeUndefined();
    expect(await service.setEnabled('other', s.id, false)).toBeUndefined();
    expect(await service.delete('other', s.id)).toBe(false);
    expect(await service.list('other')).toEqual([]);
  });

  it('toggles the global switch without touching the version', async () => {
    const { service } = setup();
    const s = await service.create('ws', NEW);
    expect(await service.setEnabled('ws', s.id, false)).toMatchObject({ enabled: false, version: 1 });
  });

  it('fills body_tokens and agent_count on every read', async () => {
    const { service, usage } = setup();
    const s = await service.create('ws', NEW);
    expect(s).toMatchObject({ body_tokens: 4, agent_count: 0 }); // "#" "Rules" "Check" "branches."
    usage.using.set(s.id, [{ id: 'a1', name: 'Test Quality Reviewer' }]);
    expect((await service.get('ws', s.id))?.agent_count).toBe(1);
    expect((await service.list('ws'))[0]).toMatchObject({ agent_count: 1, body_tokens: 4 });
    expect((await service.setEnabled('ws', s.id, false))?.agent_count).toBe(1);
  });

  it('lists versions newest first with the change message, only for a body change', async () => {
    const { service } = setup();
    const s = await service.create('ws', NEW);
    await service.update('ws', s.id, { body: 'second', message: 'Tightened the rule' });
    await service.update('ws', s.id, { name: 'renamed', message: 'ignored: no body change' });
    await service.update('ws', s.id, { body: 'third' });
    const versions = await service.versions('ws', s.id);
    expect(versions?.map((v) => [v.version, v.message])).toEqual([
      [3, null],
      [2, 'Tightened the rule'],
      [1, null],
    ]);
    expect(versions?.[0]?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('answers undefined for versions and agents of a skill in another workspace', async () => {
    const { service } = setup();
    const s = await service.create('ws', NEW);
    expect(await service.versions('other', s.id)).toBeUndefined();
    expect(await service.agentsUsing('other', s.id)).toBeUndefined();
  });

  it('lists the agents that use a skill', async () => {
    const { service, usage } = setup();
    const s = await service.create('ws', NEW);
    usage.using.set(s.id, [{ id: 'a1', name: 'Test Quality Reviewer' }]);
    expect(await service.agentsUsing('ws', s.id)).toEqual([{ id: 'a1', name: 'Test Quality Reviewer' }]);
  });

  it('previews a .md upload and saves nothing', async () => {
    const { service, skills } = setup();
    const b64 = Buffer.from('# Naming\n\nUse kebab-case.').toString('base64');
    expect(service.previewImport('naming.md', b64)).toMatchObject({
      name: 'Naming',
      description: 'Use kebab-case.',
    });
    expect(skills.skills.size).toBe(0);
  });

  it('rejects an empty upload and an unreadable archive', () => {
    const { service } = setup();
    expect(() => service.previewImport('a.md', '')).toThrow(/empty/);
    expect(() => service.previewImport('a.zip', Buffer.from('xx').toString('base64'))).toThrow(
      /not a valid \.zip/,
    );
  });
});
