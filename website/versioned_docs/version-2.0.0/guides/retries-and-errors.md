---
title: Retries and Error Handling
---

Initialization wraps dependency waits and schema changes in `retryWithBackoff`. The constructor option `retries` controls the number of attempts. The default is `5`.

```js
const modeler = new Modeler({
  name: 'users',
  retries: 3,
  columns,
  db
})

try {
  await modeler.init()
} catch (err) {
  console.error(err.message)
  console.error(err.cause)
}
```

Retries use exponential backoff. During `init()`, the base delay is the modeler's `pollInterval`, and jitter is capped at the smaller of `25` milliseconds or `pollInterval`.

When initialization fails, `init()` emits `init:error` and rejects with a new `Error`. The underlying error is available through `err.cause`.

Several public methods also cause-chain lower-level failures, including `hasColumn`, `waitForColumn`, `alterColumn`, `createColumn`, `createColumns`, `createTable`, `addForeignKey`, and `waitForTable`.

The static helper can be used directly:

```js
await Modeler.retryWithBackoff(
  async (attempt) => {
    return await connect(attempt)
  },
  { attempts: 4, baseDelay: 50, jitter: 10 }
)
```
