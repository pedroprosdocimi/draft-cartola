const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'draft.db');
const DATA_DIR = path.dirname(DB_PATH);
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Migrations: add columns that may not exist in older databases
const migrations = [
  'ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'
];
for (const migration of migrations) {
  try { db.exec(migration); } catch { /* column already exists */ }
}

// Seed default users (INSERT OR IGNORE — safe to run on every startup)
const seedHash = bcrypt.hashSync('123456', 10);
const insertSeedUser = db.prepare(`
  INSERT OR IGNORE INTO users (nome, telefone, username, nome_time, senha_hash, created_at, is_admin)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date().toISOString();
insertSeedUser.run('adm',  'adm',  'adm',  'adm',  seedHash, now, 1);
insertSeedUser.run('tela', 'tela', 'tela', 'tela', seedHash, now, 0);
insertSeedUser.run('cel',  'cel',  'cel',  'cel',  seedHash, now, 0);

// If no admin exists, promote the oldest user
const noAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get();
if (noAdmin.count === 0) {
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)').run();
}

module.exports = db;
