---
name: response-schema
description: Apply when a diff changes what a handler returns or edits the API schema (OpenAPI, zod, JSON schema): check the actual output matches the declared schema. Do NOT apply to request-only changes, tests, or code that consumes an API rather than serves one.
type: rubric
---

# Response schema conformance

The schema (OpenAPI file, zod contract, typed DTO) is what clients trust. Check that the
handler's real output matches it, and that a schema edit and a handler edit move together.

## Check
- [ ] **Handler vs schema**: every field the handler emits is declared, and every declared
  required field is always emitted. A field renamed in the handler but not in the schema
  (or the reverse) is a mismatch.
- [ ] **Nullability and required-ness**: a value that can be `null` or absent in code is
  marked nullable or optional in the schema. Making a required field optional, or an
  existing one nullable, changes what clients must handle.
- [ ] **Types**: `int` vs `string` ids, number vs numeric string, date format (ISO 8601).
- [ ] **Envelope**: list endpoints return the same wrapper everywhere
  (`{"items": [...], "total": n}`), never a bare array on one route and an object on another.
- [ ] **`total` matches `items`**: `total` is the count of ALL matches; if the endpoint is
  paginated, `items.length <= total`. `total` computed from the returned page is a bug.
- [ ] **Error shape**: every error path returns the same envelope
  (`{"error": {"code": "...", "message": "..."}}`) and the status codes the schema declares.
- [ ] **Undeclared responses**: a new status code (409, 422) that the schema does not list.

## How to report
Quote the field and both sides: what the code returns, what the schema says. Say which
client reading breaks. Severity: **CRITICAL** when the handler removes, renames or retypes
a field the schema (or a caller in the diff) still relies on; WARNING for an undeclared
new status, a loosened nullability or an inconsistent error shape; SUGGESTION for a
missing description or example. An additive, declared field is fine.

## Good and bad examples

**Bad** - the schema still promises `total`, the handler no longer sends it.

```yaml
# docs/openapi.yaml (unchanged, version 1.0.0)
LineupList:
  required: [items, total]
```
```http
200 {"items": [{"id": "l1"}], "count": 1}
```
CRITICAL: `total` is required by the schema and missing from the response.

**Bad** - `total` counts the page, not the matches.

```http
GET /v1/lineups?limit=2      (41 lineups exist)
200 {"items": [{"id": "l1"}, {"id": "l2"}], "total": 2}
```
WARNING: clients cannot render "page 1 of 21"; `total` must be 41.

**Bad** - error shape differs between paths.

```http
404 {"error": {"code": "not_found", "message": "Lineup not found"}}
400 {"message": "map is required"}
```

**Good** - Dart handler, output equals the declared `LineupList`.

```dart
Response _listLineups(Request req) {
  final all = repo.find(map: req.url.queryParameters['map']);
  final page = all.skip(offset).take(limit).toList();
  return Response.ok(
    jsonEncode({'items': page.map((l) => l.toJson()).toList(), 'total': all.length}),
    headers: {'content-type': 'application/json'},
  );
}
// GET /v1/lineups/<id> for a missing id:
//   404 {"error": {"code": "not_found", "message": "Lineup not found"}}
```
