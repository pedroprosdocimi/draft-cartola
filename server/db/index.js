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
