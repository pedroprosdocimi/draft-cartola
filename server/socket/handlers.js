const {
  createRoom,
  joinRoom,
  leaveRoom,
  setFormation,
  startDraft,
  pickPosition,
  pickBenchSlot,
  pickPlayer,
  pickCaptain,
  getRoomState,
  getRoom,
  startTimer,
  removeParticipantSocket,
  findRoomBySocket
} = require('../services/draftManager');
const { getPlayersAndClubs } = require('../services/cartola');
const { pool } = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'draft-cartola-secret-key-2024';

async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return (await pool.query('SELECT * FROM users WHERE id = $1', [payload.id])).rows[0] || null;
  } catch {
    return null;
  }
}

async function deductCoins(userId, amount) {
  const result = await pool.query(
    `UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1 RETURNING coins`,
    [amount, userId]
  );
  if (!result.rows.length) return { ok: false };
  return { ok: true, coins: result.rows[0].coins };
}

async function refundCoins(userId, amount) {
  const result = await pool.query(
    `UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins`,
    [amount, userId]
  );
  return result.rows[0]?.coins ?? null;
}

module.exports = function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on('create_room', async ({ participantName, entryFee, token }) => {
      if (!participantName?.trim()) {
        return socket.emit('error', { message: 'Nome inválido.' });
      }
      const fee = Math.max(0, parseInt(entryFee) || 0);

      let userId = null;
      if (fee > 0) {
        const user = await getUserFromToken(token);
        if (!user) return socket.emit('error', { message: 'Token inválido para cobrar entrada.' });
        if (user.coins < fee) {
          return socket.emit('error', { message: `Moedas insuficientes. Você tem ${user.coins} 🪙, precisa de ${fee} 🪙.` });
        }
        const deduct = await deductCoins(user.id, fee);
        if (!deduct.ok) return socket.emit('error', { message: `Moedas insuficientes.` });
        userId = user.id;
        socket.emit('coins_updated', { coins: deduct.coins });
      }

      const { roomCode, participantId } = await createRoom(participantName.trim(), socket.id, fee);
      socket.join(roomCode);
      socket.emit('room_joined', { roomCode, participantId, isAdmin: true });
      io.to(roomCode).emit('room_state', getRoomState(roomCode));
      console.log(`[room] created: ${roomCode} by ${participantName} (entry_fee=${fee})`);
    });

    socket.on('join_room', async ({ roomCode, participantName, token }) => {
      if (!roomCode?.trim() || !participantName?.trim()) {
        return socket.emit('error', { message: 'Código ou nome inválido.' });
      }
      const code = roomCode.trim().toUpperCase();
      const room = getRoom(code);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });

      const fee = room.entry_fee || 0;
      let userId = null;

      if (fee > 0) {
        const user = await getUserFromToken(token);
        if (!user) return socket.emit('error', { message: 'Token inválido para cobrar entrada.' });
        if (user.coins < fee) {
          return socket.emit('error', { message: `Moedas insuficientes. Você tem ${user.coins} 🪙, precisa de ${fee} 🪙.` });
        }
        const deduct = await deductCoins(user.id, fee);
        if (!deduct.ok) return socket.emit('error', { message: `Moedas insuficientes.` });
        userId = user.id;
        socket.emit('coins_updated', { coins: deduct.coins });
      }

      const result = await joinRoom(code, participantName.trim(), socket.id);
      if (result.error) {
        if (fee > 0 && userId) {
          const refunded = await refundCoins(userId, fee);
          socket.emit('coins_updated', { coins: refunded });
        }
        return socket.emit('error', { message: result.error });
      }

      socket.join(code);
      socket.emit('room_joined', { roomCode: code, participantId: result.participantId, isAdmin: false });
      io.to(code).emit('room_state', getRoomState(code));
      console.log(`[room] ${participantName} joined: ${code} (fee=${fee})`);
    });

    socket.on('leave_room', ({ roomCode, participantId }) => {
      const result = leaveRoom(roomCode, participantId);
      if (result.error) return socket.emit('error', { message: result.error });
      socket.leave(roomCode);
      socket.emit('left_room');
      if (!result.disbanded) {
        io.to(roomCode).emit('room_state', getRoomState(roomCode));
      }
    });

    socket.on('set_formation', async ({ roomCode, participantId, formation }) => {
      const result = await setFormation(roomCode, participantId, formation);
      if (result.error) return socket.emit('error', { message: result.error });
      io.to(roomCode).emit('room_state', getRoomState(roomCode));
    });

    socket.on('start_draft', async ({ roomCode, participantId, mode }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
      if (room.adminId !== participantId) return socket.emit('error', { message: 'Apenas o admin pode iniciar.' });

      try {
        socket.emit('loading', { message: 'Carregando jogadores do banco local...' });
        const { players, clubs, clubMatches } = await getPlayersAndClubs();

        const result = await startDraft(roomCode, players, clubs, clubMatches, mode || 'realtime');
        if (result.error) return socket.emit('error', { message: result.error });

        const state = getRoomState(roomCode);
        io.to(roomCode).emit('draft_started', {
          players,
          clubs,
          clubMatches,
          draftOrder: state.draftOrderIds,
          participants: state.participants,
          currentPickerId: state.currentPickerId,
          mode: state.mode,
        });

        startTimer(room, io);
        console.log(`[draft] started in room ${roomCode}`);
      } catch (err) {
        console.error('[start_draft] error:', err);
        socket.emit('error', { message: 'Erro ao carregar jogadores. Tente novamente.' });
      }
    });

    // Step 1a (main draft): pick a position → server returns 5 options
    socket.on('pick_position', ({ roomCode, participantId, positionId }) => {
      const result = pickPosition(roomCode, participantId, positionId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Step 1b (bench draft): pick a bench slot → server returns 5 options
    socket.on('pick_bench_slot', ({ roomCode, participantId, benchSlotId }) => {
      const result = pickBenchSlot(roomCode, participantId, benchSlotId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Step 2 (both phases): pick one of the 5 offered players
    socket.on('pick_player', async ({ roomCode, participantId, cartolaId }) => {
      const result = await pickPlayer(roomCode, participantId, cartolaId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Captain phase: pick captain from own starters
    socket.on('pick_captain', async ({ roomCode, participantId, cartolaId }) => {
      const result = await pickCaptain(roomCode, participantId, cartolaId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    socket.on('reconnect_participant', ({ roomCode, participantId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
      const participant = room.participants.get(participantId);
      if (!participant) return socket.emit('error', { message: 'Participante não encontrado.' });

      participant.socketId = socket.id;
      socket.join(roomCode);

      const state = getRoomState(roomCode);
      socket.emit('room_state', state);

      // Restart timer if the room is in progress but has no running timer
      // (happens when server restarts and first user reconnects)
      if ((room.status === 'drafting' || room.status === 'bench_drafting') && !room.timer) {
        startTimer(room, io);
      }

      if (room.status === 'drafting') {
        socket.emit('draft_started', {
          players: room.players,
          clubs: room.clubs,
          clubMatches: state.clubMatches,
          draftOrder: state.draftOrderIds,
          participants: state.participants,
          currentPickerId: state.currentPickerId,
          currentOptions: state.currentOptions,
          currentPickerPositionId: state.currentPickerPositionId,
          mode: state.mode,
          phase: 'main'
        });
      } else if (room.status === 'bench_drafting') {
        socket.emit('draft_started', {
          players: room.players,
          clubs: room.clubs,
          clubMatches: state.clubMatches,
          draftOrder: state.draftOrderIds,
          participants: state.participants,
          currentPickerId: state.currentPickerId,
          currentOptions: state.currentOptions,
          currentPickerPositionId: state.currentPickerPositionId,
          mode: state.mode,
          phase: 'bench'
        });
      } else if (room.status === 'complete') {
        socket.emit('draft_complete', { teams: state.participants });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      removeParticipantSocket(socket.id);
    });
  });
};
