/* eslint-disable no-console */
'use strict'
const _ = require('lodash')
const pWaitFor = require('p-wait-for')
const EventEmitter = require('events')
const debug = require('debug')
const PQueue = require('p-queue')
class Model extends EventEmitter {
  constructor (options) {
    _.defaultsDeep(options, { name: '', depends: [], columns: [], db: {} })
    super(options)
    const self = this
    Object.defineProperty(self, '_', { enumerable: false, value: {} })
    Object.defineProperty(self._, 'depends', { enumerable: false, value: options.depends })
    Object.defineProperty(self._, 'columns', { enumerable: false, value: options.columns })
    Object.defineProperty(self._, 'name', { enumerable: false, value: options.name })
    Object.defineProperty(self._, 'db', { enumerable: false, value: options.db })
    Object.defineProperty(self._, 'default', { enumerable: false, value: options.default })
    let tableName = _.get(self, '_.name')
    self.debug = debug(`feathers-knex-modeler:${tableName}`)
    self.debug(`Finished construction of model for table: ${tableName}`)
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
  async init () {
    const self = this
    const db = self.db
    let tableName = self.name
    self.debug(`Starting initialization of model for table: ${tableName}`)
    let encounteredErrors = false
    let errors
    try {
      self.emit({ source: 'initialization', type: 'database', value: { message: `Initializing database: ${self.name}. Waiting on dbs: ${self.depends.join(', ')}` } })
      self.debug(`Waiting for dependent tables for table: ${tableName}`)
      await self.waitForTables()
      self.debug(`Creating table: ${tableName}`)
      await self.createTable()
      self.debug(`Creating Columns for table: ${tableName}`)
      await self.createColumns()
    } catch (err) {
      errors = err
      encounteredErrors = true
      self.emit({ source: 'initialization', type: 'error', value: err })
    }
    if (encounteredErrors === true) {
      self.debug(`Failed initialization of model for table: ${tableName}`)
      throw new Error(errors)
    } else {
      self.debug(`Finished initialization of model for table: ${tableName}`)
    }
    return db
  }
  emit (...args) {
    if (args.length === 1) {
      super.emit('message', args[0])
    } else {
      super.emit(...args)
    }
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
        throw err
      } else {
        self.hasColumn(tableName, columnName, retries)
      }
    }
  }
  async waitForColumn (tableName, columnName) {
    const self = this
    return pWaitFor(async () => self.hasColumn(tableName, columnName))
  }
  async alterColumn (column, option, allOptions) {
    const self = this
    const db = self.db
    let errored = false
    self.debug(`Modifying column: ${column.name}`)
    self.debug(option)
    let hasOnDelete = _.defaultTo(_.find(allOptions, { type: 'onDelete' }), false)
    let hasOnUpdate = _.defaultTo(_.find(allOptions, { type: 'onUpdated' }), false)
    self.debug(`Column: ${column.name}, has onDelete defined: ${hasOnDelete !== false}`)
    self.debug(`Column: ${column.name}, has onUpdated defined: ${hasOnUpdate !== false}`)
    try {
      await db.schema.alterTable(self.name, (table) => {
        let alterCommand
        let typeOfColumn = option.type
        let argument = option.argument
        let columnToAlter = self.tableColumnUtilityMethod(table, column)

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
          case 'references': {
            if (hasOnDelete !== false && hasOnUpdate !== false) {
              self.debug(`Column: ${column.name}, references onUpdate and onDelete`)
              alterCommand = columnToAlter.references(argument).onDelete(hasOnDelete.argument).onUpdate(hasOnUpdate.argument)
            }
            if (hasOnDelete !== false && hasOnUpdate === false) {
              self.debug(`Column: ${column.name}, references onDelete`)
              alterCommand = columnToAlter.references(argument).onDelete(hasOnDelete.argument)
            }
            if (hasOnUpdate !== false && hasOnDelete === false) {
              self.debug(`Column: ${column.name}, references onUpdate`)
              alterCommand = columnToAlter.references(argument).onUpdate(hasOnUpdate.argument)
            }
            if (hasOnDelete === false || hasOnUpdate === false) {
              self.debug(`Column: ${column.name}, references no onUpdate or onDelete`)
              alterCommand = columnToAlter.references(argument)
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
            } else {
              self.debug(`Unable to find the function to perform the alter on the column: ${column.name}`)
            }
          }
        }
        if (_.isUndefined(alterCommand) === false) {
          alterCommand.alter()
        }
      })
    } catch (err) {
      let alreadyExists = (err.message.indexOf('already exists') !== -1)
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
    let waitingOnQueue = new PQueue({ concurrency: 1 })
    _.forEach(column.options, (columnOption) => {
      if (columnOption.type === 'references') {
        let splitArray = columnOption.argument.split('.')
        let dependTable = splitArray[0]
        let dependColumn = splitArray[1]
        waitingOnQueue.add(() => self.waitForTableColumn(dependTable, dependColumn))
      }
    })
    await waitingOnQueue.onIdle()
    self.debug(`All dependencies found`)
    let hasColumn = await self.hasColumn(self.name, column.name)
    self.debug(`Altering table`)
    await self.alterTable(hasColumn, column)
    self.debug(`Finished altering table`)
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
    let alterations = []
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
      let columnsBeingCreated = []
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        let column = columns[columnIndex]
        self.debug(`Creating Column: ${column.name}`)
        columnsBeingCreated.push(self.createColumn(column, columns))
      }
      await Promise.all(columnsBeingCreated)
    } catch (err) {
      console.log(err)
      throw new Error('Failed creating columns', err)
    }
  }
  async createTable (tableName) {
    const self = this
    const db = self.db
    tableName = tableName || self.name
    self.debug(`Creating table: ${tableName}`)
    let hasTable = await self.hasTable(tableName)
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
    let tablesBeingCreated = []
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      let dependedOnTableName = self.depends[dependsIndex]
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
    let exists = await db.schema.hasTable(tableName)
    return exists
  }
  async hasTables () {
    const self = this
    let dependedOnTables = []
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      let dependedOnTableName = self.depends[dependsIndex]
      dependedOnTables.push(self.hasTable(dependedOnTableName))
    }
    return Promise.all(dependedOnTables)
  }
}

module.exports = Model
