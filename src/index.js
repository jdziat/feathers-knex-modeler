/* eslint-disable no-console */
'use strict'

const _ = require('lodash')
const pWaitFor = require('p-wait-for')
const delay = require('delay')
const EventEmitter = require('events')
const debug = require('debug')

const MAX_RETRIES = 5
const DEFAULT_POLL_INTERVAL = 250
const DEFAULT_WAIT_TIMEOUT = 30000
const REFERENTIAL_ACTIONS = new Set(['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL', 'SET DEFAULT'])
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/

function messageOf (err) {
  if (err instanceof Error) return err.message
  if (_.isString(err)) return err
  try {
    return JSON.stringify(err)
  } catch (jsonErr) {
    return String(err)
  }
}

function assertIdentifier (value, label) {
  if (_.isString(value) === false) {
    throw new TypeError(`${label} must be a string identifier.`)
  }
  if (value.length < 1 || value.length > 63) {
    throw new Error(`${label} must be between 1 and 63 characters.`)
  }
  if (IDENTIFIER_PATTERN.test(value) === false) {
    throw new Error(`${label} must match ${IDENTIFIER_PATTERN}.`)
  }
  return value
}

function parseReference (reference) {
  let referenceTable
  let referenceColumn

  if (_.isString(reference) === true) {
    const segments = reference.split('.')
    if (segments.length !== 2) {
      throw new Error(`Expected references argument to be "table.column"; received "${reference}".`)
    }
    referenceTable = segments[0]
    referenceColumn = segments[1]
  } else if (_.isPlainObject(reference) === true) {
    referenceTable = reference.table
    referenceColumn = reference.column
  } else {
    throw new TypeError('Expected references argument to be "table.column" or { table, column }.')
  }

  assertIdentifier(referenceTable, 'Reference table')
  assertIdentifier(referenceColumn, 'Reference column')
  return { table: referenceTable, column: referenceColumn }
}

function resolveReferentialAction (action) {
  if (_.isString(action) === false) {
    throw new TypeError('Referential action must be a string.')
  }

  const normalized = action.trim().replace(/\s+/g, ' ').toUpperCase()
  if (REFERENTIAL_ACTIONS.has(normalized) === false) {
    throw new Error(`Unsupported referential action: ${action}`)
  }
  return normalized
}

function cloneColumn (column) {
  const cloned = { ...column }
  if (_.isArray(column.options) === true) {
    cloned.options = column.options.map((option) => ({ ...option }))
  }
  if (_.isArray(column.args) === true) {
    cloned.args = [...column.args]
  }
  return cloned
}

async function retryWithBackoff (operation, options = {}) {
  const attempts = _.defaultTo(options.attempts, MAX_RETRIES)
  const baseDelay = _.defaultTo(options.baseDelay, 50)
  const jitter = _.defaultTo(options.jitter, 10)
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt)
    } catch (err) {
      lastError = err
      if (attempt === attempts) break
      const jitterDelay = jitter > 0 ? Math.floor(Math.random() * jitter) : 0
      await delay((baseDelay * Math.pow(2, attempt - 1)) + jitterDelay)
    }
  }

  throw lastError
}

class Model extends EventEmitter {
  constructor (options = {}) {
    super(options)
    const self = this
    const columns = _.defaultTo(_.get(options, 'columns'), [])
    const name = _.defaultTo(_.get(options, 'name'), '')

    Object.defineProperty(self, '_', { enumerable: false, value: {} })
    _.set(self, '_.depends', _.defaultTo(_.get(options, 'depends'), []))
    _.set(self, '_.name', name)
    _.set(self, '_.db', _.defaultTo(_.get(options, 'db'), false))
    _.set(self, '_.default', _.defaultTo(_.get(options, 'default'), ''))
    _.set(self, '_.retries', _.defaultTo(_.get(options, 'retries'), MAX_RETRIES))
    _.set(self, '_.pollInterval', _.defaultTo(_.get(options, 'pollInterval'), DEFAULT_POLL_INTERVAL))
    _.set(self, '_.waitTimeout', _.defaultTo(_.get(options, 'waitTimeout'), DEFAULT_WAIT_TIMEOUT))

    if (self._.name === '') {
      throw new Error('No table name was provided.')
    }
    if (columns.length === 0) {
      throw new Error('No table columns present')
    }
    if (_.isArray(columns) === false) {
      throw new Error(`Expected columns to be an array. ${columns}`)
    }

    assertIdentifier(self._.name, 'Table name')
    _.set(self, '_.columns', columns.map((column) => {
      const cloned = cloneColumn(column)
      assertIdentifier(cloned.name, 'Column name')
      cloned.type = _.toLower(cloned.type)
      if (cloned.type === 'int') {
        cloned.type = 'integer'
      }
      if (_.isArray(cloned.options) === false) {
        cloned.options = []
      }
      cloned.options.forEach((option) => {
        if (option.type === 'references') parseReference(option.argument)
        if (option.type === 'onDelete' || option.type === 'onUpdate') resolveReferentialAction(option.argument)
      })
      return cloned
    }))

    self.debug = debug(`feathers-knex-modeler:${self._.name}`)
    self.debug(`Finished construction of model for table: ${self._.name}`)
  }

  static assertIdentifier (value, label) {
    return assertIdentifier(value, label)
  }

  static parseReference (reference) {
    return parseReference(reference)
  }

  static resolveReferentialAction (action) {
    return resolveReferentialAction(action)
  }

  static retryWithBackoff (operation, options) {
    return retryWithBackoff(operation, options)
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

  get pollInterval () {
    return this._.pollInterval
  }

  get waitTimeout () {
    return this._.waitTimeout
  }

  get waitOptions () {
    return { interval: this.pollInterval, timeout: this.waitTimeout }
  }

  async init () {
    const self = this
    const tableName = self.name

    // Events are init:start, init:success, and init:error with a uniform table/message/error payload.
    self.emit('init:start', { table: tableName, message: `Initializing table: ${tableName}`, error: null })
    self.debug(`Starting initialization of model for table: ${tableName}`)

    try {
      await retryWithBackoff(async () => {
        await self.waitForTables()
        await self.createTable()
        await self.createColumns()
      }, {
        attempts: self._.retries,
        baseDelay: self.pollInterval,
        jitter: Math.min(25, self.pollInterval)
      })
      self.emit('init:success', { table: tableName, message: `Initialized table: ${tableName}`, error: null })
      self.debug(`Finished initialization of model for table: ${tableName}`)
      return self.db
    } catch (err) {
      const message = `Failed to finish initialization for table: ${tableName} after ${self._.retries} attempts. ${messageOf(err)}`
      self.emit('init:error', { table: tableName, message, error: err })
      throw new Error(message, { cause: err })
    }
  }

  normalizeColumnName (columnName) {
    if (_.isNil(columnName) === true) {
      throw new TypeError('columnName must be a string or an object with a name property.')
    }
    const normalized = _.isObject(columnName) === true && _.isString(columnName.name) === true ? columnName.name : columnName
    if (_.isString(normalized) === false) {
      throw new TypeError('columnName must be a string or an object with a name property.')
    }
    return normalized
  }

  async hasColumn (tableName, columnName) {
    const self = this
    const db = self.db
    const targetTable = tableName || self.name
    const col = self.normalizeColumnName(columnName)

    for (let attempt = 1; attempt <= self._.retries; attempt++) {
      try {
        self.debug(`Checking for column: ${col} in table: ${targetTable}`)
        return await db.schema.hasColumn(targetTable, col)
      } catch (err) {
        if (attempt === self._.retries) {
          throw new Error(`hasColumn errored ${self._.retries} times on table: ${targetTable} column: ${col}. ${messageOf(err)}`, { cause: err })
        }
      }
    }
  }

  async waitForColumn (tableName, columnName) {
    const self = this
    const col = self.normalizeColumnName(columnName)
    try {
      await pWaitFor(async () => {
        try {
          return await self.hasColumn(tableName, col) === true
        } catch (err) {
          return false
        }
      }, self.waitOptions)
      return true
    } catch (err) {
      throw new Error(`Timed out after ${self.waitTimeout}ms waiting for column ${tableName}.${col}`, { cause: err })
    }
  }

  getColumnOption (column, type) {
    return _.find(column.options, { type })
  }

  getReferenceOptions (column) {
    const referenceOption = this.getColumnOption(column, 'references')
    if (referenceOption === undefined) return null

    const onDeleteOption = this.getColumnOption(column, 'onDelete')
    const onUpdateOption = this.getColumnOption(column, 'onUpdate')
    return {
      reference: parseReference(referenceOption.argument),
      onDelete: onDeleteOption ? resolveReferentialAction(onDeleteOption.argument) : null,
      onUpdate: onUpdateOption ? resolveReferentialAction(onUpdateOption.argument) : null
    }
  }

  applyColumnOption (table, columnToAlter, column, option, alterExisting) {
    if (option.type === 'references' || option.type === 'onDelete' || option.type === 'onUpdate') {
      return columnToAlter
    }

    if (_.isFunction(columnToAlter[option.type]) === true) {
      columnToAlter = _.isUndefined(option.argument) === true
        ? columnToAlter[option.type]()
        : columnToAlter[option.type](option.argument)
    } else {
      this.debug(`Unable to find function ${option.type} for column: ${column.name}`)
    }

    if (alterExisting === true && _.isFunction(columnToAlter.alter) === true) {
      columnToAlter.alter()
    }
    return columnToAlter
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

  applyColumnBody (table, column, alterExisting) {
    let columnToAlter = this.tableColumnUtilityMethod(table, column)
    for (let optionIndex = 0; optionIndex < column.options.length; optionIndex++) {
      columnToAlter = this.applyColumnOption(table, columnToAlter, column, column.options[optionIndex], alterExisting)
    }
  }

  async alterColumn (column, hasColumn) {
    const self = this
    const db = self.db
    const alterExisting = hasColumn === true

    if (alterExisting === true && (_.isUndefined(column.specificType) === false && _.get(column, 'specificType') === true)) {
      return true
    }
    if (alterExisting === true && column.options.some((option) => option.type !== 'references' && option.type !== 'onDelete' && option.type !== 'onUpdate') === false) {
      return true
    }

    try {
      await db.schema.alterTable(self.name, (table) => {
        self.applyColumnBody(table, column, alterExisting)
      })
      return true
    } catch (err) {
      throw new Error(`Alter column failed on ${self.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async waitForReference (column) {
    const referenceOptions = this.getReferenceOptions(column)
    if (referenceOptions === null) return
    await this.waitForTableColumn(referenceOptions.reference.table, referenceOptions.reference.column)
  }

  async createColumn (column) {
    const self = this
    try {
      await self.waitForReference(column)
      const hasColumn = await self.hasColumn(self.name, column.name)
      await self.alterColumn(column, hasColumn)
      await self.addForeignKey(column)
      return true
    } catch (err) {
      throw new Error(`Failed creating column ${self.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async createColumns () {
    const self = this
    try {
      for (let columnIndex = 0; columnIndex < self.columns.length; columnIndex++) {
        const column = self.columns[columnIndex]
        self.debug(`Creating Column: ${column.name}`)
        await self.createColumn(column)
      }
      return true
    } catch (err) {
      throw new Error(`Failed creating columns for table ${self.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async createTable (tableName) {
    const self = this
    const db = self.db
    const targetTable = tableName || self.name
    self.debug(`Creating table: ${targetTable}`)
    const hasTable = await self.hasTable(targetTable)
    if (hasTable === true) return false

    try {
      await db.schema.createTable(targetTable, (table) => {
        for (let columnIndex = 0; columnIndex < self.columns.length; columnIndex++) {
          self.applyColumnBody(table, self.columns[columnIndex], false)
        }
      })
      return true
    } catch (err) {
      throw new Error(`Failed creating table ${targetTable}. ${messageOf(err)}`, { cause: err })
    }
  }

  async hasForeignKey (column, referenceOptions) {
    const db = this.db
    if (_.isFunction(db) === false) return false

    const rows = await db('information_schema.table_constraints as tc')
      .join('information_schema.key_column_usage as kcu', function () {
        this.on('tc.constraint_name', 'kcu.constraint_name')
          .andOn('tc.table_schema', 'kcu.table_schema')
          .andOn('tc.table_name', 'kcu.table_name')
      })
      .join('information_schema.constraint_column_usage as ccu', function () {
        this.on('tc.constraint_name', 'ccu.constraint_name')
          .andOn('tc.table_schema', 'ccu.table_schema')
      })
      .where({
        'tc.constraint_type': 'FOREIGN KEY',
        'tc.table_name': this.name,
        'kcu.column_name': column.name,
        'ccu.table_name': referenceOptions.reference.table,
        'ccu.column_name': referenceOptions.reference.column
      })
      .first('tc.constraint_name')

    return rows !== undefined
  }

  async addForeignKey (column) {
    const self = this
    const db = self.db
    const referenceOptions = self.getReferenceOptions(column)
    if (referenceOptions === null) return false

    try {
      if (await self.hasForeignKey(column, referenceOptions) === true) return false
      await db.schema.alterTable(self.name, (table) => {
        const foreignKey = table.foreign(column.name)
          .references(referenceOptions.reference.column)
          .inTable(referenceOptions.reference.table)
        if (referenceOptions.onDelete !== null) {
          foreignKey.onDelete(referenceOptions.onDelete)
        }
        if (referenceOptions.onUpdate !== null) {
          foreignKey.onUpdate(referenceOptions.onUpdate)
        }
      })
      return true
    } catch (err) {
      throw new Error(`Failed creating foreign key for ${self.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async waitForTable (tableName) {
    const self = this
    try {
      await pWaitFor(async () => {
        try {
          return await self.hasTable(tableName) === true
        } catch (err) {
          return false
        }
      }, self.waitOptions)
      return true
    } catch (err) {
      throw new Error(`Timed out after ${self.waitTimeout}ms waiting for table ${tableName}`, { cause: err })
    }
  }

  async waitForTables () {
    const self = this
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      const dependedOnTableName = self.depends[dependsIndex]
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
    return await db.schema.hasTable(tableName)
  }

  async hasTables () {
    const self = this
    const dependedOnTables = []
    for (let dependsIndex = 0; dependsIndex < self.depends.length; dependsIndex++) {
      const dependedOnTableName = self.depends[dependsIndex]
      dependedOnTables.push(await self.hasTable(dependedOnTableName))
    }
    return dependedOnTables
  }
}

module.exports = Model
