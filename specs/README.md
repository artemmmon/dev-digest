# Specs — cross-package

Feature specs that touch more than one package (e.g. a new contract + endpoint +
UI). Single-package specs go to `<package>/specs/`. One file per feature:
`NN-short-name.md`; use the template from `server/specs/README.md` and list the
affected packages under **Design**.

## Index
<!-- one line per spec: - [NN-name](NN-name.md) — status — packages -->
- [01-run-cost-badge](01-run-cost-badge.md) — done — server, client
- [02-findings-severity](02-findings-severity.md) — done — server, client
- [03-skills](03-skills.md) — done — server, client
- [04-conventions-extractor](04-conventions-extractor.md) — done — server, client
- [05-file-language-and-dart-codegen](05-file-language-and-dart-codegen.md) — done — server, client
- [06-repo-stack](06-repo-stack.md) — done — server, client
- [07-flutter-first-review](07-flutter-first-review.md) — done — server, client

Per-package slices of these two live in `server/specs/`, `client/specs/`,
`reviewer-core/specs/` and `e2e/specs/`.
