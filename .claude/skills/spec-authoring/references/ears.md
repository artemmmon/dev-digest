# EARS acceptance criteria

EARS (Easy Approach to Requirements Syntax) gives every requirement one fixed shape [S1]:

```
[WHERE <feature>,] [WHILE <state>,] [WHEN <trigger>, | IF <condition>, THEN] the <system> shall <response>.
```

A requirement has zero or many preconditions, zero or one trigger, one system name and one or
many responses [S1]. This repo is stricter on the last point: **one response per criterion**, so
that one criterion is one test case and one row of the verification matrix.

## Picking the pattern

| The behaviour… | Pattern | Keyword |
|---|---|---|
| always holds, with no condition | Ubiquitous | none |
| starts because something happened | Event-driven | `WHEN` |
| holds for as long as something is true | State-driven | `WHILE` |
| is the answer to a failure, an error or bad input | Unwanted behaviour | `IF … THEN` |
| exists only when a setting or a configuration is on | Optional feature | `WHERE` |
| needs both a state and an event | Complex | `WHILE …, WHEN …` |

`WHEN` or `IF`? `WHEN` is for what the user or the system is meant to do; `IF … THEN` is for what
should not happen but will. "WHEN the user opens the page" — "IF the provider returns an error".

## Bad → good

| Bad | What is wrong | Good |
|---|---|---|
| The page should load fast. | No `shall`, no trigger, "fast" cannot fail | WHEN the user opens the pull-request list, the client shall show the first 50 rows within 2 s. |
| WHEN the review finishes, the server shall store the findings and notify the client. | Two responses | AC-1: WHEN a review run finishes, the server shall store its findings. · AC-2: WHEN a review run finishes, the server shall send a run-finished event to the client. |
| The system shall handle errors gracefully. | Nothing observable | IF the model provider returns an error, THEN the run card shall show the state failed with the provider's error message. |
| WHEN the user clicks Run, `ReviewService.runReview` shall enqueue a job in p-queue. | Names code and a library: this is the plan | WHEN the user starts a review, the server shall accept the request before the review itself completes. |
| The cost is shown when available. | Passive, no subject, the other branch is missing | AC-1: WHILE a run has a stored cost, the run card shall show the cost. · AC-2: IF a run has no stored cost, THEN the run card shall show `—`. |
| When a run completes the server shall save cost. | Keyword not in capitals, no comma: the clauses blur | WHEN an agent run completes, the server shall store the run's cost in US dollars. |
| The server shall, WHEN a run fails, keep the findings found so far. | Clause order broken | IF a run fails, THEN the server shall keep the findings stored before the failure. |
| WHEN the diff is large, the client shall paginate it appropriately. | "large" and "appropriately" have no value | WHEN a diff has more than 400 changed lines in one file, the client shall show the first 400 with a control that loads the rest. |

## Rules of wording

- **Subject.** `the system`, or the module or package that owns the behaviour (`the server`, `the
  client`, `the pull-request list`). A named subject says who is responsible when two packages
  take part. Never a function, a class or a component.
- **Response.** Something a person or a test can see from outside: a value shown, a record stored,
  an event sent, a request rejected with a named reason. "Shall validate", "shall process",
  "shall handle" are not responses until they say what comes out.
- **Values.** Numbers with units, exact texts, named states. When the user gave no number, do not
  invent one: write the criterion with the value in an open question (`OQ-n`) and its default.
- **Negatives.** "shall not" is fine when the absence is observable ("shall not send the
  pull-request body to the model"). "Never" in an edge case means a criterion says so.
- **One criterion, one line of thought.** If it needs "and", "or", "also", "as well as" after
  `shall`, split it. An "and" inside a condition (`WHILE a run is done and has a cost`) is fine.
- **Stories served.** `AC-3 (US-1, US-2)`. A criterion that serves no story is either a missing
  story or a non-functional requirement (`NFR-n`).

## From edge case to criterion

Each edge case is a situation plus the behaviour expected, and it points to the criterion that
makes the behaviour a requirement:

```
EC-2: the provider times out in the middle of a run → the run ends as failed, earlier findings stay (AC-7)
AC-7 (US-1): IF the model provider does not answer within the run's time limit, THEN the server shall end the run in the state failed.
```

Most edge cases turn into `IF … THEN` criteria. If you cannot write the criterion because nobody
decided the behaviour, do not write an `EC` line that says "not decided": the situation goes
under Open questions (`OQ-n: what happens when …? — default if unanswered: …`) and becomes an
`EC` with its criterion once the user answers. An `EC` line always ends with an `AC` id.

## User stories

`US-n: As a <role>, I want <capability>, so that <benefit>.` A story is worth keeping when it is
valuable to its role and testable — "I understand what I want well enough that I could write a
test for it" [S4]. The role is a real user of the product ("a developer reviewing a pull
request"), not "the system" and not "a user". One capability per story; the benefit says why, and
is what lets `brainstorm` weigh options later.
