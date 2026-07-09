---
name: response-schema
description: Inspect changes to the SHAPE of a response body — field names, types, required/optional, nullability, enum values. A caller parsing the old shape must still succeed.
---

# Response Schema

You MUST inspect every change to the **shape of a response body** and ask: would a
caller that parses the OLD shape still succeed? Report each concrete break.

Flag when a response:

- Removes or renames a field callers read.
- Changes a field's type (`number` → `string`, object → array, scalar → object).
- Makes a previously-always-present field optional/nullable, or removes a field
  from `required`.
- Drops or renames an enum value clients switch on.
- Changes the top-level shape (wrapping a bare array in `{ data: [...] }`,
  paginating what used to be a full list).

Adding a NEW optional field is safe. Widening a type callers already tolerate
(making a required field optional in the REQUEST) is safe. Focus on the response.

For each finding, state the field path (`data.items[].price`), the old vs new
shape, and the consumer that breaks.

## ❌ Bad — response shape change that breaks parsers

```diff
  res.json({
    id: order.id,
-   price: 1999,            // integer cents
+   price: "19.99",         // now a string  → clients doing math break
-   items: order.items,     // was always present
+   items: order.items ?? null,  // now nullable → `.length` throws
  })
```

## ✅ Good — schema extended, old readers unaffected

```diff
  res.json({
    id: order.id,
    price: 1999,
    items: order.items,
+   currency: "USD",        // NEW optional field, existing readers ignore it
  })
```
