# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- Added TypeScript declarations for the CommonJS package entry.
- Added the `pollInterval` and `waitTimeout` constructor options.
- Added bounded dependency waits so `init()` rejects when a required table or column is missing instead of waiting forever.
- Added an `engines.node` floor of `>=18`.

### Changed

- BREAKING: Foreign keys are now created through the native Knex schema builder, removing raw foreign-key DDL and the related SQL-injection risk.
- BREAKING: Initialization events changed from `init` and `initialization` to `init:start`, `init:success`, and `init:error` with a uniform `{ table, message, error }` payload.
- BREAKING: The constructor no longer mutates caller-provided options or column definitions.
- Dropped unused runtime dependencies on `lodash`, `delay`, and `p-queue`.

### Removed

- BREAKING: Removed the deadlocking `dropKey()` method.
