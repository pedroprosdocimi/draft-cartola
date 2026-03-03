import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../config.js';
import SimDraft from '../components/SimDraft.jsx';

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

function PlayerRow({ player, match, action }) {
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
      {action && <div className="flex-shrink-0">{action}</div>}
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

  // Table 1 (titulares) filters
  const [tPos, setTPos] = useState(0);
  const [tClub, setTClub] = useState(0);

  // Table 2 (outros) filters
  const [oPos, setOPos] = useState(0);
  const [oStatus, setOStatus] = useState(0);
  const [oClub, setOClub] = useState(0);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const token = localStorage.getItem('draft_token');
  const headers = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [playersRes, statusRes, eligibleRes] = await Promise.all([
        fetch(`${API_URL}/api/players`, { headers }),
        fetch(`${API_URL}/api/sync/status`, { headers }),
        fetch(`${API_URL}/api/admin/eligible`, { headers }),
      ]);
      const playersData = await playersRes.json();
      const statusData = await statusRes.json();
      const eligibleData = await eligibleRes.json();

      if (playersData.players) setPlayers(playersData.players);
      if (playersData.clubMatches) setClubMatches(playersData.clubMatches);
      if (statusData.ok !== false) setSyncStatus(statusData);
      if (eligibleData.eligible) setEligibleIds(new Set(eligibleData.eligible));
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

  // Clubs list sorted alphabetically
  const clubs = useMemo(() => {
    const seen = new Set();
    return players
      .map(p => p.club)
      .filter(c => c && !seen.has(c.id) && seen.add(c.id))
      .sort((a, b) => (a.abbreviation || '').localeCompare(b.abbreviation || ''));
  }, [players]);

  // Table 1: pool do draft = prováveis (status_id=7) + adicionados manualmente
  const poolDraft = useMemo(() => {
    const list = players
      .filter(p => p.status_id === 7 || eligibleIds.has(p.cartola_id))
      .filter(p => tPos === 0  || p.position_id === tPos)
      .filter(p => tClub === 0 || p.club_id === tClub);
    return sortByPos(list);
  }, [players, eligibleIds, tPos, tClub]);

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

  // Table 2: não cotados que ainda NÃO foram adicionados ao pool
  const outros = useMemo(() => {
    const list = players
      .filter(p => p.status_id !== 7 && !eligibleIds.has(p.cartola_id))
      .filter(p => oPos === 0    || p.position_id === oPos)
      .filter(p => oStatus === 0 || p.status_id === oStatus)
      .filter(p => oClub === 0   || p.club_id === oClub);
    return sortByPos(list);
  }, [players, eligibleIds, oPos, oStatus, oClub]);

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
                <div className="divide-y divide-gray-800/50">
                  {poolDraft.map(p => {
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
                          action={isManual ? (
                            <button
                              onClick={() => handleToggleEligible(p.cartola_id)}
                              disabled={isToggling}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 border bg-blue-900/40 text-blue-300 hover:bg-red-900/40 hover:text-red-300 border-blue-700 hover:border-red-700"
                            >
                              {isToggling ? '...' : 'Remover'}
                            </button>
                          ) : null}
                        />
                      </div>
                    );
                  })}
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

          {/* ── Simulador de Draft ── */}
          <SimDraft players={players} />

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
              <div className="divide-y divide-gray-800/50">
                {outros.map(p => {
                  const isEligible = eligibleIds.has(p.cartola_id);
                  const isToggling = togglingId === p.cartola_id;
                  return (
                    <div
                      key={p.cartola_id}
                      className={isEligible ? 'border-l-2 border-blue-500 rounded-r-lg' : ''}
                    >
                      <PlayerRow
                        player={p}
                        match={clubMatches[p.club_id] || clubMatches[String(p.club_id)] || null}
                        action={
                          <button
                            onClick={() => handleToggleEligible(p.cartola_id)}
                            disabled={isToggling}
                            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 border ${
                              isEligible
                                ? 'bg-blue-900/40 text-blue-300 hover:bg-red-900/40 hover:text-red-300 border-blue-700 hover:border-red-700'
                                : 'bg-gray-800 text-gray-400 hover:bg-green-900/40 hover:text-green-300 border-gray-700 hover:border-green-700'
                            }`}
                          >
                            {isToggling ? '...' : isEligible ? '✓ Adicionado' : '+ Adicionar'}
                          </button>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
