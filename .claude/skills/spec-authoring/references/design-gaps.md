# Finding what the design leaves out

Work through these lists for every screen, component and flow in the sources before writing a
requirement. Each gap becomes a **question** (when the user must decide) or a **proposal** (when
you would improve something), never a silent requirement. Mark what you report as a **fact** (seen
in a source: `path:line`, a Figma node, "user brief") or an **inference**.

## Design gaps

For each screen and component in the design sources:

- **States:** empty, loading, partial, success, error, disabled, stale.
- **Data extremes:** zero, one, many; very long names and text; missing or null fields; mock data
  in the design that the real contracts do not provide.
- **Entry and exit:** how the user gets here, back navigation, deep links, refresh in the middle
  of an action.
- **Feedback:** what the user sees while a job runs, when it fails, when it is retried or
  cancelled.
- **Consistency** with the screens the app already has.
- **Accessibility and i18n:** keyboard path, focus, labels, text that grows in translation, both
  themes.

## Edge cases

- **Concurrency:** two runs at once, a second click, two tabs.
- **Events:** repeated, late and out-of-order events.
- **Upstreams** that fail or are slow: GitHub, the model provider, git, the database.
- **Limits:** large inputs, many items, long-running jobs.
- **Existing data** created before the feature.
- **Configuration:** the feature switched off or not configured.

## Module interactions

- Which packages and modules take part.
- Who owns each piece of data.
- What crosses each boundary: REST, SSE, a queued job, a shared contract.
- In which order, and what each side does when the other fails.

## UX

Where the flow can be shorter, clearer or safer: fewer steps, better defaults, clearer empty and
error states, undo instead of confirm, progress instead of a spinner. Each improvement is a
proposal with its reason and its cost.

## Inputs

Every piece of data the feature consumes and where it would come from: already produced and
stored, computed by code, or a new model call. Look for an existing result before you accept a
new call — the preliminary provenance table goes into the discovery report with its evidence.

## From gap to spec

| The gap is… | It becomes… | After the user answers |
|---|---|---|
| a decision only the user can make | a question with numbered options, the recommended one first | a criterion, or an open question with a default |
| something you would do better | a proposal with reason and cost | accepted → a requirement · declined → a Non-goal with the reason |
| a fact the sources settle | nothing to ask | a criterion, with the source in `Sources:` |
| a source you could not read | a line in the report asking for an export or a screenshot | — |

Ask only what changes the spec. A question whose every answer leads to the same criteria is noise.
