import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config.js';

const POS_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };
const POS_ORDER = [1, 2, 3, 4, 5, 6];
const POS_COLORS = {
  1: 'bg-blue-700',
  2: 'bg-green-700',
  3: 'bg-green-700',
  4: 'bg-yellow-600',
  5: 'bg-red-600',
  6: 'bg-gray-600',
};

const STATUS_INFO = {
  2: { label: 'Dúvida',     bg: 'bg-yellow-900/40', text: 'text-yellow-300' },
  3: { label: 'Suspenso',   bg: 'bg-red-900/40',    text: 'text-red-300'    },
  5: { label: 'Contundido', bg: 'bg-orange-900/40', text: 'text-orange-300' },
  6: { label: 'Nulo',       bg: 'bg-gray-800',      text: 'text-gray-500'   },
};

function StatusBadge({ statusId }) {
  const info = STATUS_INFO[statusId];
  if (!info) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${info.bg} ${info.text} font-medium flex-shrink-0`}>
      {info.label}
    </span>
  );
}

function PlayerRow({ player, match }) {
  const posColor = POS_COLORS[player.position_id] || 'bg-gray-600';
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 hover:bg-gray-800/50 rounded-lg">
      <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
        {player.photo
          ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-white truncate">{player.nickname}</div>
        <div className="text-xs text-gray-500">
          {player.club?.abbreviation || `Clube ${player.club_id}`}
          {match && <span className="text-gray-600 ml-1">· {match}</span>}
        </div>
      </div>

      <span className={`${posColor} text-white text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline`}>
        {POS_LABELS[player.position_id]}
      </span>

      <StatusBadge statusId={player.status_id} />

      <div className="text-right flex-shrink-0">
        <div className="text-sm font-semibold text-cartola-gold">{(player.average_score || 0).toFixed(1)}</div>
        <div className="text-xs text-gray-600">C${(player.price || 0).toFixed(1)}</div>
      </div>
    </div>
  );
}

export default function Admin({ onBack }) {
  const [players, setPlayers] = useState([]);
  const [clubMatches, setClubMatches] = useState({});
  const [syncStatus, setSyncStatus] = useState(null);
  const [activePos, setActivePos] = useState(0); // 0 = todos
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const token = localStorage.getItem('draft_token');
  const headers = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [playersRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/api/players`, { headers }),
        fetch(`${API_URL}/api/sync/status`, { headers }),
      ]);
      const playersData = await playersRes.json();
      const statusData = await statusRes.json();

      if (playersData.players) setPlayers(playersData.players);
      if (playersData.clubMatches) setClubMatches(playersData.clubMatches);
      if (statusData.ok !== false) setSyncStatus(statusData);
    } catch {
      setError('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sync`, { method: 'POST', headers });
      const data = await res.json();
      if (data.ok) {
        setSyncResult(data);
        await loadData();
      } else {
        setError(data.error || 'Erro no sync.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = activePos === 0
    ? players
    : players.filter(p => p.position_id === activePos);

  const titulares = filtered
    .filter(p => p.status_id === 7)
    .sort((a, b) => (b.average_score || 0) - (a.average_score || 0));

  const outros = filtered
    .filter(p => p.status_id !== 7)
    .sort((a, b) => (b.average_score || 0) - (a.average_score || 0));

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pt-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Voltar
        </button>
        <h1 className="text-xl font-bold text-white">Painel Admin</h1>
      </div>

      {/* Sync card */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-semibold text-gray-300 mb-2">Status do Banco</h2>
            {loading && players.length === 0 ? (
              <p className="text-gray-600 text-sm">Carregando...</p>
            ) : syncStatus?.playerCount > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-400">
                  Rodada <span className="text-white font-bold">{syncStatus.debug?.latestRoundNumber ?? '–'}</span>
                </span>
                <span className="text-gray-400">
                  <span className="text-white font-bold">{syncStatus.playerCount}</span> jogadores
                </span>
                <span className="text-gray-400">
                  <span className="text-green-400 font-bold">{syncStatus.probableCount}</span> prováveis titulares
                </span>
                <span className="text-gray-400">
                  <span className="text-orange-400 font-bold">
                    {(syncStatus.playerCount || 0) - (syncStatus.probableCount || 0)}
                  </span> não cotados
                </span>
                <span className="text-gray-400">
                  <span className="text-white font-bold">{syncStatus.matchCount}</span> jogos na rodada
                </span>
              </div>
            ) : (
              <p className="text-gray-600 text-sm">Banco vazio — sincronize para importar os jogadores.</p>
            )}

            {syncResult && (
              <p className="mt-2 text-green-400 text-sm">
                ✓ Sync concluído — rodada {syncResult.roundNumber}, {syncResult.playerCount} jogadores, {syncResult.matchCount} partidas
              </p>
            )}
            {error && (
              <p className="mt-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-1.5">
                {error}
              </p>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary flex-shrink-0 flex items-center gap-2"
          >
            <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
            {syncing ? 'Sincronizando...' : 'Sincronizar Cartola'}
          </button>
        </div>
      </div>

      {/* Position filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {[{ id: 0, label: 'Todos' }, ...POS_ORDER.map(id => ({ id, label: POS_LABELS[id] }))].map(pos => (
          <button
            key={pos.id}
            onClick={() => setActivePos(pos.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activePos === pos.id
                ? 'bg-cartola-green text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {pos.label}
            {pos.id !== 0 && (
              <span className="ml-1 text-xs opacity-60">
                ({players.filter(p => p.position_id === pos.id && p.status_id === 7).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Player lists */}
      {loading && players.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Carregando jogadores...</div>
      ) : players.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">Nenhum jogador no banco.</p>
          <p className="text-gray-600 text-sm">Clique em "Sincronizar Cartola" para importar.</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Titulares */}
          <div className="card">
            <h3 className="font-semibold text-green-400 mb-1 flex items-center gap-2">
              ✅ Prováveis titulares
              <span className="text-xs text-gray-500 font-normal">({titulares.length})</span>
            </h3>
            <p className="text-xs text-gray-600 mb-3">Estes jogadores aparecerão nos drafts como opções selecionáveis</p>
            {titulares.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">Nenhum nesta posição</p>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {titulares.map(p => (
                  <PlayerRow
                    key={p.cartola_id}
                    player={p}
                    match={clubMatches[p.club_id] || clubMatches[String(p.club_id)] || null}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Não cotados */}
          <div className="card">
            <h3 className="font-semibold text-gray-400 mb-1 flex items-center gap-2">
              ⚠️ Não cotados como titulares
              <span className="text-xs text-gray-500 font-normal">({outros.length})</span>
            </h3>
            <p className="text-xs text-gray-600 mb-3">Vieram do sync mas não serão oferecidos nos drafts</p>
            {outros.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">Nenhum nesta posição</p>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {outros.map(p => (
                  <PlayerRow
                    key={p.cartola_id}
                    player={p}
                    match={clubMatches[p.club_id] || clubMatches[String(p.club_id)] || null}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
