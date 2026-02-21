import { pgTable, serial, numeric, integer, timestamp } from 'drizzle-orm/pg-core'

export const calculations = pgTable('calculations', {
  id: serial('id').primaryKey(),
  mrr: numeric('mrr', { precision: 10, scale: 2 }).notNull(),
  arr: numeric('arr', { precision: 10, scale: 2 }).notNull(),
  customers: integer('customers').notNull(),
  arpu: numeric('arpu', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Calculation = typeof calculations.$inferSelect
export type NewCalculation = typeof calculations.$inferInsert
