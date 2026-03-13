import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../config.js';
import SimDraft from '../components/SimDraft.jsx';
import DraftHistory from '../components/DraftHistory.jsx';

const POS_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA' };
const POS_ORDER = [1, 2, 3, 4, 5];
const POS_SORT = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
const POS_COLORS = {
  1: 'bg-blue-700', 2: 'bg-green-700', 3: 'bg-green-700',
  4: 'bg-yellow-600', 5: 'bg-red-600',
};

const STATUS_INFO = {
  7: { label: 'Provável',   bg: 'bg-green-900/40',  text: 'text-green-300'  },
  2: { label: 'Dúvida',     bg: 'bg-yellow-900/40', text: 'text-yellow-300' },
  3: { label: 'Suspenso',   bg: 'bg-red-900/40',    text: 'text-red-300'    },
  5: { label: 'Contundido', bg: 'bg-orange-900/40', text: 'text-orange-300' },
  6: { label: 'Nulo',       bg: 'bg-gray-800',      text: 'text-gray-500'   },
};

// Status options for the "não cotados" table (excludes Provável)
const OUTROS_STATUS_ORDER = [2, 5, 3, 6];

function sortByPos(list, getEligible) {
  return [...list].sort((a, b) => {
    const pa = POS_SORT[a.position_id] ?? 9;
    const pb = POS_SORT[b.position_id] ?? 9;
    if (pa !== pb) return pa - pb;
    if (getEligible) {
      const ea = getEligible(a) ? 0 : 1;
      const eb = getEligible(b) ? 0 : 1;
      if (ea !== eb) return ea - eb;
    }
    return (b.average_score || 0) - (a.average_score || 0);
  });
}

function StatusBadge({ statusId }) {
  const info = STATUS_INFO[statusId];
  if (!info) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${info.bg} ${info.text} font-medium flex-shrink-0`}>
      {info.label}
    </span>
  );
}

function scoreColor(score) {
  if (score >= 6) return 'text-green-400';
  if (score >= 3) return 'text-cartola-gold';
  return 'text-red-400';
}

// Grid template: photo | name | pos | status | rd×N | avg | action
function colTemplate(nRounds) {
  return `36px minmax(120px, 220px) 50px 90px repeat(${nRounds}, 54px) 54px 90px`;
}

const STATUS_SORT_ORDER = { 7: 0, 2: 1, 5: 2, 3: 3, 6: 4 };

function applySort(list, { col, dir }) {
  if (!col) return list;
  return [...list].sort((a, b) => {
    if (col === 'name') return dir * (a.nickname || '').localeCompare(b.nickname || '');
    let va, vb;
    if (col === 'position') {
      va = POS_SORT[a.position_id] ?? 9;
      vb = POS_SORT[b.position_id] ?? 9;
    } else if (col === 'status') {
      va = STATUS_SORT_ORDER[a.status_id] ?? 9;
      vb = STATUS_SORT_ORDER[b.status_id] ?? 9;
    } else if (col === 'avg') {
      va = a.average_score || 0;
      vb = b.average_score || 0;
    } else if (col.startsWith('round_')) {
      const round = Number(col.slice(6));
      va = a.recentScores?.find(s => s.round === round)?.score ?? 0;
      vb = b.recentScores?.find(s => s.round === round)?.score ?? 0;
    } else {
      return 0;
    }
    return dir * (va > vb ? 1 : va < vb ? -1 : 0);
  });
}

function SortTh({ col, children, sort, onSort, defaultDir = 1, align = 'center' }) {
  const active = sort.col === col;
  return (
    <button
      type="button"
      onClick={() => onSort({ col, dir: active ? -sort.dir : defaultDir })}
      className={`w-full text-${align} text-xs font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors hover:text-gray-200 ${active ? 'text-white' : 'text-gray-500'}`}
    >
      {children}
      <span className="ml-0.5 opacity-60">{active ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
    </button>
  );
}

function RoundsHeader({ recentRounds, sort, onSort }) {
  return (
    <div
      className="grid items-center gap-x-2 px-3 py-1.5 border-b border-gray-700"
      style={{ gridTemplateColumns: colTemplate(recentRounds.length) }}
    >
      <div />
      <SortTh col="name" sort={sort} onSort={onSort} defaultDir={1} align="left">Jogador</SortTh>
      <SortTh col="position" sort={sort} onSort={onSort} defaultDir={1}>Pos</SortTh>
      <SortTh col="status" sort={sort} onSort={onSort} defaultDir={1}>Status</SortTh>
      {recentRounds.map(r => (
        <SortTh key={r} col={`round_${r}`} sort={sort} onSort={onSort} defaultDir={-1}>Rd {r}</SortTh>
      ))}
      <SortTh col="avg" sort={sort} onSort={onSort} defaultDir={-1}>Méd</SortTh>
      <div />
    </div>
  );
}

function PlayerRow({ player, match, action, recentRounds = [] }) {
  const posColor = POS_COLORS[player.position_id] || 'bg-gray-600';
  return (
    <div
      className="grid items-center gap-x-2 px-3 py-2 hover:bg-gray-800/50 rounded-lg border-b border-gray-800/40 last:border-0"
      style={{ gridTemplateColumns: colTemplate(recentRounds.length) }}
    >
      {/* Photo */}
      <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
        {player.photo
          ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>}
      </div>

      {/* Name + club + match */}
      <div className="min-w-0 pl-1">
        <div className="font-medium text-sm text-white truncate">{player.nickname}</div>
        <div className="text-xs text-gray-500 truncate">
          {player.club?.abbreviation || `Clube ${player.club_id}`}
          {match && <span className="text-gray-600 ml-1">· {match}</span>}
        </div>
      </div>

      {/* Position */}
      <div className="flex justify-center">
        <span className={`${posColor} text-white text-xs font-bold px-1.5 py-0.5 rounded`}>
          {POS_LABELS[player.position_id]}
        </span>
      </div>

      {/* Status */}
      <div className="flex justify-center">
        <StatusBadge statusId={player.status_id} />
      </div>

      {/* Last N rounds */}
      {recentRounds.map(round => {
        const s = player.recentScores?.find(e => e.round === round);
        const score = s?.score ?? 0;
        return (
          <div key={round} className={`text-center text-sm font-semibold ${scoreColor(score)}`}>
            {score.toFixed(1)}
          </div>
        );
      })}

      {/* Average */}
      <div className="text-center text-sm text-gray-400 font-medium">
        {(player.average_score || 0).toFixed(1)}
      </div>

      {/* Action */}
      <div className="flex justify-center">{action}</div>
    </div>
  );
}

const PAGE_SIZE = 10;

function Pagination({ page, total, onChange }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1 border-t border-gray-800 mt-1">
      <span className="text-xs text-gray-600">{start}–{end} de {total}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(0)}
          disabled={page === 0}
          className="px-1.5 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >«</button>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          className="px-2 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >‹</button>
        <span className="text-xs text-gray-400 px-2 font-medium">{page + 1} / {totalPages}</span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >›</button>
        <button
          onClick={() => onChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="px-1.5 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >»</button>
      </div>
    </div>
  );
}

// Reusable position tab row
function PosFilter({ value, onChange, players, countStatus }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      <button
        onClick={() => onChange(0)}
        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          value === 0 ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
      >
        Todas pos.
      </button>
      {POS_ORDER.map(id => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === id ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          {POS_LABELS[id]}
          <span className="ml-1 opacity-50">
            ({players.filter(p => p.position_id === id && (countStatus == null || p.status_id === countStatus)).length})
          </span>
        </button>
      ))}
    </div>
  );
}

// Reusable club dropdown
function ClubSelect({ value, onChange, clubs }) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-cartola-green cursor-pointer"
    >
      <option value={0}>Todos os times</option>
      {clubs.map(c => (
        <option key={c.id} value={c.id}>
          {c.name && c.name !== c.abbreviation ? `${c.abbreviation} — ${c.name}` : c.abbreviation}
        </option>
      ))}
    </select>
  );
}

export default function Admin({ onBack }) {
  const [players, setPlayers] = useState([]);
  const [clubMatches, setClubMatches] = useState({});
  const [syncStatus, setSyncStatus] = useState(null);
  const [eligibleIds, setEligibleIds] = useState(new Set());
  const [excludedIds, setExcludedIds] = useState(new Set()); // prováveis excluídos manualmente do pool

  // Table 1 (titulares) filters + sort + page
  const [tPos, setTPos] = useState(0);
  const [tClub, setTClub] = useState(0);
  const [tSort, setTSort] = useState({ col: 'position', dir: 1 });
  const [tPage, setTPage] = useState(0);

  // Table 2 (outros) filters + sort + page
  const [oPos, setOPos] = useState(0);
  const [oStatus, setOStatus] = useState(0);
  const [oClub, setOClub] = useState(0);
  const [oSort, setOSort] = useState({ col: 'position', dir: 1 });
  const [oPage, setOPage] = useState(0);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingScores, setSyncingScores] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [scoreSyncResult, setScoreSyncResult] = useState(null);

  // Users / coins management
  const [users, setUsers] = useState([]);
  const [coinDelta, setCoinDelta] = useState({});
  const [adjustingUserId, setAdjustingUserId] = useState(null);
  const [coinError, setCoinError] = useState(null);

  // Coin transactions history
  const [coinTx, setCoinTx] = useState([]);
  const [coinTxLoading, setCoinTxLoading] = useState(false);
  const [coinTxFilter, setCoinTxFilter] = useState(0); // 0 = todos, userId = filtro

  const token = localStorage.getItem('draft_token');
  const headers = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [playersRes, statusRes, eligibleRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/players`, { headers }),
        fetch(`${API_URL}/api/sync/status`, { headers }),
        fetch(`${API_URL}/api/admin/eligible`, { headers }),
        fetch(`${API_URL}/api/admin/users`, { headers }),
      ]);
      const playersData = await playersRes.json();
      const statusData = await statusRes.json();
      const eligibleData = await eligibleRes.json();
      const usersData = await usersRes.json();

      if (playersData.players) setPlayers(playersData.players);
      if (playersData.clubMatches) setClubMatches(playersData.clubMatches);
      if (statusData.ok !== false) setSyncStatus(statusData);
      if (eligibleData.eligible) setEligibleIds(new Set(eligibleData.eligible));
      if (usersData.users) setUsers(usersData.users);
    } catch {
      setError('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const loadCoinTransactions = useCallback(async (userId = 0) => {
    setCoinTxLoading(true);
    try {
      const url = userId
        ? `${API_URL}/api/admin/coin-transactions?user_id=${userId}`
        : `${API_URL}/api/admin/coin-transactions`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.transactions) setCoinTx(data.transactions);
    } catch {
      // silently fail
    } finally {
      setCoinTxLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCoinTransactions(coinTxFilter); }, [coinTxFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdjustCoins = async (userId, delta) => {
    if (!delta || delta === 0) return;
    setAdjustingUserId(userId);
    setCoinError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/coins`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, coins: data.coins } : u));
        setCoinDelta(prev => ({ ...prev, [userId]: 0 }));
        loadCoinTransactions(coinTxFilter);
      } else {
        setCoinError(data.error || 'Erro ao ajustar moedas.');
      }
    } catch {
      setCoinError('Erro de conexão.');
    } finally {
      setAdjustingUserId(null);
    }
  };

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

  const handleSyncScores = async () => {
    setSyncingScores(true);
    setScoreSyncResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sync/scores`, { method: 'POST', headers });
      const data = await res.json();
      if (data.ok) {
        setScoreSyncResult(data);
      } else {
        setError(data.error || 'Erro ao buscar pontuações.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setSyncingScores(false);
    }
  };

  const handleToggleEligible = async (cartolaId) => {
    setTogglingId(cartolaId);
    const isEligible = eligibleIds.has(cartolaId);
    try {
      const res = await fetch(`${API_URL}/api/admin/eligible/${cartolaId}`, {
        method: isEligible ? 'DELETE' : 'POST',
        headers,
      });
      if (res.ok) {
        setEligibleIds(prev => {
          const next = new Set(prev);
          isEligible ? next.delete(cartolaId) : next.add(cartolaId);
          return next;
        });
      }
    } catch {
      setError('Erro ao atualizar jogador.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleRemoveFromPool = (cartolaId) => {
    if (eligibleIds.has(cartolaId)) {
      handleToggleEligible(cartolaId); // remove from eligible list (persisted)
    } else {
      setExcludedIds(prev => new Set([...prev, cartolaId])); // exclude probable locally
    }
  };

  const handleRestoreToPool = (cartolaId) => {
    setExcludedIds(prev => { const next = new Set(prev); next.delete(cartolaId); return next; });
  };

  // Top 3 most recent round numbers across all players
  const recentRounds = useMemo(() => {
    const roundSet = new Set();
    for (const p of players) {
      for (const s of p.recentScores || []) roundSet.add(s.round);
    }
    return [...roundSet].sort((a, b) => b - a).slice(0, 3);
  }, [players]);

  // Clubs list sorted alphabetically
  const clubs = useMemo(() => {
    const seen = new Set();
    return players
      .map(p => p.club)
      .filter(c => c && !seen.has(c.id) && seen.add(c.id))
      .sort((a, b) => (a.abbreviation || '').localeCompare(b.abbreviation || ''));
  }, [players]);

  // Table 1: pool do draft = prováveis (status_id=7) + adicionados manualmente, exceto excluídos
  const poolDraft = useMemo(() => {
    const list = players
      .filter(p => (p.status_id === 7 || eligibleIds.has(p.cartola_id)) && !excludedIds.has(p.cartola_id))
      .filter(p => tPos === 0  || p.position_id === tPos)
      .filter(p => tClub === 0 || p.club_id === tClub);
    return applySort(list, tSort);
  }, [players, eligibleIds, excludedIds, tPos, tClub, tSort]);

  // Club counts for the pool draft sidebar (respects tPos + tClub filters)
  // Shows ALL clubs (even those with 0 after filtering)
  const clubCounts = useMemo(() => {
    const countMap = {};
    for (const p of poolDraft) {
      countMap[p.club_id] = (countMap[p.club_id] || 0) + 1;
    }
    return clubs
      .map(c => ({ name: c.name || c.abbreviation, count: countMap[c.id] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [poolDraft, clubs]);

  // Table 2: não cotados que ainda NÃO foram adicionados ao pool (+ prováveis excluídos manualmente)
  const outros = useMemo(() => {
    const list = players
      .filter(p => (p.status_id !== 7 || excludedIds.has(p.cartola_id)) && !eligibleIds.has(p.cartola_id))
      .filter(p => oPos === 0    || p.position_id === oPos)
      .filter(p => oStatus === 0 || p.status_id === oStatus)
      .filter(p => oClub === 0   || p.club_id === oClub);
    return applySort(list, oSort);
  }, [players, eligibleIds, excludedIds, oPos, oStatus, oClub, oSort]);

  // Reset pages when filters or sort change
  useEffect(() => { setTPage(0); }, [tPos, tClub, tSort, eligibleIds, excludedIds]);
  useEffect(() => { setOPage(0); }, [oPos, oStatus, oClub, oSort, eligibleIds, excludedIds]);

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">

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
                  <span className="text-blue-400 font-bold">{eligibleIds.size}</span> adicionados manualmente
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
            {scoreSyncResult && (
              <p className="mt-2 text-blue-400 text-sm">
                ✓ Pontuações atualizadas — rodada {scoreSyncResult.roundNumber}, {scoreSyncResult.count} jogadores
              </p>
            )}
            {error && (
              <p className="mt-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-1.5">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-primary flex items-center gap-2"
            >
              <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
              {syncing ? 'Sincronizando...' : 'Sincronizar Cartola'}
            </button>
            <button
              onClick={handleSyncScores}
              disabled={syncingScores}
              className="flex items-center gap-2 justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 border border-blue-700 disabled:opacity-50"
            >
              <span className={syncingScores ? 'animate-spin inline-block' : ''}>⚽</span>
              {syncingScores ? 'Buscando...' : 'Buscar Pontuações'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Gerenciamento de Usuários / Moedas ── */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
          🪙 Usuários &amp; Moedas
        </h2>
        {coinError && (
          <p className="text-red-400 text-sm mb-3 bg-red-900/20 border border-red-800 rounded px-3 py-1.5">{coinError}</p>
        )}
        {users.length === 0 ? (
          <p className="text-gray-600 text-sm">Nenhum usuário encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-4 font-medium">Usuário</th>
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium text-center">Moedas</th>
                  <th className="pb-2 font-medium">Ajustar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {users.map(u => {
                  const delta = coinDelta[u.id] ?? 0;
                  return (
                    <tr key={u.id}>
                      <td className="py-2 pr-4">
                        <span className="text-white font-medium">{u.username}</span>
                        {u.is_admin && (
                          <span className="ml-1.5 text-xs text-cartola-gold">admin</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-400">{u.nome_time}</td>
                      <td className="py-2 pr-4 text-center">
                        <span className="font-mono font-bold text-yellow-300">{u.coins}</span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={delta}
                            onChange={e => setCoinDelta(prev => ({ ...prev, [u.id]: parseInt(e.target.value) || 0 }))}
                            className="w-20 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded px-2 py-1 focus:outline-none focus:border-cartola-green font-mono text-center"
                            placeholder="0"
                          />
                          <button
                            onClick={() => handleAdjustCoins(u.id, delta)}
                            disabled={delta === 0 || adjustingUserId === u.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 border border-gray-700 hover:border-cartola-green text-gray-400 hover:text-white"
                          >
                            {adjustingUserId === u.id ? '...' : delta >= 0 ? '+ Adicionar' : '− Remover'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico de Transações de Moedas ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-300 flex items-center gap-2">
            📜 Histórico de Moedas
            <span className="text-xs text-gray-600 font-normal">({coinTx.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={coinTxFilter}
              onChange={e => setCoinTxFilter(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-cartola-green"
            >
              <option value={0}>Todos os usuários</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
            <button
              onClick={() => loadCoinTransactions(coinTxFilter)}
              disabled={coinTxLoading}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {coinTxLoading ? '...' : '↻'}
            </button>
          </div>
        </div>

        {coinTxLoading && coinTx.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">Carregando...</p>
        ) : coinTx.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">Nenhuma transação registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800 text-xs">
                  <th className="pb-2 pr-3 font-medium">Data</th>
                  <th className="pb-2 pr-3 font-medium">Usuário</th>
                  <th className="pb-2 pr-3 font-medium">Descrição</th>
                  <th className="pb-2 pr-3 font-medium text-right">Valor</th>
                  <th className="pb-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40">
                {coinTx.map(tx => {
                  const isPositive = tx.amount > 0;
                  const date = new Date(tx.created_at);
                  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={tx.id} className="hover:bg-gray-800/30">
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                        <div className="text-xs">{dateStr}</div>
                        <div className="text-xs text-gray-600">{timeStr}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-white font-medium text-xs">{tx.username}</div>
                        <div className="text-gray-600 text-xs">{tx.nome_time}</div>
                      </td>
                      <td className="py-2 pr-3 text-gray-400 text-xs">{tx.description}</td>
                      <td className={`py-2 pr-3 text-right font-mono font-bold text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{tx.amount} 🪙
                      </td>
                      <td className="py-2 text-right font-mono text-yellow-300 text-sm font-bold">
                        {tx.balance_after}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historico de Drafts ── */}
      <div className="mb-6">
        <DraftHistory />
      </div>

      {/* ── Simulador de Draft ── */}
      <SimDraft players={players} clubMatches={clubMatches} />

      {loading && players.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Carregando jogadores...</div>
      ) : players.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">Nenhum jogador no banco.</p>
          <p className="text-gray-600 text-sm">Clique em "Sincronizar Cartola" para importar.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Tabela 1: Pool do Draft ── */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">

            {/* Main table */}
            <div className="card flex-1 min-w-0">
              <h3 className="font-semibold text-green-400 mb-1 flex items-center gap-2">
                ✅ Pool do Draft
                <span className="text-xs text-gray-500 font-normal">({poolDraft.length})</span>
                {eligibleIds.size > 0 && (
                  <span className="text-xs text-blue-400 font-normal">
                    · {eligibleIds.size} adicionados manualmente
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                Prováveis titulares + jogadores adicionados manualmente
              </p>

              {/* Filters */}
              <div className="space-y-2 mb-3">
                <PosFilter
                  value={tPos}
                  onChange={setTPos}
                  players={players.filter(p => p.status_id === 7 || eligibleIds.has(p.cartola_id))}
                  countStatus={null}
                />
                <div className="flex items-center gap-2">
                  <ClubSelect value={tClub} onChange={setTClub} clubs={clubs} />
                  {(tPos !== 0 || tClub !== 0) && (
                    <button
                      onClick={() => { setTPos(0); setTClub(0); }}
                      className="text-xs text-gray-600 hover:text-gray-300 underline transition-colors"
                    >
                      limpar
                    </button>
                  )}
                </div>
              </div>

              {poolDraft.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">Nenhum com os filtros atuais</p>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: '620px' }}>
                    <RoundsHeader recentRounds={recentRounds} sort={tSort} onSort={setTSort} />
                    {poolDraft.slice(tPage * PAGE_SIZE, (tPage + 1) * PAGE_SIZE).map(p => {
                      const isManual = eligibleIds.has(p.cartola_id);
                      const isToggling = togglingId === p.cartola_id;
                      return (
                        <div
                          key={p.cartola_id}
                          className={isManual ? 'border-l-2 border-blue-500 rounded-r-lg' : ''}
                        >
                          <PlayerRow
                            player={p}
                            match={clubMatches[p.club_id] || clubMatches[String(p.club_id)] || null}
                            recentRounds={recentRounds}
                            action={
                              <button
                                onClick={() => handleRemoveFromPool(p.cartola_id)}
                                disabled={isToggling}
                                className="whitespace-nowrap text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 border bg-gray-800 text-gray-400 hover:bg-red-900/40 hover:text-red-300 border-gray-700 hover:border-red-700"
                              >
                                {isToggling ? '...' : 'Remover'}
                              </button>
                            }
                          />
                        </div>
                      );
                    })}
                    <Pagination page={tPage} total={poolDraft.length} onChange={setTPage} />
                  </div>
                </div>
              )}
            </div>

            {/* Club count sidebar */}
            <div className="card lg:w-64 w-full flex-shrink-0">
              <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                Jogadores por time
              </h4>
              {clubCounts.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCount = Math.max(...clubCounts.map(c => c.count), 1);
                    return clubCounts.map(({ name, count }) => {
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-xs font-medium truncate mr-2 ${count === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                              {name}
                            </span>
                            <span className={`text-xs font-bold flex-shrink-0 ${count === 0 ? 'text-gray-600' : 'text-cartola-gold'}`}>
                              {count}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-cartola-green transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

          </div>

          {/* ── Tabela 2: Não cotados ── */}
          <div className="card">
            <h3 className="font-semibold text-gray-400 mb-1 flex items-center gap-2">
              ⚠️ Não cotados como titulares
              <span className="text-xs text-gray-500 font-normal">({outros.length})</span>
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              Adicione manualmente os jogadores que devem entrar no pool do draft
            </p>

            {/* Filters */}
            <div className="space-y-2 mb-3">
              <PosFilter value={oPos} onChange={setOPos} players={players.filter(p => p.status_id !== 7)} countStatus={null} />
              <div className="flex flex-wrap items-center gap-2">
                {/* Status chips */}
                <button
                  onClick={() => setOStatus(0)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    oStatus === 0 ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Todos status
                </button>
                {OUTROS_STATUS_ORDER.map(sid => {
                  const info = STATUS_INFO[sid];
                  return (
                    <button
                      key={sid}
                      onClick={() => setOStatus(oStatus === sid ? 0 : sid)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        oStatus === sid
                          ? `${info.bg} ${info.text} border-current`
                          : 'bg-gray-800 text-gray-400 border-transparent hover:text-white'
                      }`}
                    >
                      {info.label}
                    </button>
                  );
                })}
                <ClubSelect value={oClub} onChange={setOClub} clubs={clubs} />
                {(oPos !== 0 || oStatus !== 0 || oClub !== 0) && (
                  <button
                    onClick={() => { setOPos(0); setOStatus(0); setOClub(0); }}
                    className="text-xs text-gray-600 hover:text-gray-300 underline transition-colors"
                  >
                    limpar
                  </button>
                )}
              </div>
            </div>

            {outros.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">Nenhum com os filtros atuais</p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: '620px' }}>
                  <RoundsHeader recentRounds={recentRounds} sort={oSort} onSort={setOSort} />
                  {outros.slice(oPage * PAGE_SIZE, (oPage + 1) * PAGE_SIZE).map(p => {
                    const isEligible = eligibleIds.has(p.cartola_id);
                    const isExcluded = excludedIds.has(p.cartola_id);
                    const isToggling = togglingId === p.cartola_id;
                    return (
                      <div
                        key={p.cartola_id}
                        className={isEligible ? 'border-l-2 border-blue-500 rounded-r-lg' : ''}
                      >
                        <PlayerRow
                          player={p}
                          match={clubMatches[p.club_id] || clubMatches[String(p.club_id)] || null}
                          recentRounds={recentRounds}
                          action={isExcluded ? (
                            <button
                              onClick={() => handleRestoreToPool(p.cartola_id)}
                              className="whitespace-nowrap text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border bg-orange-900/30 text-orange-300 hover:bg-green-900/40 hover:text-green-300 border-orange-700/50 hover:border-green-700"
                            >
                              ↩ Restaurar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleEligible(p.cartola_id)}
                              disabled={isToggling}
                              className={`whitespace-nowrap text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 border ${
                                isEligible
                                  ? 'bg-blue-900/40 text-blue-300 hover:bg-red-900/40 hover:text-red-300 border-blue-700 hover:border-red-700'
                                  : 'bg-gray-800 text-gray-400 hover:bg-green-900/40 hover:text-green-300 border-gray-700 hover:border-green-700'
                              }`}
                            >
                              {isToggling ? '...' : isEligible ? '✓ Adicionado' : '+ Adicionar'}
                            </button>
                          )}
                        />
                      </div>
                    );
                  })}
                  <Pagination page={oPage} total={outros.length} onChange={setOPage} />
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
