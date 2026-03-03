const {
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
  findRoomBySocket
} = require('../services/draftManager');
const { getPlayersAndClubs } = require('../services/cartola');

module.exports = function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Create a new room
    socket.on('create_room', ({ participantName }) => {
      if (!participantName?.trim()) {
        return socket.emit('error', { message: 'Nome inválido.' });
      }
      const { roomCode, participantId } = createRoom(participantName.trim(), socket.id);
      socket.join(roomCode);
      socket.emit('room_joined', { roomCode, participantId, isAdmin: true });
      io.to(roomCode).emit('room_state', getRoomState(roomCode));
      console.log(`[room] created: ${roomCode} by ${participantName}`);
    });

    // Join an existing room
    socket.on('join_room', ({ roomCode, participantName }) => {
      if (!roomCode?.trim() || !participantName?.trim()) {
        return socket.emit('error', { message: 'Código ou nome inválido.' });
      }
      const result = joinRoom(roomCode.trim().toUpperCase(), participantName.trim(), socket.id);
      if (result.error) return socket.emit('error', { message: result.error });

      socket.join(roomCode.toUpperCase());
      socket.emit('room_joined', { roomCode: roomCode.toUpperCase(), participantId: result.participantId, isAdmin: false });
      io.to(roomCode.toUpperCase()).emit('room_state', getRoomState(roomCode.toUpperCase()));
      console.log(`[room] ${participantName} joined: ${roomCode}`);
    });

    // Set formation in lobby
    socket.on('set_formation', ({ roomCode, participantId, formation }) => {
      const result = setFormation(roomCode, participantId, formation);
      if (result.error) return socket.emit('error', { message: result.error });
      io.to(roomCode).emit('room_state', getRoomState(roomCode));
    });

    // Admin starts draft
    socket.on('start_draft', async ({ roomCode, participantId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
      if (room.adminId !== participantId) return socket.emit('error', { message: 'Apenas o admin pode iniciar.' });

      try {
        socket.emit('loading', { message: 'Carregando jogadores do banco local...' });
        const { players, clubs, clubMatches } = getPlayersAndClubs();

        const result = startDraft(roomCode, players, clubs, clubMatches);
        if (result.error) return socket.emit('error', { message: result.error });

        const state = getRoomState(roomCode);
        io.to(roomCode).emit('draft_started', {
          players,
          clubs,
          clubMatches,
          draftOrder: state.draftOrderIds,
          participants: state.participants,
          currentPickerId: state.currentPickerId
        });

        // Start timer for first pick
        startTimer(room, io);
        console.log(`[draft] started in room ${roomCode}`);
      } catch (err) {
        console.error('[start_draft] error:', err);
        socket.emit('error', { message: 'Erro ao carregar jogadores. Tente novamente.' });
      }
    });

    // Step 1: Pick a position → server returns 5 options
    socket.on('pick_position', ({ roomCode, participantId, positionId }) => {
      const result = pickPosition(roomCode, participantId, positionId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Step 2: Pick one of the 5 offered players
    socket.on('pick_player', ({ roomCode, participantId, cartolaId }) => {
      const result = pickPlayer(roomCode, participantId, cartolaId, io);
      if (result.error) return socket.emit('error', { message: result.error });
    });

    // Reconnect: associate socket with participant
    socket.on('reconnect_participant', ({ roomCode, participantId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit('error', { message: 'Sala não encontrada.' });
      const participant = room.participants.get(participantId);
      if (!participant) return socket.emit('error', { message: 'Participante não encontrado.' });

      participant.socketId = socket.id;
      socket.join(roomCode);

      const state = getRoomState(roomCode);
      socket.emit('room_state', state);

      if (room.status === 'drafting') {
        socket.emit('draft_started', {
          players: room.players,
          clubs: room.clubs,
          clubMatches: state.clubMatches,
          draftOrder: state.draftOrderIds,
          participants: state.participants,
          currentPickerId: state.currentPickerId,
          currentOptions: state.currentOptions,
          currentPickerPositionId: state.currentPickerPositionId
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      removeParticipantSocket(socket.id);
    });
  });
};
