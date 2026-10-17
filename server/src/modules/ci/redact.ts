/**
 * Secret-shape scan used on the way out (files committed to a target repository)
 * and on the way in (a downloaded CI result). It returns pattern ids only, never the
 * matched text, so no secret value can reach an error or a log.
 */
const SECRET_SHAPES: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'openai_key', re: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/ },
  { id: 'openrouter_key', re: /(?<![A-Za-z0-9])sk-or-[A-Za-z0-9_-]{20,}/ },
  { id: 'anthropic_key', re: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'github_token', re: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: 'github_pat', re: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{50,}/ },
  { id: 'aws_access_key', re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/ },
  { id: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    id: 'generic_assignment',
    re: /(?:api[_-]?key|secret|token|passw(?:or)?d)[\w-]*\\?["']?\s*[:=]\s*\\?["'][A-Za-z0-9+/_=-]{24,}\\?["']/i,
  },
  { id: 'postgres_url_password', re: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i },
];

/** Ids of the secret shapes found in `text`, in table order; empty when it is clean. */
export function findSecretShapes(text: string): string[] {
  return SECRET_SHAPES.filter(({ re }) => re.test(text)).map(({ id }) => id);
}
