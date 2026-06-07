---
title: Migrating from 1.x
---

Version 2.0.0 includes breaking changes from the 1.x series.

## Event names changed

Initialization events changed from `init` and `initialization` to:

- `init:start`
- `init:success`
- `init:error`

All three use the payload `{ table, message, error }`.

## `dropKey()` was removed

The deadlocking `dropKey()` method is no longer part of the public API.

## Foreign key creation was rewritten

Foreign keys are now created with the native Knex schema builder. The raw foreign-key DDL path was removed to address SQL-safety risk.

## Inputs are no longer mutated

The constructor clones column definitions before normalizing them. Caller-provided options and column objects are not mutated.

## Waits are bounded

Dependency and referenced-column waits now reject after `waitTimeout` instead of waiting forever.

## Runtime dependencies changed

Unused runtime dependencies on `lodash`, `delay`, and `p-queue` were dropped.

## Node.js and TypeScript support changed

The package now requires Node.js `>=18` and ships TypeScript declarations for the CommonJS package entry.
