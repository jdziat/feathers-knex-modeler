# Feathers Knex modeler

Documentation: https://jdziat.github.io/feathers-knex-modeler/

This package allows you to extend a Knex/Postgres table while you are developing it without requiring you to drop tables.

Install `knex` and the database driver your app uses alongside this package. For Postgres, that means installing `knex` and `pg` in your application.

## Usage

### Within Feathers

The model factory must be awaited before the service starts querying the table.

```js
// test.model.js - A KnexJS model definition
//
// See http://knexjs.org/
// for more of what you can do here.
module.exports = async function (app) {
  const tableName = 'users'
  const db = app.get('knexClient')
  const Modeler = require('feathers-knex-modeler')
  const modeler = new Modeler({
    name: tableName,
    depends: ['organizations'],
    columns: [
      { name: 'id', type: 'increments' },
      {
        name: 'organization_id',
        type: 'integer',
        options: [{ type: 'references', argument: 'organizations.id' }]
      },
      { name: 'value', type: 'integer', options: [{ type: 'notNullable' }] },
      { name: 'name', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'schema_type', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'status', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'shared', type: 'bool', options: [{ type: 'notNullable' }] }
    ],
    db
  })
  await modeler.init()
  return db
}

// test.service.js - A KnexJS service definition
//
// Initializes the `fields` service on path `/test`
const createService = require('@feathersjs/knex')
const createModel = require('../../models/test.model.js')
const hooks = require('./test.hooks')

module.exports = async function (app) {
  const Model = await createModel(app)
  const paginate = app.get('paginate')

  const options = {
    name: 'fields',
    Model,
    paginate
  }

  // Initialize our service with any options it requires
  app.use('/fields', createService(options))

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('fields')

  service.hooks(hooks)
}
```

### Standalone

```js
'use strict'
const knex = require('knex')
const Modeler = require('feathers-knex-modeler')

const db = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    database: 'myapp_test'
  }
})
async function main () {
  const testModel = new Modeler({
    name: 'test',
    depends: [],
    columns: [
      { name: 'id', type: 'increments' },
      { name: 'name', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'schema_type', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'status', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'shared', type: 'bool', options: [{ type: 'notNullable' }] }
    ],
    db
  })

  await testModel.init()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

## Constructor Options

- `name` is the table name to create or update.
- `columns` is the ordered list of Knex column definitions.
- `depends` is an optional list of table names that must exist before this table initializes.
- `db` is the Knex instance.
- `retries` controls how many times initialization retries after transient failures.
- `pollInterval` controls how often dependency waits are checked, in milliseconds.
- `waitTimeout` bounds each dependency wait, in milliseconds.

`init()` is idempotent and must be awaited before querying the table. When a dependency table or referenced column is missing, initialization rejects after `waitTimeout` instead of hanging indefinitely.

## Events

Modeler emits initialization lifecycle events with a uniform payload: `{ table, message, error }`.

- `init:start` fires before dependency checks and schema updates start.
- `init:success` fires after the table and columns are ready.
- `init:error` fires before `init()` rejects; `error` contains the underlying failure.

## Foreign Keys

Use a `references` option with either a `"table.column"` string or `{ table, column }`. Optional `onDelete` and `onUpdate` options support these referential actions: `CASCADE`, `RESTRICT`, `NO ACTION`, `SET NULL`, and `SET DEFAULT`.

## Development

```sh
npm install
npm test            # lint + unit tests (no database needed)
```

Integration tests run against a real Postgres. The repo ships a `docker-compose.yml`
(matching the `postgres:16` service used in CI):

```sh
npm run test:integration:docker   # starts Postgres, runs the suite, tears it down
```

Or manage the database yourself:

```sh
docker compose up -d --wait
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/myapp_test npm run test:integration
docker compose down
```
