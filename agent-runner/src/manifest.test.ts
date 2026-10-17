import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifest, findManifestPath, loadAgentManifest } from './manifest.js';
import { RunnerError } from './errors.js';

const VALID_MANIFEST_YAML = `
manifest_version: 1
agent_version: 3
name: "Security Reviewer"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["security-basics"]
strategy: "auto"
ci_fail_on: "critical"
`;

describe('manifest loading + validation (AC-20)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a well-formed manifest against the AgentManifest schema', () => {
    writeFileSync(path.join(dir, 'agents', 'security-reviewer.yaml'), VALID_MANIFEST_YAML);

    const manifest = loadManifest(dir);

    expect(manifest.manifest_version).toBe(1);
    expect(manifest.agent_version).toBe(3);
    expect(manifest.name).toBe('Security Reviewer');
    expect(manifest.model).toBe('deepseek/deepseek-v4-flash');
    expect(manifest.skills).toEqual(['security-basics']);
    expect(manifest.ci_fail_on).toBe('critical');
  });

  it('fails clearly when the manifest fails schema validation (bad ci_fail_on)', () => {
    writeFileSync(
      path.join(dir, 'agents', 'bad.yaml'),
      `
manifest_version: 1
agent_version: 1
name: "Bad Agent"
model: "gpt-4.1"
system_prompt: "review"
ci_fail_on: "sometimes"
`,
    );

    expect(() => loadManifest(dir)).toThrow(RunnerError);
    expect(() => loadManifest(dir)).toThrow(/failed validation/i);
  });

  it('rejects a manifest without manifest_version / agent_version (the old unversioned shape)', () => {
    writeFileSync(
      path.join(dir, 'agents', 'old.yaml'),
      'name: "Old"\nmodel: "gpt-4.1"\nsystem_prompt: "review"\nci_fail_on: "critical"\n',
    );
    expect(() => loadManifest(dir)).toThrow(/manifest_version/);
  });

  it('rejects an unknown manifest_version and an agent_version below 1', () => {
    const base = 'name: "A"\nmodel: "m"\nsystem_prompt: "p"\n';
    writeFileSync(path.join(dir, 'agents', 'a.yaml'), `manifest_version: 2\nagent_version: 1\n${base}`);
    expect(() => loadManifest(dir)).toThrow(/manifest_version/);
    writeFileSync(path.join(dir, 'agents', 'a.yaml'), `manifest_version: 1\nagent_version: 0\n${base}`);
    expect(() => loadManifest(dir)).toThrow(/agent_version/);
  });

  it('fails clearly when the manifest is missing required fields', () => {
    writeFileSync(path.join(dir, 'agents', 'incomplete.yaml'), 'name: "No model or prompt"\n');
    expect(() => loadManifest(dir)).toThrow(RunnerError);
  });

  it('fails clearly when no manifest file exists', () => {
    rmSync(path.join(dir, 'agents', ), { recursive: true, force: true });
    expect(() => findManifestPath(dir)).toThrow(/not found/i);
  });

  it('fails clearly when more than one manifest file exists', () => {
    writeFileSync(path.join(dir, 'agents', 'a.yaml'), VALID_MANIFEST_YAML);
    writeFileSync(path.join(dir, 'agents', 'b.yaml'), VALID_MANIFEST_YAML);
    expect(() => findManifestPath(dir)).toThrow(/exactly one/i);
  });

  it('fails clearly on malformed YAML', () => {
    writeFileSync(path.join(dir, 'agents', 'broken.yaml'), 'name: "unterminated\n  bad: [1, 2\n');
    const manifestPath = path.join(dir, 'agents', 'broken.yaml');
    expect(() => loadAgentManifest(manifestPath)).toThrow(RunnerError);
  });
});
