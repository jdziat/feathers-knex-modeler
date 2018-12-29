/* eslint-disable no-undef */
'use strict'
const expect = require('chai').expect
const delay = require('delay')
const fixtures = require('./fixtures.json')
const Modeler = require('../src/index.js')
const knex = require('knex')
const db = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    database: 'myapp_test'
  }
})
after(function (done) {
  db.destroy()
  done(process.exit())
})

describe('Feathers-Knex-Modeller', () => {
  let testOne = fixtures.testOne
  let testTwo = fixtures.testTwo
  testOne.db = db
  testTwo.db = db
  const modelOne = new Modeler(testOne)
  const modelTwo = new Modeler(testTwo)
  describe('#init', function () {
    describe('Creates table if it does not exist.', function () {
      it('Should wait for table and column to exist if it references it.', async function () {
        // await Promise.all([modelOne.init(), modelTwo.init()])
        await Promise.all([modelTwo.init(), modelOne.init()])
        let tableOne = await modelOne.hasTable('test')
        let hasTable = tableOne
        expect(hasTable).to.equal(true)
      })
      it('Has the table(s) after init', async function () {
        let hasTableOne = await db.schema.hasTable(fixtures.testOne.name)
        let hasTableTwo = await db.schema.hasTable(fixtures.testTwo.name)
        expect(hasTableOne).to.equal(true)
        expect(hasTableTwo).to.equal(true)
      })
      it('Has the columns(s) after init', async function () {
        let hasTableOneColumnOne = await db.schema.hasColumn(fixtures.testOne.name, fixtures.testOne.columns[0].name)
        let hasTableTwoDependentColumn = await db.schema.hasColumn(fixtures.testTwo.name, 'test_id')
        expect(hasTableOneColumnOne).to.equal(true)
        expect(hasTableTwoDependentColumn).to.equal(true)
      })
      it('Specific type should create a column of the requested type', async function () {
        let tableName = fixtures.data.specificType.textArray.table
        let columnName = fixtures.data.specificType.textArray.name
        let columnData = fixtures.data.specificType.textArray.data
        await db(tableName).delete()
        let dataToInsert = {
          'name': 'name',
          'schema_type': 'specificTypeTest',
          'status': 'TBD',
          'shared': true
        }
        dataToInsert[columnName] = columnData
        await db.insert(dataToInsert).into(tableName)
        let returnedData = (await db.select().from(tableName))[0]
        expect(returnedData[columnName]).to.be.an('array')
        expect(returnedData[columnName][0]).to.be.an('string')
      })
    })
  })
})
