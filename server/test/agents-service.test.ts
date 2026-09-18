import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AgentsService } from '../src/modules/agents/service.js';
import type {
  AgentRecord,
  AgentStore,
  AgentVersionRecord,
  InsertAgent,
  SkillLink,
  UpdateAgent,
} from '../src/modules/agents/ports.js';

/** AgentsService against an in-memory AgentStore (onion-architecture patterns §8). */

class InMemoryAgentStore implements AgentStore {
  agents = new Map<string, AgentRecord>();
  links = new Map<string, SkillLink[]>();
  knownSkills = new Set<string>();
  private seq = 0;

  async list(ws: string) {
    return [...this.agents.values()].filter((a) => a.workspaceId === ws);
  }
  async listEnabled(ws: string) {
    return (await this.list(ws)).filter((a) => a.enabled);
  }
  async getById(ws: string, id: string) {
    const a = this.agents.get(id);
    return a && a.workspaceId === ws ? a : undefined;
  }
  async namesByIds(ws: string, ids: string[]) {
    const out = new Map<string, string>();
    for (const id of ids) {
      const a = await this.getById(ws, id);
      if (a) out.set(id, a.name);
    }
    return out;
  }
  async deleteById(ws: string, id: string) {
    return (await this.getById(ws, id)) ? this.agents.delete(id) : false;
  }
  async insert(v: InsertAgent) {
    const a: AgentRecord = {
      id: `agent-${++this.seq}`,
      workspaceId: v.workspaceId,
      name: v.name,
      description: v.description ?? '',
      provider: v.provider,
      model: v.model,
      systemPrompt: v.systemPrompt,
      outputSchema: v.outputSchema ?? null,
      strategy: v.strategy ?? 'single-pass',
      ciFailOn: v.ciFailOn ?? 'critical',
      repoIntel: v.repoIntel ?? true,
      enabled: v.enabled ?? true,
      version: 1,
      createdBy: v.createdBy ?? null,
      createdAt: new Date(),
    };
    this.agents.set(a.id, a);
    return a;
  }
  async update(ws: string, id: string, patch: UpdateAgent) {
    const a = await this.getById(ws, id);
    if (!a) return undefined;
    Object.assign(a, patch);
    return a;
  }
  async listVersions(): Promise<AgentVersionRecord[]> {
    return [];
  }
  async getVersion() {
    return undefined;
  }
  async linkedSkills(agentId: string) {
    return this.links.get(agentId) ?? [];
  }
  async linkSkill(agentId: string, skillId: string, order: number) {
    this.links.set(agentId, [...(this.links.get(agentId) ?? []), { skillId, order }]);
  }
  async setSkills(agentId: string, skillIds: string[]) {
    this.links.set(agentId, skillIds.map((skillId, order) => ({ skillId, order })));
  }
  async skillIdsInWorkspace(_ws: string, ids: string[]) {
    return new Set(ids.filter((id) => this.knownSkills.has(id)));
  }
}

function setup() {
  const agents = new InMemoryAgentStore();
  const service = new AgentsService({
    agents,
    llm: async () => new MockLLMProvider('openai', { models: [{ id: 'gpt-x', provider: 'openai' }] }),
  });
  return { agents, service };
}

const NEW = { name: 'A', provider: 'openai' as const, model: 'gpt-4.1', system_prompt: 's' };

describe('AgentsService', () => {
  it('creates an agent as a DTO with the defaults filled in', async () => {
    const { service } = setup();
    const agent = await service.create('ws', NEW, 'u1');
    expect(agent).toMatchObject({
      name: 'A',
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: true,
      enabled: true,
      version: 1,
    });
  });

  it("does not see, update or delete another workspace's agent", async () => {
    const { service } = setup();
    const agent = await service.create('ws', NEW);
    expect(await service.get('other', agent.id)).toBeUndefined();
    expect(await service.update('other', agent.id, { name: 'x' })).toBeUndefined();
    expect(await service.delete('other', agent.id)).toBe(false);
    expect(await service.listVersions('other', agent.id)).toBeUndefined();
  });

  it('links only skills that exist in the workspace, and orders them', async () => {
    const { service, agents } = setup();
    agents.knownSkills.add('s1');
    agents.knownSkills.add('s2');
    const agent = await service.create('ws', NEW);

    await expect(service.setSkills('ws', agent.id, ['s1', 'ghost'])).rejects.toMatchObject({
      code: 'validation_error',
      details: { skill_ids: ['ghost'] },
    });
    await expect(service.linkSkill('ws', agent.id, 'ghost')).rejects.toMatchObject({
      code: 'validation_error',
    });

    expect(await service.setSkills('ws', agent.id, ['s2', 's1'])).toEqual([
      { agent_id: agent.id, skill_id: 's2', order: 0 },
      { agent_id: agent.id, skill_id: 's1', order: 1 },
    ]);
  });

  it('linkSkill appends by default', async () => {
    const { service, agents } = setup();
    agents.knownSkills.add('s1');
    agents.knownSkills.add('s2');
    const agent = await service.create('ws', NEW);
    await service.linkSkill('ws', agent.id, 's1');
    const links = await service.linkSkill('ws', agent.id, 's2');
    expect(links?.map((l) => [l.skill_id, l.order])).toEqual([
      ['s1', 0],
      ['s2', 1],
    ]);
  });

  it('lists provider models, and degrades to [] when the provider has no key', async () => {
    const { service } = setup();
    expect(await service.listModels('openai')).toEqual([{ id: 'gpt-x', provider: 'openai' }]);

    const broken = new AgentsService({
      agents: new InMemoryAgentStore(),
      llm: async () => {
        throw new Error('OPENAI_API_KEY is not configured');
      },
    });
    expect(await broken.listModels('openai')).toEqual([]);
  });
});
