'use strict'

const pWaitFor = require('p-wait-for')
const { setTimeout: delay } = require('node:timers/promises')
const EventEmitter = require('events')
const debug = require('debug')

const MAX_RETRIES = 5
const DEFAULT_POLL_INTERVAL = 250
const DEFAULT_WAIT_TIMEOUT = 30000
const REFERENTIAL_ACTIONS = new Set(['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL', 'SET DEFAULT'])
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/

function messageOf (err) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch (jsonErr) {
    return String(err)
  }
}

function isPlainObject (value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertIdentifier (value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string identifier.`)
  }
  if (value.length < 1 || value.length > 63) {
    throw new Error(`${label} must be between 1 and 63 characters.`)
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} must match ${IDENTIFIER_PATTERN}.`)
  }
  return value
}

function parseReference (reference) {
  let referenceTable
  let referenceColumn

  if (typeof reference === 'string') {
    const segments = reference.split('.')
    if (segments.length !== 2) {
      throw new Error(`Expected references argument to be "table.column"; received "${reference}".`)
    }
    referenceTable = segments[0]
    referenceColumn = segments[1]
  } else if (isPlainObject(reference)) {
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
  if (typeof action !== 'string') {
    throw new TypeError('Referential action must be a string.')
  }

  const normalized = action.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!REFERENTIAL_ACTIONS.has(normalized)) {
    throw new Error(`Unsupported referential action: ${action}`)
  }
  return normalized
}

function cloneColumn (column) {
  const cloned = { ...column }
  if (Array.isArray(column.options)) {
    cloned.options = column.options.map((option) => ({ ...option }))
  }
  if (Array.isArray(column.args)) {
    cloned.args = [...column.args]
  }
  return cloned
}

async function retryWithBackoff (operation, options = {}) {
  const attempts = options.attempts ?? MAX_RETRIES
  const baseDelay = options.baseDelay ?? 50
  const jitter = options.jitter ?? 10
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
  #name
  #columns
  #depends
  #db
  #retries
  #pollInterval
  #waitTimeout

  constructor (options = {}) {
    super()
    const columns = options?.columns ?? []
    const name = options?.name ?? ''
    const depends = options?.depends ?? []
    const db = options?.db ?? false
    const retries = options?.retries ?? MAX_RETRIES
    const pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL
    const waitTimeout = options?.waitTimeout ?? DEFAULT_WAIT_TIMEOUT

    if (name === '') {
      throw new Error('No table name was provided.')
    }
    if (columns.length === 0) {
      throw new Error('No table columns present')
    }
    if (!Array.isArray(columns)) {
      throw new Error(`Expected columns to be an array. ${columns}`)
    }

    assertIdentifier(name, 'Table name')
    const normalizedColumns = columns.map((column) => {
      const cloned = cloneColumn(column)
      assertIdentifier(cloned.name, 'Column name')
      cloned.type = String(cloned.type).toLowerCase()
      if (cloned.type === 'int') {
        cloned.type = 'integer'
      }
      if (!Array.isArray(cloned.options)) {
        cloned.options = []
      }
      cloned.options.forEach((option) => {
        if (option.type === 'references') parseReference(option.argument)
        if (option.type === 'onDelete' || option.type === 'onUpdate') resolveReferentialAction(option.argument)
      })
      return cloned
    })

    this.#name = name
    this.#columns = normalizedColumns
    this.#depends = depends
    this.#db = db
    this.#retries = retries
    this.#pollInterval = pollInterval
    this.#waitTimeout = waitTimeout

    this.debug = debug(`feathers-knex-modeler:${this.#name}`)
    this.debug(`Finished construction of model for table: ${this.#name}`)
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
    return this.#columns
  }

  get db () {
    return this.#db
  }

  get depends () {
    return this.#depends
  }

  get name () {
    return this.#name
  }

  get pollInterval () {
    return this.#pollInterval
  }

  get waitTimeout () {
    return this.#waitTimeout
  }

  get waitOptions () {
    return { interval: this.pollInterval, timeout: this.waitTimeout }
  }

  async init () {
    const tableName = this.name

    // Events are init:start, init:success, and init:error with a uniform table/message/error payload.
    this.emit('init:start', { table: tableName, message: `Initializing table: ${tableName}`, error: null })
    this.debug(`Starting initialization of model for table: ${tableName}`)

    try {
      await retryWithBackoff(async () => {
        await this.waitForTables()
        await this.createTable()
        await this.createColumns()
      }, {
        attempts: this.#retries,
        baseDelay: this.pollInterval,
        jitter: Math.min(25, this.pollInterval)
      })
      this.emit('init:success', { table: tableName, message: `Initialized table: ${tableName}`, error: null })
      this.debug(`Finished initialization of model for table: ${tableName}`)
      return this.db
    } catch (err) {
      const message = `Failed to finish initialization for table: ${tableName} after ${this.#retries} attempts. ${messageOf(err)}`
      this.emit('init:error', { table: tableName, message, error: err })
      throw new Error(message, { cause: err })
    }
  }

  normalizeColumnName (columnName) {
    if (columnName == null) {
      throw new TypeError('columnName must be a string or an object with a name property.')
    }
    const normalized = typeof columnName === 'object' && columnName !== null && typeof columnName.name === 'string' ? columnName.name : columnName
    if (typeof normalized !== 'string') {
      throw new TypeError('columnName must be a string or an object with a name property.')
    }
    return normalized
  }

  async hasColumn (tableName, columnName) {
    const db = this.db
    const targetTable = tableName || this.name
    const col = this.normalizeColumnName(columnName)

    for (let attempt = 1; attempt <= this.#retries; attempt++) {
      try {
        this.debug(`Checking for column: ${col} in table: ${targetTable}`)
        return await db.schema.hasColumn(targetTable, col)
      } catch (err) {
        if (attempt === this.#retries) {
          throw new Error(`hasColumn errored ${this.#retries} times on table: ${targetTable} column: ${col}. ${messageOf(err)}`, { cause: err })
        }
      }
    }
  }

  async waitForColumn (tableName, columnName) {
    const col = this.normalizeColumnName(columnName)
    try {
      await pWaitFor(async () => {
        try {
          return await this.hasColumn(tableName, col) === true
        } catch (err) {
          return false
        }
      }, this.waitOptions)
      return true
    } catch (err) {
      throw new Error(`Timed out after ${this.waitTimeout}ms waiting for column ${tableName}.${col}`, { cause: err })
    }
  }

  getColumnOption (column, type) {
    return column.options.find((option) => option.type === type)
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

    if (typeof columnToAlter[option.type] === 'function') {
      columnToAlter = option.argument === undefined
        ? columnToAlter[option.type]()
        : columnToAlter[option.type](option.argument)
    } else {
      this.debug(`Unable to find function ${option.type} for column: ${column.name}`)
    }

    if (alterExisting === true && typeof columnToAlter.alter === 'function') {
      columnToAlter.alter()
    }
    return columnToAlter
  }

  tableColumnUtilityMethod (table, column) {
    let columnToReturn
    if (Array.isArray(column.args) && column.specificType === undefined) {
      columnToReturn = table[column.type](column.name, ...column.args)
    } else if (typeof column.args === 'string' && column.specificType === undefined) {
      columnToReturn = table[column.type](column.name, column.args)
    } else if (column.specificType !== undefined && column?.specificType === true) {
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
    const db = this.db
    const alterExisting = hasColumn === true

    if (alterExisting === true && (column.specificType !== undefined && column?.specificType === true)) {
      return true
    }
    if (alterExisting === true && column.options.some((option) => option.type !== 'references' && option.type !== 'onDelete' && option.type !== 'onUpdate') === false) {
      return true
    }

    try {
      await db.schema.alterTable(this.name, (table) => {
        this.applyColumnBody(table, column, alterExisting)
      })
      return true
    } catch (err) {
      throw new Error(`Alter column failed on ${this.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async waitForReference (column) {
    const referenceOptions = this.getReferenceOptions(column)
    if (referenceOptions === null) return
    await this.waitForTableColumn(referenceOptions.reference.table, referenceOptions.reference.column)
  }

  async createColumn (column) {
    try {
      await this.waitForReference(column)
      const hasColumn = await this.hasColumn(this.name, column.name)
      await this.alterColumn(column, hasColumn)
      await this.addForeignKey(column)
      return true
    } catch (err) {
      throw new Error(`Failed creating column ${this.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async createColumns () {
    try {
      for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++) {
        const column = this.columns[columnIndex]
        this.debug(`Creating Column: ${column.name}`)
        await this.createColumn(column)
      }
      return true
    } catch (err) {
      throw new Error(`Failed creating columns for table ${this.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async createTable (tableName) {
    const db = this.db
    const targetTable = tableName || this.name
    this.debug(`Creating table: ${targetTable}`)
    const hasTable = await this.hasTable(targetTable)
    if (hasTable === true) return false

    try {
      await db.schema.createTable(targetTable, (table) => {
        for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++) {
          this.applyColumnBody(table, this.columns[columnIndex], false)
        }
      })
      return true
    } catch (err) {
      throw new Error(`Failed creating table ${targetTable}. ${messageOf(err)}`, { cause: err })
    }
  }

  async hasForeignKey (column, referenceOptions) {
    const db = this.db
    if (typeof db !== 'function') return false

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
    const db = this.db
    const referenceOptions = this.getReferenceOptions(column)
    if (referenceOptions === null) return false

    try {
      if (await this.hasForeignKey(column, referenceOptions) === true) return false
      await db.schema.alterTable(this.name, (table) => {
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
      throw new Error(`Failed creating foreign key for ${this.name}.${column.name}. ${messageOf(err)}`, { cause: err })
    }
  }

  async waitForTable (tableName) {
    try {
      await pWaitFor(async () => {
        try {
          return await this.hasTable(tableName) === true
        } catch (err) {
          return false
        }
      }, this.waitOptions)
      return true
    } catch (err) {
      throw new Error(`Timed out after ${this.waitTimeout}ms waiting for table ${tableName}`, { cause: err })
    }
  }

  async waitForTables () {
    for (let dependsIndex = 0; dependsIndex < this.depends.length; dependsIndex++) {
      const dependedOnTableName = this.depends[dependsIndex]
      await this.waitForTable(dependedOnTableName)
    }
    return true
  }

  async waitForTableColumn (tableName, columnName) {
    this.debug(`Waiting for table: ${tableName}`)
    await this.waitForTable(tableName)
    this.debug(`Waiting for Column: ${columnName}`)
    await this.waitForColumn(tableName, columnName)
    return true
  }

  async hasTable (tableName) {
    const db = this.db
    return await db.schema.hasTable(tableName)
  }

  async hasTables () {
    const dependedOnTables = []
    for (let dependsIndex = 0; dependsIndex < this.depends.length; dependsIndex++) {
      const dependedOnTableName = this.depends[dependsIndex]
      dependedOnTables.push(await this.hasTable(dependedOnTableName))
    }
    return dependedOnTables
  }
}

module.exports = Model
