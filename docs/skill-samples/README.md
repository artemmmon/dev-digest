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

## API Contract Reviewer skills

Four rubric skills for the **API Contract Reviewer** agent, in `api-contract/`. They are
not seeded: you bring them in through the three ways the Skills page offers, so each
flow gets exercised once.

| Skill | What it checks | How to add it |
|---|---|---|
| `breaking-change` | removed / renamed / retyped fields, route and status changes, new required input | Skills -> Add -> **Create** |
| `response-schema` | handler output vs the declared schema, nullability, error shape, `total` vs `items` | Skills -> Add -> **Create** |
| `semver-discipline` | breaking -> major, additive -> minor, fix -> patch; spec version and changelog | Skills -> Add -> **Create** |
| `deprecation-policy` | deprecate and keep the old form for a grace period instead of silent removal | Skills -> Add -> **Import** (`.zip` or `.md`) |

Each `description` is a directive that also says when the skill does **not** apply
(the import preview cuts a description at 300 characters, so they are kept short).

### Create three through the modal

For `breaking-change`, `response-schema` and `semver-discipline`: **Skills -> Add -> Create**,
type `rubric`, then paste from `SKILL.md`:

- **Name**: the `name` line of the frontmatter.
- **Description**: the `description` line.
- **Body**: everything after the closing `---` of the frontmatter.

### Import `deprecation-policy`

As a `.zip`:

```sh
cd docs/skill-samples/api-contract && zip -r /tmp/deprecation-policy.zip deprecation-policy
```

Then **Skills -> Add -> Import -> From file**, pick `/tmp/deprecation-policy.zip`, read the
preview, confirm. Importing `deprecation-policy/SKILL.md` on its own works too. Do not commit
the zip.

Optional variant, **From URL**: paste the raw or `blob` link of a `SKILL.md` on GitHub, e.g.
`https://github.com/<owner>/<repo>/blob/<branch>/docs/skill-samples/api-contract/semver-discipline/SKILL.md`
(the repo must be public and the file pushed). **Fetch**, read the preview, confirm; the
skill is saved with source `imported_url`.

### Bind them to the agent

**Agents -> API Contract Reviewer -> Skills** tab: switch on all four and save. The agent
version bumps when the enabled set changes.

For the **no-skills baseline** experiment, switch off the seeded `route-breaking-change-rubric`
and `zod-contract-conventions` on the same tab first, run the reviewer on the PR, then
enable the four new skills and run it again. Compare findings and the skill blocks in the
run trace.
