/* eslint-disable no-console */
'use strict'
const _ = require('lodash')
const pWaitFor = require('p-wait-for')
const EventEmitter = require('events')
const debug = require('debug')
const PQueue = require('p-queue')
class DefaultModel extends EventEmitter {
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
  emit (message) {
    super.emit('message', message)
  }
  async hasColumn (tableName, columnName) {
    const self = this
    const db = self.db
    tableName = tableName || self.name
    let col
    if (!_.isUndefined(columnName.name)) {
      col = columnName.name
    } else {
      col = columnName
    }
    return db.schema.hasColumn(tableName, col)
  }
  async waitForColumn (tableName, columnName) {
    const self = this
    await pWaitFor(() => self.hasColumn(tableName, columnName))
  }
  alterColumn (column, option) {
    return new Promise((resolve, reject) => {
      const self = this
      const db = self.db
      let errored = false
      db.schema.alterTable(self.name, (table) => {
        try {
          let typeOfColumn = option.type
          let argument = option.argument
          if (_.isFunction(table[column.type](column.name)[typeOfColumn]) === true) {
            table[column.type](column.name)[typeOfColumn](argument).alter()
          } else {
            self.debug(`${typeOfColumn} is not a function. Error occured on table: ${self.name}`)
          }
        } catch (err) {
          self.debug(`Failed to alter column on table: ${self.name}`)
          self.debug(err)
        }
        return table
      })
        .catch((err) => {
          let alreadyExists = err.message.indexOf('already exists') !== -1
          if (alreadyExists === false) {
            errored = err
          }
          return err
        })
        .then(() => {
          if (errored === false) {
            return resolve()
          } else {
            return reject(errored)
          }
        })
    })
  }
  createColumn (column) {
    return new Promise((resolve, reject) => {
      const self = this
      const db = self.db
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
      waitingOnQueue.onIdle()
        .then(() => db.schema.hasColumn(self.name, column.name))
        .then((hasColumn) => {
          return db.schema.alterTable(self.name, (table) => {
            let alterations = []
            if (hasColumn === false) {
              table[column.type](column.name)
            }

            for (let optionIndex = 0; optionIndex < column.options.length; optionIndex++) {
              alterations.push(self.alterColumn(column, column.options[optionIndex]))
            }
            return Promise.all(alterations)
          })
        })
        .then(() => resolve())
        .catch((e) => {
          return reject(e)
        })
    })
  }
  async createColumns () {
    const self = this
    const columns = self.columns
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      let column = columns[columnIndex]
      self.debug(`Creating table: ${self.name}, column: ${column.name}`)
      await self.createColumn(column)
    }
  }
  async createTable (tableName) {
    const self = this
    const db = self.db
    tableName = tableName || self.name
    let hasColumn = await self.hasTable(tableName)
    if (hasColumn === false) {
      return db.schema.createTable(self.name, function () {
        return true
      })
    } else {
      return false
    }
  }
  async waitForTable (tableName) {
    const self = this
    await pWaitFor(() => self.hasTable(tableName))
    return self.hasTable(tableName)
  }
  async waitForTables () {
    const self = this
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      let dependedOnTableName = self.depends[dependsIndex]
      await self.waitForTable(dependedOnTableName)
    }
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
    return db.schema.hasTable(tableName)
  }
  async hasTables () {
    const self = this
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      let dependedOnTableName = self.depends[dependsIndex]
      await self.hasTable(dependedOnTableName)
    }
    return true
  }
}

module.exports = DefaultModel
