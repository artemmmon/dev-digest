# Specs — reviewer-core

Feature specs for `reviewer-core`, one file per feature: `NN-short-name.md`.
Write the spec before the code and keep its `Status` current while implementing.
Features spanning several packages go to the root `specs/` instead.

New specs use the template in the root `specs/README.md` (`Spec ID: SPEC-NN`, written by the
`spec-creator` agent). The template below is the legacy one, kept for the specs already here.

## Template (legacy)
```md
# <Feature name>
Status: draft | in progress | done | dropped
Lesson: L0x (if it comes from the course)

## Goal
What problem it solves and for whom.
## Scope
In / out.
## Design
Contracts, endpoints, UI, data, affected files.
## Acceptance
Checkable criteria — what proves it works.
## Open questions
```

## Index
<!-- one line per spec: - [NN-name](NN-name.md) — status -->
- [01-usage-on-failed-runs](01-usage-on-failed-runs.md) — draft — partial usage when a run throws
