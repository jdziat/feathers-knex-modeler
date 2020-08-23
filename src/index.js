/* eslint-disable no-console */
'use strict'
const _ = require('lodash')
const pWaitFor = require('p-wait-for')
const EventEmitter = require('events')
const debug = require('debug')
const { default: PQueue } = require('p-queue')
const MAX_RETRIES = 5
class Model extends EventEmitter {
  constructor (options) {
    _.defaults(options, { name: '', depends: [], columns: [], db: {}, retries: MAX_RETRIES })
    super(options)
    const self = this

    Object.defineProperty(self, '_', { enumerable: false, value: {} })
    _.set(self, '_.depends', _.defaultTo(_.get(options, 'depends'), []))
    _.set(self, '_.columns', _.defaultTo(_.get(options, 'columns'), []))
    _.set(self, '_.name', _.defaultTo(_.get(options, 'name'), ''))
    _.set(self, '_.db', _.defaultTo(_.get(options, 'db'), false))
    _.set(self, '_.default', _.defaultTo(_.get(options, 'default'), ''))
    _.set(self, '_.retries', _.defaultTo(_.get(options, 'retries'), 5))

    if (self._.name === '') {
      throw new Error('No table name was provided.')
    }
    if (self._.columns.length === 0) {
      throw new Error('No table columns present')
    }
    if (_.isArray(self._.columns) === false) {
      throw new Error(`Expected columns to be an array. ${self._.columns}`)
    }
    _.forEach(self._.columns, (column) => {
      column.type = _.toLower(column.type)
      if (column.type === 'int') {
        column.type = 'integer'
      }
      return column
    })
    self.debug = debug(`feathers-knex-modeler:${self._.name}`)
    self.debug(`Finished construction of model for table: ${self._.name}`)
  }

  get columns () {
    return this._.columns
  }

  get db () {
    return this._.db
  }

  get default () {
    return this._.default
  }

  get depends () {
    return this._.depends
  }

  get name () {
    return this._.name
  }

  async init (options, retries = 0) {
    const self = this
    const db = self.db
    const tableName = self.name
    const errors = []
    try {
      self.debug(`Starting initialization of model for table: ${tableName}`)
      try {
        self.emit('init', { source: 'initialization', type: 'database', value: { message: `Initializing database: ${self.name}. Waiting on dbs: ${self.depends.join(', ')}` } })
        self.debug(`Waiting for dependent tables for table: ${tableName}`)
        await self.waitForTables()
        self.debug(`Creating table: ${tableName}`)
        await self.createTable()
        self.debug(`Creating Columns for table: ${tableName}`)
        await self.createColumns()
      } catch (err) {
        errors.push(err)
        self.emit('initialization', { source: 'initialization', message: `Encountered error during the initalization process. Table: ${tableName}. ${err || ''}`, error: err })
      }
      if (errors.length > 0) {
        self.debug(`Failed initialization of model for table: ${tableName}. ${errors || ''}`)
        throw new Error(`Failed initialization of model for table: ${tableName}. ${errors || ''}`)
      } else {
        self.debug(`Finished initialization of model for table: ${tableName}`)
      }
    } catch (err) {
      self.debug(`Failed during the initialization process retry: ${retries}. ${err || ''}`)
      retries++
      if (retries < self._.retries) {
        return self.init(options, retries)
      } else {
        throw new Error(`Failed to finish initialization after: ${retries} of ${self._.retries}. ${err || ''}`)
      }
    }
    return db
  }

  async hasColumn (tableName, columnName, retries = 0) {
    const self = this
    const db = self.db
    self.debug(`Checking for column: ${columnName} in table: ${tableName}`)
    try {
      tableName = tableName || self.name
      let col
      if (!_.isUndefined(columnName.name)) {
        col = columnName.name
      } else {
        col = columnName
      }
      return db.schema.hasColumn(tableName, col)
    } catch (err) {
      retries++
      if (retries > 5) {
        throw new Error(`hasColumn errored more than 5 times on table: ${tableName} column: ${columnName}.${err || ''}`)
      } else {
        return self.hasColumn(tableName, columnName, retries)
      }
    }
  }

  async waitForColumn (tableName, columnName) {
    const self = this
    return pWaitFor(async () => self.hasColumn(tableName, columnName))
  }

  async dropKey (tableName, columnName) {
    const self = this
    const done = false
    const columnInfo = await self.db(tableName).columnInfo(columnName)
    await pWaitFor(() => {
      return done
    })
    return columnInfo
  }

  async alterColumn (column, option, allOptions) {
    const self = this
    const db = self.db
    let errored = false
    self.debug(`Modifying column: ${column.name}`)
    self.debug(option)
    const hasOnDelete = _.defaultTo(_.find(allOptions, { type: 'onDelete' }), false)
    const hasOnUpdate = _.defaultTo(_.find(allOptions, { type: 'onUpdated' }), false)
    self.debug(`Column: ${column.name}, has onDelete defined: ${hasOnDelete !== false}`)
    self.debug(`Column: ${column.name}, has onUpdated defined: ${hasOnUpdate !== false}`)
    try {
      await db.schema.alterTable(self.name, async (table) => {
        let alterCommand
        const typeOfColumn = option.type
        const argument = option.argument
        const columnToAlter = self.tableColumnUtilityMethod(table, column)
        switch (typeOfColumn) {
          case 'notNullable': {
            alterCommand = columnToAlter.notNullable()
            break
          }
          case 'nullable': {
            alterCommand = columnToAlter.nullable()
            break
          }
          case 'primary': {
            alterCommand = columnToAlter.primary()
            break
          }
          case 'references' : {
            const referenceArray = argument.split('.')
            const referenceTable = referenceArray[0]
            const referenceColumn = referenceArray[1]
            const constraintName = `${self.name}_${referenceTable}_${referenceColumn}_fkey`
            try {
              debug(`Table: ${self.name} `)
              let alterTableRaw = `alter table "${self.name}" add constraint ${constraintName} foreign key ("${column.name}") references "${referenceTable}" ("${referenceColumn}")`
              if (hasOnDelete !== false) {
                alterTableRaw += ` ON DELETE ${hasOnDelete.argument}`
              }
              if (hasOnUpdate !== false) {
                alterTableRaw += ` ON UPDATE ${hasOnUpdate.argument}`
              }
              debug(`Table: ${self.name} constraint creation: ${alterTableRaw}`)
              await db.raw(alterTableRaw)
              await columnToAlter.references(referenceColumn).on(referenceTable)
            } catch (err) {
              const errorMessage = _.defaultTo(_.get(err, 'message'), '')
              if (errorMessage.indexOf('already exists') !== -1) {
                debug(`Failed to create constraint because it already exists. ${err || ''}`)
              } else {
                throw new Error(`Failed to create constraint. ${err || ''}`)
              }
            }

            break
          }
          case 'unique': {
            self.debug(`Column: ${column.name}, alter command unique`)
            alterCommand = columnToAlter.unique()
            break
          }
          default: {
            if (_.isFunction(table[column.type](column.name)[typeOfColumn]) === true) {
              alterCommand = columnToAlter[typeOfColumn](argument)
            } else if (typeOfColumn !== 'references') {
              self.debug(`Unable to find the function to perform the alter on the column: ${column.name}`)
            }
          }
        }
        if (_.isUndefined(alterCommand) === false) {
          self.debug(`Performing alter command on ${column.name}, type of column: ${typeOfColumn}`)
          alterCommand.alter()
        }
      })
    } catch (err) {
      self.debug(`Alter column failed on column: ${column.name}. ${err || ''}`)
      const alreadyExists = (err.message.indexOf('already exists') !== -1)
      if (alreadyExists === false) {
        errored = err
      }
    }
    if (errored === false) {
      return true
    } else {
      throw errored
    }
  }

  async createColumn (column) {
    const self = this
    column.options = column.options || []
    const waitingOnQueue = new PQueue({ concurrency: 1 })
    _.forEach(column.options, (columnOption) => {
      if (columnOption.type === 'references') {
        const splitArray = columnOption.argument.split('.')
        const dependTable = splitArray[0]
        const dependColumn = splitArray[1]
        waitingOnQueue.add(() => self.waitForTableColumn(dependTable, dependColumn))
      }
    })
    await waitingOnQueue.onIdle()
    self.debug('All dependencies found')
    const hasColumn = await self.hasColumn(self.name, column.name)
    self.debug('Altering table')
    await self.alterTable(hasColumn, column)
    self.debug('Finished altering table')
  }

  tableColumnUtilityMethod (table, column) {
    let columnToReturn
    if (_.isArray(column.args) === true && _.isString(column.args) === false && _.isUndefined(column.specificType) === true) {
      columnToReturn = table[column.type](column.name, ...column.args)
    } else if (_.isString(column.args) === true && _.isUndefined(column.specificType) === true) {
      columnToReturn = table[column.type](column.name, column.args)
    } else if (_.isUndefined(column.specificType) === false && _.get(column, 'specificType') === true) {
      columnToReturn = table.specificType(column.name, column.type)
    } else {
      columnToReturn = table[column.type](column.name)
    }
    return columnToReturn
  }

  async alterTable (hasColumn, column) {
    const self = this
    const db = self.db
    const alterations = []
    await db.schema.alterTable(self.name, (table) => {
      if (hasColumn === false) {
        self.tableColumnUtilityMethod(table, column)
      } else if (_.isUndefined(column.specificType) === true || _.get(column, 'specificType') === false) {
        for (let optionIndex = 0; optionIndex < column.options.length; optionIndex++) {
          alterations.push(self.alterColumn(column, column.options[optionIndex], column.options))
        }
      }
    })
    if (hasColumn === false) {
      return self.alterTable(true, column)
    } else {
      return Promise.all(alterations)
    }
  }

  async createColumns () {
    try {
      const self = this
      const columns = self.columns
      const columnsBeingCreated = []
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const column = columns[columnIndex]
        self.debug(`Creating Column: ${column.name}`)
        columnsBeingCreated.push(self.createColumn(column, columns))
      }
      await Promise.all(columnsBeingCreated)
    } catch (err) {
      throw new Error('Failed creating columns', err)
    }
  }

  async createTable (tableName) {
    const self = this
    const db = self.db
    tableName = tableName || self.name
    self.debug(`Creating table: ${tableName}`)
    const hasTable = await self.hasTable(tableName)
    if (hasTable === false) {
      return db.schema.createTable(self.name, function () {
        return true
      })
    } else {
      return false
    }
  }

  async waitForTable (tableName) {
    const self = this
    await pWaitFor(async () => self.hasTable(tableName))
    return self.hasTable(tableName)
  }

  async waitForTables () {
    const self = this
    const tablesBeingCreated = []
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      const dependedOnTableName = self.depends[dependsIndex]
      tablesBeingCreated.push(self.waitForTable(dependedOnTableName))
    }
    await Promise.all(tablesBeingCreated)
    return true
  }

  async waitForTableColumn (tableName, columnName) {
    const self = this
    self.debug(`Waiting for table: ${tableName}`)
    await self.waitForTable(tableName)
    self.debug(`Waiting for Column: ${columnName}`)
    await self.waitForColumn(tableName, columnName)
    return true
  }

  async hasTable (tableName) {
    const self = this
    const db = self.db
    const exists = await db.schema.hasTable(tableName)
    return exists
  }

  async hasTables () {
    const self = this
    const dependedOnTables = []
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      const dependedOnTableName = self.depends[dependsIndex]
      dependedOnTables.push(self.hasTable(dependedOnTableName))
    }
    return Promise.all(dependedOnTables)
  }
}

module.exports = Model
