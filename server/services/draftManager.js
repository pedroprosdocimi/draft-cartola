const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const FORMATIONS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 }
};

// Bench slots: id → which real positions are allowed
const BENCH_SLOTS = {
  21: { label: 'DEF RES', fullLabel: 'Defensor Reserva', allowedPositions: [2, 3] },
  22: { label: 'MEI RES', fullLabel: 'Meia Reserva',     allowedPositions: [4] },
  23: { label: 'ATA RES', fullLabel: 'Atacante Reserva', allowedPositions: [5] },
};
const BENCH_SLOT_IDS = [21, 22, 23];

// rooms: Map<roomCode, Room>
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

async function createRoom(participantName, socketId) {
  const roomCode = generateRoomCode();
  const participantId = uuidv4();

  const room = {
    code: roomCode,
    status: 'lobby', // lobby | drafting | bench_drafting | complete
    adminId: participantId,
    participants: new Map([[participantId, {
      id: participantId,
      name: participantName,
      socketId,
      formation: null,
      picks: []
    }]]),
    players: null,        // main draft pool (titulares + overrides)
    allPlayers: null,     // full player list (for bench pool)
    benchPlayers: null,   // bench draft pool
    clubs: null,
    clubMatches: {},
    pickedIds: new Set(),
    draftOrder: [],
    currentPickIndex: 0,
    timer: null,
    pickNumber: 0,
    currentOptions: null,
    currentPickerPositionId: null
  };

  rooms.set(roomCode, room);

  await pool.query(
    `INSERT INTO draft_sessions (id, created_at) VALUES ($1, $2)`,
    [roomCode, new Date().toISOString()]
  );

  return { roomCode, participantId };
}

function joinRoom(roomCode, participantName, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'lobby') return { error: 'Draft já iniciado.' };

  const participantId = uuidv4();
  room.participants.set(participantId, {
    id: participantId,
    name: participantName,
    socketId,
    formation: null,
    picks: []
  });

  return { participantId };
}

function setFormation(roomCode, participantId, formation) {
  if (!FORMATIONS[formation]) return { error: 'Formação inválida.' };
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  const participant = room.participants.get(participantId);
  if (!participant) return { error: 'Participante não encontrado.' };
  participant.formation = formation;
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

async function startDraft(roomCode, players, clubs, clubMatches) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'lobby') return { error: 'Draft já iniciado.' };
  if (room.participants.size < 2) return { error: 'Mínimo 2 participantes.' };

  for (const [, p] of room.participants) {
    if (!p.formation) return { error: `${p.name} ainda não escolheu formação.` };
  }

  const overrideRows = (await pool.query('SELECT cartola_id FROM draft_eligible_override')).rows;
  const overrideIds = new Set(overrideRows.map(r => r.cartola_id));
  const probablePlayers = players.filter(p => p.status_id === 7 || overrideIds.has(p.cartola_id));

  room.allPlayers = players;                                            // full list for bench
  room.players = probablePlayers.length > 0 ? probablePlayers : players; // main draft pool
  room.clubs = clubs;
  room.clubMatches = clubMatches || {};
  room.status = 'drafting';

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
  room.draftOrder = buildDraftOrder(participantIds, formations);
  room.currentPickIndex = 0;

  return { ok: true };
}

// ── bench draft start ─────────────────────────────────────────────────────────

function startBenchDraft(room, io) {
  // Pool: non-contundido (status_id != 5) players not already picked
  room.benchPlayers = (room.allPlayers || []).filter(
    p => p.status_id !== 5 && !room.pickedIds.has(p.cartola_id)
  );

  // Keep same pick order (sorted by pickOrder property)
  const participantIds = [...room.participants.keys()].sort(
    (a, b) => (room.participants.get(a).pickOrder || 0) - (room.participants.get(b).pickOrder || 0)
  );

  room.draftOrder = buildSnakeOrder(participantIds, 3); // 3 bench rounds
  room.currentPickIndex = 0;
  room.status = 'bench_drafting';

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

  io.to(roomCode).emit('position_picked', { participantId, positionId, options });
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

  io.to(roomCode).emit('position_picked', { participantId, positionId: benchSlotId, options });
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
  return executePick(room, participant, player, io);
}

async function executePick(room, participant, player, io) {
  // Capture bench slot BEFORE clearing state
  const storedPositionId = room.currentPickerPositionId || player.position_id;

  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  room.pickedIds.add(player.cartola_id);
  room.pickNumber++;
  const pickNumber = room.pickNumber;

  // Store with bench slot id (21/22/23) in bench phase, real position in main phase
  participant.picks.push({ ...player, position_id: storedPositionId, picked_at: new Date().toISOString() });

  await pool.query(
    `INSERT INTO draft_picks (session_id, participant_id, cartola_id, overall_pick, picked_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [room.code, participant.id, player.cartola_id, pickNumber, new Date().toISOString()]
  );

  room.currentPickIndex++;
  advancePastDone(room);

  const nextPickerId = getCurrentPicker(room);

  if (!nextPickerId) {
    if (room.status === 'bench_drafting') {
      // Bench draft complete
      room.status = 'complete';
      await pool.query(
        `UPDATE draft_sessions SET completed_at = $1 WHERE id = $2`,
        [new Date().toISOString(), room.code]
      );
      io.to(room.code).emit('draft_complete', { teams: buildTeams(room) });
    } else {
      // Main draft complete → transition to bench
      startBenchDraft(room, io);
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

  // Position/slot already selected — auto-pick from offered options
  if (room.currentOptions && room.currentOptions.length > 0) {
    const pick = room.currentOptions[Math.floor(Math.random() * room.currentOptions.length)];
    io.to(room.code).emit('auto_picked', { participantId, player: pick });
    await executePick(room, participant, pick, io);
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
        io.to(room.code).emit('auto_picked', { participantId, player: { ...pick, position_id: slotId } });
        await executePick(room, participant, pick, io);
        return;
      }
    }
    return;
  }

  // Main draft auto-pick: most needed position
  const needed = getNeededPositions(participant);
  if (needed.length === 0) return;

  needed.sort((a, b) => b.remaining - a.remaining);
  for (const n of needed) {
    const available = room.players.filter(
      p => p.position_id === n.posId && !room.pickedIds.has(p.cartola_id)
    );
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)];
      io.to(room.code).emit('auto_picked', { participantId, player: pick });
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
      if (currentPickerId) autoPickForParticipant(room, currentPickerId, io);
    }
  }, 1000);
}

function buildTeams(room) {
  return [...room.participants.values()].map(p => ({
    id: p.id,
    name: p.name,
    formation: p.formation,
    pickOrder: p.pickOrder,
    picks: p.picks
  }));
}

function getRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  return {
    roomCode: room.code,
    status: room.status,
    phase: room.status === 'bench_drafting' ? 'bench' : 'main',
    adminId: room.adminId,
    participants: [...room.participants.values()].map(p => ({
      id: p.id,
      name: p.name,
      formation: p.formation,
      pickOrder: p.pickOrder,
      picks: p.picks
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

module.exports = {
  createRoom,
  joinRoom,
  setFormation,
  startDraft,
  pickPosition,
  pickBenchSlot,
  pickPlayer,
  getRoomState,
  getRoom,
  startTimer,
  removeParticipantSocket,
  findRoomBySocket,
  FORMATIONS,
  BENCH_SLOTS,
  BENCH_SLOT_IDS,
};
