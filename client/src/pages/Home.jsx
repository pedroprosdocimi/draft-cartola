import React, { useState, useEffect } from 'react';
import socket from '../socket.js';
import { API_URL } from '../config.js';
import DraftDetail from '../components/DraftDetail.jsx';

function readSession() {
  try { return JSON.parse(localStorage.getItem('draft_session')); } catch { return null; }
}

const STATUS_LABELS = {
  lobby: 'Aguardando',
  drafting: 'Em andamento',
  bench_drafting: 'Reservas',
  captain_drafting: 'Capitão',
  parallel_waiting: 'Paralelo — aguardando',
};

export default function Home({ user, onLogout, onGoAdmin, onRejoin }) {
  const [roomCode, setRoomCode] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'join' — only admin sees tabs
  const [entryFee, setEntryFee] = useState(0);
  const [wantToPlay, setWantToPlay] = useState(true);
  const [activeDrafts, setActiveDrafts] = useState([]);
  const [historyDrafts, setHistoryDrafts] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [detailRoomCode, setDetailRoomCode] = useState(null);

  const activeSession = readSession();

  useEffect(() => {
    const token = localStorage.getItem('draft_token');
    if (!token) return;
    fetch(`${API_URL}/api/drafts/active`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.drafts) setActiveDrafts(data.drafts); })
      .catch(() => {});
    fetch(`${API_URL}/api/drafts/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.drafts) setHistoryDrafts(data.drafts); })
      .catch(() => {});
  }, []);

  const handleRejoinDraft = (rc, pid) => {
    socket.emit('reconnect_participant', { roomCode: rc, participantId: pid });
  };

  // Auto-fill invite code from URL (e.g. /ABC123)
  useEffect(() => {
    const invite = sessionStorage.getItem('draft_invite_code');
    if (invite) {
      sessionStorage.removeItem('draft_invite_code');
      setRoomCode(invite);
      setTab('join');
    }
  }, []);

  const handleCreate = () => {
    const token = localStorage.getItem('draft_token');
    socket.emit('create_room', { participantName: user.nomeTime, entryFee, token, spectate: !wantToPlay });
  };

  const handleJoin = () => {
    if (roomCode.length < 6) return;
    const token = localStorage.getItem('draft_token');
    socket.emit('join_room', { roomCode: roomCode.trim().toUpperCase(), participantName: user.nomeTime, token });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {detailRoomCode && (
        <DraftDetail roomCode={detailRoomCode} onClose={() => setDetailRoomCode(null)} />
      )}
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-4xl font-bold text-white mb-2">Draft Cartola</h1>
          <p className="text-gray-400">Monte seu time com jogadores reais do Brasileirão</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className="text-gray-400 text-sm">
              Olá, <span className="text-white font-medium">{user.nome.split(' ')[0]}</span>
              {' '}·{' '}
              <span className="text-cartola-green font-medium">{user.nomeTime}</span>
              {user.isAdmin && (
                <span className="ml-2 text-xs bg-cartola-gold/20 text-cartola-gold border border-cartola-gold/30 px-2 py-0.5 rounded-full">
                  admin
                </span>
              )}
            </span>
            <button onClick={onLogout} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
              Sair
            </button>
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-sm font-semibold px-3 py-1 rounded-full">
              🪙 {user.coins ?? 0} moedas
            </span>
          </div>
        </div>

        {/* Active drafts from server */}
        {activeDrafts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Seus drafts ativos</p>
            <div className="space-y-2">
              {activeDrafts.map(draft => (
                <div key={draft.room_code} className="rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{draft.room_code}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cartola-green/20 text-green-400 border border-cartola-green/30">
                        {STATUS_LABELS[draft.status] || draft.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{draft.participant_count} participante{draft.participant_count !== '1' ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={() => setDetailRoomCode(draft.room_code)}
                    className="flex-shrink-0 text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Pontuação
                  </button>
                  <button
                    onClick={() => handleRejoinDraft(draft.room_code, draft.participant_id)}
                    className="flex-shrink-0 btn-primary text-sm py-1.5 px-4"
                  >
                    Entrar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active draft banner */}
        {activeSession?.roomCode && (
          <div className="mb-4 rounded-xl border border-cartola-green/50 bg-cartola-green/10 p-4 flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-cartola-green" />
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-cartola-green animate-ping" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Draft em andamento</p>
              <p className="text-gray-400 text-xs font-mono mt-0.5">{activeSession.roomCode}</p>
            </div>
            <button
              onClick={onRejoin}
              className="flex-shrink-0 btn-primary text-sm py-1.5 px-4"
            >
              Voltar
            </button>
          </div>
        )}

        {/* Card */}
        <div className="card">

          {/* Admin: tabs to switch between create and join */}
          {user.isAdmin && (
            <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setTab('create')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'create' ? 'bg-cartola-green text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Criar Sala
              </button>
              <button
                onClick={() => setTab('join')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'join' ? 'bg-cartola-green text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Entrar com Código
              </button>
            </div>
          )}

          {/* Non-admin: section label */}
          {!user.isAdmin && (
            <p className="text-sm font-medium text-gray-400 mb-4">Entrar em uma sala</p>
          )}

          {/* Create room — admin only */}
          {user.isAdmin && tab === 'create' && (
            <>
              {/* Want to play toggle */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-400 mb-2">Participação</p>
                <div className="inline-flex bg-gray-800 rounded-lg p-1 gap-1">
                  <button
                    onClick={() => setWantToPlay(true)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      wantToPlay ? 'bg-cartola-green text-white shadow' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ⚽ Quero jogar
                  </button>
                  <button
                    onClick={() => setWantToPlay(false)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      !wantToPlay ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    👁️ Só observar
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1.5">
                  {wantToPlay
                    ? `Você entrará como ${user.nomeTime} e participará do draft`
                    : 'Você administra a sala mas não drafta'}
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  🪙 Taxa de entrada (moedas por participante)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={entryFee}
                    onChange={e => setEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="input-field w-32 text-center font-mono text-lg"
                  />
                  <span className="text-gray-500 text-sm">moedas</span>
                  {entryFee === 0 && <span className="text-xs text-gray-600">(gratuito)</span>}
                  {entryFee > 0 && wantToPlay && (
                    <span className="text-xs text-yellow-400">
                      Você também pagará {entryFee} 🪙
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={wantToPlay && entryFee > 0 && (user.coins ?? 0) < entryFee}
                className="btn-primary w-full disabled:opacity-40"
              >
                ✨ Criar Sala{wantToPlay && entryFee > 0 ? ` (-${entryFee} 🪙)` : ''}
              </button>
              {wantToPlay && entryFee > 0 && (user.coins ?? 0) < entryFee && (
                <p className="text-red-400 text-xs mt-2 text-center">
                  Moedas insuficientes para criar esta sala.
                </p>
              )}
            </>
          )}

          {/* Join room — everyone */}
          {(!user.isAdmin || tab === 'join') && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Código da sala</label>
                <input
                  type="text"
                  className="input-field uppercase tracking-widest text-xl text-center font-mono"
                  placeholder="ABC123"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  maxLength={6}
                  autoFocus
                />
                <p className="text-xs text-gray-600 mt-2 text-center">
                  Você entrará como <span className="text-white">{user.nomeTime}</span>
                </p>
              </div>
              <button
                onClick={handleJoin}
                className="btn-primary w-full"
                disabled={roomCode.length < 6}
              >
                🚀 Entrar na Sala
              </button>
            </>
          )}
        </div>

        {user.isAdmin && (
          <div className="mt-4 text-center">
            <button
              onClick={onGoAdmin}
              className="text-xs text-gray-600 hover:text-cartola-gold transition-colors border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg"
            >
              ⚙️ Painel Admin
            </button>
          </div>
        )}

        {/* Draft history */}
        {historyDrafts.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowHistory(h => !h)}
              className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-300 transition-colors"
            >
              <span>Histórico de drafts ({historyDrafts.length})</span>
              <span>{showHistory ? '▲' : '▼'}</span>
            </button>

            {showHistory && (
              <div className="space-y-2">
                {historyDrafts.map(draft => (
                  <button
                    key={draft.room_code}
                    onClick={() => setDetailRoomCode(draft.room_code)}
                    className="w-full rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-left hover:border-gray-600 hover:bg-gray-800/60 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-gray-300 text-sm">{draft.room_code}</span>
                      <span className="text-xs text-gray-600">
                        {draft.completed_at
                          ? new Date(draft.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '—'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{draft.participants_names}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-4">
          Dados dos jogadores via API não-oficial do Cartola FC
        </p>
      </div>
    </div>
  );
}
