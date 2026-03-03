const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = 'draft-cartola-secret-key-2024';
const JWT_EXPIRES = '30d';

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, nome: user.nome, nomeTime: user.nome_time || user.nomeTime, isAdmin: user.is_admin === 1 || user.isAdmin === true },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function userPayload(user) {
  return {
    id: user.id,
    username: user.username,
    nome: user.nome,
    nomeTime: user.nome_time || user.nomeTime,
    isAdmin: user.is_admin === 1 || user.isAdmin === true
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nome, telefone, username, nome_time, senha } = req.body;

  if (!nome?.trim() || !telefone?.trim() || !username?.trim() || !nome_time?.trim() || !senha) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username só pode conter letras, números e underscore.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Este username já está em uso.' });
  }

  try {
    // First user registered becomes admin
    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const isAdmin = count === 0 ? 1 : 0;

    const senha_hash = await bcrypt.hash(senha, 10);
    const result = db.prepare(`
      INSERT INTO users (nome, telefone, username, nome_time, senha_hash, created_at, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome.trim(), telefone.trim(), username.trim().toLowerCase(),
      nome_time.trim(), senha_hash, new Date().toISOString(), isAdmin
    );

    const newUser = { id: result.lastInsertRowid, username: username.toLowerCase(), nome: nome.trim(), nome_time: nome_time.trim(), is_admin: isAdmin };
    res.status(201).json({ token: makeToken(newUser), user: userPayload(newUser) });
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, senha } = req.body;

  if (!username?.trim() || !senha) {
    return res.status(400).json({ error: 'Username e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Username ou senha incorretos.' });

  const valid = await bcrypt.compare(senha, user.senha_hash);
  if (!valid) return res.status(401).json({ error: 'Username ou senha incorretos.' });

  res.json({ token: makeToken(user), user: userPayload(user) });
});

// GET /api/auth/me — validate stored token
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Re-fetch from DB so isAdmin reflects any changes made after token was issued
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    res.json({ user: userPayload(user) });
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
});

module.exports = router;
