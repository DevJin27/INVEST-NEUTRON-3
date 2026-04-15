const { pgTable, text, timestamp, jsonb } = require('drizzle-orm/pg-core')

const gameStateTable = pgTable('game_state', {
  id: text('id').primaryKey().default('singleton'),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

module.exports = { gameStateTable }