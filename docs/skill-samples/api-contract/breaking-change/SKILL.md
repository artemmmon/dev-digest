---
name: breaking-change
description: Apply when a diff changes an HTTP route, a request or a response of an existing API: compare old and new and flag every change an existing caller would notice. Do NOT apply to internal refactors, new routes, new optional fields, or code that only consumes an API.
type: rubric
---

# Breaking change

A change is **breaking** when a client written against the old contract now fails or reads
wrong data. Compare the contract before and after; the reference is the OpenAPI file, the
old handler in the diff, or the removed lines. If there is no old contract in the diff,
there is nothing to compare: do not invent a finding.

## Check
- [ ] **Removed or renamed response field** (`total` -> `count`, `items` -> `data`).
- [ ] **Type change**: `string` -> `number`, scalar -> object, a field that becomes nullable.
- [ ] **Envelope change**: a bare array becomes an object, or the wrapper key changes.
- [ ] **Route change**: path, prefix, HTTP method or path-parameter name changed, or the route removed.
- [ ] **Status code change**: `200` -> `201`, `404` -> `422`, or a new error shape.
- [ ] **New required input**: a query param, body field or header that old callers do not send.
- [ ] **Pagination semantics**: page size default, page base (0 vs 1), cursor vs offset, sort order.
- [ ] **Narrowed input**: stricter validation, shorter max length, an enum value removed.

## Not breaking
- A new route, a new optional request field or query param, a new response field.
- A new enum value only when clients are documented to ignore unknown values.

## How to report
Name the route and the field, the old and the new shape, and what an old caller now sees
(`json['items']` is `null`, 404 on the old URL, 400 without `map`). Say whether any caller
or the OpenAPI file in the diff was updated; if not, the severity goes up.

| Change | Severity |
|---|---|
| Remove, rename or retype a public field or route, with no migration in the diff | **CRITICAL** (breaking) |
| New required param or header, envelope change, status code change | **CRITICAL** |
| Same change, but the old form is kept next to the new one | WARNING at most |
| Additive: new optional field, new route | no finding |

## Good and bad examples

**Bad** - the list envelope is renamed in place. Old clients read `items` and `total`.

```http
GET /v1/lineups?map=mirage

-  200 {"items": [{"id": "l1"}], "total": 1}
+  200 {"data":  [{"id": "l1"}], "count": 1, "page": 1}
```

Finding: CRITICAL, `items` and `total` are gone from `GET /v1/lineups`; every caller that
reads them gets `null`. Fix: keep `items` and `total`, add `page` next to them.

**Good** - additive only.

```http
GET /v1/lineups?map=mirage&page=2

200 {"items": [{"id": "l1"}], "total": 41, "page": 2}
```

**Bad** - Dart handler, route renamed and a required parameter added.

```dart
-  router.get('/v1/lineups/<id>', _getLineup);
+  router.get('/v1/lineup/<id>', _getLineup);          // path changed: old URL now 404s

   Response _listLineups(Request req) {
+    final map = req.url.queryParameters['map'];
+    if (map == null) return Response(400);            // newly required param
     return Response.ok(jsonEncode({'items': items, 'total': items.length}));
   }
```

Two CRITICAL findings: `/v1/lineups/:id` no longer exists, and `map` is now mandatory.

**Good** - the old route stays, the new one is added, `map` stays optional.

```dart
router.get('/v1/lineups/<id>', _getLineup);
router.get('/v1/lineup/<id>', _getLineup); // new alias, old path still served
final map = req.url.queryParameters['map']; // null = all maps, as before
```
