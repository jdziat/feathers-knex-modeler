/* eslint-disable no-undef */
'use strict'
const expect = require('chai').expect
const fixtures = require('./fixtures.json')
const Modeler = require('../src/index.js')
const knex = require('knex')

describe('Feathers-Knex-Modeller', () => {
  before(function (done) {
    db.schema.hasTable(fixtures.testTwo.name)
      .then((hasTable) => {
        if (hasTable === true) {
          return db.raw(`drop table ${fixtures.testTwo.name}`)
        }
      })
      .then(() => db.schema.hasTable(fixtures.testOne.name))
      .then((hasTable) => {
        if (hasTable === true) {
          return db.raw(`drop table ${fixtures.testOne.name}`)
        }
      })
      .then((data) => {
        return done()
      })
  })

  after(function (done) {
    db.destroy()
    done(process.exit())
  })
  const db = knex({
    client: 'pg',
    connection: {
      host: '127.0.0.1',
      database: 'myapp_test'
    }
  })
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
        let hasTable = await db.schema.hasTable('test')
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
    })
  })
})
