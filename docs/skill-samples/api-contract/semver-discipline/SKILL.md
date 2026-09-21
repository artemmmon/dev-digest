---
name: semver-discipline
description: Apply when a diff changes the public API of a versioned service (routes, request or response shape): check the version signal moves with the change. Do NOT apply to internal-only changes, docs, tests, or services that publish no version or changelog.
type: rubric
---

# Semver discipline

Callers use the version to decide whether upgrading is safe. Given the change in the diff,
check that the version signal says the same thing.

| Change | Required bump |
|---|---|
| Breaking (remove, rename, retype a field or route, new required input) | **major**: `2.0.0`, or a new path prefix `/v2` with `/v1` left in place |
| Additive and backward compatible (new optional field, new route) | **minor**: `1.1.0` |
| Bug fix, no contract change | **patch**: `1.0.1` |

## Check
- [ ] Find the version signal: `info.version` in `docs/openapi.yaml`, `pubspec.yaml`
  `version:`, `package.json` `version`, a `/v1` path prefix, an `API-Version` header.
- [ ] Classify the change with the table above (use the breaking-change rules).
- [ ] Compare: was the signal bumped, and by enough? A breaking change under an
  unchanged `1.0.0`, or a `1.0.1` patch, is a mismatch.
- [ ] A breaking change published under the same `/v1` prefix, with no `/v2` route, is a mismatch.
- [ ] Is there a changelog or release-notes entry (`CHANGELOG.md`) that names the change?
- [ ] Are the OpenAPI file and the code bumped together? Code changed and the spec left at
  the old version means the published contract is now wrong.

## How to report
Say what the change is (breaking / additive / fix), the version signal you found and what
it should be. Severity: **CRITICAL** when a breaking change ships with no major bump and no
new path version; WARNING when an additive change has no minor bump or a bump has no
changelog line; SUGGESTION for a missing changelog on a patch. If the service publishes no
version at all, report nothing.

## Good and bad examples

**Bad** - a breaking response change, the contract version untouched.

```yaml
# docs/openapi.yaml - not in the diff
info:
  title: CS2 Lineups API
  version: 1.0.0
```
```http
-  200 {"items": [...], "total": 3}
+  200 {"data":  [...], "count": 3}
```
CRITICAL: breaking change, `info.version` still `1.0.0`, no `/v2`, no changelog entry.

**Good** - the same change, done compatibly and versioned.

```yaml
info:
  version: 2.0.0
paths:
  /v2/lineups:      # new shape lives here
  /v1/lineups:      # old shape unchanged, deprecated: true
```
```markdown
## 2.0.0
- Added `/v2/lineups` returning `{"data": [...], "count": n}`.
- `/v1/lineups` is deprecated and will be removed in 3.0.0.
```

**Good** - additive change, minor bump.

```yaml
# 1.0.0 -> 1.1.0
info:
  version: 1.1.0
# new optional response field `page` on GET /v1/lineups
```

**Bad** - Dart service, new required parameter with only a patch bump.

```yaml
# pubspec.yaml
-version: 1.0.0
+version: 1.0.1
```
```dart
if (map == null) return Response(400); // new required param = breaking, needs 2.0.0
```
