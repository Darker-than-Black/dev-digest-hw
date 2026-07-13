---
name: semver-discipline
description: Map each API change to the semver bump it demands. A breaking contract change without a MAJOR bump / new version route is a CRITICAL release-discipline finding.
---

# Semver Discipline

You MUST map every contract change to the version bump it requires, and flag a
mismatch between the change and the version it ships under.

- **MAJOR** — any breaking change: removed/renamed route or field, retyped or
  now-required param, changed status code, tightened validation. Requires a major
  version bump OR a new versioned route (`/v2/...`) that leaves the old one intact.
- **MINOR** — backward-compatible additions: new endpoint, new optional field or
  param, new enum value the server tolerates.
- **PATCH** — no contract change: bug fix, perf, docs, internal refactor.

Report as **CRITICAL** when a breaking change ships without a major bump or a new
version route. Report as **WARNING** when an additive change is labeled a patch, or
a version file / OpenAPI `version` was not bumped to match the change.

Look for the signal: `package.json` version, an OpenAPI/`info.version`, a
`/v1|/v2` path segment, an `Accept-Version` header. Absence of a bump next to a
breaking diff IS the finding.

## ❌ Bad — breaking change, version untouched

```diff
  // package.json stays "2.4.1"
- app.get('/v1/reports/:id', getReport)
+ app.get('/v1/reports/:slug', getReport)   // breaking, still under v1, no bump
```
Breaking edit under the same `/v1` and same package version → CRITICAL.

## ✅ Good — breaking change isolated behind a new major route

```diff
  app.get('/v1/reports/:id', getReport)      // old contract preserved
+ app.get('/v2/reports/:slug', getReportV2)  // breaking shape lives in v2
  // package.json bumped 2.4.1 → 3.0.0
```
