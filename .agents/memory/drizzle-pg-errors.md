---
name: Drizzle wraps pg errors
description: How to detect Postgres error codes (e.g. unique violation) when using Drizzle, especially inside transactions.
---

# Drizzle wraps pg errors

Drizzle (node-postgres driver) wraps the raw `pg` error in a `DrizzleQueryError`. The
original Postgres error (with `.code`, e.g. `23505` for a unique violation) is NOT on the
top-level thrown object — it lives on the `.cause` chain. Inside `db.transaction(...)`
there can be an extra wrapping layer.

**Why:** A naive `err.code === "23505"` check silently fails and the route returns a 500
with a raw SQL error page instead of a clean 409.

**How to apply:** Walk the cause chain when classifying DB errors:
```ts
function isUniqueViolation(err: unknown): boolean {
  let cur: any = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    if (cur.code === "23505") return true;
    cur = cur.cause;
  }
  return false;
}
```
