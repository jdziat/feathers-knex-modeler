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
  const testOne = fixtures.testOne
  const testTwo = fixtures.testTwo
  testOne.db = db
  testTwo.db = db
  const modelOne = new Modeler(testOne)
  const modelTwo = new Modeler(testTwo)
  describe('#init', function () {
    describe('Creates table if it does not exist.', function () {
      it('Should wait for table and column to exist if it references it.', async function () {
        // await Promise.all([modelOne.init(), modelTwo.init()])
        await Promise.all([modelTwo.init(), modelOne.init()])
        const tableOne = await modelOne.hasTable('test')
        const hasTable = tableOne
        expect(hasTable).to.equal(true)
      })
      it('Has the table(s) after init', async function () {
        const hasTableOne = await db.schema.hasTable(fixtures.testOne.name)
        const hasTableTwo = await db.schema.hasTable(fixtures.testTwo.name)
        expect(hasTableOne).to.equal(true)
        expect(hasTableTwo).to.equal(true)
      })
      it('Has the columns(s) after init', async function () {
        const hasTableOneColumnOne = await db.schema.hasColumn(fixtures.testOne.name, fixtures.testOne.columns[0].name)
        const hasTableTwoDependentColumn = await db.schema.hasColumn(fixtures.testTwo.name, 'test_id')
        expect(hasTableOneColumnOne).to.equal(true)
        expect(hasTableTwoDependentColumn).to.equal(true)
      })
      it('Specific type should create a column of the requested type', async function () {
        const tableName = fixtures.data.specificType.textArray.table
        const columnName = fixtures.data.specificType.textArray.name
        const columnData = fixtures.data.specificType.textArray.data
        await db(tableName).delete()
        const dataToInsert = {
          name: 'name',
          schema_type: 'specificTypeTest',
          status: 'TBD',
          shared: true
        }
        dataToInsert[columnName] = columnData
        await db.insert(dataToInsert).into(tableName)
        const returnedData = (await db.select().from(tableName))[0]
        expect(returnedData[columnName]).to.be.an('array')
        expect(returnedData[columnName][0]).to.be.an('string')
      })
    })
  })
})
