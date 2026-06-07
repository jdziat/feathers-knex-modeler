---
title: Getting Started
---

## Install

Install the modeler, Knex, and your database driver in the consuming application. Knex and the driver are peer requirements supplied by your app, not bundled by `feathers-knex-modeler`.

```bash
npm install feathers-knex-modeler knex pg
```

For a different database, replace `pg` with the driver required by your Knex client.

## Standalone quick start

```js
'use strict'

const knex = require('knex')
const Modeler = require('feathers-knex-modeler')

const db = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    database: 'myapp'
  }
})

async function main () {
  const users = new Modeler({
    name: 'users',
    columns: [
      { name: 'id', type: 'increments' },
      { name: 'email', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'role', type: 'text', options: [{ type: 'defaultTo', argument: 'user' }] }
    ],
    db
  })

  await users.init()

  const rows = await db('users').select('*')
  console.log(rows)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

Always await `init()` before querying. The method creates the table if needed, adds missing columns, waits for dependencies, and returns the Knex instance when initialization succeeds.

## Feathers with `@feathersjs/knex`

Use `@feathersjs/knex`, not the deprecated `feathers-knex` package.

```js
// users.model.js
'use strict'

const Modeler = require('feathers-knex-modeler')

module.exports = async function createUsersModel (app) {
  const db = app.get('knexClient')
  const modeler = new Modeler({
    name: 'users',
    depends: ['organizations'],
    columns: [
      { name: 'id', type: 'increments' },
      {
        name: 'organization_id',
        type: 'integer',
        options: [
          { type: 'references', argument: 'organizations.id' },
          { type: 'onDelete', argument: 'CASCADE' }
        ]
      },
      { name: 'email', type: 'text', options: [{ type: 'notNullable' }] },
      { name: 'status', type: 'text', options: [{ type: 'defaultTo', argument: 'active' }] }
    ],
    db
  })

  await modeler.init()
  return db
}
```

```js
// users.service.js
'use strict'

const { KnexService } = require('@feathersjs/knex')
const createModel = require('../../models/users.model')

module.exports = async function usersService (app) {
  const Model = await createModel(app)

  app.use('users', new KnexService({
    Model,
    name: 'users',
    paginate: app.get('paginate')
  }))
}
```

The model factory is async because `modeler.init()` must finish before the service starts handling requests.
