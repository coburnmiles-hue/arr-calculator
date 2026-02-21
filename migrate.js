require('dotenv').config({ path: '.env' });
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  
  console.log('Creating tables...');
  
  // Drop old table if exists
  await sql`DROP TABLE IF EXISTS calculations`;
  
  // Create statements table
  await sql`
    CREATE TABLE IF NOT EXISTS statements (
      id SERIAL PRIMARY KEY,
      restaurant_name TEXT,
      monthly_volume NUMERIC(12, 2),
      total_interchange NUMERIC(10, 2),
      card_breakdown JSONB,
      image_url TEXT,
      extracted_data JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;
  
  // Create pricing scenarios table
  await sql`
    CREATE TABLE IF NOT EXISTS pricing_scenarios (
      id SERIAL PRIMARY KEY,
      statement_id INTEGER REFERENCES statements(id),
      pricing_model TEXT NOT NULL,
      rates JSONB NOT NULL,
      monthly_profit NUMERIC(10, 2),
      arr NUMERIC(12, 2),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;
  
  console.log('✅ Tables created successfully!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
