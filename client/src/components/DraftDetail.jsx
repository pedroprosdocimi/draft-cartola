import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config.js';

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'DEF RES', 22: 'MEI RES', 23: 'ATA RES' };
const POS_COLORS = {
  1: 'text-blue-400', 2: 'text-green-400', 3: 'text-green-400',
  4: 'text-yellow-400', 5: 'text-red-400',
  21: 'text-green-500', 22: 'text-yellow-500', 23: 'text-red-500',
};
const BENCH_SLOT_IDS = [21, 22, 23];
const POS_ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 21: 5, 22: 6, 23: 7 };

// Which bench slot can substitute which starter positions
const BENCH_TO_POSITIONS = { 21: [2, 3], 22: [4], 23: [5] };

function scoreColor(score) {
  if (score == null) return 'text-gray-600';
  if (score >= 7) return 'text-green-400';
  if (score >= 4) return 'text-cartola-gold';
  if (score > 0) return 'text-orange-400';
  return 'text-red-400';
}

// Returns substitution maps:
// subMap: starterCartolaId -> benchPlayer (bench came in for this starter)
// usedBenchIds: Set of bench cartolaIds that were subbed in
function buildSubstitutions(picks) {
  const mainPicks = picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  const benchPicks = picks.filter(p => BENCH_SLOT_IDS.includes(p.position_id))
    .sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));

  const subMap = new Map();   // starterCartolaId -> benchPlayer
  const usedBenchIds = new Set();

  for (const bench of benchPicks) {
    if (!bench.round_score || bench.round_score === 0) continue; // bench didn't play
    const allowed = BENCH_TO_POSITIONS[bench.position_id] || [];
    const target = mainPicks.find(p =>
      allowed.includes(p.position_id) &&
      (!p.round_score || p.round_score === 0) &&
      !subMap.has(p.cartola_id)
    );
    if (target) {
      subMap.set(target.cartola_id, bench);
      usedBenchIds.add(bench.cartola_id);
    }
  }

  return { subMap, usedBenchIds };
}

function teamRoundScore(picks, captainId) {
  const mainPicks = picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  const { subMap } = buildSubstitutions(picks);

  return mainPicks.reduce((sum, p) => {
    const effective = subMap.has(p.cartola_id) ? subMap.get(p.cartola_id) : p;
    const score = effective.round_score || 0;
    const multiplier = p.cartola_id === captainId ? 2 : 1;
    return sum + score * multiplier;
  }, 0);
}

function teamAvgScore(picks) {
  return picks
    .filter(p => !BENCH_SLOT_IDS.includes(p.position_id))
    .reduce((sum, p) => sum + (p.average_score || 0), 0);
}

export default function DraftDetail({ roomCode, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = localStorage.getItem('draft_token');
      const res = await fetch(`${API_URL}/api/drafts/history/${roomCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar draft.');
      setData(json);
      setActiveTab(prev => prev || json.teams?.[0]?.id || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const hasRoundScores = data?.teams?.some(t => t.picks.some(p => p.round_score != null));

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
        <div className="card p-8 text-center">
          <div className="animate-spin text-4xl mb-3">⚽</div>
          <p className="text-gray-400">Carregando draft...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-sm">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        </div>
      </div>
    );
  }

  const sortedTeams = [...data.teams].sort((a, b) => (a.pickOrder || 0) - (b.pickOrder || 0));
  const activeTeam = data.teams.find(t => t.id === activeTab);

  const mainPicks = (activeTeam?.picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id)) || [])
    .sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));
  const benchPicks = (activeTeam?.picks.filter(p => BENCH_SLOT_IDS.includes(p.position_id)) || [])
    .sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));

  const { subMap, usedBenchIds } = activeTeam
    ? buildSubstitutions(activeTeam.picks)
    : { subMap: new Map(), usedBenchIds: new Set() };

  const cols = hasRoundScores ? 5 : 4;

  return (
    <div className="fixed inset-0 bg-black/85 z-50 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 pt-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-lg">{roomCode}</span>
              {data.completedAt && (
                <span className="text-xs text-gray-500">
                  {new Date(data.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              )}
            </div>
            {data.roundNumber && (
              <p className="text-xs text-gray-500 mt-0.5">
                Pontuação da rodada {data.roundNumber}
                {!hasRoundScores && <span className="text-gray-600"> · ainda sem dados</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="text-xs text-gray-500 hover:text-white transition-colors border border-gray-700 px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              {refreshing ? '...' : '↻ Atualizar'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none px-2">✕</button>
          </div>
        </div>

        {/* Team summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {sortedTeams.map(team => {
            const roundTotal = teamRoundScore(team.picks, team.captainId);
            const avgTotal = teamAvgScore(team.picks);
            return (
              <button
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                className={`card text-left transition-all p-3 ${
                  activeTab === team.id ? 'border-cartola-green bg-cartola-green/10' : 'hover:border-gray-600'
                }`}
              >
                <div className="font-semibold text-white text-sm truncate">{team.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{team.formation}</div>
                {hasRoundScores ? (
                  <div className={`text-sm font-bold mt-1 ${scoreColor(roundTotal)}`}>
                    {roundTotal.toFixed(2)} pts
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 mt-1">méd. {avgTotal.toFixed(1)}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Active team detail */}
        {activeTeam && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{activeTeam.name}</h2>
                <p className="text-gray-500 text-xs">{activeTeam.formation} · {activeTeam.picks.length} jogadores</p>
              </div>
              {hasRoundScores && (
                <div className="text-right">
                  <div className={`text-xl font-bold ${scoreColor(teamRoundScore(activeTeam.picks, activeTeam.captainId))}`}>
                    {teamRoundScore(activeTeam.picks, activeTeam.captainId).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">pontos rodada {data.roundNumber}</div>
                </div>
              )}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Pos</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Jogador</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Clube</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Média</th>
                  {hasRoundScores && (
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Rodada</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {mainPicks.map(p => {
                  const isCaptain = p.cartola_id === activeTeam.captainId;
                  const subIn = subMap.get(p.cartola_id); // bench player that replaced this starter
                  const wasSubbedOut = !!subIn;

                  // Effective score for this slot
                  const slotScore = wasSubbedOut ? (subIn.round_score || 0) : (p.round_score || 0);
                  const displayScore = p.round_score != null || wasSubbedOut
                    ? (isCaptain ? slotScore * 2 : slotScore)
                    : null;

                  return (
                    <React.Fragment key={p.cartola_id}>
                      {/* Starter row */}
                      <tr className={`border-b border-gray-800/50 ${wasSubbedOut ? 'opacity-40' : 'hover:bg-gray-800/30'}`}>
                        <td className="py-2 px-2">
                          <span className={`font-bold text-xs ${POS_COLORS[p.position_id]}`}>
                            {POS_LABEL[p.position_id]}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            {p.photo && <img src={p.photo} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />}
                            <span className={wasSubbedOut ? 'line-through text-gray-500' : 'font-medium text-white'}>
                              {p.nickname}
                            </span>
                            {isCaptain && (
                              <span className="bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded leading-none flex-shrink-0">C</span>
                            )}
                            {wasSubbedOut && (
                              <span className="text-[10px] text-red-400 font-medium flex-shrink-0">não jogou</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-gray-400 text-xs">{p.club?.abbreviation || '—'}</td>
                        <td className="py-2 px-2 text-right text-gray-400 text-xs">{(p.average_score || 0).toFixed(1)}</td>
                        {hasRoundScores && (
                          <td className="py-2 px-2 text-right font-bold text-gray-600">
                            {wasSubbedOut ? '0.00' : p.round_score != null ? (
                              <span className={scoreColor(p.round_score)}>
                                {(isCaptain ? p.round_score * 2 : p.round_score).toFixed(2)}
                                {isCaptain && <span className="text-yellow-400 text-[10px] ml-1">×2</span>}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                      </tr>

                      {/* Sub-in row — bench player who replaced this starter */}
                      {wasSubbedOut && (
                        <tr className="border-b border-green-900/30 bg-green-950/20">
                          <td className="py-1.5 px-2 pl-5">
                            <span className={`font-bold text-xs ${POS_COLORS[subIn.position_id]}`}>
                              {POS_LABEL[subIn.position_id]}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="text-green-400 text-xs font-bold flex-shrink-0">↑</span>
                              {subIn.photo && <img src={subIn.photo} className="w-5 h-5 rounded-full object-cover flex-shrink-0" alt="" />}
                              <span className="text-green-300 font-medium text-xs">{subIn.nickname}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-gray-500 text-xs">{subIn.club?.abbreviation || '—'}</td>
                          <td className="py-1.5 px-2 text-right text-gray-500 text-xs">{(subIn.average_score || 0).toFixed(1)}</td>
                          {hasRoundScores && (
                            <td className={`py-1.5 px-2 text-right font-bold ${scoreColor(displayScore)}`}>
                              {displayScore != null ? (
                                <span>
                                  {displayScore.toFixed(2)}
                                  {isCaptain && <span className="text-yellow-400 text-[10px] ml-1">×2</span>}
                                </span>
                              ) : '—'}
                            </td>
                          )}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Bench section */}
                {benchPicks.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={cols} className="py-2 px-2 text-xs font-semibold text-gray-600 uppercase tracking-wide border-t border-gray-800">
                        Reservas
                      </td>
                    </tr>
                    {benchPicks.map(p => {
                      const subbed = usedBenchIds.has(p.cartola_id);
                      return (
                        <tr key={p.cartola_id} className={`border-b border-gray-800/30 ${subbed ? 'opacity-40' : 'opacity-60'}`}>
                          <td className="py-2 px-2">
                            <span className={`font-bold text-xs ${POS_COLORS[p.position_id]}`}>
                              {POS_LABEL[p.position_id]}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              {p.photo && <img src={p.photo} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />}
                              <span className="text-gray-300 text-xs">{p.nickname}</span>
                              {subbed && <span className="text-[10px] text-gray-600 italic">entrou</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-gray-500 text-xs">{p.club?.abbreviation || '—'}</td>
                          <td className="py-2 px-2 text-right text-gray-500 text-xs">{(p.average_score || 0).toFixed(1)}</td>
                          {hasRoundScores && (
                            <td className={`py-2 px-2 text-right font-bold ${scoreColor(p.round_score)}`}>
                              {p.round_score != null ? p.round_score.toFixed(2) : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
