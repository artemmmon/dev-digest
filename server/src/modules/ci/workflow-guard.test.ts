import { describe, it, expect } from 'vitest';
import { CiPostAs, CiTrigger } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { WORKFLOW_PATH } from './constants.js';
import { generateWorkflow } from './workflow.js';
import { assertSafeWorkflow } from './workflow-guard.js';

const SHA = '11d5960a326750d5838078e36cf38b85af677262';

const wf = (parts: { on?: string; permissions?: string; jobPermissions?: string; uses?: string }) => `name: t
on:
${parts.on ?? '  pull_request:\n    types: [opened]'}
${parts.permissions ?? 'permissions:\n  contents: read'}
jobs:
  review:
    runs-on: ubuntu-latest
${parts.jobPermissions ?? ''}
    steps:
      - uses: ${parts.uses ?? `actions/checkout@${SHA} # v4`}
      - run: echo hi
`;

function refusal(text: string): ValidationError {
  try {
    assertSafeWorkflow(text);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return err as ValidationError;
  }
  throw new Error('expected the workflow to be refused');
}

const subsets = (all: readonly CiTrigger[]): CiTrigger[][] => {
  const out: CiTrigger[][] = [];
  for (let mask = 1; mask < 1 << all.length; mask++) out.push(all.filter((_, i) => mask & (1 << i)));
  return out;
};

describe('assertSafeWorkflow', () => {
  it('accepts the generated workflow for every post_as and trigger combination', () => {
    for (const postAs of CiPostAs.options) {
      for (const triggers of subsets(CiTrigger.options)) {
        expect(() => assertSafeWorkflow(generateWorkflow({ triggers, postAs }))).not.toThrow();
      }
    }
  });

  it('refuses pull_request_target and workflow_run, in every `on` shape', () => {
    for (const on of [
      '  pull_request_target:\n    types: [opened]',
      '  workflow_run:\n    workflows: [x]',
      '  pull_request:\n  pull_request_target:',
    ]) {
      const err = refusal(wf({ on }));
      expect(err.message).toContain('pull_request_target or workflow_run');
      expect(err.message).toContain(WORKFLOW_PATH);
    }
    expect(() => assertSafeWorkflow('on: pull_request_target\njobs: {}\n')).toThrow(ValidationError);
    expect(() => assertSafeWorkflow('on: [push, workflow_run]\njobs: {}\n')).toThrow(ValidationError);
  });

  it('refuses permissions beyond contents: read and pull-requests: read|write', () => {
    for (const permissions of [
      'permissions: write-all',
      'permissions: read-all',
      'permissions:\n  contents: write',
      'permissions:\n  contents: read\n  id-token: write',
      'permissions:\n  issues: read',
      'permissions:\n  pull-requests: admin',
    ]) {
      expect(refusal(wf({ permissions })).message).toContain('may grant only contents: read');
    }
  });

  it('refuses a per-job permissions block that grants too much, accepts a narrow one', () => {
    expect(
      refusal(wf({ jobPermissions: '    permissions:\n      contents: write' })).message,
    ).toContain('may grant only contents: read');
    expect(() =>
      assertSafeWorkflow(wf({ jobPermissions: '    permissions:\n      pull-requests: write' })),
    ).not.toThrow();
  });

  it('refuses a uses that is not pinned to a full 40-hex SHA, accepts a local action', () => {
    for (const uses of [
      'actions/checkout@v4',
      'actions/checkout@main',
      `actions/checkout@${SHA.slice(0, 39)}`,
      'actions/checkout',
      'docker://alpine:3',
    ]) {
      expect(refusal(wf({ uses })).message).toContain('full 40-character commit SHA');
    }
    expect(() => assertSafeWorkflow(wf({ uses: './.github/actions/local' }))).not.toThrow();
  });

  it('refuses a reusable-workflow job that is not pinned', () => {
    const text = `on:\n  pull_request:\njobs:\n  call:\n    uses: org/repo/.github/workflows/x.yml@main\n`;
    expect(refusal(text).message).toContain('full 40-character commit SHA');
  });

  it('refuses invalid YAML with a fixed message that does not echo the text', () => {
    for (const text of ['on: [unclosed\njobs: {', 'a: 1\na: 2\n', 'just a string']) {
      const err = refusal(text);
      expect(err.message).toBe(`The workflow ${WORKFLOW_PATH} is not valid YAML`);
    }
    expect(refusal('on: [SECRET_TOKEN_VALUE\n').message).not.toContain('SECRET_TOKEN_VALUE');
  });
});
