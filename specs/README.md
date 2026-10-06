# Specs — cross-package

Feature specs that touch more than one package (e.g. a new contract + endpoint +
UI). Single-package specs go to `<package>/specs/`. One file per feature, named after
the feature: `NN-<feature-name>.md` (kebab-case), with the title `# Spec: <feature name>`.

Specs are written by the `spec-creator` agent (`.claude/agents/spec-creator.md`) from
the sources you give it; it asks before it writes and always leaves `Status: draft`.
The rules — template, EARS patterns, ids, provenance tags — are the `spec-authoring` skill
(`.claude/skills/spec-authoring/SKILL.md`).

## Template (SPEC-10 onward, every spec folder)
The one copy of the template is
[`.claude/skills/spec-authoring/assets/spec-template.md`](../.claude/skills/spec-authoring/assets/spec-template.md);
a finished example is `references/example-spec.md` beside it. `NN` is one sequence across the
root and all package spec folders.

Check a spec's form (header, sections, ids, EARS shape, provenance tags):

```sh
node .claude/skills/spec-authoring/assets/check-spec.mjs            # every SPEC-NN spec
node .claude/skills/spec-authoring/assets/check-spec.mjs specs/10-x.md
```

## Status
| Specs | Values | Who sets them |
|---|---|---|
| With a `Spec ID:` line (SPEC-10 onward) | `draft` → `approved` → `implemented` | `spec-creator` writes `draft`; only you set `approved`; `implementer` sets `implemented` when the plan's last group is done. There is no `in progress`. Nothing is planned from a `draft`. A gap found in an `approved` spec is an amendment: `spec-creator` sets it back to `draft`, adds an `Amended:` line and new ids, and you approve it again |
| Legacy: 01–09 here and the older package specs (Goal / Scope / Design / Acceptance, see `server/specs/README.md`) | `draft` · `in progress` · `done` · `dropped` | Whoever implements it, at the start and at the end |

The index below shows each spec's status in its own vocabulary.

## Index
<!-- one line per spec: - [NN-name](NN-name.md) — status — packages -->
- [01-run-cost-badge](01-run-cost-badge.md) — done — server, client
- [02-findings-severity](02-findings-severity.md) — done — server, client
- [03-skills](03-skills.md) — done — server, client
- [04-conventions-extractor](04-conventions-extractor.md) — done — server, client
- [05-file-language-and-dart-codegen](05-file-language-and-dart-codegen.md) — done — server, client
- [06-repo-stack](06-repo-stack.md) — done — server, client
- [07-flutter-first-review](07-flutter-first-review.md) — done — server, client
- [08-intent-layer](08-intent-layer.md) — done — server, reviewer-core, client, e2e
- [09-smart-diff](09-smart-diff.md) — done — server, client
- [10-project-context](10-project-context.md) — approved — server, client, reviewer-core, e2e
- [11-onboarding-tour](11-onboarding-tour.md) — implemented — server, client, e2e
- [12-pr-brief](12-pr-brief.md) — implemented — server, client

Per-package slices of these two live in `server/specs/`, `client/specs/`,
`reviewer-core/specs/` and `e2e/specs/`.
