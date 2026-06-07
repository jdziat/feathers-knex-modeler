/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const fixtures = require('../fixtures.json')
const Modeler = require('../../src/index.js')
const { createDb, canConnect } = require('../helpers/db')

let db
let modelOne
let modelTwo

before(async function () {
  if (await canConnect() === false) {
    this.skip()
  }

  db = createDb()
  fixtures.testOne.db = db
  fixtures.testTwo.db = db
  modelOne = new Modeler(fixtures.testOne)
  modelTwo = new Modeler(fixtures.testTwo)
})

after(async () => {
  if (db) await db.destroy()
})

describe('Feathers-Knex-Modeller', () => {
  describe('#init', function () {
    describe('Creates table if it does not exist.', function () {
      it('Should wait for table and column to exist if it references it.', async function () {
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
