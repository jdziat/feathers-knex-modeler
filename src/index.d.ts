declare class Model {
  constructor(options: Model.Options)

  static assertIdentifier(value: string, label: string): string
  static parseReference(reference: Model.ReferenceInput): Model.Reference
  static resolveReferentialAction(action: string): Model.ReferentialAction
  static retryWithBackoff<T>(
    operation: (attempt: number) => Promise<T> | T,
    options?: Model.RetryOptions
  ): Promise<T>

  readonly columns: Model.ColumnSpec[]
  readonly db: any
  readonly depends: string[]
  readonly name: string
  readonly pollInterval: number
  readonly waitTimeout: number
  readonly waitOptions: Model.WaitOptions
  debug: (...args: any[]) => void

  addListener(eventName: string | symbol, listener: (...args: any[]) => void): this
  emit(eventName: string | symbol, ...args: any[]): boolean
  off(eventName: string | symbol, listener: (...args: any[]) => void): this
  on(eventName: string | symbol, listener: (...args: any[]) => void): this
  once(eventName: string | symbol, listener: (...args: any[]) => void): this
  removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this
  init(): Promise<any>
  normalizeColumnName(columnName: string | { name: string }): string
  hasColumn(tableName: string | undefined | null, columnName: string | { name: string }): Promise<boolean>
  waitForColumn(tableName: string, columnName: string | { name: string }): Promise<boolean>
  getColumnOption(column: Model.ColumnSpec, type: string): Model.ColumnOption | undefined
  getReferenceOptions(column: Model.ColumnSpec): Model.ReferenceOptions | null
  applyColumnOption(
    table: any,
    columnToAlter: any,
    column: Model.ColumnSpec,
    option: Model.ColumnOption,
    alterExisting: boolean
  ): any
  tableColumnUtilityMethod(table: any, column: Model.ColumnSpec): any
  applyColumnBody(table: any, column: Model.ColumnSpec, alterExisting: boolean): void
  alterColumn(column: Model.ColumnSpec, hasColumn: boolean): Promise<boolean>
  waitForReference(column: Model.ColumnSpec): Promise<void>
  createColumn(column: Model.ColumnSpec): Promise<boolean>
  createColumns(): Promise<boolean>
  createTable(tableName?: string): Promise<boolean>
  hasForeignKey(column: Model.ColumnSpec, referenceOptions: Model.ReferenceOptions): Promise<boolean>
  addForeignKey(column: Model.ColumnSpec): Promise<boolean>
  waitForTable(tableName: string): Promise<boolean>
  waitForTables(): Promise<boolean>
  waitForTableColumn(tableName: string, columnName: string | { name: string }): Promise<boolean>
  hasTable(tableName: string): Promise<boolean>
  hasTables(): Promise<boolean[]>
}

declare namespace Model {
  interface Options {
    name: string
    columns: ColumnSpec[]
    depends?: string[]
    db?: any
    retries?: number
    pollInterval?: number
    waitTimeout?: number
  }

  interface ColumnSpec {
    name: string
    type: string
    args?: any[] | string
    specificType?: boolean
    options?: ColumnOption[]
  }

  type ColumnOption =
    | { type: 'notNullable', argument?: undefined }
    | { type: 'references', argument: ReferenceInput }
    | { type: 'onDelete', argument: string }
    | { type: 'onUpdate', argument: string }
    | { type: 'defaultTo', argument?: any }
    | { type: string, argument?: any }

  interface Reference {
    table: string
    column: string
  }

  type ReferenceInput = string | Reference
  type ReferentialAction = 'CASCADE' | 'RESTRICT' | 'NO ACTION' | 'SET NULL' | 'SET DEFAULT'

  interface ReferenceOptions {
    reference: Reference
    onDelete: ReferentialAction | null
    onUpdate: ReferentialAction | null
  }

  interface RetryOptions {
    attempts?: number
    baseDelay?: number
    jitter?: number
  }

  interface WaitOptions {
    interval: number
    timeout: number
  }
}

export = Model
