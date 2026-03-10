import React, { useState, useEffect } from 'react';
import socket from '../socket.js';

const FORMATIONS = ['4-3-3', '4-4-2', '3-5-2', '4-5-1', '3-4-3'];

const FORMATION_DETAILS = {
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
  '3-5-2': { GOL: 1, LAT: 0, ZAG: 3, MEI: 5, ATA: 2 },
  '4-5-1': { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1 },
  '3-4-3': { GOL: 1, LAT: 0, ZAG: 3, MEI: 4, ATA: 3 }
};

const BENCH_SLOT_IDS = [21, 22, 23];

function formationTotal(f) {
  const d = FORMATION_DETAILS[f];
  return d ? Object.values(d).reduce((a, b) => a + b, 0) : 11;
}

function participantPicksDone(participant, phase) {
  if (!participant?.picks) return 0;
  if (phase === 'bench') return participant.picks.filter(p => BENCH_SLOT_IDS.includes(p.position_id)).length;
  return participant.picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id)).length;
}

export default function Lobby({ roomCode, participantId, isAdmin, initialState, onLeave }) {
  const [roomState, setRoomState] = useState(initialState || null);
  const [selectedFormation, setSelectedFormation] = useState(() => {
    const me = initialState?.participants?.find(p => p.id === participantId);
    return me?.formation || null;
  });
  const [draftMode, setDraftMode] = useState('realtime');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.on('room_state', (state) => {
      setRoomState(state);
      // Sync formation
      const me = state.participants.find(p => p.id === participantId);
      if (me?.formation) setSelectedFormation(me.formation);
    });
    return () => socket.off('room_state');
  }, [participantId]);

  const handleFormation = (f) => {
    setSelectedFormation(f);
    socket.emit('set_formation', { roomCode, participantId, formation: f });
  };

  const handleStartDraft = () => {
    socket.emit('start_draft', { roomCode, participantId, mode: draftMode });
  };

  const handleLeave = () => {
    socket.emit('leave_room', { roomCode, participantId });
    socket.once('left_room', () => onLeave?.());
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allReady = roomState?.participants?.every(p => p.formation);
  const canStart = isAdmin && allReady && roomState?.participants.length >= 2;

  const totalPicks = selectedFormation
    ? Object.values(FORMATION_DETAILS[selectedFormation]).reduce((a, b) => a + b, 0)
    : 0;

  const isParallelWaiting = roomState?.status === 'parallel_waiting';
  const parallelPhase = roomState?.parallelPhase || 'main';
  const currentPickerId = roomState?.currentPickerId;
  const isMyParallelTurn = isParallelWaiting && currentPickerId === participantId;
  const parallelCurrentDrafter = roomState?.participants?.find(p => p.id === currentPickerId);

  const handleStartMyTurn = () => {
    socket.emit('start_my_turn', { roomCode, participantId });
  };

  if (isParallelWaiting || (roomState?.mode === 'parallel' && roomState?.status !== 'lobby')) {
    const phaseLabel = parallelPhase === 'bench' ? 'Reservas' : parallelPhase === 'captain' ? 'Capitão' : 'Principal';
    const participants = roomState?.participants || [];

    return (
      <div className="min-h-screen p-4 max-w-2xl mx-auto">
        <div className="text-center mb-8 pt-6">
          <h1 className="text-3xl font-bold mb-1">⚽ Draft Paralelo</h1>
          <p className="text-gray-500 text-sm font-mono">{roomCode}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/50 text-blue-300 text-xs font-semibold px-3 py-1 rounded-full">
            👤 Fase: {phaseLabel}
          </div>
        </div>

        {/* Active drafter banner */}
        {currentPickerId && (
          <div className={`mb-6 rounded-xl p-4 text-center border ${
            isMyParallelTurn
              ? 'bg-cartola-green/10 border-cartola-green'
              : 'bg-blue-900/20 border-blue-700'
          }`}>
            {isMyParallelTurn ? (
              <>
                <p className="text-cartola-gold font-bold text-lg mb-3">É sua vez de draftar!</p>
                <button
                  onClick={handleStartMyTurn}
                  className="btn-primary text-base px-8 py-3"
                >
                  🚀 Iniciar meu Draft
                </button>
              </>
            ) : (
              <p className="text-gray-300">
                Aguardando <strong className="text-white">{parallelCurrentDrafter?.name || '...'}</strong> completar seu draft...
              </p>
            )}
          </div>
        )}

        {/* Pick counts per participant */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Progresso dos Times</h2>
          <div className="space-y-3">
            {participants.map(p => {
              const total = p.formation
                ? (parallelPhase === 'bench' ? 3 : formationTotal(p.formation))
                : 0;
              const done = participantPicksDone(p, parallelPhase);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const isCurrent = p.id === currentPickerId;
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={`flex items-center gap-1.5 ${p.id === participantId ? 'text-white font-semibold' : 'text-gray-300'}`}>
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-cartola-gold animate-pulse inline-block" />}
                      {p.id === roomState?.adminId ? '👑' : ''}
                      {p.name}
                      {p.id === participantId && <span className="text-xs text-gray-500">(você)</span>}
                    </span>
                    <span className="text-gray-500 text-xs">{done}/{total}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct === 100 ? 'bg-cartola-green' : isCurrent ? 'bg-cartola-gold' : 'bg-gray-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      <div className="text-center mb-8 pt-6 relative">
        <button
          onClick={handleLeave}
          className="absolute left-0 top-6 text-sm text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
        >
          ← Sair
        </button>
        <h1 className="text-3xl font-bold mb-2">⚽ Draft Cartola</h1>
        <div className="flex items-center justify-center gap-3">
          <span className="text-gray-400">Código da sala:</span>
          <button
            onClick={copyCode}
            className="font-mono text-2xl font-bold text-cartola-gold bg-gray-800 px-4 py-1 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {roomCode}
          </button>
          <span className="text-xs text-gray-500">{copied ? '✓ Copiado!' : 'clique para copiar'}</span>
        </div>
        {(roomState?.entry_fee ?? 0) > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-sm font-semibold px-3 py-1 rounded-full">
            🪙 Taxa de entrada: {roomState.entry_fee} moedas
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Participants */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">
            Participantes ({roomState?.participants.length || 0})
          </h2>
          <div className="space-y-2">
            {roomState?.participants.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.id === roomState.adminId ? '👑' : '👤'}</span>
                  <span className={p.id === participantId ? 'font-semibold text-white' : 'text-gray-300'}>
                    {p.name}
                    {p.id === participantId && <span className="text-xs text-gray-500 ml-1">(você)</span>}
                  </span>
                </div>
                <span className={`text-sm px-2 py-0.5 rounded ${p.formation ? 'bg-cartola-green/30 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                  {p.formation || 'aguardando...'}
                </span>
              </div>
            ))}
          </div>
          {roomState?.participants.length < 2 && (
            <p className="text-gray-600 text-sm mt-3 text-center">
              Compartilhe o código para outros entrarem
            </p>
          )}
        </div>

        {/* Formation Picker */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">Escolha sua Formação</h2>
          <div className="space-y-2">
            {FORMATIONS.map(f => {
              const details = FORMATION_DETAILS[f];
              const total = Object.values(details).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={f}
                  onClick={() => handleFormation(f)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                    selectedFormation === f
                      ? 'border-cartola-green bg-cartola-green/20 text-white'
                      : 'border-gray-700 hover:border-gray-600 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-lg">{f}</span>
                    <span className="text-xs text-gray-500">{total} picks</span>
                  </div>
                  <div className="flex gap-2 mt-1 text-xs text-gray-500">
                    {Object.entries(details).filter(([, v]) => v > 0).map(([pos, count]) => (
                      <span key={pos}>{count}×{pos}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Start button */}
      <div className="mt-8 text-center">
        {isAdmin ? (
          <div className="space-y-4">
            {/* Mode selector */}
            <div>
              <p className="text-sm text-gray-400 mb-2">Modo do draft</p>
              <div className="inline-flex bg-gray-800 rounded-lg p-1 gap-1">
                <button
                  onClick={() => setDraftMode('realtime')}
                  className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${
                    draftMode === 'realtime'
                      ? 'bg-cartola-green text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  ⚡ Tempo Real
                </button>
                <button
                  onClick={() => setDraftMode('parallel')}
                  className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${
                    draftMode === 'parallel'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  👤 Paralelo
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                {draftMode === 'realtime'
                  ? 'Todos escolhem em ordem cobra, alternando a cada pick'
                  : 'Cada jogador faz todos os seus picks de uma vez, um por vez'}
              </p>
            </div>

            <button
              onClick={handleStartDraft}
              disabled={!canStart}
              className="btn-primary text-lg px-10 py-4 disabled:opacity-40"
            >
              {canStart ? '🚀 Iniciar Draft' : allReady ? 'Aguardando mais participantes...' : 'Aguardando todos escolherem formação...'}
            </button>
            {!allReady && roomState?.participants.length >= 2 && (
              <p className="text-gray-500 text-sm mt-2">Todos os participantes precisam escolher uma formação</p>
            )}
          </div>
        ) : (
          <div className="card inline-block px-8 py-4">
            <p className="text-gray-400">
              {allReady && roomState?.participants.length >= 2
                ? '✅ Tudo pronto! Aguardando o admin iniciar...'
                : 'Aguardando todos escolherem formação...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
