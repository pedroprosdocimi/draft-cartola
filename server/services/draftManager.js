const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const FORMATIONS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 1 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2, 6: 1 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2, 6: 1 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1, 6: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3, 6: 1 }
};

// position_id → label
const POSITION_NAMES = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };

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

function createRoom(participantName, socketId) {
  const roomCode = generateRoomCode();
  const participantId = uuidv4();

  const room = {
    code: roomCode,
    status: 'lobby', // lobby | drafting | complete
    adminId: participantId,
    participants: new Map([[participantId, {
      id: participantId,
      name: participantName,
      socketId,
      formation: null,
      picks: []
    }]]),
    players: null,     // all available players (from Cartola)
    clubs: null,
    pickedIds: new Set(),
    draftOrder: [],    // flat array of participantIds (snake)
    currentPickIndex: 0,
    timer: null,
    pickNumber: 0,
    currentOptions: null,          // 5 players offered in current pick
    currentPickerPositionId: null  // position selected in current pick
  };

  rooms.set(roomCode, room);

  // Persist to DB
  db.prepare(`INSERT INTO draft_sessions (id, created_at) VALUES (?, ?)`).run(
    roomCode, new Date().toISOString()
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

function pickPosition(roomCode, participantId, positionId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'drafting') return { error: 'Draft não está em andamento.' };

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

  // Shuffle and take up to 5
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 5);

  room.currentOptions = options;
  room.currentPickerPositionId = positionId;

  io.to(roomCode).emit('position_picked', { participantId, positionId, options });
  return { ok: true };
}

function buildDraftOrder(participantIds, formations) {
  // Determine total rounds = max slots in any formation
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

function startDraft(roomCode, players, clubs, clubMatches) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'lobby') return { error: 'Draft já iniciado.' };
  if (room.participants.size < 2) return { error: 'Mínimo 2 participantes.' };

  for (const [, p] of room.participants) {
    if (!p.formation) return { error: `${p.name} ainda não escolheu formação.` };
  }

  const overrideIds = new Set(
    db.prepare('SELECT cartola_id FROM draft_eligible_override').all().map(r => r.cartola_id)
  );
  const probablePlayers = players.filter(p => p.status_id === 7 || overrideIds.has(p.cartola_id));
  room.players = probablePlayers.length > 0 ? probablePlayers : players;
  console.log(`[draft] ${room.players.length} jogadores prováveis (de ${players.length} total)`);
  room.clubs = clubs;
  room.clubMatches = clubMatches || {};
  room.status = 'drafting';

  // Shuffle participants for pick order
  const participantIds = [...room.participants.keys()];
  for (let i = participantIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participantIds[i], participantIds[j]] = [participantIds[j], participantIds[i]];
  }

  // Set pick_order on each participant
  participantIds.forEach((id, index) => {
    room.participants.get(id).pickOrder = index;
  });

  const formations = Object.fromEntries([...room.participants.entries()].map(([id, p]) => [id, p.formation]));
  room.draftOrder = buildDraftOrder(participantIds, formations);
  room.currentPickIndex = 0;

  return { ok: true };
}

function getCurrentPicker(room) {
  if (room.currentPickIndex >= room.draftOrder.length) return null;
  return room.draftOrder[room.currentPickIndex];
}

function getNeededPositions(participant) {
  const formation = FORMATIONS[participant.formation];
  if (!formation) return [];

  const picked = participant.picks.map(p => p.position_id);
  const counts = {};
  for (const posId of picked) {
    counts[posId] = (counts[posId] || 0) + 1;
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

function pickPlayer(roomCode, participantId, cartolaId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Sala não encontrada.' };
  if (room.status !== 'drafting') return { error: 'Draft não está em andamento.' };

  const currentPicker = getCurrentPicker(room);
  if (currentPicker !== participantId) return { error: 'Não é sua vez.' };
  if (!room.currentOptions) return { error: 'Escolha uma posição primeiro.' };

  const player = room.currentOptions.find(p => p.cartola_id === cartolaId);
  if (!player) return { error: 'Jogador não está entre as opções apresentadas.' };

  const participant = room.participants.get(participantId);
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  return executePick(room, participant, player, io);
}

function executePick(room, participant, player, io) {
  // Clear timer and options state
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  room.currentOptions = null;
  room.currentPickerPositionId = null;

  room.pickedIds.add(player.cartola_id);
  room.pickNumber++;
  const pickNumber = room.pickNumber;

  participant.picks.push({ ...player, picked_at: new Date().toISOString() });

  // Persist to DB
  db.prepare(`
    INSERT INTO draft_picks (session_id, participant_id, cartola_id, overall_pick, picked_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(room.code, participant.id, player.cartola_id, pickNumber, new Date().toISOString());

  room.currentPickIndex++;

  // Advance past participants whose draft is complete
  advancePastDone(room);

  const nextPickerId = getCurrentPicker(room);

  if (!nextPickerId) {
    // Draft complete
    room.status = 'complete';
    db.prepare(`UPDATE draft_sessions SET completed_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), room.code);

    const teams = buildTeams(room);
    io.to(room.code).emit('draft_complete', { teams });
    return { ok: true };
  }

  io.to(room.code).emit('player_picked', {
    participantId: participant.id,
    player,
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

    const needed = getNeededPositions(participant);
    if (needed.length === 0) {
      room.currentPickIndex++;
    } else {
      break;
    }
  }
}

function autoPickForParticipant(room, participantId, io) {
  const participant = room.participants.get(participantId);
  if (!participant) return;

  // If position already selected, auto-pick from offered options
  if (room.currentOptions && room.currentOptions.length > 0) {
    const pick = room.currentOptions[Math.floor(Math.random() * room.currentOptions.length)];
    io.to(room.code).emit('auto_picked', { participantId, player: pick });
    executePick(room, participant, pick, io);
    return;
  }

  // No position selected yet — auto-pick most needed position then a player
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
      executePick(room, participant, pick, io);
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
        autoPickForParticipant(room, currentPickerId, io);
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
    picks: p.picks
  }));
}

function getRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  return {
    roomCode: room.code,
    status: room.status,
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
    clubMatches: room.clubMatches || {}
  };
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function removeParticipantSocket(socketId) {
  for (const [, room] of rooms) {
    for (const [, participant] of room.participants) {
      if (participant.socketId === socketId) {
        participant.socketId = null; // Mark as disconnected but keep in room
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
  pickPlayer,
  getRoomState,
  getRoom,
  startTimer,
  removeParticipantSocket,
  findRoomBySocket,
  FORMATIONS
};
