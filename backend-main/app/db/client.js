const { neon } = require('@neondatabase/serverless')
const { drizzle } = require('drizzle-orm/neon-http')
const { gameStateTable } = require('./schema')

function createDbClient(databaseUrl) {
  const sql = neon(databaseUrl)
  return drizzle(sql, { schema: { gameStateTable } })
}

module.exports = { createDbClient }