# Skill samples

Skills that are **not** seeded, so you can try the import flow end to end.

## boundary-cases

A `SKILL.md` (frontmatter + markdown body) plus a `scripts/check.sh`. The script is
there on purpose: the import preview must list it as ignored (`executable`) and never run it.

```sh
cd docs/skill-samples
zip -r /tmp/boundary-cases.zip boundary-cases
```

Then in the app: **Skills → Add → Import from file**, pick `/tmp/boundary-cases.zip`,
read the preview, confirm. Bind the new skill to **Test Quality Reviewer** in the agent
editor's **Skills** tab. Importing `boundary-cases/SKILL.md` on its own works too.
