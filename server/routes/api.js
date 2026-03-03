const express = require('express');
const router = express.Router();
const { getPlayersAndClubs, syncFromAPI } = require('../services/cartola');
const db = require('../db');

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
router.get('/sync/status', (req, res) => {
  try {
    const latestRound = db.prepare('SELECT id, round_number FROM rounds ORDER BY id DESC LIMIT 1').get();
    const rawMatchCount = latestRound
      ? db.prepare('SELECT COUNT(*) as cnt FROM matches WHERE round_id = ?').get(latestRound.id).cnt
      : 0;
    const rawMatchCountAll = db.prepare('SELECT COUNT(*) as cnt FROM matches').get().cnt;
    const matchesByRound = db.prepare('SELECT round_id, COUNT(*) as cnt FROM matches GROUP BY round_id').all();
    const allRounds = db.prepare('SELECT id, round_number FROM rounds ORDER BY id').all();

    const { players, clubMatches } = getPlayersAndClubs();
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

router.get('/players', (req, res) => {
  try {
    const { players, clubs, clubMatches } = getPlayersAndClubs();
    res.json({ players, clubs, clubMatches });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/admin/eligible — list manually added player IDs
router.get('/admin/eligible', (req, res) => {
  const rows = db.prepare('SELECT cartola_id FROM draft_eligible_override').all();
  res.json({ eligible: rows.map(r => r.cartola_id) });
});

// POST /api/admin/eligible/:cartolaId — add player to draft pool
router.post('/admin/eligible/:cartolaId', (req, res) => {
  const cartolaId = parseInt(req.params.cartolaId);
  if (isNaN(cartolaId)) return res.status(400).json({ error: 'cartolaId inválido.' });
  db.prepare('INSERT OR IGNORE INTO draft_eligible_override (cartola_id, added_at) VALUES (?, ?)')
    .run(cartolaId, new Date().toISOString());
  res.json({ ok: true });
});

// DELETE /api/admin/eligible/:cartolaId — remove player from draft pool
router.delete('/admin/eligible/:cartolaId', (req, res) => {
  const cartolaId = parseInt(req.params.cartolaId);
  if (isNaN(cartolaId)) return res.status(400).json({ error: 'cartolaId inválido.' });
  db.prepare('DELETE FROM draft_eligible_override WHERE cartola_id = ?').run(cartolaId);
  res.json({ ok: true });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
