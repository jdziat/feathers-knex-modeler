---
slug: /
title: Feathers Knex Modeler
---

Feathers Knex Modeler creates or extends a Knex/Postgres table while an application is starting, without requiring you to drop existing tables during development.

The package is a CommonJS module:

```js
const Modeler = require('feathers-knex-modeler')
```

Applications install and configure `knex` and their database driver separately, then pass the Knex instance as `db`. For Postgres, install `knex` and `pg` alongside this package.

`init()` is async and must be awaited before any service or query uses the table. Initialization is idempotent: it creates the table if it is missing, adds missing columns, and never drops existing tables or columns.

## What 2.0.0 provides

- Bounded waits for dependency tables and referenced columns.
- SQL-safe foreign key creation through the native Knex schema builder.
- Constructor-time validation for table names, column names, and references.
- Initialization lifecycle events: `init:start`, `init:success`, and `init:error`.
- TypeScript declarations for the CommonJS entry point.

Start with [Getting Started](./getting-started), then use the guides for columns, dependencies, foreign keys, events, and migration notes.
