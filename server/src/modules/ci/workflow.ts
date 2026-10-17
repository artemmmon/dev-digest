import { CiPostAs, CiTrigger } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { PINNED_ACTIONS, RESULT_ARTIFACT, RESULT_FILE, RUNNER_DIR } from './constants.js';

export interface WorkflowOptions {
  triggers: CiTrigger[];
  postAs: CiPostAs;
}

const pin = (a: { sha: string; ref: string }, name: string): string =>
  `actions/${name}@${a.sha} # ${a.ref}`;

/**
 * The GitHub Actions workflow that runs the bundled agent-runner on each
 * same-repository pull request.
 *
 * Every value that is not a fixed string is an enum member (trigger types, the
 * post-as option), re-checked here, so no user text reaches the YAML or a `${{ }}`
 * expression. Security shape:
 *  - `pull_request` only (never `pull_request_target`), a read-only token, and
 *    `pull-requests: write` only when the runner posts (AC-35..AC-37);
 *  - the `gate` job skips fork pull requests (AC-38) and checks out the BASE commit,
 *    so the runner, manifest and skills are the ones already merged (AC-39, AC-119);
 *  - the API key reaches only the step that runs the runner (AC-42);
 *  - every action is pinned to a full commit SHA (AC-40).
 */
export function generateWorkflow(options: WorkflowOptions): string {
  const triggers = CiTrigger.options.filter((t) => options.triggers.includes(t));
  if (triggers.length === 0) {
    throw new ValidationError('At least one trigger is required');
  }
  const postAs = CiPostAs.parse(options.postAs);
  const prPermission = postAs === 'none' ? 'read' : 'write';
  const checkout = pin(PINNED_ACTIONS.checkout, 'checkout');
  const sameRepo = 'github.event.pull_request.head.repo.full_name == github.repository';

  return `name: DevDigest Review

on:
  pull_request:
    types: [${triggers.join(', ')}]

permissions:
  contents: read
  pull-requests: ${prPermission}

jobs:
  gate:
    if: ${sameRepo}
    runs-on: ubuntu-latest
    outputs:
      present: \${{ steps.runner.outputs.present }}
    steps:
      - uses: ${checkout}
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - id: runner
        run: |
          if test -f ${RUNNER_DIR}index.js; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
          fi

  review:
    needs: gate
    if: needs.gate.outputs.present == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: ${checkout}
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - uses: ${pin(PINNED_ACTIONS.setupNode, 'setup-node')}
        with:
          node-version: 22
      - name: Run the DevDigest agent
        run: node ${RUNNER_DIR}index.js
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ github.token }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_HEAD_SHA: \${{ github.event.pull_request.head.sha }}
          DEVDIGEST_POST_AS: ${postAs}
      - uses: ${pin(PINNED_ACTIONS.uploadArtifact, 'upload-artifact')}
        if: always()
        with:
          name: ${RESULT_ARTIFACT}
          path: ${RESULT_FILE}
          if-no-files-found: ignore
`;
}
