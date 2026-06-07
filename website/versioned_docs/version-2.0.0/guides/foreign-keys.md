---
title: Foreign Keys and References
---

Foreign keys are configured with a `references` option. The reference can be a `"table.column"` string or an object with `table` and `column`.

```js
{
  name: 'organization_id',
  type: 'integer',
  options: [
    { type: 'references', argument: 'organizations.id' }
  ]
}
```

```js
{
  name: 'organization_id',
  type: 'integer',
  options: [
    { type: 'references', argument: { table: 'organizations', column: 'id' } }
  ]
}
```

Before creating the foreign key, the modeler waits for the referenced table and column. The foreign key itself is created through the native Knex schema builder, not raw SQL.

## Referential actions

Use `onDelete` and `onUpdate` options with one of these allowed actions:

- `CASCADE`
- `RESTRICT`
- `NO ACTION`
- `SET NULL`
- `SET DEFAULT`

Input is trimmed, whitespace-normalized, and uppercased. Any other action throws during construction.

```js
{
  name: 'organization_id',
  type: 'integer',
  options: [
    { type: 'references', argument: 'organizations.id' },
    { type: 'onDelete', argument: 'CASCADE' },
    { type: 'onUpdate', argument: 'NO ACTION' }
  ]
}
```

Table names, column names, and reference identifiers must match `/^[A-Za-z_][A-Za-z0-9_$]*$/` and be 1 to 63 characters long.
