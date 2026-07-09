# API Contract Reviewer — skills experiment

Agent **API Contract Reviewer** (`openrouter / deepseek-v4-flash`, single-pass)
reviewing the same PR twice: skills OFF vs the 4 attached skills ON.

## The PR under test — `acme/payments-api` #900

One file, `src/api/orders.ts`. A deliberate pile of breaking contract changes,
all shipped under `/v1` with no version bump and no deprecation:

```diff
- app.get('/v1/orders/:orderId', getOrder)
+ app.get('/v1/orders/:id', getOrderV2)        // route param renamed
  ...
  return res.json({
    id: order.id,
-   order_total: order.total,                  // field renamed
-   created_at: order.createdAt,               // field renamed
-   status: order.status,                      // field removed
+   totalAmount: order.total,
+   createdAt: order.createdAt,
  })
```

## The 4 skills (Skills tab → linked to the agent)

| skill | type | created via | injected? |
|-------|------|-------------|-----------|
| `breaking-change`   | convention | UI · create from scratch | ✅ |
| `response-schema`   | convention | UI · create from scratch | ✅ |
| `semver-discipline` | security   | UI · create from scratch | ✅ |
| `deprecation-policy`| custom     | **import pipeline** (`.md`, `source=imported_url`) | ✅ |

Run trace for the with-skills run: `Injecting 4 enabled skill(s) into the prompt`
— all four bodies land in the `## Skills / rules` prompt block.

## Result

| | Run A — skills OFF | Run B — skills ON |
|---|---|---|
| findings | 4 | **6** |
| blockers (CRITICAL) | 3 | **5** |
| grounding | 4/4 | 6/6 |
| verdict | request_changes | request_changes |

### What the skills added (delta A → B)

1. **Caught a field rename A missed** — `created_at → createdAt`. The bare prompt
   flagged `order_total` and `status` but *skipped* `created_at`. The
   `response-schema` skill made the reviewer walk the response body field-by-field
   and catch it. (+1 CRITICAL)
2. **New semver finding** — "Breaking changes shipped under same `/v1` without
   version bump." `semver-discipline` maps the break to a required MAJOR bump / a
   new `/v2` route. Run A never raised versioning at all. (+1 CRITICAL)
3. **Deprecation framing in every rationale** — Run B rationales now read
   "No deprecation, no alias, no version bump," and the summary explicitly cites
   the deprecation policy and a major version bump. That language and the required
   fix (keep old field + `Deprecation`/`Sunset`) come straight from
   `deprecation-policy`.

Without skills the agent behaves like a generic reviewer: it spots the loud
renames but misses one field, ignores versioning, and offers no migration path.
With skills it produces a complete, directive, contract-grade review.

## Reproduce

```bash
A=d6374090-5a4b-485d-b882-68d5e6022a7f     # API Contract Reviewer
PR=7d031b29-ca8c-4a97-8d53-4d840c7baded    # payments-api #900

# OFF: clear links, run
curl -sX POST localhost:3001/agents/$A/skills -H 'content-type: application/json' -d '{"skill_ids":[]}'
curl -sX POST localhost:3001/pulls/$PR/review -H 'content-type: application/json' -d "{\"agentId\":\"$A\"}"

# ON: relink the 4, run
curl -sX POST localhost:3001/agents/$A/skills -H 'content-type: application/json' \
  -d '{"skill_ids":["9cb9d113-...","5414f07f-...","1db0ef78-...","9b835564-..."]}'
curl -sX POST localhost:3001/pulls/$PR/review -H 'content-type: application/json' -d "{\"agentId\":\"$A\"}"

curl -s localhost:3001/pulls/$PR/reviews   # compare findings
```
