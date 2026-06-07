---
title: Events
---

`Modeler` extends Node.js `EventEmitter` and emits initialization lifecycle events:

- `init:start`
- `init:success`
- `init:error`

Each event payload has the same shape:

```ts
{
  table: string
  message: string
  error: Error | null
}
```

`init:start` and `init:success` use `error: null`. `init:error` includes the underlying failure in `error` before `init()` rejects.

```js
const modeler = new Modeler({ name: 'users', columns, db })

modeler.on('init:start', ({ table, message }) => {
  console.log(table, message)
})

modeler.on('init:error', ({ table, error }) => {
  console.error(`Could not initialize ${table}`, error)
})

await modeler.init()
```

In 2.0.0 these event names replaced the 1.x `init` and `initialization` events.
