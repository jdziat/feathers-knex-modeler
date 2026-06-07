/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const Modeler = require('../../src/index.js')
const { createDb, canConnect } = require('../helpers/db')

let db

const tableNames = {
  parent: 'p2_parent',
  child: 'p2_child',
  updateParent: 'p2_update_parent',
  updateChild: 'p2_update_child',
  typed: 'p2_typed'
}

async function dropTables () {
  await db.schema.dropTableIfExists(tableNames.child)
  await db.schema.dropTableIfExists(tableNames.parent)
  await db.schema.dropTableIfExists(tableNames.updateChild)
  await db.schema.dropTableIfExists(tableNames.updateParent)
  await db.schema.dropTableIfExists(tableNames.typed)
}

before(async function () {
  if (await canConnect() === false) {
    this.skip()
  }

  db = createDb()
  await dropTables()
})

after(async () => {
  if (db) {
    await dropTables()
    await db.destroy()
  }
})

describe('Core correctness integration', () => {
  it('runs init repeatedly without dropping or failing', async () => {
    const model = new Modeler({
      name: tableNames.parent,
      db,
      columns: [
        { name: 'id', type: 'increments' },
        { name: 'name', type: 'text', options: [{ type: 'notNullable' }] }
      ]
    })

    await model.init()
    await db(tableNames.parent).insert({ name: 'kept' })
    await model.init()

    const rows = await db(tableNames.parent).select('name')
    expect(rows.map((row) => row.name)).to.include('kept')
  })

  it('creates foreign keys with ON DELETE CASCADE while waiting for dependencies', async () => {
    const parent = new Modeler({
      name: tableNames.parent,
      db,
      columns: [
        { name: 'id', type: 'increments' },
        { name: 'name', type: 'text' }
      ]
    })
    const child = new Modeler({
      name: tableNames.child,
      db,
      depends: [tableNames.parent],
      columns: [
        { name: 'id', type: 'increments' },
        { name: 'parent_id', type: 'integer', options: [{ type: 'references', argument: `${tableNames.parent}.id` }, { type: 'onDelete', argument: 'CASCADE' }] }
      ]
    })

    await Promise.all([child.init(), parent.init()])

    const constraint = await db('information_schema.referential_constraints as rc')
      .join('information_schema.table_constraints as tc', function () {
        this.on('rc.constraint_name', 'tc.constraint_name')
          .andOn('rc.constraint_schema', 'tc.constraint_schema')
      })
      .where({
        'tc.table_name': tableNames.child,
        'tc.constraint_type': 'FOREIGN KEY'
      })
      .first('rc.delete_rule')

    expect(constraint.delete_rule).to.equal('CASCADE')
  })

  it('applies ON UPDATE CASCADE', async () => {
    const parent = new Modeler({
      name: tableNames.updateParent,
      db,
      columns: [{ name: 'id', type: 'integer', options: [{ type: 'primary' }] }]
    })
    const child = new Modeler({
      name: tableNames.updateChild,
      db,
      depends: [tableNames.updateParent],
      columns: [
        { name: 'id', type: 'increments' },
        { name: 'parent_id', type: 'integer', options: [{ type: 'references', argument: `${tableNames.updateParent}.id` }, { type: 'onUpdate', argument: 'CASCADE' }] }
      ]
    })

    await parent.init()
    await child.init()

    const constraint = await db('information_schema.referential_constraints as rc')
      .join('information_schema.table_constraints as tc', function () {
        this.on('rc.constraint_name', 'tc.constraint_name')
          .andOn('rc.constraint_schema', 'tc.constraint_schema')
      })
      .where({
        'tc.table_name': tableNames.updateChild,
        'tc.constraint_type': 'FOREIGN KEY'
      })
      .first('rc.update_rule')

    expect(constraint.update_rule).to.equal('CASCADE')
  })

  it('round-trips specificType text[] columns', async () => {
    const model = new Modeler({
      name: tableNames.typed,
      db,
      columns: [
        { name: 'id', type: 'increments' },
        { name: 'tags', specificType: true, type: 'text[]' }
      ]
    })

    await model.init()
    await db(tableNames.typed).insert({ tags: ['one', 'two'] })
    const row = await db(tableNames.typed).first('tags')

    expect(row.tags).to.deep.equal(['one', 'two'])
  })
})
