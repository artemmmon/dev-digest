# Skills — reusable instruction blocks for review agents
Status: done
Lesson: L02

## Goal
Let a user keep review rules in one place and reuse them across agents. A **skill** is
markdown text — name, directive description, type, body — stored in the DB. An agent
has an ordered list of bound skills; the enabled ones are added to its prompt, one
block per skill, in that order, and each block is visible in the run trace with its token
count. A skill never runs anything: it is text only.

Two new agents use the feature end to end: **Test Quality Reviewer** and **API Contract
Reviewer**. At least one of their skills is brought in through the import flow.

## Scope
**In**
- Server module `skills`: CRUD over `skills` (DB is the source of truth), body versioning
  (`skill_versions`), a global enable toggle.
- Import: a `.md` file or a `.zip` archive → core of the skill + preview → saved only after
  the user confirms. Nothing in an archive is executed or written to disk.
- Agent ↔ skill binding: per-binding `enabled` + order; changing it versions the agent.
- Prompt: enabled skills are rendered as `### Skill: <name>` blocks under `## Skills / rules`;
  the run trace records `skill_blocks` (name + tokens) and the live log names each skill.
- UI, as in the current design (screenshots of the Skills Lab; `client/docs/design/src/screen_skills.jsx` is an
  older version of it): `/skills` is one page. Left, a 290px list of **cards** (type icon, name, enable switch,
  description, type + source, "N agents"; search; "Add Skill" menu: import from file / create from scratch).
  Right, the selected skill: header (name, type, `vN`, delete) and tabs **Config** (name, directive description,
  type, line-numbered markdown editor with a token count, "Enabled" switch, optional "what changed?" message, Save /
  Discard), **Preview** (the draft rendered as markdown), **Stats** (used by N agents + who) and **Versions** (history
  with messages, Diff against the current body, Restore = a new version with the old text). Selection is in
  `?skill=<id>` (`new` = empty draft), the tab in `?tab=`; leaving unsaved edits asks first. `/skills/new` and
  `/skills/:id` redirect there. Agent editor **Skills** tab: one ordered list of all skills, checkbox = used by this
  agent, reorder by drag-and-drop or ArrowUp/ArrowDown on the grip; a save sends the whole list, so an unchecked
  skill keeps its place. Sidebar: WORKSPACE (Pull Requests) and SKILLS LAB (Skills, Agents).
- Seeds: the two agents and their skills (one skill is delivered as an import sample).
- `pr-self-review` auto-invocation switched off.

**Out**
- Import from URL, community search, conventions extractor (later in L02/L03).
- Touch drag-and-drop (native HTML5 DnD has none on mobile; the keyboard path covers it).
- The **Evals** tab and "Run on evals" (L06); Import from URL and Search community skills (menu items + drawer).
- Stats that need findings attributed to a skill — pull frequency, accept rate, findings by category, and the
  matching parts of the card footer. Nothing in the data links a finding to one skill yet.
- Sidebar items of later lessons (Conventions, Eval Dashboard, Memory, …): no page, no link.
- Archive formats other than `.zip`.
- Homework artefacts (`hw/L02`, demo video) and the control-experiment PRs.

## Design
Packages: `server`, `client`. `reviewer-core` needs no change: `assemblePrompt` already
renders `PromptParts.skills`.

### Data
- `agent_skills.enabled boolean not null default true`.
- `skills.source` enum gains `imported_file`; `skills.updated_at`.
- `skill_versions.message` (nullable): what changed, written by the editor when the body changes.
- Migrations `0012` and `0013` are generated with `pnpm db:generate`, never hand-written.

### Contracts (`server/src/vendor/shared`, synced to the client)
- `SkillSource` + `imported_file`; `AgentSkillLink.enabled`; `Agent.skill_count`.
- `SkillInput`, `SkillImportPreview` (`name, description, type, body, source_file,
  ignored_files[{path, reason}]`).
- `PromptAssembly.skill_blocks?: {skill_id, name, tokens}[] | null` — nullish, stored
  traces are served unparsed.

### Server
- `GET/POST /skills`, `GET/PUT/DELETE /skills/:id`, `PATCH /skills/:id/enabled`.
- `GET /skills/:id/versions` (newest first, with `message`), `GET /skills/:id/agents` (agents with an enabled
  binding); `PUT /skills/:id` takes an optional `message`, stored only when the body changes. `Skill` carries
  `agent_count` and `body_tokens`. The agents module implements the usage read port (`agent_skills` is its table).
- `POST /skills/import/preview` `{filename, content_base64}` → `SkillImportPreview`, no write.
- `PUT /agents/:id/skills` `{skills:[{skill_id, enabled}]}` — replace the set, order = index.
- `AgentStore.resolvedSkills(agentId)` — links and skills both enabled, by `order`.
- `ArchiveReader` port + `fflate` adapter; the parser picks `SKILL.md` (or the only `.md`)
  and lists everything else as ignored (`executable` for scripts).
- Limits: 200 entries, 1 MB for the chosen file, 10 MB uncompressed total, no absolute or
  `..` paths.

### Client
`/skills` (`SkillList`, `SkillDetail` with `ConfigTab` / `PreviewTab` / `StatsTab` / `VersionsTab`, `ImportSkillModal` with `SkillForm`), a `skills` hook
file, the agent editor `Skills` tab, a per-skill token list in the run trace. Trust notice
in the import preview: an imported skill is someone else's instructions inside the prompt.

## Acceptance
- A skill is created, edited (body change → version +1) and toggled in the UI.
- Importing a `.zip` with `SKILL.md` and `scripts/*.sh` shows a preview that lists the script
  as ignored; nothing is saved before confirm; the script is never run.
- Test Quality Reviewer and API Contract Reviewer both have bound skills.
- A review run shows the enabled skills as separate blocks in the trace with token counts and
  one log line each; a disabled skill (globally or on the binding) is absent from both.
- `pr-self-review` no longer auto-invokes; run manually it routes to both frontend and
  backend skills for a change that touches `client/src` and `server/src`.

## Control experiment (2026-09-21)
Real runs on `deepseek/deepseek-v4-flash`, test repo `artemmmon/cs2-lineups`, agents with lean prompts
(role + severity/verdict only; the checks live in the skills). Each run with all bindings on, then off.

| Agent | PR | With skills | Without skills |
|---|---|---|---|
| Test Quality | happy-path tests for a favorites controller and API client | untested remove branch 2/2, untested error statuses 2/2, search/sort untested 2/2 | untested remove branch 0/2, error statuses 1/2 (SUGGESTION) |
| API Contract | new API client, no old contract | `approve` 2/2 (the rubric compares old vs new) | found silent `[]`, crash on non-404, wrong map |
| API Contract | 3 announced breaks (param rename, array → object, dropped field) | 3/3 found, 2/2 | 3/3 found, 2/2 |
| API Contract | error envelope changed under "no behavior change" | found 3/3 | found 3/3 |

Reproduces for **Test Quality**. Does **not** reproduce for API Contract: its role already is "find contract breaks",
so the rubric adds nothing, and a narrow rubric even made it approve a PR with nothing to compare. Skills pay off
where the knowledge is not inferable (house conventions); no such skill was written for the throwaway test repo.

## Open questions
- Whether a change to a skill body should also bump the versions of agents bound to it
  (today: no; agent snapshots hold skill ids only).
