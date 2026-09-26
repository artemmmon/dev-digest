import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `adapters.test.ts` only exercises the MOCK GitHub client, never the real
 * `OctokitGitHubClient` — so the intent layer's two new methods (GraphQL
 * closing issues, contents-API file reads) get their own stub of the
 * `octokit` package (server/INSIGHTS.md "Unverified" note in the plan).
 */
const graphqlMock = vi.fn();
const getContentMock = vi.fn();

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    graphql: graphqlMock,
    rest: { repos: { getContent: getContentMock } },
  })),
}));

const { OctokitGitHubClient } = await import('../src/adapters/github/octokit.js');

describe('OctokitGitHubClient.closingIssues', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
    getContentMock.mockReset();
  });

  it('maps GraphQL nodes and keeps only same-repo references', async () => {
    graphqlMock.mockResolvedValue({
      repository: {
        pullRequest: {
          closingIssuesReferences: {
            nodes: [
              {
                number: 12,
                title: 'Fix X',
                body: 'body',
                state: 'OPEN',
                repository: { nameWithOwner: 'acme/repo' },
              },
              {
                number: 5,
                title: 'Other repo issue',
                body: null,
                state: 'CLOSED',
                repository: { nameWithOwner: 'other/repo' },
              },
            ],
          },
        },
      },
    });
    const client = new OctokitGitHubClient('tok');
    const issues = await client.closingIssues({ owner: 'acme', name: 'repo' }, 1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({ number: 12, title: 'Fix X', body: 'body', state: 'open' });
    expect(graphqlMock).toHaveBeenCalledWith(
      expect.stringContaining('closingIssuesReferences'),
      { owner: 'acme', name: 'repo', number: 1 },
    );
  });

  it('returns [] when there is no closing reference', async () => {
    graphqlMock.mockResolvedValue({ repository: { pullRequest: null } });
    const client = new OctokitGitHubClient('tok');
    expect(await client.closingIssues({ owner: 'acme', name: 'repo' }, 1)).toEqual([]);
  });
});

describe('OctokitGitHubClient.getFileContent', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
    getContentMock.mockReset();
  });

  it('returns decoded content under the size cap', async () => {
    const raw = 'hello world';
    getContentMock.mockResolvedValue({
      data: {
        type: 'file',
        size: raw.length,
        content: Buffer.from(raw).toString('base64'),
        encoding: 'base64',
      },
    });
    const client = new OctokitGitHubClient('tok');
    const res = await client.getFileContent({ owner: 'a', name: 'b' }, 'docs/x.md', 'sha1');
    expect(res).toEqual({ content: raw, size: raw.length });
  });

  it('checks size BEFORE decoding: too_large, content never touched', async () => {
    getContentMock.mockResolvedValue({
      data: { type: 'file', size: 10 * 1024 * 1024, content: 'huge', encoding: 'base64' },
    });
    const client = new OctokitGitHubClient('tok');
    const res = await client.getFileContent({ owner: 'a', name: 'b' }, 'docs/x.md', 'sha1');
    expect(res).toEqual({ status: 'too_large' });
  });

  it('a directory listing is not_found, not a crash', async () => {
    getContentMock.mockResolvedValue({ data: [{ type: 'dir', name: 'docs' }] });
    const client = new OctokitGitHubClient('tok');
    const res = await client.getFileContent({ owner: 'a', name: 'b' }, 'docs', 'sha1');
    expect(res).toEqual({ status: 'not_found' });
  });

  it('a 404 from the contents API is not_found', async () => {
    getContentMock.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const client = new OctokitGitHubClient('tok');
    const res = await client.getFileContent({ owner: 'a', name: 'b' }, 'missing.md', 'sha1');
    expect(res).toEqual({ status: 'not_found' });
  });
});
