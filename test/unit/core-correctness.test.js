/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Modeler = require('../../src/index.js')

function deepFreeze (value) {
  Object.freeze(value)
  Object.keys(value).forEach((key) => {
    const child = value[key]
    if (child && typeof child === 'object' && Object.isFrozen(child) === false) {
      deepFreeze(child)
    }
  })
  return value
}

function createBaseModel (overrides = {}) {
  return new Modeler({
    name: 'test_table',
    columns: [{ name: 'id', type: 'increments' }],
    ...overrides
  })
}

describe('Core correctness helpers', () => {
  it('validates identifiers', () => {
    expect(Modeler.assertIdentifier('valid_snake_case', 'name')).to.equal('valid_snake_case')
    expect(() => Modeler.assertIdentifier('has space', 'name')).to.throw()
    expect(() => Modeler.assertIdentifier('has"quote', 'name')).to.throw()
    expect(() => Modeler.assertIdentifier('1starts_with_digit', 'name')).to.throw()
    expect(() => Modeler.assertIdentifier('a'.repeat(64), 'name')).to.throw()
  })

  it('parses references', () => {
    expect(Modeler.parseReference('organizations.id')).to.deep.equal({ table: 'organizations', column: 'id' })
    expect(Modeler.parseReference({ table: 'organizations', column: 'id' })).to.deep.equal({ table: 'organizations', column: 'id' })
    expect(() => Modeler.parseReference('id')).to.throw()
    expect(() => Modeler.parseReference('a.b.c')).to.throw()
  })

  it('resolves referential actions from the allow-list', () => {
    expect(Modeler.resolveReferentialAction('cascade')).to.equal('CASCADE')
    expect(Modeler.resolveReferentialAction('set null')).to.equal('SET NULL')
    expect(() => Modeler.resolveReferentialAction('CASCADE; DROP TABLE x; --')).to.throw()
  })

  it('does not mutate frozen constructor input', () => {
    const options = deepFreeze({
      name: 'immutable_input',
      columns: [{ name: 'count', type: 'INT' }]
    })
    const original = JSON.stringify(options)
    const model = new Modeler(options)

    expect(model.columns[0].type).to.equal('integer')
    expect(options.columns[0].type).to.equal('INT')
    expect(JSON.stringify(options)).to.equal(original)
  })

  it('retries with backoff until success', async () => {
    let attempts = 0
    const started = Date.now()
    const result = await Modeler.retryWithBackoff(async () => {
      attempts++
      if (attempts < 3) throw new Error('not yet')
      return 'done'
    }, { attempts: 3, baseDelay: 10, jitter: 0 })

    expect(result).to.equal('done')
    expect(attempts).to.equal(3)
    expect(Date.now() - started).to.be.at.least(20)
  })

  it('throws after the configured number of retry attempts', async () => {
    let attempts = 0

    try {
      await Modeler.retryWithBackoff(async () => {
        attempts++
        throw new Error('still failing')
      }, { attempts: 4, baseDelay: 1, jitter: 0 })
      throw new Error('expected retry to throw')
    } catch (err) {
      expect(err.message).to.equal('still failing')
      expect(attempts).to.equal(4)
    }
  })

  it('bounds table waits and names the table on timeout', async () => {
    const model = createBaseModel({
      waitTimeout: 80,
      pollInterval: 10,
      db: {
        schema: {
          hasTable: async () => false
        }
      }
    })
    const started = Date.now()

    try {
      await model.waitForTable('missing_table')
      throw new Error('expected wait to throw')
    } catch (err) {
      expect(Date.now() - started).to.be.below(500)
      expect(err.message).to.include('missing_table')
      expect(err.message).to.include('80ms')
    }
  })

  it('uses the native foreign key builder', async () => {
    const calls = []
    const db = {
      raw: () => {
        throw new Error('raw should not be called')
      },
      schema: {
        alterTable: async (name, buildTable) => {
          calls.push(['alterTable', name])
          buildTable({
            foreign: (columnName) => {
              calls.push(['foreign', columnName])
              const chain = {
                references: (referenceColumn) => {
                  calls.push(['references', referenceColumn])
                  return chain
                },
                inTable: (referenceTable) => {
                  calls.push(['inTable', referenceTable])
                  return chain
                },
                onDelete: (action) => {
                  calls.push(['onDelete', action])
                  return chain
                },
                onUpdate: (action) => {
                  calls.push(['onUpdate', action])
                  return chain
                }
              }
              return chain
            }
          })
        }
      }
    }
    const model = createBaseModel({
      db,
      columns: [{
        name: 'organization_id',
        type: 'integer',
        options: [
          { type: 'references', argument: 'organizations.id' },
          { type: 'onDelete', argument: 'cascade' }
        ]
      }]
    })

    await model.addForeignKey(model.columns[0])

    expect(calls).to.deep.equal([
      ['alterTable', 'test_table'],
      ['foreign', 'organization_id'],
      ['references', 'id'],
      ['inTable', 'organizations'],
      ['onDelete', 'CASCADE']
    ])
  })

  it('does not expose the removed key-dropping method', () => {
    const method = 'drop' + 'Key'
    const model = createBaseModel()

    expect(Modeler.prototype[method]).to.equal(undefined)
    expect(model[method]).to.equal(undefined)
  })
})
