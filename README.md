# Feathers Knex modeler

This package allows you to easily extend a table while you are developing it without requiring you to drop tables. 

## Usage

### Within Feathers

The below contain the contents of two files the model file and the service file.
```js

// test.model.js - A KnexJS
//
// See http://knexjs.org/
// for more of what you can do here.
module.exports = function (app) {
  const tableName = 'users'
  const db = app.get('knexClient')
  const Modeler = require('feathers-knex-modeler')
  const modeler = new Modeler({
    name: tableName,
    depends: ['organizations'],
    columns:    [
    { name: 'id', type: 'increments' },
    { name:'organization_id',type:'integer',options:[{ type: 'references', argument: 'organizations.id' }]} ,
    { name: 'value', type: 'integer', options: [{ type: 'notNullable' }] },
    { name: 'name', type: 'text', options: [{ type: 'notNullable' }] },
    { name: 'schema_type', type: 'text', options: [{ type: 'notNullable' }] },
    { name: 'status', type: 'text', options: [{ type: 'notNullable' }] },
    { name: 'shared', type: 'bool', options: [{ type: 'notNullable' }] }
  ],
    db
  })
  modeler.init()
  return db
}

// test.service.js - A KnexJS
//
// Initializes the `fields` service on path `/test`
const createService = require('feathers-knex')
const createModel = require('../../models/test.model.js')
const hooks = require('./test.hooks')

module.exports = function (app) {
  const Model = createModel(app)
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

The below contain the contents of two files the model file and the service file.
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

testModel.init()
```
