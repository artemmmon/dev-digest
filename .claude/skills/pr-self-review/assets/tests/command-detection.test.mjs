import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGatedCommand, mentionsOverride } from '../gate-check.mjs';

const gated = [
  'git push',
  'git push -u origin lesson-02',
  'cd server && git push',
  'git -C . push',
  'gh pr create --fill',
  'gh pr merge 12 --squash',
  'FOO=1 gh pr merge 12',
  'npm test; git push',
  'bash -c "git push origin x"',
  "sh -c 'gh pr create --fill'",
  'echo "$(git push)"',
  'echo `gh pr create`',
  'eval "git push"',
  'git commit -m "x" && git push',
  'true && bash -c "cd a && git push"',
  // An apostrophe inside double quotes must not pair with a later single quote and hide the push.
  `git commit -m "fix: don't crash" && git push && echo 'ok'`,
  `echo "it's" && git push origin x && echo 'done'`,
  `git commit -m 'say "hi"' && gh pr create --fill`,
];

const notGated = [
  'git status',
  'git log --oneline',
  'echo git pushing',
  'gh pr view 3',
  'gh pr list',
  'cat push.txt',
  'git commit -m "docs: explain git push and gh pr create"',
  "git commit -m 'never run git push here'",
  'git commit -m "$(cat <<\'EOF\'\nfix: the git push hook\n\nCloses gh pr create bug\nEOF\n)"',
  "cat > notes.md <<'EOF'\ngit push\ngh pr merge\nEOF",
  'cat <<EOF > x.md\n  gh pr create\nEOF',
  'grep -n "git push" README.md',
];

test('gated: direct, compound, nested shells and substitutions', () => {
  for (const c of gated) assert.ok(isGatedCommand(c), `should be gated: ${c}`);
});

test('not gated: mentions inside quotes, commit messages and heredoc bodies', () => {
  for (const c of notGated) assert.ok(!isGatedCommand(c), `should not be gated: ${c}`);
});

test('override detection follows the same layers', () => {
  for (const c of [
    'PR_SELF_REVIEW_OVERRIDE="x" git push',
    'PR_SELF_REVIEW_OVERRIDE=x git push',
    'export PR_SELF_REVIEW_OVERRIDE=x; git push',
    'env PR_SELF_REVIEW_OVERRIDE=x git push',
    'bash -c "PR_SELF_REVIEW_OVERRIDE=x git push"',
  ]) {
    assert.ok(mentionsOverride(c), c);
  }
  assert.ok(!mentionsOverride('git push'));
  assert.ok(!mentionsOverride('echo "PR_SELF_REVIEW_OVERRIDE=x is how you override"'));
});
