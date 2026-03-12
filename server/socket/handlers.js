const {
  createRoom,
  joinRoom,
  leaveRoom,
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
  removeParticipantSocket,
  findRoomBySocket,
  adminForcePick,
  adminSimAll,
  adminRemovePick,
  adminAddPick,
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

async function logCoinTransaction(userId, amount, balanceAfter, description) {
  try {
    await pool.query(
      `INSERT INTO coin_transactions (user_id, amount, balance_after, description, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, amount, balanceAfter, description, new Date().toISOString()]
    );
  } catch (e) {
    console.error('[coin_log] erro ao registrar transação:', e.message);
  }
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
      let createDeductCoins = null;
      if (fee > 0) {
        const user = await getUserFromToken(token);
        if (!user) return socket.emit('error', { message: 'Token inválido para cobrar entrada.' });
        if (user.coins < fee) {
          return socket.emit('error', { message: `Moedas insuficientes. Você tem ${user.coins} 🪙, precisa de ${fee} 🪙.` });
        }
        const deduct = await deductCoins(user.id, fee);
        if (!deduct.ok) return socket.emit('error', { message: `Moedas insuficientes.` });
        userId = user.id;
        createDeductCoins = deduct.coins;
        socket.emit('coins_updated', { coins: deduct.coins });
      }

      const { roomCode, participantId } = await createRoom(participantName.trim(), socket.id, fee);
      if (fee > 0 && userId) {
        await logCoinTransaction(userId, -fee, createDeductCoins, `Entrada sala ${roomCode}`);
      }
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
      let joinDeductCoins = null;

      if (fee > 0) {
        const user = await getUserFromToken(token);
        if (!user) return socket.emit('error', { message: 'Token inválido para cobrar entrada.' });
        if (user.coins < fee) {
          return socket.emit('error', { message: `Moedas insuficientes. Você tem ${user.coins} 🪙, precisa de ${fee} 🪙.` });
        }
        const deduct = await deductCoins(user.id, fee);
        if (!deduct.ok) return socket.emit('error', { message: `Moedas insuficientes.` });
        userId = user.id;
        joinDeductCoins = deduct.coins;
        socket.emit('coins_updated', { coins: deduct.coins });
      }

      const result = await joinRoom(code, participantName.trim(), socket.id);
      if (result.error) {
        if (fee > 0 && userId) {
          const refunded = await refundCoins(userId, fee);
          socket.emit('coins_updated', { coins: refunded });
          await logCoinTransaction(userId, fee, refunded, `Reembolso sala ${code} (sala cheia)`);
        }
        return socket.emit('error', { message: result.error });
      }

      if (fee > 0 && userId) {
        await logCoinTransaction(userId, -fee, joinDeductCoins, `Entrada sala ${code}`);
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
        io.to(roomCode).emit('loading', { message: 'Carregando jogadores do banco local...' });
        const { players, clubs, clubMatches } = await getPlayersAndClubs();

        const result = await startDraft(roomCode, players, clubs, clubMatches, mode || 'realtime');
        if (result.error) return socket.emit('error', { message: result.error });

        const state = getRoomState(roomCode);

        if (mode === 'parallel') {
          // Parallel: everyone stays in lobby waiting for their turn
          io.to(roomCode).emit('room_state', state);
        } else {
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
        }

        console.log(`[draft] started in room ${roomCode} (mode=${mode || 'realtime'})`);
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

    // Reroll the 5 offered players — costs 5 coins
    socket.on('reroll_options', async ({ roomCode, participantId, token }) => {
      const user = await getUserFromToken(token);
      if (!user) return socket.emit('error', { message: 'Token inválido. Faça login para usar moedas.' });

      const deduct = await deductCoins(user.id, 5);
      if (!deduct.ok) return socket.emit('error', { message: `Moedas insuficientes. Você precisa de 5 🪙 para sortear novamente.` });

      const result = rerollOptions(roomCode, participantId, io);
      if (result.error) {
        const refunded = await refundCoins(user.id, 5);
        socket.emit('coins_updated', { coins: refunded });
        return socket.emit('error', { message: result.error });
      }

      await logCoinTransaction(user.id, -5, deduct.coins, `Novo sorteio (sala ${roomCode})`);
      socket.emit('coins_updated', { coins: deduct.coins });
    });

    // Captain phase: pick captain from own starters
    socket.on('pick_captain', async ({ roomCode, participantId, cartolaId }) => {
      const result = await pickCaptain(roomCode, participantId, cartolaId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Parallel mode: participant clicks "Iniciar meu Draft"
    socket.on('start_my_turn', async ({ roomCode, participantId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });

      const result = await startMyTurn(roomCode, participantId);
      if (result.error) return socket.emit('error', { message: result.error });

      const state = getRoomState(roomCode);

      if (result.queued) {
        // Player is waiting in queue — keep them in lobby with position info
        socket.emit('parallel_queued', {
          position: result.position,
          waitingFor: result.waitingFor,
        });
        socket.emit('room_state', state);
        socket.to(roomCode).emit('room_state', state);
        return;
      }

      // Player starts immediately — notify others, send draft screen to this player
      socket.to(roomCode).emit('room_state', state);
      socket.emit('draft_started', {
        players: room.players,
        clubs: room.clubs,
        clubMatches: state.clubMatches,
        draftOrder: state.draftOrderIds,
        participants: state.participants,
        currentPickerId: state.currentPickerId,
        currentOptions: null,
        mode: state.mode,
        phase: 'main',
      });

      startTimer(room, io);
    });

    socket.on('reconnect_participant', ({ roomCode, participantId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
      const participant = room.participants.get(participantId);
      if (!participant) return socket.emit('error', { message: 'Participante não encontrado.' });

      participant.socketId = socket.id;
      socket.join(roomCode);

      const state = getRoomState(roomCode);

      // parallel_waiting: everyone is in the lobby
      if (room.status === 'parallel_waiting') {
        socket.emit('room_state', state);
        return;
      }

      // Restart timer if the room is in progress but has no running timer
      if ((room.status === 'drafting' || room.status === 'bench_drafting' || room.status === 'captain_drafting') && !room.timer) {
        // In parallel mode, only restart if it's this participant's turn
        if (room.mode !== 'parallel' || state.currentPickerId === participantId) {
          startTimer(room, io);
        }
      }

      if (room.status === 'complete') {
        socket.emit('draft_complete', { teams: state.participants });
        return;
      }

      // In parallel mode, non-current-picker stays in lobby
      if (room.mode === 'parallel' && state.currentPickerId !== participantId) {
        socket.emit('room_state', state);
        return;
      }

      // Realtime mode or parallel mode current picker → send draft screen
      const phaseMap = { drafting: 'main', bench_drafting: 'bench', captain_drafting: 'captain' };
      const phase = phaseMap[room.status] || 'main';

      if (room.status === 'drafting' || room.status === 'bench_drafting' || room.status === 'captain_drafting') {
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
          phase,
        });
      } else {
        socket.emit('room_state', state);
      }
    });

    // ── Admin actions ──────────────────────────────────────────────────────────
    socket.on('admin_force_pick', async ({ roomCode, participantId }) => {
      const result = await adminForcePick(roomCode, participantId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    socket.on('admin_sim_all', async ({ roomCode, participantId }) => {
      const result = await adminSimAll(roomCode, participantId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    socket.on('admin_remove_pick', async ({ roomCode, participantId, targetParticipantId, cartolaId }) => {
      const result = await adminRemovePick(roomCode, participantId, targetParticipantId, cartolaId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    socket.on('admin_add_pick', async ({ roomCode, participantId, targetParticipantId, cartolaId, positionId }) => {
      const result = await adminAddPick(roomCode, participantId, targetParticipantId, cartolaId, positionId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      removeParticipantSocket(socket.id);
    });
  });
};
