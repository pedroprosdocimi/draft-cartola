const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Migrations for existing databases
  const migrations = [
    `ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS admin_id TEXT`,
    `ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'lobby'`,
    `ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS draft_order TEXT`,
    `ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS current_pick_index INTEGER DEFAULT 0`,
    `ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS pick_number INTEGER DEFAULT 0`,
    `ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS position_id INTEGER`,
    `ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS options_json TEXT`,
    `ALTER TABLE draft_participants ADD COLUMN IF NOT EXISTS captain_cartola_id INTEGER`,
    `CREATE TABLE IF NOT EXISTS round_scores (
      id SERIAL PRIMARY KEY,
      cartola_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      scout_data TEXT,
      fetched_at TEXT,
      UNIQUE(cartola_id, round_number)
    )`,
    `ALTER TABLE round_scores ADD COLUMN IF NOT EXISTS scout_data TEXT`,
    `ALTER TABLE round_scores ADD COLUMN IF NOT EXISTS fetched_at TEXT`,
  ];
  for (const m of migrations) {
    try { await pool.query(m); } catch { /* column already exists */ }
  }

  // Seed default users
  const hash = bcrypt.hashSync('123456', 10);
  const now = new Date().toISOString();
  for (const [nome, telefone, username, nome_time, isAdmin] of [
    ['adm', 'adm', 'adm', 'adm', true],
    ['tela', 'tela', 'tela', 'tela', false],
    ['cel', 'cel', 'cel', 'cel', false],
  ]) {
    await pool.query(
      `INSERT INTO users (nome, telefone, username, nome_time, senha_hash, created_at, is_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (username) DO NOTHING`,
      [nome, telefone, username, nome_time, hash, now, isAdmin]
    );
  }

  // Promote oldest user to admin if none exists
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = true');
  if (parseInt(rows[0].count) === 0) {
    await pool.query('UPDATE users SET is_admin = true WHERE id = (SELECT MIN(id) FROM users)');
  }

  console.log('[db] PostgreSQL conectado e schema aplicado');
}

module.exports = { pool, initDb };
