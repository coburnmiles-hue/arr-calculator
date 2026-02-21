import { pgTable, serial, numeric, integer, timestamp, text, jsonb } from 'drizzle-orm/pg-core'

export const statements = pgTable('statements', {
  id: serial('id').primaryKey(),
  restaurantName: text('restaurant_name'),
  monthlyVolume: numeric('monthly_volume', { precision: 12, scale: 2 }),
  totalInterchange: numeric('total_interchange', { precision: 10, scale: 2 }),
  cardBreakdown: jsonb('card_breakdown'), // {visa: {volume, interchange}, mastercard: {...}, etc}
  imageUrl: text('image_url'),
  extractedData: jsonb('extracted_data'), // Raw AI extraction
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pricingScenarios = pgTable('pricing_scenarios', {
  id: serial('id').primaryKey(),
  statementId: integer('statement_id').references(() => statements.id),
  pricingModel: text('pricing_model').notNull(), // 'interchange_plus', 'flat', 'tiered', 'dual_pricing'
  rates: jsonb('rates').notNull(), // Model-specific rates
  monthlyProfit: numeric('monthly_profit', { precision: 10, scale: 2 }),
  arr: numeric('arr', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Statement = typeof statements.$inferSelect
export type NewStatement = typeof statements.$inferInsert
export type PricingScenario = typeof pricingScenarios.$inferSelect
export type NewPricingScenario = typeof pricingScenarios.$inferInsert
