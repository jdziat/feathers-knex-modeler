---
title: API
---

This API reference is written from `src/index.d.ts` for version 2.0.0.

## Import

```js
const Modeler = require('feathers-knex-modeler')
```

The package exports a CommonJS class. Consumers provide their own Knex instance as `db`.

## Constructor

```ts
new Modeler(options: Modeler.Options)
```

### `Options`

```ts
interface Options {
  name: string
  columns: ColumnSpec[]
  depends?: string[]
  db?: any
  retries?: number
  pollInterval?: number
  waitTimeout?: number
}
```

- `name`: required table name.
- `columns`: required ordered list of column specs.
- `depends`: table names that must exist before this model initializes.
- `db`: Knex instance.
- `retries`: initialization retry attempts. Default: `5`.
- `pollInterval`: dependency polling interval in milliseconds. Default: `250`.
- `waitTimeout`: maximum wait for each dependency or referenced column in milliseconds. Default: `30000`.

The constructor validates table names, column names, and references. Identifiers must match `/^[A-Za-z_][A-Za-z0-9_$]*$/` and be 1 to 63 characters long. It lowercases column `type`, normalizes `int` to `integer`, validates referential actions, and does not mutate caller-provided column objects.

## ColumnSpec

```ts
interface ColumnSpec {
  name: string
  type: string
  args?: any[] | string
  specificType?: boolean
  options?: ColumnOption[]
}
```

- `name`: column name.
- `type`: Knex table-builder method name, lowercased at construction. `int` becomes `integer`.
- `args`: optional arguments passed after the column name. Arrays are spread; strings are passed as one argument.
- `specificType`: when `true`, uses `table.specificType(name, type)`.
- `options`: column-builder options.

## ColumnOption

```ts
type ColumnOption =
  | { type: 'notNullable', argument?: undefined }
  | { type: 'references', argument: ReferenceInput }
  | { type: 'onDelete', argument: string }
  | { type: 'onUpdate', argument: string }
  | { type: 'defaultTo', argument?: any }
  | { type: string, argument?: any }
```

`references`, `onDelete`, and `onUpdate` are handled specially for foreign keys. Other option types call the matching Knex column-builder method when present.

## References

```ts
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
```

`ReferenceInput` can be `"table.column"` or `{ table, column }`. Referential actions are trimmed, whitespace-normalized, uppercased, and restricted to the `ReferentialAction` union.

## Retry and wait types

```ts
interface RetryOptions {
  attempts?: number
  baseDelay?: number
  jitter?: number
}

interface WaitOptions {
  interval: number
  timeout: number
}
```

## Properties

```ts
readonly columns: Modeler.ColumnSpec[]
readonly db: any
readonly depends: string[]
readonly name: string
readonly pollInterval: number
readonly waitTimeout: number
readonly waitOptions: Modeler.WaitOptions
debug: (...args: any[]) => void
```

`waitOptions` returns `{ interval: pollInterval, timeout: waitTimeout }`.

## Static methods

### `assertIdentifier(value, label)`

```ts
static assertIdentifier(value: string, label: string): string
```

Validates an identifier and returns it. Throws if the value is not a string, is shorter than 1 character, longer than 63 characters, or does not match `/^[A-Za-z_][A-Za-z0-9_$]*$/`.

### `parseReference(reference)`

```ts
static parseReference(reference: Modeler.ReferenceInput): Modeler.Reference
```

Parses `"table.column"` or `{ table, column }`, validates both identifiers, and returns `{ table, column }`.

### `resolveReferentialAction(action)`

```ts
static resolveReferentialAction(action: string): Modeler.ReferentialAction
```

Normalizes and validates `CASCADE`, `RESTRICT`, `NO ACTION`, `SET NULL`, or `SET DEFAULT`.

### `retryWithBackoff(operation, options)`

```ts
static retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T> | T,
  options?: Modeler.RetryOptions
): Promise<T>
```

Retries an operation with exponential backoff. Defaults are `attempts: 5`, `baseDelay: 50`, and `jitter: 10`.

## EventEmitter methods

The class exposes standard EventEmitter methods:

```ts
addListener(eventName: string | symbol, listener: (...args: any[]) => void): this
emit(eventName: string | symbol, ...args: any[]): boolean
off(eventName: string | symbol, listener: (...args: any[]) => void): this
on(eventName: string | symbol, listener: (...args: any[]) => void): this
once(eventName: string | symbol, listener: (...args: any[]) => void): this
removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this
```

Initialization events are `init:start`, `init:success`, and `init:error`, each with `{ table, message, error }`.

## Instance methods

### `init()`

```ts
init(): Promise<any>
```

Waits for dependencies, creates the table if missing, adds missing columns, creates foreign keys, emits lifecycle events, and returns `db`. Must be awaited before querying.

### `normalizeColumnName(columnName)`

```ts
normalizeColumnName(columnName: string | { name: string }): string
```

Returns a column name from a string or object with a `name` property.

### `hasColumn(tableName, columnName)`

```ts
hasColumn(tableName: string | undefined | null, columnName: string | { name: string }): Promise<boolean>
```

Checks whether a table has a column. When `tableName` is undefined or null, the model's table name is used.

### `waitForColumn(tableName, columnName)`

```ts
waitForColumn(tableName: string, columnName: string | { name: string }): Promise<boolean>
```

Polls until the column exists or rejects after `waitTimeout`.

### `getColumnOption(column, type)`

```ts
getColumnOption(column: Modeler.ColumnSpec, type: string): Modeler.ColumnOption | undefined
```

Finds the first column option with the requested type.

### `getReferenceOptions(column)`

```ts
getReferenceOptions(column: Modeler.ColumnSpec): Modeler.ReferenceOptions | null
```

Returns parsed reference options for a foreign key column, or null when the column has no `references` option.

### `applyColumnOption(table, columnToAlter, column, option, alterExisting)`

```ts
applyColumnOption(
  table: any,
  columnToAlter: any,
  column: Modeler.ColumnSpec,
  option: Modeler.ColumnOption,
  alterExisting: boolean
): any
```

Applies a non-foreign-key column option to a Knex column builder and returns the builder.

### `tableColumnUtilityMethod(table, column)`

```ts
tableColumnUtilityMethod(table: any, column: Modeler.ColumnSpec): any
```

Creates a Knex column builder using `type`, `args`, or `specificType`.

### `applyColumnBody(table, column, alterExisting)`

```ts
applyColumnBody(table: any, column: Modeler.ColumnSpec, alterExisting: boolean): void
```

Creates or alters a column definition inside a Knex schema callback.

### `alterColumn(column, hasColumn)`

```ts
alterColumn(column: Modeler.ColumnSpec, hasColumn: boolean): Promise<boolean>
```

Adds or alters a column. Existing `specificType` columns and existing columns with only foreign-key options are skipped.

### `waitForReference(column)`

```ts
waitForReference(column: Modeler.ColumnSpec): Promise<void>
```

Waits for the referenced table and column when the column has a `references` option.

### `createColumn(column)`

```ts
createColumn(column: Modeler.ColumnSpec): Promise<boolean>
```

Waits for references, checks whether the column exists, applies the column body, and adds a foreign key if configured.

### `createColumns()`

```ts
createColumns(): Promise<boolean>
```

Creates or updates every configured column in order.

### `createTable(tableName?)`

```ts
createTable(tableName?: string): Promise<boolean>
```

Creates the target table if it does not exist. Returns `false` when the table already exists.

### `hasForeignKey(column, referenceOptions)`

```ts
hasForeignKey(column: Modeler.ColumnSpec, referenceOptions: Modeler.ReferenceOptions): Promise<boolean>
```

Checks Postgres `information_schema` for a matching foreign key.

### `addForeignKey(column)`

```ts
addForeignKey(column: Modeler.ColumnSpec): Promise<boolean>
```

Adds a foreign key with Knex when the column has reference options and the key is missing. Returns `false` when no key is needed or it already exists.

### `waitForTable(tableName)`

```ts
waitForTable(tableName: string): Promise<boolean>
```

Polls until the table exists or rejects after `waitTimeout`.

### `waitForTables()`

```ts
waitForTables(): Promise<boolean>
```

Waits for every table in `depends`.

### `waitForTableColumn(tableName, columnName)`

```ts
waitForTableColumn(tableName: string, columnName: string | { name: string }): Promise<boolean>
```

Waits for a table and then waits for a column on that table.

### `hasTable(tableName)`

```ts
hasTable(tableName: string): Promise<boolean>
```

Checks whether a table exists through `db.schema.hasTable`.

### `hasTables()`

```ts
hasTables(): Promise<boolean[]>
```

Returns one boolean per table listed in `depends`.
