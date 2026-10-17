/** Fixed names and limits of the Export-to-CI module. */

/** Branch the export pull request is opened from. */
export const CI_BRANCH = 'devdigest/ci';
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const WORKFLOW_FILE = 'devdigest-review.yml';
/** Name of the artifact the workflow uploads, and the one file inside it. */
export const RESULT_ARTIFACT = 'devdigest-result';
export const RESULT_FILE = 'devdigest-result.json';
/** Largest accepted result: the artifact's size and the inflated file (256 KB). */
export const RESULT_MAX_BYTES = 262144;
export const PR_TITLE = 'Add DevDigest CI review';
/** Directories the export owns: their stale files are deleted by the commit. */
export const REPLACE_DIRS = ['.devdigest/agents/', '.devdigest/skills/', '.devdigest/runner/'];
/** A refresh of one installation within this window of the last one is skipped. */
export const REFRESH_SKIP_MS = 30000;
/** Newest completed workflow runs read per installation per refresh. */
export const RUNS_PER_REFRESH = 20;

export const AGENTS_DIR = '.devdigest/agents/';
export const SKILLS_DIR = '.devdigest/skills/';
export const RUNNER_DIR = '.devdigest/runner/';
export const MEMORY_PATH = '.devdigest/memory.jsonl';

/**
 * Actions the generated workflow uses, pinned to a full commit SHA (AC-40).
 * `ref` is the tag the SHA was resolved from (latest v4 at implementation time);
 * the workflow carries it as a trailing comment.
 */
export const PINNED_ACTIONS = {
  checkout: { sha: '11d5960a326750d5838078e36cf38b85af677262', ref: 'v4.4.0' },
  setupNode: { sha: '49933ea5288caeca8642d1e84afbd3f7d6820020', ref: 'v4.4.0' },
  uploadArtifact: { sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02', ref: 'v4.6.2' },
} as const;

/** The Actions secret the generated workflow reads; only its presence is ever checked. */
export const SECRET_NAME = 'OPENROUTER_API_KEY';
/** Name of the workflow job whose skip means "no review ran" (matches `workflow.ts`). */
export const REVIEW_JOB = 'review';
export const COMMIT_MESSAGE = 'Add DevDigest CI review';
/** Fixed text: no agent, skill or repository content reaches the pull request body. */
export const PR_BODY = [
  'This pull request adds a DevDigest agent to this repository as a GitHub Actions review.',
  '',
  `- \`${WORKFLOW_PATH}\` runs the bundled runner on each pull request from this repository.`,
  `- \`${AGENTS_DIR}\`, \`${SKILLS_DIR}\` and \`${MEMORY_PATH}\` hold the agent, its skills and memory.`,
  `- \`${RUNNER_DIR}\` holds the prebuilt runner.`,
  '',
  `Before merging, add a repository secret named \`${SECRET_NAME}\`. The review runs on the merged base commit, so nothing runs until this pull request is merged.`,
].join('\n');
/** File name the zip export is downloaded as. */
export const ZIP_FILE_NAME = 'devdigest-ci.zip';
