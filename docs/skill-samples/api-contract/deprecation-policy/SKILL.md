---
name: deprecation-policy
description: Apply when a diff removes, renames or replaces a public API field, route or parameter: check it is deprecated first and kept alongside its replacement. Do NOT apply to new APIs, additive changes, or removal of something no caller ever saw (internal or unreleased).
type: rubric
---

# Deprecation policy

A public field or route is not deleted in one step. It is marked deprecated, its
replacement is added next to it, and it stays for a grace period. Silent removal is what
breaks callers who never read your changelog.

## Check
- [ ] **Replace, do not swap**: when `items` becomes `data`, both are returned for a
  while. When `/v1/lineups/:id` becomes `/v1/lineup/:id`, both paths are served.
- [ ] **Marked**: OpenAPI `deprecated: true` on the operation, parameter or property, and a
  description saying what to use instead. In HTTP: a `Deprecation` header and, when a
  removal date is decided, a `Sunset` header (RFC 8594) plus a `Link: <...>; rel="successor-version"`.
- [ ] **Grace period stated**: a removal version or date (at least one minor release or
  90 days), not "soon".
- [ ] **Changelog entry**: names the deprecated item, the replacement and the removal target.
- [ ] **Removal only after the period**: a removal in the diff cites the earlier
  deprecation; if the field was never deprecated, the removal is a silent break.

## How to report
Name the removed or replaced item and say whether it was ever deprecated. Severity:
**CRITICAL** when a public field or route is removed or renamed with no deprecation and no
replacement alongside it; WARNING when it is deprecated in code but not in the spec, has
no `Sunset` or removal target, or has no changelog line; SUGGESTION for a missing
`Link` to the successor. Do not flag an addition.

## Good and bad examples

**Bad** - the old field is deleted in the same change that adds the new one.

```http
-  200 {"items": [{"id": "l1"}], "total": 1}
+  200 {"data":  [{"id": "l1"}], "count": 1}
```
CRITICAL: `items` and `total` removed with no deprecation window.

**Good** - both shapes, old one marked, dates announced.

```http
GET /v1/lineups

200 OK
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT
Link: </v2/lineups>; rel="successor-version"

{"items": [{"id": "l1"}], "total": 1, "data": [{"id": "l1"}], "count": 1}
```

```yaml
# docs/openapi.yaml
/v1/lineups:
  get:
    deprecated: true
    description: Deprecated, use /v2/lineups. Removed in 3.0.0 (after 2026-12-31).
```

**Good** - Dart handler keeps the old route and announces its end.

```dart
router.get('/v1/lineups/<id>', (Request req, String id) async {
  final res = await _getLineup(req, id);
  return res.change(headers: {
    'Deprecation': 'true',
    'Sunset': 'Thu, 31 Dec 2026 23:59:59 GMT',
    'Link': '</v1/lineup/$id>; rel="successor-version"',
  });
});
router.get('/v1/lineup/<id>', _getLineup);
```

**Bad** - the route is simply renamed.

```dart
-  router.get('/v1/lineups/<id>', _getLineup);
+  router.get('/v1/lineup/<id>', _getLineup);
```
CRITICAL: `/v1/lineups/:id` now returns 404, no deprecation, no alias.
