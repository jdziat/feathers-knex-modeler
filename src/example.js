'use strict'
const knex = require('knex')
const Modeler = require('./index.js')

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
const dependent = new Modeler({
  name: 'dependent',
  depends: [],
  columns: [
    { 'name': 'id', 'type': 'increments' },
    {
      'name': 'name',
      'type': 'text',
      'options': [{ 'type': 'notNullable' }]
    },
    {
      'name': 'random_text_array',
      'specificType': true,
      'type': 'text[]',
      'options': [{ 'type': 'notNullable' }]
    },
    {
      'name': 'test_id',
      'type': 'integer',
      'options': [{ 'type': 'references', 'argument': 'test.id' }, { 'type': 'onDelete', 'argument': 'CASCADE' }]
    },
    {
      'name': 'schema_type',
      'type': 'text',
      'options': [{ 'type': 'notNullable' }]
    },
    {
      'name': 'status',
      'type': 'text',
      'options': [{ 'type': 'notNullable' }]
    },
    {
      'name': 'shared',
      'type': 'bool',
      'options': [{ 'type': 'notNullable' }]
    }
  ],
  db
})

testModel.init()
  .then((data) => dependent.init())
  .then(async (data) => {
    await db.insert({ name: 'test1', shared: true, schema_type: 'something', status: 'pending' }).into('test')
    let testId = (await db.select().first('id').from('test')).id

    await db.insert({ 'random_text_array': ['test', 'test', 'test2'], test_id: testId, name: 'test', shared: true, status: 'test', schema_type: 'test' }).into('dependent')
    let result = await db.select().from('dependent')
    console.log(result)
  })
  .then((data) => console.log('done'))
  .catch((data) => console.log(data))
