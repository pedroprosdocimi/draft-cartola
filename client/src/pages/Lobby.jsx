import React, { useState, useEffect } from 'react';
import socket from '../socket.js';

const FORMATIONS = ['4-3-3', '4-4-2', '3-5-2', '4-5-1', '3-4-3'];

const FORMATION_DETAILS = {
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3, TEC: 1 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2, TEC: 1 },
  '3-5-2': { GOL: 1, LAT: 0, ZAG: 3, MEI: 5, ATA: 2, TEC: 1 },
  '4-5-1': { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1, TEC: 1 },
  '3-4-3': { GOL: 1, LAT: 0, ZAG: 3, MEI: 4, ATA: 3, TEC: 1 }
};

export default function Lobby({ roomCode, participantId, isAdmin }) {
  const [roomState, setRoomState] = useState(null);
  const [selectedFormation, setSelectedFormation] = useState(null);
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
    socket.emit('start_draft', { roomCode, participantId });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allReady = roomState?.participants.every(p => p.formation);
  const canStart = isAdmin && allReady && roomState?.participants.length >= 2;

  const totalPicks = selectedFormation
    ? Object.values(FORMATION_DETAILS[selectedFormation]).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      <div className="text-center mb-8 pt-6">
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
          <div>
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
