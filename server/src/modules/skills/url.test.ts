import { describe, it, expect } from 'vitest';
import { normalizeSkillUrl } from './url.js';

describe('normalizeSkillUrl', () => {
  it('rewrites a GitHub blob link to raw.githubusercontent.com', () => {
    const { url, filename } = normalizeSkillUrl(
      'https://github.com/acme/skills/blob/main/api/breaking-change/SKILL.md?plain=1#L3',
    );
    expect(url.href).toBe('https://raw.githubusercontent.com/acme/skills/main/api/breaking-change/SKILL.md');
    expect(filename).toBe('SKILL.md');
  });

  it('rewrites a GitHub raw link too', () => {
    const { url } = normalizeSkillUrl('https://github.com/acme/skills/raw/v1.2/skill.zip');
    expect(url.href).toBe('https://raw.githubusercontent.com/acme/skills/v1.2/skill.zip');
  });

  it('keeps any other https host as is and trims the input', () => {
    const { url, filename } = normalizeSkillUrl('  https://example.com/a/My%20Skill.MD  ');
    expect(url.href).toBe('https://example.com/a/My%20Skill.MD');
    expect(filename).toBe('My Skill.MD');
  });

  it('accepts the explicit default port', () => {
    expect(normalizeSkillUrl('https://example.com:443/x.md').filename).toBe('x.md');
  });

  it.each([
    ['http://example.com/x.md', /https/],
    ['ftp://example.com/x.md', /https/],
    ['https://user:pw@example.com/x.md', /user name or password/],
    ['https://user@example.com/x.md', /user name or password/],
    ['https://example.com:8443/x.md', /port/],
    ['https://127.0.0.1/x.md', /IP address/],
    ['https://[::1]/x.md', /IP address/],
    ['https://2130706433/x.md', /IP address/],
    ['not a url', /valid URL/],
    ['https://example.com/x.txt', /\.md and \.zip/],
    ['https://example.com/', /\.md and \.zip/],
    ['https://github.com/acme/skills/blob/main/run.sh', /\.md and \.zip/],
    ['https://github.com/acme/skills', /\.md and \.zip/],
  ])('rejects %s', (input, message) => {
    expect(() => normalizeSkillUrl(input)).toThrow(message);
  });
});
