# Recording a demo video

How to get a narrated screencast of a lesson. Claude does the work; you approve and
listen. Plan for 30–40 minutes for a fresh 5-minute video, most of it waiting.

## One-time setup

1. An ElevenLabs account (free tier is enough — 10k characters/month, a 5-minute video
   costs ~3.5k). Copy an API key from https://elevenlabs.io/app/settings/api-keys, then
   run this once — the key is not shown and is not stored in any file:

   ```sh
   security add-generic-password -s elevenlabs-api -a "$USER" -U -w "$(pbpaste)"
   ```

2. Grant Terminal **Screen Recording** and **Automation** in System Settings → Privacy
   & Security. Claude will tell you if either is missing.

3. A second display. Filming happens there, so you keep working on the built-in one.

## Making a video

**Step 1 — the script.** In a normal Claude session:

> напиши сценарій демо для L02 за критеріями в hw/L02

It reads the criteria, writes `hw/L02/demo/scenario.md` and `cues.json`, and checks every
number it wants to say against the running app. Read the script. It will also tell you
where the product and the criteria disagree — decide those before filming.

**Step 2 — filming.** Start the stack (`./scripts/dev.sh`), then type:

```
/demo-film
```

This one cannot start on its own — it drives your screen, so it only runs when you ask.
It will:

1. check permissions and displays, and stop if something is missing;
2. play you 3 voice samples — **you pick one**, Claude cannot hear them;
3. open its own VS Code, Terminal and Chrome on the second display;
4. ask you to move the mouse off that display and say **go**.

While it films: don't type, don't touch the second display. Turn on Do Not Disturb.
Roughly 10 minutes.

**Step 3 — checking.** Claude checks every frame against what is being said at that
moment and fixes what is wrong, usually over two or three rounds. Then it reports what it
verified. Two things only you can judge: the voice, and whether the wording is right.

The video lands at `hw/LNN/demo-LNN.mp4`. It is not committed — videos are in
`.gitignore`; the inputs in `hw/LNN/demo/` are what gets committed.

## Changing something later

Just say what is wrong. Useful things to ask for:

| You want | Say |
|---|---|
| one scene re-shot | "перезніми сцену 6" |
| a line re-worded | "переозвуч репліку s7-03: <new text>" |
| a different voice | "зміни голос, дай послухати варіанти" |
| the whole thing again | "перезніми все" |

Re-shooting one scene takes about a minute because the other scenes are cached in
`~/.cache/demo-video/`. Don't delete that folder unless you are short on disk.

## If it goes wrong

- **"pointer is ON the filmed display"** — move the mouse to the other screen.
- **Nothing gets recorded after re-plugging a monitor** — say "перевір дисплеї заново";
  capture indexes change.
- **The voice mangles a word** — give Claude the replacement spelling for that one line.
- Anything else: Claude has a file of known traps (`reference/gotchas.md` in the
  `demo-film` skill). Ask it to check there first.

## What is where

| Piece | Location | Role |
|---|---|---|
| `demo-scenario` skill | `~/.claude/skills/` | writes the script |
| `demo-film` skill | `~/.claude/skills/` | films it — you invoke it |
| `frame-checker` agent | `~/.claude/agents/` | checks frames against the narration |
| `devdigest-demo` skill | `.claude/skills/` | this repo's rules (never click Run Review, etc.) |
| Worked example | `hw/L01/demo/` | a finished 9-scene video's inputs |

The two skills are personal, so they work in any project on this machine — only the
`devdigest-demo` skill is specific to DevDigest.
