---
name: deprecation-policy
description: Require the deprecate-then-remove path for anything public. Silent deletion or rename of a live contract is a finding; the fix is to keep the old shape working while it is marked deprecated.
---

# Deprecation Policy

You MUST require that a public contract be **deprecated before it is removed**, not
deleted silently. When a diff removes or renames a live route/field with no
migration path, that IS the finding — even if the replacement is correct.

A compliant deprecation:

- Keeps the old route/field working (alias, shim, or dual-write) during a window.
- Marks it deprecated where callers see it — `Deprecation`/`Sunset` header, an
  OpenAPI `deprecated: true`, a `@deprecated` doc tag, or a documented sunset date.
- Adds the replacement alongside the old one, not in place of it.

Flag as a finding:

- A public field/route **deleted or renamed in the same diff** with no old-shape
  fallback and no deprecation marker.
- A removal whose only signal is the code change itself (no header, no doc, no
  changelog, no sunset date).

Prefer the fix: "keep `X` returning its old value and mark it `@deprecated` with a
sunset date; add `Y` as the replacement."

## ❌ Bad — silent removal, no deprecation path

```diff
  res.json({
-   avatar_url: user.avatarUrl,   // deleted outright, clients still read it
+   avatarUrl: user.avatarUrl,
  })
```
No alias, no header, no sunset note → breaks every current consumer with no warning.

## ✅ Good — deprecate, keep both, announce sunset

```diff
  res.setHeader('Deprecation', 'true')
  res.setHeader('Sunset', 'Wed, 01 Oct 2026 00:00:00 GMT')
  res.json({
    avatar_url: user.avatarUrl,    // OLD field kept, marked @deprecated
+   avatarUrl: user.avatarUrl,     // NEW field added alongside
  })
```
