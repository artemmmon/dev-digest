---
name: devdigest-demo
description: DevDigest-specific conventions for recording demo videos of a lesson — where the scenario and cue files live, which URLs and ids to film, and which controls must never be clicked. Read this before using the demo-scenario or demo-film skills in this repository.
---

# DevDigest demo videos

Project conventions only. The engine is in the personal skills `demo-scenario`
(writes the shooting script) and `demo-film` (records it).

## Layout

| What | Where |
|---|---|
| Shooting script + cues + scenes | `hw/LNN/demo/{scenario.md,cues.json,scenes.mjs,config.json}` |
| Grading criteria the video must cover | `hw/LNN/*criteria*.md` |
| Finished video | `hw/LNN/demo-LNN.mp4` |
| Worked example | `hw/L01/demo/` — read `scenes.mjs` there first |

Working files (clips, narration, frames, staged app profiles) never enter the repo;
they live in `~/.cache/demo-video/<slug>/`.

## Filming this app

- Stack must be up: `./scripts/dev.sh` — web `:3000`, api `:3001`.
  `config.healthUrls` checks both during preflight.
- Film one repository only. The seeded `acme/payments-api` must stay off camera:
  navigate straight to `/repos/<repoId>/pulls`, never through the repo switcher.
- `config.web.repoId` is per machine. Confirm it before filming:
  ```sh
  curl -s localhost:3001/repos |
    python3 -c "import json,sys; [print(r['full_name'], r['id']) for r in json.load(sys.stdin)]"
  ```
- Narration is in Ukrainian; filenames, code and this skill stay English.

## Never click

`Run Review` · `Accept` · `Reject` · `Delete run` · `Delete this review run`.

They cost money (an LLM round) or destroy data, and a demo must be reproducible.
Hover to show that a control exists — that is enough to satisfy a criterion about it.

## Numbers that have bitten us

Verify these against the running UI every time; the reality-check step of
`demo-scenario` exists because of them:

- PR-list `COST` is **rounded** for display (`0.01259` renders `$0.013`).
- `COST`, `SCORE` and `FINDINGS` in the list summarise the **latest review round**,
  not the whole PR history — see `server/docs/0001-latest-review-is-a-batch.md`.
- The severity counts on one run card are that **agent's** findings, not the round's.
