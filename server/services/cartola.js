const fetch = require('node-fetch');
const { pool } = require('../db');

const BASE_URL = 'https://api.cartolafc.globo.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer': 'https://cartola.globo.com/',
  'Origin': 'https://cartola.globo.com'
};

// ---------------------------------------------------------------------------
// Private: fetch helpers (only used during sync)
// ---------------------------------------------------------------------------

async function fetchPlayers() {
  const res = await fetch(`${BASE_URL}/atletas/mercado`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Cartola API jogadores: ${res.status}`);
  const data = await res.json();
  return data.atletas || [];
}

async function fetchClubs() {
  const res = await fetch(`${BASE_URL}/clubes`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Cartola API clubes: ${res.status}`);
  return res.json();
}

async function fetchMarketStatus() {
  const res = await fetch(`${BASE_URL}/mercado/status`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Cartola API status: ${res.status}`);
  return res.json();
}

async function fetchMatchesRaw(rodada) {
  try {
    const res = await fetch(`${BASE_URL}/partidas/${rodada}`, { headers: HEADERS });
    if (!res.ok) return { partidas: [] };
    return res.json();
  } catch {
    return { partidas: [] };
  }
}

async function fetchPontuados(rodada, fallbackToCurrent = false) {
  try {
    const res = await fetch(`${BASE_URL}/atletas/pontuados/${rodada}`, { headers: HEADERS });
    if (res.ok) return await res.json();
  } catch { /* ignore */ }
  if (fallbackToCurrent) {
    try {
      const res = await fetch(`${BASE_URL}/atletas/pontuados`, { headers: HEADERS });
      if (res.ok) return await res.json();
    } catch { /* ignore */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public: syncFromAPI — call once per week to refresh local DB
// ---------------------------------------------------------------------------

async function syncFromAPI() {
  const [rawPlayers, rawClubs, marketStatus] = await Promise.all([
    fetchPlayers(),
    fetchClubs(),
    fetchMarketStatus()
  ]);

  const roundNumber = marketStatus.rodada_atual || 0;
  const matchesData = await fetchMatchesRaw(roundNumber);
  console.log(`[sync] Rodada ${roundNumber}: ${(matchesData.partidas || []).length} partidas encontradas na API`);
  const now = new Date().toISOString();

  // Upsert round — delete duplicates first, keep the oldest id for this round_number
  const existingRounds = (await pool.query(
    'SELECT id FROM rounds WHERE round_number = $1 ORDER BY id ASC',
    [roundNumber]
  )).rows;

  let roundId;
  if (existingRounds.length === 0) {
    const r = await pool.query(
      'INSERT INTO rounds (round_number, fetched_at) VALUES ($1, $2) RETURNING id',
      [roundNumber, now]
    );
    roundId = Number(r.rows[0].id);
  } else {
    roundId = Number(existingRounds[0].id);
    await pool.query('UPDATE rounds SET fetched_at = $1 WHERE id = $2', [now, roundId]);
    // Remove duplicate round rows and their orphaned data
    const duplicateIds = existingRounds.slice(1).map(r => r.id);
    for (const dupId of duplicateIds) {
      await pool.query('DELETE FROM player_round_data WHERE round_id = $1', [dupId]);
      await pool.query('DELETE FROM matches WHERE round_id = $1', [dupId]);
      await pool.query('DELETE FROM rounds WHERE id = $1', [dupId]);
    }
  }

  // Save clubs
  const clubSample = Object.entries(rawClubs).slice(0, 2);
  console.log('[sync clubs sample]', clubSample.map(([id, c]) => ({ id, nome: c.nome, abreviacao: c.abreviacao, keys: Object.keys(c) })));
  for (const [id, club] of Object.entries(rawClubs)) {
    const fullName = club.nome_completo || club.nome || club.abreviacao;
    await pool.query(
      `INSERT INTO clubs (id, name, abbreviation, shield_url) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation, shield_url = EXCLUDED.shield_url`,
      [parseInt(id), fullName, club.abreviacao, club.escudo_url || club.escudos?.['45x45'] || '']
    );
  }

  // Save players (insert new, update existing)
  for (const p of rawPlayers) {
    const photoUrl = p.foto ? p.foto.replace('FORMATO', '220x220') : null;
    await pool.query(
      'INSERT INTO players (cartola_id, nickname, name, photo_url) VALUES ($1, $2, $3, $4) ON CONFLICT (cartola_id) DO NOTHING',
      [p.atleta_id, p.apelido, p.nome, photoUrl]
    );
    await pool.query(
      'UPDATE players SET nickname = $1, name = $2, photo_url = $3 WHERE cartola_id = $4',
      [p.apelido, p.nome, photoUrl, p.atleta_id]
    );
    await pool.query(
      `INSERT INTO player_round_data (player_id, round_id, position_id, club_id, price, average_score, status_id)
       VALUES ((SELECT id FROM players WHERE cartola_id = $1), $2, $3, $4, $5, $6, $7)
       ON CONFLICT (player_id, round_id) DO UPDATE SET
         position_id = EXCLUDED.position_id, club_id = EXCLUDED.club_id,
         price = EXCLUDED.price, average_score = EXCLUDED.average_score, status_id = EXCLUDED.status_id`,
      [p.atleta_id, roundId, p.posicao_id, p.clube_id, p.preco_num || 0, p.media_num || 0, p.status_id]
    );
  }

  // Save matches (replace all for this round)
  await pool.query('DELETE FROM matches WHERE round_id = $1', [roundId]);
  for (const partida of (matchesData.partidas || [])) {
    await pool.query(
      'INSERT INTO matches (round_id, home_club_id, away_club_id, match_date, valid) VALUES ($1, $2, $3, $4, $5)',
      [roundId, partida.clube_casa_id, partida.clube_visitante_id, partida.partida_data || null, partida.valida ? 1 : 0]
    );
  }

  // Save scout totals from mercado (season totals, keyed by current round number)
  let totalScoutEntries = 0;
  for (const p of rawPlayers) {
    if (!p.scout || Object.keys(p.scout).length === 0) continue;
    await pool.query(
      `INSERT INTO player_scouts (player_id, round_number, scout_data, pontuacao)
       VALUES ((SELECT id FROM players WHERE cartola_id = $1), $2, $3, $4)
       ON CONFLICT (player_id, round_number) DO UPDATE SET scout_data = EXCLUDED.scout_data, pontuacao = EXCLUDED.pontuacao`,
      [p.atleta_id, roundNumber, JSON.stringify(p.scout), p.pontos_num || 0]
    );
    totalScoutEntries++;
  }
  console.log(`[sync] ${totalScoutEntries} scouts de temporada salvos`);

  const stats = {
    roundNumber,
    playerCount: rawPlayers.length,
    clubCount: Object.keys(rawClubs).length,
    matchCount: (matchesData.partidas || []).length,
    scoutEntries: totalScoutEntries,
    syncedAt: now
  };
  console.log(`[sync] Rodada ${roundNumber}: ${stats.playerCount} jogadores, ${stats.clubCount} clubes, ${stats.matchCount} partidas, ${stats.scoutEntries} scouts`);
  return stats;
}

// ---------------------------------------------------------------------------
// Public: getPlayersAndClubs — reads from local DB (never hits the API)
// ---------------------------------------------------------------------------

async function getPlayersAndClubs() {
  // Find the round that actually has player data (guards against orphaned round rows)
  const latestRound = (await pool.query(`
    SELECT r.id, r.round_number FROM rounds r
    WHERE EXISTS (SELECT 1 FROM player_round_data prd WHERE prd.round_id = r.id)
    ORDER BY r.id DESC LIMIT 1
  `)).rows[0];

  if (!latestRound) {
    throw new Error('Banco local vazio. Execute POST /api/sync para sincronizar os dados do Cartola.');
  }

  // Load clubs
  const clubs = {};
  for (const c of (await pool.query('SELECT id, name, abbreviation, shield_url FROM clubs')).rows) {
    clubs[c.id] = { id: c.id, name: c.name, abbreviation: c.abbreviation, shield: c.shield_url };
    clubs[String(c.id)] = clubs[c.id];
  }

  // Build clubMatches map from DB
  const clubMatches = {};
  for (const m of (await pool.query(
    'SELECT home_club_id, away_club_id FROM matches WHERE round_id = $1',
    [latestRound.id]
  )).rows) {
    const matchStr = `${clubs[m.home_club_id]?.abbreviation || m.home_club_id} x ${clubs[m.away_club_id]?.abbreviation || m.away_club_id}`;
    clubMatches[m.home_club_id] = matchStr;
    clubMatches[m.away_club_id] = matchStr;
  }

  // Load latest scout snapshot per player (season totals from mercado)
  const scoutRows = (await pool.query(`
    SELECT p.cartola_id, ps.scout_data, ps.round_number
    FROM player_scouts ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.round_number = (
      SELECT MAX(ps2.round_number) FROM player_scouts ps2 WHERE ps2.player_id = ps.player_id
    )
  `)).rows;

  const scoutMap = {};
  for (const row of scoutRows) {
    try {
      const scouts = JSON.parse(row.scout_data);
      const stats = {};
      for (const [k, v] of Object.entries(scouts)) {
        if (v > 0) stats[k] = v;
      }
      if (Object.keys(stats).length > 0) {
        scoutMap[row.cartola_id] = { stats };
      }
    } catch { /* malformed JSON, skip */ }
  }

  // Load players with latest round data
  const players = (await pool.query(`
    SELECT p.cartola_id, p.nickname, p.name, p.photo_url,
           prd.position_id, prd.club_id, prd.price, prd.average_score, prd.status_id
    FROM players p
    JOIN player_round_data prd ON p.id = prd.player_id
    WHERE prd.round_id = $1
  `, [latestRound.id])).rows.map(r => ({
    cartola_id: r.cartola_id,
    nickname: r.nickname,
    name: r.name,
    position_id: r.position_id,
    club_id: r.club_id,
    price: r.price,
    average_score: r.average_score,
    status_id: r.status_id,
    photo: r.photo_url,
    club: clubs[r.club_id] || null,
    scouts: scoutMap[r.cartola_id] || null
  }));

  if (players.length === 0) {
    throw new Error('Nenhum jogador no banco. Execute POST /api/sync para sincronizar.');
  }

  console.log(`[cartola] Rodada ${latestRound.round_number}: ${players.length} jogadores carregados do banco local`);
  return { players, clubs, clubMatches };
}

module.exports = { getPlayersAndClubs, syncFromAPI };
