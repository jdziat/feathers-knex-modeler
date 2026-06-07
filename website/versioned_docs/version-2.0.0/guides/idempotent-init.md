---
title: Idempotent Init
---

`init()` is the schema synchronization entry point. It is async, idempotent, and must be awaited before querying.

During initialization the modeler:

- waits for every table listed in `depends`;
- creates the target table if it does not exist;
- adds configured columns that are missing;
- applies supported Knex column-builder options;
- creates configured foreign keys when they do not already exist.

It never drops a table or column. It is designed for the create-or-extend workflow used while a table is evolving, not for destructive migrations.

```js
const modeler = new Modeler({
  name: 'projects',
  columns: [
    { name: 'id', type: 'increments' },
    { name: 'name', type: 'text', options: [{ type: 'notNullable' }] }
  ],
  db
})

await modeler.init()
await db('projects').insert({ name: 'Docs' })
```

Calling `init()` again is safe: existing tables are skipped, existing columns are detected, and missing columns are added.
