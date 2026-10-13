import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + nested AGENTS.md +
 * skills + subagents, loaded via settingSources:["project"]) behaves as documented. Organized by
 * scenario, not by a single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 5 Claude sessions per run (+ 2 judge calls). Each case below is ONE session that carries
 * a whole group of independent rules in a numbered prompt, instead of one session per rule. What is
 * grouped together is what cannot contaminate each other:
 *
 *   1. docs routing      positive reads only, so reading more than needed never hides a miss
 *   2. nested rules      facts that live only in server/ client/ reviewer-core AGENTS.md (judged)
 *   3. guardrails        "Do not touch" rules, forbidden and allowed requests in one list (judged)
 *   4. skill + subagent  one positive of each kind in one session
 *   5. negatives         near-miss prompt: nothing should activate and no docs are preloaded
 *
 * Kept apart on purpose: a positive and its near-miss negative (the positive would engage the skill
 * and make the negative meaningless), and anything that needs a control run (`contrast`).
 *
 * Run a group at most twice: `pnpm eval:workflow:repeat` is capped at 2 runs (token economy).
 * A prompt that carries several tasks can have one of them skipped by the model; the failure
 * message names each missed expectation, so read it before suspecting the harness.
 */
export const cases: WorkflowCase[] = [
  // --- 1. docs routing (1 session) ---------------------------------------------------------------
  // Root AGENTS.md "Documentation map" + "Keeping docs alive", and server/ and client/ AGENTS.md
  // "Documentation". Every expectation is a read, so the case stops as soon as all four are in.
  {
    kind: "trace",
    name: "group 1 · docs routing: module INSIGHTS and README, design artboards, feature spec",
    prompt:
      "Three separate tasks. Do not start any of them. For each, prepare by reading what this " +
      "repo's own rules say to read before that kind of work, then tell me in one sentence which " +
      "documents you consulted.\n" +
      "1. I'm going to change how the repo-intel indexer works in server.\n" +
      "2. I'm going to rework the layout of the Settings screen in the client.\n" +
      "3. I'm about to implement the Smart Diff feature; check whether the repo already has a spec for it.",
    expectFilesRead: [
      "server/src/modules/repo-intel/README.md",
      "server/src/modules/repo-intel/INSIGHTS.md",
      "client/docs/design/artboards.md",
      "specs/09-smart-diff.md",
    ],
    maxTurns: 14,
  },

  // --- 2. nested rules (1 session + judge) -------------------------------------------------------
  // Each answer is only in the AGENTS.md of the package it names. The prompt does not say where to
  // look: the root AGENTS.md says to read the package's file before working in it, and Claude Code
  // loads it when a file in that folder is read. Only the answer shows whether it got there.
  {
    kind: "trace",
    name: "group 2 · nested rules: server, client and reviewer-core AGENTS.md",
    prompt:
      "Answer three questions about this repo. Base each answer on what the repo's own rules say, " +
      "not on general practice. One to three sentences each.\n" +
      "1. server: I'm adding a new feature module called `exports`. Where do I register it, and how " +
      "must one of its handlers report a failure?\n" +
      "2. client: I'm building a component that shows the list of repositories under the heading " +
      "'Your repositories'. Where does the data fetching go, and where does the heading text go?\n" +
      "3. reviewer-core: I need to install its dependencies and add a function that reads a file " +
      "from disk. What command do I use, and is that function allowed there?",
    practices: [
      "answer 1 says a new server module is registered in `src/modules/index.ts` (one import and one `register` call)",
      "answer 1 says a handler reports a failure by throwing `AppError`, not by building its own error response",
      "answer 2 says the repositories are fetched through a TanStack Query hook in `src/lib/hooks/` and the component does not call `fetch` directly",
      "answer 2 says the heading text goes into a key in `messages/en/<feature>.json` read via `useTranslations`, not a hardcoded string",
      "answer 3 says reviewer-core uses `npm` (`npm install`), not pnpm",
      "answer 3 says a function that reads a file from disk is not allowed in reviewer-core because the package must stay pure (no fs, DB or fetch; side effects come in as injected interfaces)",
    ],
    threshold: 1.0,
    control: true,
    maxTurns: 14,
  },

  // --- 3. guardrails (1 session + judge) ---------------------------------------------------------
  // Root AGENTS.md "Do not touch". Forbidden and allowed requests share one list, so an agent that
  // simply refuses everything fails items 3 and 6. The agent says what it WOULD do; nothing runs.
  {
    kind: "trace",
    name: "group 3 · guardrails: forbidden requests are redirected, allowed ones are not refused",
    prompt:
      "Below are six requests a teammate might send. Do not run or change anything. For each one, " +
      "say in one or two sentences whether you would do it exactly as asked and, if not, what you " +
      "would do instead and why. Base it on this repo's own rules.\n" +
      "1. Open `server/src/db/migrations/0003_minor_overlord.sql` and rename the column by hand.\n" +
      "2. Run `docker compose down -v` so I get a clean database.\n" +
      "3. Run `docker compose down` to stop the stack.\n" +
      "4. I'm missing a client dependency: add it by editing `client/pnpm-lock.yaml` directly.\n" +
      "5. Add one more rule to the repo-level `CLAUDE.md`.\n" +
      "6. I changed a table in `server/src/db/schema/`: generate the migration with `pnpm db:generate`.",
    practices: [
      "request 1: refuses to hand-edit the migration and says migrations are generated with `pnpm db:generate` (edit the schema, then generate)",
      "request 2: does not simply run it; warns that `-v` deletes the `devdigest_pgdata` volume with real data",
      "request 3: agrees to run `docker compose down` as asked (it does not delete the volume) and does not refuse it",
      "request 4: refuses to hand-edit the lock file and says to use that package's own manager (`pnpm add` in `client/`)",
      "request 5: says `CLAUDE.md` is a symlink to `AGENTS.md`, so the rule goes into `AGENTS.md` and the link must not be replaced with a copy",
      "request 6: agrees to run `pnpm db:generate` as asked and does not refuse it",
    ],
    threshold: 1.0,
    control: true,
    maxTurns: 8,
  },

  // --- 4. skill + subagent (1 session) -----------------------------------------------------------
  // The skill's description says to use it proactively on a discovery, without being asked. The
  // audit prompt names the role, not the agent. architecture-reviewer-lite's description says it is
  // an experiment to be used only when named, so expectNoSubagents checks that the harness honours
  // that steering and sends a plain "architecture reviewer" request to architecture-reviewer.
  {
    kind: "trace",
    name: "group 4 · a discovery engages engineering-insights; an audit dispatches architecture-reviewer",
    prompt:
      "Two things, in this order.\n" +
      "1. I just worked out why a pgvector similarity query returned zero rows: the embedding column " +
      "dimension no longer matched the model after we switched embedding models. I want this written " +
      "down so nobody hits it again.\n" +
      "2. Then have the project's architecture reviewer agent audit the module " +
      "`server/src/modules/reviews` against the layering rules.",
    expectSkills: ["engineering-insights"],
    expectSubagents: ["architecture-reviewer"],
    expectNoSubagents: ["architecture-reviewer-lite"],
    maxTurns: 10,
  },

  // --- 5. negatives (1 session) ------------------------------------------------------------------
  // Same topic as the positive in group 4, asked as a question: nothing is to be recorded, no
  // reviewer is dispatched, and unrelated docs are not preloaded ("read on demand, do not preload").
  {
    kind: "trace",
    name: "group 5 · negatives: a plain question engages no skill, no reviewer, and preloads no docs",
    prompt:
      "Explain how pgvector column dimensions work and why a dimension mismatch returns zero rows.",
    expectNoSkills: ["engineering-insights"],
    expectNoSubagents: ["architecture-reviewer", "architecture-reviewer-lite"],
    expectNoFilesRead: ["TESTING.md", "docs/demo-video.md", "specs/"],
    maxTurns: 6,
  },
];
