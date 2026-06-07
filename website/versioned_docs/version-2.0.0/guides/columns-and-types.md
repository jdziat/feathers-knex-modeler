---
title: Columns and Types
---

Each column uses a `ColumnSpec`:

```ts
{
  name: string
  type: string
  args?: any[] | string
  specificType?: boolean
  options?: ColumnOption[]
}
```

`name` must be a valid identifier. `type` is lowercased during construction, and `int` is normalized to `integer`. The constructor clones column definitions and does not mutate the objects passed by the caller.

## Standard Knex column types

For normal column types, `type` maps to a Knex table builder method.

```js
{
  name: 'display_name',
  type: 'text',
  options: [{ type: 'notNullable' }]
}
```

`args` are passed after the column name. Arrays are spread; strings are passed as a single argument.

```js
{ name: 'amount', type: 'decimal', args: [10, 2] }
{ name: 'metadata', type: 'jsonb' }
```

## Specific types

Set `specificType: true` to emit a raw database type through `table.specificType(name, type)`. This is useful for Postgres-specific types such as arrays.

```js
{
  name: 'tags',
  type: 'text[]',
  specificType: true,
  options: [{ type: 'defaultTo', argument: '{}' }]
}
```

Existing `specificType` columns are not altered on later runs.

## Column options

Recognized option types include:

- `notNullable`
- `defaultTo`
- `references`
- `onDelete`
- `onUpdate`

Other Knex column-builder methods can be used with `{ type, argument }` when the method exists on the column builder.

```js
{
  name: 'email',
  type: 'text',
  options: [
    { type: 'notNullable' },
    { type: 'unique' }
  ]
}
```
