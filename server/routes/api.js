const express = require('express');
const router = express.Router();
const { getPlayersAndClubs, syncFromAPI, syncRoundScores } = require('../services/cartola');
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

// POST /api/sync/scores — sync current round scores from /atletas/pontuados
// Call this during/after each round to know who played and their score.
router.post('/sync/scores', async (req, res) => {
  try {
    const stats = await syncRoundScores();
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('[sync/scores] erro:', err.message);
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

// GET /api/drafts/active — active drafts the current user participates in
router.get('/drafts/active', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado.' });

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'draft-cartola-secret-key-2024';
  let user;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    user = (await pool.query('SELECT * FROM users WHERE id = $1', [payload.id])).rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const nomeTime = user.nome_time;
  const rows = (await pool.query(
    `SELECT ds.id AS room_code, ds.status, ds.created_at,
            dp.id AS participant_id,
            (SELECT COUNT(*) FROM draft_participants WHERE session_id = ds.id) AS participant_count
     FROM draft_sessions ds
     JOIN draft_participants dp ON dp.session_id = ds.id AND dp.name = $1
     WHERE ds.status != 'complete'
     ORDER BY ds.created_at DESC`,
    [nomeTime]
  )).rows;

  res.json({ drafts: rows });
});

// GET /api/drafts/history — completed drafts the current user participated in
router.get('/drafts/history', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado.' });

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'draft-cartola-secret-key-2024';
  let user;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    user = (await pool.query('SELECT * FROM users WHERE id = $1', [payload.id])).rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const nomeTime = user.nome_time;
  const rows = (await pool.query(
    `SELECT ds.id AS room_code, ds.status, ds.created_at, ds.completed_at,
            dp.id AS participant_id, dp.captain_cartola_id,
            (SELECT COUNT(*) FROM draft_participants WHERE session_id = ds.id) AS participant_count,
            (SELECT STRING_AGG(name, ', ' ORDER BY pick_order) FROM draft_participants WHERE session_id = ds.id) AS participants_names
     FROM draft_sessions ds
     JOIN draft_participants dp ON dp.session_id = ds.id AND dp.name = $1
     WHERE ds.status = 'complete'
     ORDER BY ds.completed_at DESC
     LIMIT 20`,
    [nomeTime]
  )).rows;

  res.json({ drafts: rows });
});

// GET /api/drafts/history/:roomCode — full detail of a completed draft with current round scores
router.get('/drafts/history/:roomCode', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado.' });

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'draft-cartola-secret-key-2024';
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const { roomCode } = req.params;

  const session = (await pool.query(
    'SELECT * FROM draft_sessions WHERE id = $1',
    [roomCode]
  )).rows[0];
  if (!session) return res.status(404).json({ error: 'Draft não encontrado.' });

  const participants = (await pool.query(
    'SELECT * FROM draft_participants WHERE session_id = $1 ORDER BY pick_order ASC NULLS LAST',
    [roomCode]
  )).rows;

  const latestRound = (await pool.query(
    `SELECT round_number FROM round_scores
     GROUP BY round_number ORDER BY round_number DESC LIMIT 1`
  )).rows[0];

  const picks = (await pool.query(`
    SELECT dp.participant_id, dp.cartola_id, dp.position_id AS slot_pos, dp.overall_pick,
           p.nickname, p.photo_url,
           prd.position_id AS real_pos, prd.club_id, prd.average_score, prd.status_id,
           c.abbreviation AS club_abbreviation,
           rs.score AS round_score,
           CASE WHEN rs.cartola_id IS NOT NULL THEN true ELSE false END AS played
    FROM draft_picks dp
    JOIN players p ON p.cartola_id = dp.cartola_id
    LEFT JOIN player_round_data prd ON prd.player_id = p.id
      AND prd.round_id = (SELECT id FROM rounds ORDER BY id DESC LIMIT 1)
    LEFT JOIN clubs c ON c.id = prd.club_id
    LEFT JOIN round_scores rs ON rs.cartola_id = dp.cartola_id
      AND rs.round_number = $2
    WHERE dp.session_id = $1
    ORDER BY dp.overall_pick ASC
  `, [roomCode, latestRound?.round_number || 0])).rows;

  const teams = participants.map(p => ({
    id: p.id,
    name: p.name,
    formation: p.formation,
    pickOrder: p.pick_order,
    captainId: p.captain_cartola_id || null,
    picks: picks
      .filter(pick => pick.participant_id === p.id)
      .map(pick => ({
        cartola_id: pick.cartola_id,
        nickname: pick.nickname,
        photo: pick.photo_url,
        position_id: pick.slot_pos ?? pick.real_pos,
        club_id: pick.club_id,
        average_score: pick.average_score,
        round_score: pick.played ? (pick.round_score ?? 0) : null,
        played: pick.played,
        status_id: pick.status_id,
        club: pick.club_id ? { abbreviation: pick.club_abbreviation } : null,
      }))
  }));

  res.json({
    roomCode,
    status: session.status,
    completedAt: session.completed_at,
    roundNumber: latestRound?.round_number || null,
    teams,
  });
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

// GET /api/admin/drafts — list all draft sessions with participant count
router.get('/admin/drafts', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ds.id,
        ds.status,
        ds.created_at,
        ds.completed_at,
        COUNT(dp.id)::int AS participant_count
      FROM draft_sessions ds
      LEFT JOIN draft_participants dp ON dp.session_id = ds.id
      GROUP BY ds.id
      ORDER BY ds.created_at DESC
    `);
    res.json({ drafts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/drafts/:id — full draft detail
router.get('/admin/drafts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const sessionRes = await pool.query('SELECT * FROM draft_sessions WHERE id = $1', [id]);
    if (!sessionRes.rows.length) return res.status(404).json({ error: 'Draft não encontrado' });

    const participantsRes = await pool.query(
      'SELECT id, name, formation, pick_order FROM draft_participants WHERE session_id = $1 ORDER BY pick_order',
      [id]
    );

    const picksRes = await pool.query(`
      SELECT
        dp.overall_pick,
        dp.participant_id,
        dp.cartola_id,
        dp.position_id,
        dp.picked_at,
        dp.options_json,
        p.nickname,
        p.photo_url,
        latest.average_score,
        latest.price,
        latest.club_id,
        c.abbreviation AS club_abbreviation
      FROM draft_picks dp
      LEFT JOIN players p ON p.cartola_id = dp.cartola_id
      LEFT JOIN LATERAL (
        SELECT average_score, price, club_id
        FROM player_round_data
        WHERE player_id = p.id
        ORDER BY round_id DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN clubs c ON c.id = latest.club_id
      WHERE dp.session_id = $1
      ORDER BY dp.overall_pick
    `, [id]);

    const picks = picksRes.rows.map(r => ({
      ...r,
      options: r.options_json ? JSON.parse(r.options_json) : null,
    }));

    res.json({
      session: sessionRes.rows[0],
      participants: participantsRes.rows,
      picks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
