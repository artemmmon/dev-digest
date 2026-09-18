# Specs — e2e

Feature specs for `e2e`, one file per feature: `NN-short-name.md`.
Write the spec before the code and keep its `Status` current while implementing.
Features spanning several packages go to the root `specs/` instead.

## Template
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
- [01-l01-coverage](01-l01-coverage.md) — done — what the flows prove about cost and severity

> This folder also holds the executable flows (`NN-name.flow.json`). The runner
> only picks up `*.flow.json`, so spec docs (`*.md`) live here safely.
