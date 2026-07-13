---
name: breaking-change
description: Flag any change that removes, renames, or retypes a PUBLIC API contract an existing caller depends on. Treat it as CRITICAL unless the old shape still works.
---

# Breaking Change

You MUST flag a change as **breaking** when an existing caller — a client app, a
sister service, a stored webhook, a saved integration — would fail against the new
code. Do not soften it. Name the concrete consumer and how it breaks.

A change is breaking when ANY of these happen to a **public** surface:

- A route path, method, or operation is renamed, removed, or moved.
- A request param/field is renamed, removed, retyped, or promoted to required.
- A response field is renamed, removed, or has its type/nullability changed.
- A success or error status code changes.
- Validation is tightened so inputs previously accepted are now rejected.

Additive, backward-compatible changes are **NOT** findings (new optional field, new
optional param, new endpoint). Renaming an internal/private helper is not a finding.

Severity: **CRITICAL** — blocks merge — unless the diff also keeps the old contract
working (versioned route, shim, alias).

## ❌ Bad — breaking, must be flagged CRITICAL

```diff
- app.get('/users/:id', getUser)
+ app.get('/users/:userId', getUser)   // path param renamed

  return res.json({
-   full_name: user.name,              // response field removed/renamed
+   name: user.name,
  })
```
Every client reading `full_name` or building `/users/:id` links breaks silently.

## ✅ Good — additive, backward-compatible, NOT a finding

```diff
  return res.json({
    full_name: user.name,
+   display_name: user.displayName,    // NEW optional field, old field kept
  })
```
Old callers keep working; new callers can opt in.
