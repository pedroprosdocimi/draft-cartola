const express = require('express');
const router = express.Router();
const { getPlayersAndClubs, syncFromAPI } = require('../services/cartola');
const { pool } = require('../db');

// Sync all data from Cartola API into local DB.
// Call this once per week (e.g.: curl -X POST http://localhost:3001/api/sync)
router.post('/sync', async (req, res) => {
  try {
    const stats = await syncFromAPI();
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('[sync] erro:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Check what's in the local DB without hitting the API
router.get('/sync/status', async (req, res) => {
  try {
    const latestRound = (await pool.query('SELECT id, round_number FROM rounds ORDER BY id DESC LIMIT 1')).rows[0];
    const rawMatchCount = latestRound
      ? (await pool.query('SELECT COUNT(*) as cnt FROM matches WHERE round_id = $1', [latestRound.id])).rows[0].cnt
      : 0;
    const rawMatchCountAll = (await pool.query('SELECT COUNT(*) as cnt FROM matches')).rows[0].cnt;
    const matchesByRound = (await pool.query('SELECT round_id, COUNT(*) as cnt FROM matches GROUP BY round_id')).rows;
    const allRounds = (await pool.query('SELECT id, round_number FROM rounds ORDER BY id')).rows;

    const { players, clubMatches } = await getPlayersAndClubs();
    const matches = Object.values(clubMatches).filter((v, i, a) => a.indexOf(v) === i);
    res.json({
      ok: true,
      playerCount: players.length,
      probableCount: players.filter(p => p.status_id === 7).length,
      matchCount: matches.length,
      matches,
      debug: {
        latestRoundId: latestRound?.id,
        latestRoundNumber: latestRound?.round_number,
        rawMatchesForRound: rawMatchCount,
        rawMatchesTotal: rawMatchCountAll,
        matchesByRound,
        allRounds
      }
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

router.get('/players', async (req, res) => {
  try {
    const { players, clubs, clubMatches } = await getPlayersAndClubs();
    res.json({ players, clubs, clubMatches });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/admin/eligible — list manually added player IDs
router.get('/admin/eligible', async (req, res) => {
  try {
    const rows = (await pool.query('SELECT cartola_id FROM draft_eligible_override')).rows;
    res.json({ eligible: rows.map(r => r.cartola_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/eligible/:cartolaId — add player to draft pool
router.post('/admin/eligible/:cartolaId', async (req, res) => {
  const cartolaId = parseInt(req.params.cartolaId);
  if (isNaN(cartolaId)) return res.status(400).json({ error: 'cartolaId inválido.' });
  try {
    await pool.query(
      'INSERT INTO draft_eligible_override (cartola_id, added_at) VALUES ($1, $2) ON CONFLICT (cartola_id) DO NOTHING',
      [cartolaId, new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/eligible/:cartolaId — remove player from draft pool
router.delete('/admin/eligible/:cartolaId', async (req, res) => {
  const cartolaId = parseInt(req.params.cartolaId);
  if (isNaN(cartolaId)) return res.status(400).json({ error: 'cartolaId inválido.' });
  try {
    await pool.query('DELETE FROM draft_eligible_override WHERE cartola_id = $1', [cartolaId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
