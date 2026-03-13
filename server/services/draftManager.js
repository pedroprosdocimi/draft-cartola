const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const FORMATIONS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 }
};

const BENCH_SLOTS = {
  21: { label: 'DEF RES', fullLabel: 'Defensor Reserva', allowedPositions: [2, 3] },
  22: { label: 'MEI RES', fullLabel: 'Meia Reserva',     allowedPositions: [4] },
  23: { label: 'ATA RES', fullLabel: 'Atacante Reserva', allowedPositions: [5] },
};
const BENCH_SLOT_IDS = [21, 22, 23];

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const SPECTATOR_ADMIN_ID = 'SPECTATOR';

async function createRoom(participantName, socketId, entryFee = 0, spectate = false) {
  const roomCode = generateRoomCode();
  const fee = Math.max(0, parseInt(entryFee) || 0);

  let participantId;
  let participantsMap;

  if (spectate) {
    participantId = SPECTATOR_ADMIN_ID;
    participantsMap = new Map();
  } else {
    participantId = uuidv4();
    participantsMap = new Map([[participantId, {
      id: participantId,
      name: participantName,
      socketId,
      formation: null,
      picks: []
    }]]);
  }

  const room = {
    code: roomCode,
    status: 'lobby',
    adminId: participantId,
    adminSocketId: socketId,
    entry_fee: fee,
    participants: participantsMap,
    players: null,
    allPlayers: null,
    benchPlayers: null,
    clubs: null,
    clubMatches: {},
    pickedIds: new Set(),
    draftOrder: [],
    currentPickIndex: 0,
    timer: null,
    pickNumber: 0,
    currentOptions: null,
    currentPickerPositionId: null,
    parallelPhase: null,
    parallelQueue: [],
  };

  rooms.set(roomCode, room);

  await pool.query(
    `INSERT INTO draft_sessions (id, admin_id, created_at, status, entry_fee) VALUES ($1, $2, $3, 'lobby', $4)`,
    [roomCode, participantId, new Date().toISOString(), fee]
  );

  if (!spectate) {
    await pool.query(
      `INSERT INTO draft_participants (id, session_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [participantId, roomCode, participantName]
    );
  }

  return { roomCode, participantId };
}

async function joinRoom(roomCode, participantName, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status === 'complete') return { error: 'Este draft já foi concluído.' };
  // Allow joining mid-draft only in parallel mode
  if (room.status !== 'lobby' && room.mode !== 'parallel') return { error: 'Draft já iniciado.' };

  const participantId = uuidv4();
  room.participants.set(participantId, {
    id: participantId,
    name: participantName,
    socketId,
    formation: null,
    picks: []
  });

  await pool.query(
    `INSERT INTO draft_participants (id, session_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [participantId, roomCode, participantName]
  );

  return { participantId };
}

async function setFormation(roomCode, participantId, formation) {
  if (!FORMATIONS[formation]) return { error: 'Formação inválida.' };
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  const participant = room.participants.get(participantId);
  if (!participant) return { error: 'Participante não encontrado.' };
  participant.formation = formation;

  await pool.query(
    `UPDATE draft_participants SET formation = $1 WHERE id = $2`,
    [formation, participantId]
  );

  return { ok: true };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getCurrentPicker(room) {
  if (room.currentPickIndex >= room.draftOrder.length) return null;
  return room.draftOrder[room.currentPickIndex];
}

function getNeededPositions(participant) {
  const formation = FORMATIONS[participant.formation];
  if (!formation) return [];

  const mainPicks = participant.picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  const counts = {};
  for (const p of mainPicks) {
    counts[p.position_id] = (counts[p.position_id] || 0) + 1;
  }

  const needed = [];
  for (const [posId, required] of Object.entries(formation)) {
    const have = counts[parseInt(posId)] || 0;
    if (have < required) {
      needed.push({ posId: parseInt(posId), remaining: required - have });
    }
  }
  return needed;
}

function getBenchNeededSlots(participant) {
  const filledSlots = new Set(
    participant.picks
      .filter(p => BENCH_SLOT_IDS.includes(p.position_id))
      .map(p => p.position_id)
  );
  return BENCH_SLOT_IDS.filter(id => !filledSlots.has(id));
}

function buildParallelOrder(participantIds, formations) {
  const order = [];
  for (const id of participantIds) {
    const f = formations[id];
    const total = f ? Object.values(FORMATIONS[f]).reduce((a, b) => a + b, 0) : 11;
    for (let i = 0; i < total; i++) order.push(id);
  }
  return order;
}

function buildDraftOrder(participantIds, formations) {
  const maxRounds = Math.max(...participantIds.map(id => {
    const f = formations[id];
    return f ? Object.values(FORMATIONS[f]).reduce((a, b) => a + b, 0) : 12;
  }));

  const order = [];
  for (let round = 0; round < maxRounds; round++) {
    const roundParticipants = round % 2 === 0 ? [...participantIds] : [...participantIds].reverse();
    order.push(...roundParticipants);
  }
  return order;
}

function buildSnakeOrder(participantIds, rounds) {
  const order = [];
  for (let r = 0; r < rounds; r++) {
    const row = r % 2 === 0 ? [...participantIds] : [...participantIds].reverse();
    order.push(...row);
  }
  return order;
}

// ── draft start ───────────────────────────────────────────────────────────────

async function startDraft(roomCode, players, clubs, clubMatches, mode = 'realtime') {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'lobby') return { error: 'Draft já iniciado.' };
  if (room.participants.size < 1) return { error: 'Mínimo 1 participante.' };

  for (const [, p] of room.participants) {
    if (!p.formation) return { error: `${p.name} ainda não escolheu formação.` };
  }

  const overrideRows = (await pool.query('SELECT cartola_id FROM draft_eligible_override')).rows;
  const overrideIds = new Set(overrideRows.map(r => r.cartola_id));
  const probablePlayers = players.filter(p => p.status_id === 7 || overrideIds.has(p.cartola_id));

  room.allPlayers = players;
  room.players = probablePlayers.length > 0 ? probablePlayers : players;
  room.clubs = clubs;
  room.clubMatches = clubMatches || {};
  room.status = mode === 'parallel' ? 'parallel_waiting' : 'drafting';
  room.mode = mode;
  room.parallelPhase = mode === 'parallel' ? 'main' : null;
  room.parallelQueue = [];

  // Shuffle participants for pick order
  const participantIds = [...room.participants.keys()];
  for (let i = participantIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participantIds[i], participantIds[j]] = [participantIds[j], participantIds[i]];
  }

  participantIds.forEach((id, index) => {
    room.participants.get(id).pickOrder = index;
  });

  const formations = Object.fromEntries([...room.participants.entries()].map(([id, p]) => [id, p.formation]));
  if (mode === 'parallel') {
    // Only queue first player's main picks — each player does all phases before the next starts
    room.draftOrder = buildParallelOrder([participantIds[0]], formations);
  } else {
    room.draftOrder = buildDraftOrder(participantIds, formations);
  }
  room.currentPickIndex = 0;
  room.pickNumber = 0;

  // Persist draft start
  await pool.query(
    `UPDATE draft_sessions SET status = $3, draft_order = $1, current_pick_index = 0, pick_number = 0, mode = $4, parallel_phase = $5 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), roomCode, room.status, mode, room.parallelPhase]
  );
  for (const [id, p] of room.participants) {
    await pool.query(
      `UPDATE draft_participants SET pick_order = $1, formation = $2 WHERE id = $3`,
      [p.pickOrder, p.formation, id]
    );
  }

  return { ok: true };
}

// ── parallel per-player phase helpers ─────────────────────────────────────────

// Immediately transitions the current drafter to bench phase (no lobby wait).
async function startBenchDraftForPlayer(room, participant, io) {
  room.benchPlayers = (room.allPlayers || []).filter(
    p => p.status_id !== 7 && !room.pickedIds.has(p.cartola_id)
  );
  room.draftOrder = [participant.id, participant.id, participant.id];
  room.currentPickIndex = 0;
  room.status = 'bench_drafting';
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  await pool.query(
    `UPDATE draft_sessions SET status = 'bench_drafting', draft_order = $1, current_pick_index = 0 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), room.code]
  );

  const drafterSocket = participant.socketId;
  if (drafterSocket) {
    io.to(drafterSocket).emit('bench_draft_started', {
      benchPlayers: room.benchPlayers,
      draftOrder: room.draftOrder,
      currentPickerId: participant.id,
    });
    io.to(room.code).except(drafterSocket).emit('room_state', getRoomState(room));
  } else {
    io.to(room.code).emit('room_state', getRoomState(room));
  }
  startTimer(room, io);
  console.log(`[draft] parallel bench → ${participant.name} in ${room.code}`);
}

// Immediately transitions the current drafter to captain phase (no lobby wait).
async function startCaptainDraftForPlayer(room, participant, io) {
  const captainOptions = getStarterOptions(participant);
  room.currentOptions = captainOptions;
  room.currentPickerPositionId = null;
  room.draftOrder = [participant.id];
  room.currentPickIndex = 0;
  room.status = 'captain_drafting';

  await pool.query(
    `UPDATE draft_sessions SET status = 'captain_drafting', draft_order = $1, current_pick_index = 0 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), room.code]
  );

  const drafterSocket = participant.socketId;
  if (drafterSocket) {
    io.to(drafterSocket).emit('captain_draft_started', {
      currentPickerId: participant.id,
      options: captainOptions,
    });
    io.to(room.code).except(drafterSocket).emit('room_state', getRoomState(room));
  } else {
    io.to(room.code).emit('room_state', getRoomState(room));
  }
  startTimer(room, io);
  console.log(`[draft] parallel captain → ${participant.name} in ${room.code}`);
}

// ── captain draft ─────────────────────────────────────────────────────────────

function getStarterOptions(participant) {
  const starters = participant.picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  const shuffled = [...starters].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

async function startMyTurn(roomCode, participantId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.mode !== 'parallel') return { error: 'Não é modo paralelo.' };

  const participant = room.participants.get(participantId);
  if (!participant) return { error: 'Participante não encontrado.' };
  if (participant.captainId) return { error: 'Você já completou seu draft.' };

  // Block if someone is currently drafting
  if (room.status !== 'parallel_waiting') {
    const currentDrafterId = room.parallelQueue[0];
    const drafterName = room.participants.get(currentDrafterId)?.name || 'alguém';
    return { error: `${drafterName} está draftando agora. Aguarde terminar.` };
  }

  // Free — start immediately
  room.parallelQueue = [participantId];
  const formations = { [participantId]: participant.formation };
  room.draftOrder = buildParallelOrder([participantId], formations);
  room.currentPickIndex = 0;
  room.status = 'drafting';
  room.currentOptions = null;
  await pool.query(
    `UPDATE draft_sessions SET status = 'drafting', draft_order = $1, current_pick_index = 0 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), roomCode]
  );
  return { ok: true, queued: false, phase: 'main' };
}

async function startCaptainDraft(room, io) {
  // Realtime mode only — parallel mode uses startCaptainDraftForPlayer instead
  const participantIds = [...room.participants.keys()].sort(
    (a, b) => (room.participants.get(a).pickOrder || 0) - (room.participants.get(b).pickOrder || 0)
  );

  room.draftOrder = participantIds;
  room.currentPickIndex = 0;

  room.status = 'captain_drafting';
  await pool.query(
    `UPDATE draft_sessions SET status = 'captain_drafting', draft_order = $1, current_pick_index = 0 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), room.code]
  );

  const firstPickerId = room.draftOrder[0];
  const options = getStarterOptions(room.participants.get(firstPickerId));
  room.currentOptions = options;
  room.currentPickerPositionId = null;

  io.to(room.code).emit('captain_draft_started', { currentPickerId: firstPickerId, options });
  startTimer(room, io);
  console.log(`[draft] captain phase started in room ${room.code}`);
}

async function executeCaptainPick(room, participantId, cartolaId, io) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  const participant = room.participants.get(participantId);
  participant.captainId = cartolaId;

  await pool.query(
    `UPDATE draft_participants SET captain_cartola_id = $1 WHERE id = $2`,
    [cartolaId, participantId]
  );

  room.currentPickIndex++;
  await pool.query(
    `UPDATE draft_sessions SET current_pick_index = $1 WHERE id = $2`,
    [room.currentPickIndex, room.code]
  );

  const nextPickerId = getCurrentPicker(room);
  const drafterSocket = room.participants.get(participantId)?.socketId;

  // ── Parallel mode: each player does all phases in one session ──────────────
  if (room.mode === 'parallel') {
    if (drafterSocket) {
      io.to(drafterSocket).emit('captain_picked', { participantId, captainId: cartolaId });
      io.to(drafterSocket).emit('parallel_turn_done');
    }

    // Clear the queue — no auto-start, next player presses the button themselves
    room.parallelQueue = [];

    // Check if all players are done
    const allDone = [...room.participants.values()].every(p => p.captainId);
    if (allDone) {
      room.status = 'complete';
      const roundRow = (await pool.query('SELECT round_number FROM rounds ORDER BY id DESC LIMIT 1')).rows[0];
      await pool.query(
        `UPDATE draft_sessions SET completed_at = $1, status = 'complete', round_number = $2 WHERE id = $3`,
        [new Date().toISOString(), roundRow?.round_number || null, room.code]
      );
      io.to(room.code).emit('draft_complete', { teams: buildTeams(room) });
    } else {
      // Wait for next player to press the button
      room.status = 'parallel_waiting';
      room.draftOrder = [];
      room.currentPickIndex = 0;
      room.currentOptions = null;
      await pool.query(
        `UPDATE draft_sessions SET status = 'parallel_waiting', draft_order = $1, current_pick_index = 0, parallel_phase = 'main' WHERE id = $2`,
        [JSON.stringify([]), room.code]
      );
      io.to(room.code).emit('room_state', getRoomState(room));
    }
    return { ok: true };
  }

  // ── Realtime mode ──────────────────────────────────────────────────────────
  if (!nextPickerId) {
    room.status = 'complete';
    const roundRow = (await pool.query('SELECT round_number FROM rounds ORDER BY id DESC LIMIT 1')).rows[0];
    await pool.query(
      `UPDATE draft_sessions SET completed_at = $1, status = 'complete', round_number = $2 WHERE id = $3`,
      [new Date().toISOString(), roundRow?.round_number || null, room.code]
    );
    io.to(room.code).emit('captain_picked', { participantId, captainId: cartolaId });
    io.to(room.code).emit('draft_complete', { teams: buildTeams(room) });
    return { ok: true };
  }

  const nextOptions = getStarterOptions(room.participants.get(nextPickerId));
  room.currentOptions = nextOptions;

  io.to(room.code).emit('captain_picked', {
    participantId,
    captainId: cartolaId,
    nextPickerId,
    nextOptions,
  });

  startTimer(room, io);
  return { ok: true };
}

async function pickCaptain(roomCode, participantId, cartolaId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'captain_drafting') return { error: 'Fase de capitão não está em andamento.' };

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (!room.currentOptions) return { error: 'Sem opções disponíveis.' };

  const player = room.currentOptions.find(p => p.cartola_id === cartolaId);
  if (!player) return { error: 'Jogador não está entre as opções.' };

  return executeCaptainPick(room, participantId, cartolaId, io);
}

// ── bench draft start ─────────────────────────────────────────────────────────

async function startBenchDraft(room, io) {
  // Realtime mode only — parallel mode uses startBenchDraftForPlayer instead
  room.benchPlayers = (room.allPlayers || []).filter(
    p => p.status_id !== 7 && !room.pickedIds.has(p.cartola_id)
  );

  const participantIds = [...room.participants.keys()].sort(
    (a, b) => (room.participants.get(a).pickOrder || 0) - (room.participants.get(b).pickOrder || 0)
  );

  room.draftOrder = buildSnakeOrder(participantIds, 3);
  room.currentPickIndex = 0;

  room.status = 'bench_drafting';
  await pool.query(
    `UPDATE draft_sessions SET status = 'bench_drafting', draft_order = $1, current_pick_index = 0 WHERE id = $2`,
    [JSON.stringify(room.draftOrder), room.code]
  );

  const currentPickerId = getCurrentPicker(room);
  io.to(room.code).emit('bench_draft_started', {
    benchPlayers: room.benchPlayers,
    draftOrder: room.draftOrder,
    currentPickerId,
  });

  startTimer(room, io);
  console.log(`[draft] bench phase started in room ${room.code} — ${room.benchPlayers.length} bench players`);
}

// ── position picking ──────────────────────────────────────────────────────────

function pickPosition(roomCode, participantId, positionId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'drafting') return { error: 'Draft principal não está em andamento.' };

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (room.currentOptions) return { error: 'Posição já escolhida neste turno.' };

  const participant = room.participants.get(participantId);
  const needed = getNeededPositions(participant);
  if (!needed.some(n => n.posId === positionId)) {
    return { error: 'Sua formação não precisa desta posição.' };
  }

  const available = room.players.filter(
    p => p.position_id === positionId && !room.pickedIds.has(p.cartola_id)
  );

  if (available.length === 0) {
    return { error: 'Nenhum jogador disponível nessa posição.' };
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 5);

  room.currentOptions = options;
  room.currentPickerPositionId = positionId;

  const target = room.mode === 'parallel'
    ? room.participants.get(participantId)?.socketId
    : roomCode;
  if (target) io.to(target).emit('position_picked', { participantId, positionId, options });
  return { ok: true };
}

function pickBenchSlot(roomCode, participantId, benchSlotId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'bench_drafting') return { error: 'Draft reserva não está em andamento.' };

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (room.currentOptions) return { error: 'Slot já escolhido neste turno.' };

  const slot = BENCH_SLOTS[benchSlotId];
  if (!slot) return { error: 'Slot de reserva inválido.' };

  const participant = room.participants.get(participantId);
  const neededSlots = getBenchNeededSlots(participant);
  if (!neededSlots.includes(benchSlotId)) {
    return { error: 'Este slot já foi preenchido.' };
  }

  const available = (room.benchPlayers || []).filter(
    p => slot.allowedPositions.includes(p.position_id) && !room.pickedIds.has(p.cartola_id)
  );

  if (available.length === 0) {
    return { error: `Nenhum jogador disponível para ${slot.label}.` };
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 5);

  room.currentOptions = options;
  room.currentPickerPositionId = benchSlotId;

  const target = room.mode === 'parallel'
    ? room.participants.get(participantId)?.socketId
    : roomCode;
  if (target) io.to(target).emit('position_picked', { participantId, positionId: benchSlotId, options });
  return { ok: true };
}

// ── player picking ────────────────────────────────────────────────────────────

async function pickPlayer(roomCode, participantId, cartolaId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'drafting' && room.status !== 'bench_drafting') {
    return { error: 'Draft não está em andamento.' };
  }

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (!room.currentOptions) return { error: 'Escolha uma posição primeiro.' };

  const player = room.currentOptions.find(p => p.cartola_id === cartolaId);
  if (!player) return { error: 'Jogador não está entre as opções apresentadas.' };

  const participant = room.participants.get(participantId);
  const options = [...room.currentOptions];
  return executePick(room, participant, player, io, options);
}

async function executePick(room, participant, player, io, options = null) {
  const storedPositionId = room.currentPickerPositionId || player.position_id;

  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  room.pickedIds.add(player.cartola_id);
  room.pickNumber++;
  const pickNumber = room.pickNumber;

  participant.picks.push({ ...player, position_id: storedPositionId, picked_at: new Date().toISOString() });

  const optionsJson = options
    ? JSON.stringify(options.map(p => ({
        cartola_id: p.cartola_id,
        nickname: p.nickname,
        photo_url: p.photo || p.photo_url || null,
        average_score: p.average_score,
        price: p.price,
        club_abbreviation: p.club?.abbreviation || null,
      })))
    : null;

  // Persist pick with position_id and options
  await pool.query(
    `INSERT INTO draft_picks (session_id, participant_id, cartola_id, position_id, overall_pick, picked_at, options_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [room.code, participant.id, player.cartola_id, storedPositionId, pickNumber, new Date().toISOString(), optionsJson]
  );

  room.currentPickIndex++;
  advancePastDone(room);

  // Persist updated pick index and pick number
  await pool.query(
    `UPDATE draft_sessions SET current_pick_index = $1, pick_number = $2 WHERE id = $3`,
    [room.currentPickIndex, room.pickNumber, room.code]
  );

  const nextPickerId = getCurrentPicker(room);

  // ── Parallel mode ──────────────────────────────────────────────────────────
  if (room.mode === 'parallel') {
    const drafterSocket = participant.socketId;

    // Emit pick to drafter only
    if (drafterSocket) {
      io.to(drafterSocket).emit('player_picked', {
        participantId: participant.id,
        player: { ...player, position_id: storedPositionId },
        nextParticipantId: nextPickerId,
        pickNumber,
      });
    }

    if (nextPickerId === participant.id) {
      // Same person continues in this phase — update others' progress
      if (drafterSocket) {
        io.to(room.code).except(drafterSocket).emit('room_state', getRoomState(room));
      } else {
        io.to(room.code).emit('room_state', getRoomState(room));
      }
      startTimer(room, io);
    } else {
      // This player's picks in current phase are exhausted
      if (room.status === 'bench_drafting') {
        // Bench done → captain immediately (no lobby)
        await startCaptainDraftForPlayer(room, participant, io);
      } else {
        // Main done → bench immediately (no lobby)
        await startBenchDraftForPlayer(room, participant, io);
      }
    }
    return { ok: true };
  }

  // ── Realtime mode ───────────────────────────────────────────────────────────
  if (!nextPickerId) {
    if (room.status === 'bench_drafting') {
      await startCaptainDraft(room, io);
    } else {
      await startBenchDraft(room, io);
    }
    return { ok: true };
  }

  io.to(room.code).emit('player_picked', {
    participantId: participant.id,
    player: { ...player, position_id: storedPositionId },
    nextParticipantId: nextPickerId,
    pickNumber
  });

  startTimer(room, io);
  return { ok: true };
}

function advancePastDone(room) {
  while (room.currentPickIndex < room.draftOrder.length) {
    const pid = room.draftOrder[room.currentPickIndex];
    const participant = room.participants.get(pid);
    if (!participant) { room.currentPickIndex++; continue; }

    const needed = room.status === 'bench_drafting'
      ? getBenchNeededSlots(participant)
      : getNeededPositions(participant);

    if (needed.length === 0) {
      room.currentPickIndex++;
    } else {
      break;
    }
  }
}

async function autoPickForParticipant(room, participantId, io) {
  const participant = room.participants.get(participantId);
  if (!participant) return;

  const emitTarget = room.mode === 'parallel' && participant.socketId
    ? participant.socketId : room.code;

  if (room.status === 'captain_drafting') {
    const options = room.currentOptions || [];
    if (!options.length) return;
    const pick = options[Math.floor(Math.random() * options.length)];
    io.to(emitTarget).emit('auto_picked', { participantId, player: pick });
    await executeCaptainPick(room, participantId, pick.cartola_id, io);
    return;
  }

  if (room.currentOptions && room.currentOptions.length > 0) {
    const options = [...room.currentOptions];
    const pick = options[Math.floor(Math.random() * options.length)];
    io.to(emitTarget).emit('auto_picked', { participantId, player: pick });
    await executePick(room, participant, pick, io, options);
    return;
  }

  if (room.status === 'bench_drafting') {
    const neededSlots = getBenchNeededSlots(participant);
    if (!neededSlots.length) return;

    for (const slotId of neededSlots) {
      const slot = BENCH_SLOTS[slotId];
      const available = (room.benchPlayers || [])
        .filter(p => slot.allowedPositions.includes(p.position_id) && !room.pickedIds.has(p.cartola_id))
        .sort((a, b) => (b.average_score || 0) - (a.average_score || 0));

      if (available.length > 0) {
        room.currentPickerPositionId = slotId;
        const pick = available[0];
        io.to(emitTarget).emit('auto_picked', { participantId, player: { ...pick, position_id: slotId } });
        await executePick(room, participant, pick, io);
        return;
      }
    }
    return;
  }

  const needed = getNeededPositions(participant);
  if (needed.length === 0) return;

  needed.sort((a, b) => b.remaining - a.remaining);
  for (const n of needed) {
    const available = room.players.filter(
      p => p.position_id === n.posId && !room.pickedIds.has(p.cartola_id)
    );
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)];
      io.to(emitTarget).emit('auto_picked', { participantId, player: pick });
      await executePick(room, participant, pick, io);
      return;
    }
  }
}

function startTimer(room, io) {
  if (room.timer) clearInterval(room.timer);
  let timeLeft = 60;

  room.timer = setInterval(() => {
    timeLeft--;
    io.to(room.code).emit('timer_tick', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      const currentPickerId = getCurrentPicker(room);
      if (currentPickerId) {
        autoPickForParticipant(room, currentPickerId, io).catch(e => {
          console.error('[timer] auto-pick error:', e);
        });
      }
    }
  }, 1000);
}

function buildTeams(room) {
  return [...room.participants.values()].map(p => ({
    id: p.id,
    name: p.name,
    formation: p.formation,
    pickOrder: p.pickOrder,
    picks: p.picks,
    captainId: p.captainId || null,
  }));
}

// ── restore rooms from DB on server startup ───────────────────────────────────

async function restoreRoomsFromDB() {
  const { getPlayersAndClubs } = require('./cartola');

  const sessions = (await pool.query(
    `SELECT * FROM draft_sessions
     WHERE completed_at IS NULL
       AND status IN ('drafting', 'bench_drafting', 'captain_drafting', 'parallel_waiting')`
  )).rows;

  if (sessions.length === 0) return;

  // Load player data once for all sessions
  let allPlayerData = null;
  let overrideIds = new Set();
  try {
    allPlayerData = await getPlayersAndClubs();
    const overrideRows = (await pool.query('SELECT cartola_id FROM draft_eligible_override')).rows;
    overrideIds = new Set(overrideRows.map(r => r.cartola_id));
  } catch (e) {
    console.warn('[db] Dados de jogadores indisponíveis para restauração:', e.message);
  }

  for (const session of sessions) {
    const participants = (await pool.query(
      `SELECT * FROM draft_participants WHERE session_id = $1 ORDER BY pick_order ASC NULLS LAST`,
      [session.id]
    )).rows;

    if (participants.length === 0) continue;

    // Load picks with full player data from DB
    const picksResult = (await pool.query(
      `SELECT dp.participant_id, dp.cartola_id, dp.position_id AS slot_pos, dp.overall_pick, dp.picked_at,
              p.nickname, p.name AS player_name, p.photo_url,
              prd.position_id AS real_pos, prd.club_id, prd.price, prd.average_score, prd.status_id,
              c.name AS club_name, c.abbreviation, c.shield_url
       FROM draft_picks dp
       JOIN players p ON p.cartola_id = dp.cartola_id
       LEFT JOIN player_round_data prd ON prd.player_id = p.id
         AND prd.round_id = (SELECT id FROM rounds ORDER BY id DESC LIMIT 1)
       LEFT JOIN clubs c ON c.id = prd.club_id
       WHERE dp.session_id = $1
       ORDER BY dp.overall_pick ASC`,
      [session.id]
    )).rows;

    const picksByParticipant = {};
    const pickedIds = new Set();
    for (const row of picksResult) {
      if (!picksByParticipant[row.participant_id]) picksByParticipant[row.participant_id] = [];
      picksByParticipant[row.participant_id].push({
        cartola_id: row.cartola_id,
        nickname: row.nickname,
        name: row.player_name,
        photo: row.photo_url,
        position_id: row.slot_pos ?? row.real_pos, // slot (21/22/23) or player position
        club_id: row.club_id,
        price: row.price,
        average_score: row.average_score,
        status_id: row.status_id,
        club: row.club_id ? {
          id: row.club_id, name: row.club_name,
          abbreviation: row.abbreviation, shield: row.shield_url
        } : null,
        picked_at: row.picked_at
      });
      pickedIds.add(row.cartola_id);
    }

    const participantsMap = new Map();
    for (const p of participants) {
      participantsMap.set(p.id, {
        id: p.id,
        name: p.name,
        socketId: null,
        formation: p.formation,
        picks: picksByParticipant[p.id] || [],
        pickOrder: p.pick_order,
        captainId: p.captain_cartola_id || null,
      });
    }

    // Rebuild draft pool from current player data
    let draftPlayers = null, allPlayers = null, clubs = null, clubMatches = {};
    if (allPlayerData) {
      allPlayers = allPlayerData.players;
      clubs = allPlayerData.clubs;
      clubMatches = allPlayerData.clubMatches;
      const probable = allPlayers.filter(p => p.status_id === 7 || overrideIds.has(p.cartola_id));
      draftPlayers = probable.length > 0 ? probable : allPlayers;
    }

    const draftOrder = session.draft_order ? JSON.parse(session.draft_order) : [];

    const room = {
      code: session.id,
      status: session.status,
      adminId: session.admin_id,
      entry_fee: session.entry_fee || 0,
      mode: session.mode || 'realtime',
      parallelPhase: session.parallel_phase || null,
      parallelQueue: [], // in-memory only; players re-click after server restart
      participants: participantsMap,
      players: draftPlayers,
      allPlayers,
      benchPlayers: ['bench_drafting', 'captain_drafting'].includes(session.status) && allPlayers
        ? allPlayers.filter(p => p.status_id !== 7 && !pickedIds.has(p.cartola_id))
        : null,
      clubs,
      clubMatches,
      pickedIds,
      draftOrder,
      currentPickIndex: session.current_pick_index || 0,
      timer: null,
      pickNumber: session.pick_number || 0,
      currentOptions: null,
      currentPickerPositionId: null
    };

    rooms.set(session.id, room);
    console.log(`[db] Sala restaurada: ${session.id} (${room.status}, ${picksResult.length} picks)`);
  }

  console.log(`[db] ${sessions.length} sala(s) restaurada(s) do banco`);
}

// ── read-only helpers ─────────────────────────────────────────────────────────

function getRoomState(roomOrCode) {
  const room = typeof roomOrCode === 'string' ? rooms.get(roomOrCode) : roomOrCode;
  if (!room) return null;

  const phaseMap = { bench_drafting: 'bench', captain_drafting: 'captain' };
  const phase = room.status === 'parallel_waiting'
    ? (room.parallelPhase || 'main')
    : (phaseMap[room.status] || 'main');

  // Progress of current drafter (for parallel mode display)
  let currentDrafterProgress = null;
  const currentPid = getCurrentPicker(room);
  if (currentPid && room.mode === 'parallel') {
    const cp = room.participants.get(currentPid);
    if (cp?.formation) {
      const isbench = ['bench_drafting', 'bench'].includes(room.status) ||
        (room.status === 'parallel_waiting' && room.parallelPhase === 'bench');
      const total = isbench ? 3 : Object.values(FORMATIONS[cp.formation]).reduce((a, b) => a + b, 0);
      const done = isbench
        ? cp.picks.filter(pk => BENCH_SLOT_IDS.includes(pk.position_id)).length
        : cp.picks.filter(pk => !BENCH_SLOT_IDS.includes(pk.position_id)).length;
      currentDrafterProgress = { done, total };
    }
  }

  return {
    roomCode: room.code,
    status: room.status,
    phase,
    adminId: room.adminId,
    entry_fee: room.entry_fee || 0,
    mode: room.mode || 'realtime',
    parallelPhase: room.parallelPhase || null,
    parallelQueue: room.parallelQueue || [],
    currentDrafterProgress,
    participants: [...room.participants.values()].map(p => ({
      id: p.id,
      name: p.name,
      formation: p.formation,
      pickOrder: p.pickOrder,
      picks: p.picks,
      captainId: p.captainId || null,
    })),
    currentPickerId: getCurrentPicker(room),
    pickNumber: room.pickNumber,
    draftOrderIds: room.draftOrder,
    pickedIds: [...room.pickedIds],
    currentOptions: room.currentOptions || null,
    currentPickerPositionId: room.currentPickerPositionId || null,
    clubMatches: room.clubMatches || {},
    benchPlayers: room.status === 'bench_drafting' ? (room.benchPlayers || []) : undefined,
  };
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function leaveRoom(roomCode, participantId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'lobby') return { error: 'Não é possível sair durante o draft.' };

  room.participants.delete(participantId);

  // If room is empty, delete it
  if (room.participants.size === 0) {
    rooms.delete(roomCode);
    return { disbanded: true };
  }

  // If admin left, assign a new admin
  if (room.adminId === participantId) {
    room.adminId = room.participants.keys().next().value;
  }

  return { ok: true };
}

function removeParticipantSocket(socketId) {
  for (const [, room] of rooms) {
    for (const [, participant] of room.participants) {
      if (participant.socketId === socketId) {
        participant.socketId = null;
      }
    }
  }
}

function findRoomBySocket(socketId) {
  for (const [roomCode, room] of rooms) {
    for (const [participantId, participant] of room.participants) {
      if (participant.socketId === socketId) {
        return { room, participantId };
      }
    }
  }
  return null;
}

// ── admin actions ─────────────────────────────────────────────────────────────

async function adminForcePick(roomCode, adminId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.adminId !== adminId) return { error: 'Acesso negado.' };
  if (['lobby', 'parallel_waiting', 'complete'].includes(room.status)) {
    return { error: 'Nenhum pick em andamento.' };
  }
  const pickerId = getCurrentPicker(room);
  if (!pickerId) return { error: 'Nenhum jogador na vez.' };
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  await autoPickForParticipant(room, pickerId, io);
  return { ok: true };
}

async function adminSimAll(roomCode, adminId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.adminId !== adminId) return { error: 'Acesso negado.' };

  for (let i = 0; i < 300; i++) {
    if (['complete', 'parallel_waiting', 'lobby'].includes(room.status)) break;
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    const pickerId = getCurrentPicker(room);
    if (!pickerId) break;
    await autoPickForParticipant(room, pickerId, io);
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    await new Promise(r => setTimeout(r, 50));
  }
  return { ok: true };
}

async function adminRemovePick(roomCode, adminId, targetParticipantId, cartolaId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.adminId !== adminId) return { error: 'Acesso negado.' };

  const participant = room.participants.get(targetParticipantId);
  if (!participant) return { error: 'Participante não encontrado.' };

  const idx = participant.picks.findIndex(p => p.cartola_id === cartolaId);
  if (idx === -1) return { error: 'Pick não encontrado.' };

  participant.picks.splice(idx, 1);
  room.pickedIds.delete(cartolaId);
  if (participant.captainId === cartolaId) participant.captainId = null;

  await pool.query(
    `DELETE FROM draft_picks WHERE session_id = $1 AND participant_id = $2 AND cartola_id = $3`,
    [roomCode, targetParticipantId, cartolaId]
  );

  const state = getRoomState(room);
  io.to(roomCode).emit('picks_updated', { participants: state.participants });
  return { ok: true };
}

async function adminAddPick(roomCode, adminId, targetParticipantId, cartolaId, positionId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.adminId !== adminId) return { error: 'Acesso negado.' };

  const participant = room.participants.get(targetParticipantId);
  if (!participant) return { error: 'Participante não encontrado.' };
  if (room.pickedIds.has(cartolaId)) return { error: 'Jogador já foi escolhido.' };

  // Find player across all pools
  const seen = new Set();
  const pool_list = [...(room.players || []), ...(room.allPlayers || []), ...(room.benchPlayers || [])].filter(p => {
    if (seen.has(p.cartola_id)) return false;
    seen.add(p.cartola_id); return true;
  });
  const player = pool_list.find(p => p.cartola_id === cartolaId);
  if (!player) return { error: 'Jogador não encontrado no pool.' };

  room.pickedIds.add(cartolaId);
  room.pickNumber++;
  participant.picks.push({ ...player, position_id: positionId, picked_at: new Date().toISOString() });

  await pool.query(
    `INSERT INTO draft_picks (session_id, participant_id, cartola_id, position_id, overall_pick, picked_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [roomCode, targetParticipantId, cartolaId, positionId, room.pickNumber, new Date().toISOString()]
  );

  const state = getRoomState(room);
  io.to(roomCode).emit('picks_updated', { participants: state.participants });
  return { ok: true };
}

// Reroll the 5 offered players for the current pick (costs 5 coins, handled in handler).
// Tries to offer different players from the previous batch; falls back to all available if not enough.
function rerollOptions(roomCode, participantId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'drafting' && room.status !== 'bench_drafting' && room.status !== 'captain_drafting') {
    return { error: 'Reroll não disponível nesta fase.' };
  }

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (!room.currentOptions) return { error: 'Escolha uma posição antes de sortear novamente.' };

  const positionId = room.currentPickerPositionId;
  const previousIds = new Set(room.currentOptions.map(p => p.cartola_id));

  let candidates;
  if (room.status === 'captain_drafting') {
    const participant = room.participants.get(participantId);
    candidates = participant.picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  } else if (room.status === 'bench_drafting') {
    const slot = BENCH_SLOTS[positionId];
    if (!slot) return { error: 'Slot de reserva inválido.' };
    candidates = (room.benchPlayers || []).filter(
      p => slot.allowedPositions.includes(p.position_id) && !room.pickedIds.has(p.cartola_id)
    );
  } else {
    candidates = room.players.filter(
      p => p.position_id === positionId && !room.pickedIds.has(p.cartola_id)
    );
  }

  if (candidates.length === 0) return { error: 'Nenhum jogador disponível para sortear.' };

  // Prefer players not in the previous batch; fall back to full candidates if too few fresh ones
  const fresh = candidates.filter(p => !previousIds.has(p.cartola_id));
  const source = fresh.length >= 3 ? fresh : candidates;

  const shuffled = [...source].sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 5);

  room.currentOptions = options;

  const participant = room.participants.get(participantId);
  const target = room.mode === 'parallel' ? participant.socketId : room.code;
  io.to(target).emit('options_rerolled', { participantId, positionId, options });

  return { ok: true };
}

module.exports = {
  createRoom,
  joinRoom,
  setFormation,
  startDraft,
  startMyTurn,
  pickPosition,
  pickBenchSlot,
  pickPlayer,
  pickCaptain,
  rerollOptions,
  getRoomState,
  getRoom,
  startTimer,
  leaveRoom,
  removeParticipantSocket,
  findRoomBySocket,
  restoreRoomsFromDB,
  getStarterOptions,
  adminForcePick,
  adminSimAll,
  adminRemovePick,
  adminAddPick,
  FORMATIONS,
  BENCH_SLOTS,
  BENCH_SLOT_IDS,
  SPECTATOR_ADMIN_ID,
};
