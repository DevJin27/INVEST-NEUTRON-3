const { createError } = require('../core/errors')
const { createDbClient } = require('../db/client')
const { gameStateTable } = require('../db/schema')
const { eq } = require('drizzle-orm')
const { neon } = require('@neondatabase/serverless')

const LOCK_RETRY_MS = 30
const LOCK_TIMEOUT_MS = 2000

class NeonStateStore {
  constructor(options) {
    this.logger = options.logger
    this.databaseUrl = options.databaseUrl
    this.db = null
    this.sql = null
  }

  async connect() {
    this.db = createDbClient(this.databaseUrl)
    this.sql = neon(this.databaseUrl)
  }

  async disconnect() {
    // Neon HTTP client doesn't require explicit cleanup
    this.db = null
    this.sql = null
  }

  async initialize(initialState) {
    if (!this.db) {
      throw createError('INTERNAL_ERROR', { reason: 'Database not connected' })
    }

    // Insert only if not exists (NX semantics)
    try {
      await this.db.insert(gameStateTable).values({
        id: 'singleton',
        state: initialState,
      }).onConflictDoNothing()
    } catch (error) {
      // If the row already exists, that's fine
      if (error.code !== '23505') { // unique_violation
        throw error
      }
    }
  }

  async getState() {
    if (!this.db) {
      throw createError('INTERNAL_ERROR', { reason: 'Database not connected' })
    }

    const rows = await this.db.select().from(gameStateTable).where(eq(gameStateTable.id, 'singleton'))
    return rows.length > 0 ? rows[0].state : null
  }

  async setState(state) {
    if (!this.db) {
      throw createError('INTERNAL_ERROR', { reason: 'Database not connected' })
    }

    await this.db.insert(gameStateTable).values({
      id: 'singleton',
      state: state,
    }).onConflictDoUpdate({
      target: gameStateTable.id,
      set: { state: state },
    })

    return state
  }

  async withLock(handler) {
    if (!this.db || !this.sql) {
      throw createError('INTERNAL_ERROR', { reason: 'Database not connected' })
    }

    const startTime = Date.now()

    while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
      try {
        // Try to acquire advisory lock using raw SQL client
        const lockResult = await this.sql`SELECT pg_try_advisory_lock(hashtext('game_state')) AS acquired`
        
        const acquired = lockResult?.[0]?.acquired ?? false

        if (!acquired) {
          // Lock not acquired, retry
          await this._sleep(LOCK_RETRY_MS)
          continue
        }

        try {
          // We have the lock, execute the handler
          const value = await handler()
          return value
        } finally {
          // Always release the lock
          try {
            await this.sql`SELECT pg_advisory_unlock(hashtext('game_state'))`
          } catch (error) {
            this.logger?.warn?.({ error }, 'Failed to release advisory lock')
          }
        }
      } catch (error) {
        // If lock acquisition or handler failed, log and retry
        this.logger?.error?.({ error }, 'Error in withLock operation')
        
        // If we're out of time, throw the error
        if (Date.now() - startTime >= LOCK_TIMEOUT_MS) {
          throw error
        }
      }

      await this._sleep(LOCK_RETRY_MS)
    }

    throw createError('INTERNAL_ERROR', { reason: 'Failed to acquire lock within timeout' })
  }

  hasRedisAdapterClients() {
    return false
  }

  getRedisAdapterClients() {
    return null
  }

  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

module.exports = { NeonStateStore }