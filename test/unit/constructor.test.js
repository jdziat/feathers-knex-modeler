/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Modeler = require('../../src/index.js')

describe('Model constructor', () => {
  it('throws when no table name is provided', () => {
    expect(() => new Modeler({
      columns: [{ name: 'id', type: 'increments' }]
    })).to.throw('No table name was provided.')
  })

  it('throws when no table columns are present', () => {
    expect(() => new Modeler({
      name: 'missing_columns',
      columns: []
    })).to.throw('No table columns present')
  })

  it('throws when columns is not an array', () => {
    expect(() => new Modeler({
      name: 'invalid_columns',
      columns: 'not-an-array'
    })).to.throw(/^Expected columns to be an array\./)
  })

  it('normalizes INT columns to integer', () => {
    const model = new Modeler({
      name: 'integer_columns',
      columns: [{ name: 'count', type: 'INT' }]
    })

    expect(model.columns[0].type).to.equal('integer')
  })

  it('normalizes TEXT columns to lowercase text', () => {
    const model = new Modeler({
      name: 'text_columns',
      columns: [{ name: 'description', type: 'TEXT' }]
    })

    expect(model.columns[0].type).to.equal('text')
  })
})
