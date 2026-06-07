'use strict'

const knex = require('knex')

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/myapp_test'

function createDb (options = {}) {
  return knex({
    client: 'pg',
    connection: DATABASE_URL,
    ...options
  })
}

async function canConnect () {
  // Bound BOTH the TCP connect (connectionTimeoutMillis) and pool acquisition
  // (acquireConnectionTimeout) so the probe can never hang — a refused port
  // returns immediately, and a black-hole host is capped at ~2s.
  const probe = createDb({
    connection: { connectionString: DATABASE_URL, connectionTimeoutMillis: 2000 },
    pool: { min: 0, max: 1 },
    acquireConnectionTimeout: 2000
  })
  let connected = false

  try {
    await probe.raw('select 1')
    connected = true
  } catch (err) {
    connected = false
  } finally {
    try {
      await probe.destroy()
    } catch (err) {
      connected = false
    }
  }

  return connected
}

module.exports = {
  DATABASE_URL,
  createDb,
  canConnect
}
