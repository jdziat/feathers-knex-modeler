---
title: Dependencies and Bounded Waits
---

Use `depends` when one model must wait for other tables before initializing.

```js
const members = new Modeler({
  name: 'members',
  depends: ['organizations'],
  columns: [
    { name: 'id', type: 'increments' },
    { name: 'organization_id', type: 'integer' }
  ],
  db
})

await members.init()
```

Each dependency is polled with:

- `pollInterval`, default `250` milliseconds;
- `waitTimeout`, default `30000` milliseconds.

When a required table or referenced column is missing, initialization rejects after `waitTimeout` instead of hanging forever. The error message names the missing table or column, for example `Timed out after 30000ms waiting for table organizations`.

```js
const modeler = new Modeler({
  name: 'members',
  depends: ['organizations'],
  pollInterval: 100,
  waitTimeout: 5000,
  columns,
  db
})
```

Foreign key references use the same bounded waiting behavior for the referenced table and column.
