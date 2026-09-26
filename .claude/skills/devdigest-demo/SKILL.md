---
name: devdigest-demo
description: DevDigest-specific conventions for recording demo videos of a lesson — where the scenario and cue files live, which URLs and ids to film, and which controls must never be clicked. Read this before using the screencast-demo-maker plugin's demo-scenario or demo-film skills in this repository.
---

# DevDigest demo videos

Project conventions only. The engine is the `screencast-demo-maker` Claude Code plugin
(https://github.com/artemmmon/screencast-demo-maker, ≥ 1.2.0): skills `demo-setup`,
`demo-scenario` (writes the shooting script) and `demo-film` (records it), subagent
`frame-checker`. `.claude/settings.json` enables it for everyone who trusts this repo.

## Prerequisite

If `/screencast-demo-maker:demo-film` is not an available skill, the plugin is not installed.
Stop and give the user the two commands from `docs/demo-video.md` → "Разове
налаштування"; do not improvise filming without it. Check the machine with the plugin's
`doctor.mjs hw/LNN/demo --fix` before anything else.

## Order

1. If `hw/LNN/demo/` already holds `scenario.md` and `cues.json`, read them. Otherwise
   copy the previous lesson's `config.json` (new `slug`, `output`, `order`, `surfaces`)
   and write them with `screencast-demo-maker:demo-scenario`. `demo-setup` is not
   needed here — this skill already answers its questions.
2. Ask the user to run `/screencast-demo-maker:demo-film` — it is user-invoked, an agent cannot start it.
   Follow it phase by phase and never record before the user says "go".
3. Hand contact sheets to the `screencast-demo-maker:frame-checker` subagent; never read them here.
4. Report what the frames and probes showed. The user judges the voice and the result.

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

- `surfaces`: `["browser"]` for a UI-only lesson (L02); add `editor`/`terminal` only when
  a scene opens a file or runs a command (L01), so VS Code and Terminal stay closed otherwise.
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
- Voice Eric (`cjVigY5qzO86Huf0OWal`) is an ElevenLabs default voice, so it works on anyone's
  account — but each person films with their **own** key; never use or ask for someone else's.
- Eric is the team default in the committed `config.json`. A person's own voice (cloned or
  from their Voice Library) goes in their personal file
  `~/.config/screencast-demo-maker/config.json` (`tts.elevenlabs.voiceId`), never in
  `hw/**/demo/config.json`; `doctor.mjs` shows which voice will narrate.

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
