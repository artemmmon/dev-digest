---
name: boundary-cases
description: Use when reviewing tests for code that takes input: flag every boundary value the changed code handles but no test feeds it — empty, null, zero, max, off-by-one, unicode.
type: rubric
---

# Boundary cases

For each function, handler or schema the diff changes, list the inputs at the edge of
what it accepts, then check that a test in the diff feeds each one. Report the ones
that are missing, naming the input and the branch it would reach.

## Check these edges
- **Empty**: `''`, `[]`, `{}`, a missing optional field.
- **Null and undefined**, where the type allows them.
- **Zero and negative** numbers; the first and last valid value of a range.
- **Off-by-one**: the value exactly at a limit, one below and one above.
- **Maximum size**: the longest string, the largest page, the limit itself.
- **Text**: unicode, emoji, very long words, leading and trailing whitespace.
- **Duplicates and ordering**: repeated ids, unsorted input.

## How to report
- One finding per missing edge that reaches a real branch. Do not list an edge the
  code cannot reach.
- A test that only feeds a typical value ("happy path") does not cover any edge.
- Severity: CRITICAL only when the edge is the main failure path of new behaviour;
  otherwise WARNING.
