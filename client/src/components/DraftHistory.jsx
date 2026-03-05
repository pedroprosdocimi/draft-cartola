import React, { useState, useEffect } from 'react';
import { API_URL } from '../config.js';

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'RES', 22: 'RES', 23: 'RES' };
const POS_COLORS = {
  1: 'text-yellow-400', 2: 'text-blue-400', 3: 'text-red-400',
  4: 'text-purple-400', 5: 'text-green-400',
  21: 'text-gray-400', 22: 'text-gray-400', 23: 'text-gray-400',
};
const POS_BG = {
  1: 'bg-yellow-900/40', 2: 'bg-blue-900/40', 3: 'bg-red-900/40',
  4: 'bg-purple-900/40', 5: 'bg-green-900/40',
  21: 'bg-gray-800', 22: 'bg-gray-800', 23: 'bg-gray-800',
};
const POS_ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 21: 5, 22: 6, 23: 7 };
const BENCH_IDS = [21, 22, 23];

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  if (status === 'completed') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 font-medium">Finalizado</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 font-medium">Em andamento</span>;
}

// ── Detail view ──────────────────────────────────────────────
function DraftDetail({ draftId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('timeline'); // 'timeline' | 'teams'
  const [activeParticipant, setActiveParticipant] = useState(null);

  const token = localStorage.getItem('draft_token');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/admin/drafts/${draftId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        if (d.participants?.length) setActiveParticipant(d.participants[0].id);
      })
      .catch(() => setError('Erro ao carregar draft.'))
      .finally(() => setLoading(false));
  }, [draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-center py-12 text-gray-500">Carregando...</div>;
  if (error) return <div className="text-red-400 text-sm py-4">{error}</div>;
  if (!data) return null;

  const { session, participants, picks } = data;

  // Build team map: participantId -> picks[]
  const teamMap = {};
  for (const p of participants) teamMap[p.id] = [];
  for (const pick of picks) {
    if (teamMap[pick.participant_id]) teamMap[pick.participant_id].push(pick);
  }

  const activeTeam = activeParticipant ? (teamMap[activeParticipant] || []) : [];
  const mainPicks = activeTeam.filter(p => !BENCH_IDS.includes(p.position_id)).sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));
  const benchPicks = activeTeam.filter(p => BENCH_IDS.includes(p.position_id));
  const totalScore = (arr) => arr.filter(p => !BENCH_IDS.includes(p.position_id)).reduce((s, p) => s + (p.average_score || 0), 0);

  // Build pick-owner name map for timeline
  const participantNames = {};
  for (const p of participants) participantNames[p.id] = p.name;

  // Colors for each participant in timeline
  const participantColors = ['text-blue-400', 'text-green-400', 'text-yellow-400', 'text-red-400', 'text-purple-400', 'text-orange-400', 'text-pink-400', 'text-teal-400'];

  return (
    <div>
      {/* Detail header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Voltar
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-white font-bold text-lg">{session.id}</span>
            <StatusBadge status={session.status} />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {participants.length} participantes · iniciado em {formatDate(session.created_at)}
            {session.completed_at && ` · finalizado em ${formatDate(session.completed_at)}`}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('timeline')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'timeline' ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Linha do Tempo
        </button>
        <button
          onClick={() => setView('teams')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'teams' ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Times
        </button>
      </div>

      {/* Timeline view */}
      {view === 'timeline' && (
        <div className="card">
          {picks.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Nenhuma pick registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-10">#</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Participante</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Pos</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Jogador</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Clube</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((pick, i) => {
                    const ownerIdx = participants.findIndex(p => p.id === pick.participant_id);
                    const color = participantColors[ownerIdx % participantColors.length];
                    return (
                      <tr key={pick.overall_pick ?? i} className="border-b border-gray-800/40 hover:bg-gray-800/30">
                        <td className="py-2 px-3 text-gray-600 font-mono text-xs">{pick.overall_pick ?? i + 1}</td>
                        <td className={`py-2 px-3 font-medium ${color}`}>
                          {participantNames[pick.participant_id] || pick.participant_id}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${POS_BG[pick.position_id]} ${POS_COLORS[pick.position_id]}`}>
                            {POS_LABEL[pick.position_id] || `Pos${pick.position_id}`}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {pick.photo_url && (
                              <img src={pick.photo_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
                            )}
                            <span className="text-white font-medium truncate">{pick.nickname || `#${pick.cartola_id}`}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{pick.club_abbreviation || '—'}</td>
                        <td className="py-2 px-3 text-right text-cartola-gold font-semibold hidden sm:table-cell">
                          {pick.average_score != null ? pick.average_score.toFixed(1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Teams view */}
      {view === 'teams' && (
        <div>
          {/* Participant tabs */}
          <div className="flex gap-2 flex-wrap mb-4">
            {participants.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveParticipant(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeParticipant === p.id ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                {p.name}
                <span className="ml-1.5 text-xs opacity-60">{p.formation}</span>
              </button>
            ))}
          </div>

          {activeParticipant && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white">
                    {participants.find(p => p.id === activeParticipant)?.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {participants.find(p => p.id === activeParticipant)?.formation} · {activeTeam.length} jogadores
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-cartola-gold">{totalScore(activeTeam).toFixed(2)}</div>
                  <div className="text-xs text-gray-500">total pontos</div>
                </div>
              </div>

              {activeTeam.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Nenhum jogador.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Pos</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Jogador</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Clube</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">Média</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mainPicks.map(p => (
                        <tr key={p.cartola_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-2 px-3">
                            <span className={`text-xs font-bold ${POS_COLORS[p.position_id]}`}>
                              {POS_LABEL[p.position_id]}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              {p.photo_url && <img src={p.photo_url} className="w-6 h-6 rounded-full object-cover" alt="" />}
                              <span className="text-white font-medium">{p.nickname || `#${p.cartola_id}`}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{p.club_abbreviation || '—'}</td>
                          <td className="py-2 px-3 text-right font-semibold text-cartola-gold">
                            {p.average_score != null ? p.average_score.toFixed(1) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-500 hidden sm:table-cell">
                            {p.price != null ? `C$${p.price.toFixed(1)}` : '—'}
                          </td>
                        </tr>
                      ))}
                      {benchPicks.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={5} className="py-2 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wide border-t border-gray-800">
                              Reservas
                            </td>
                          </tr>
                          {benchPicks.map(p => (
                            <tr key={`b-${p.cartola_id}`} className="border-b border-gray-800/30 hover:bg-gray-800/20 opacity-75">
                              <td className="py-2 px-3">
                                <span className="text-xs font-bold text-gray-500">RES</span>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  {p.photo_url && <img src={p.photo_url} className="w-6 h-6 rounded-full object-cover" alt="" />}
                                  <span className="text-gray-300 font-medium">{p.nickname || `#${p.cartola_id}`}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-gray-500 hidden sm:table-cell">{p.club_abbreviation || '—'}</td>
                              <td className="py-2 px-3 text-right font-semibold text-gray-400">
                                {p.average_score != null ? p.average_score.toFixed(1) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right text-gray-600 hidden sm:table-cell">
                                {p.price != null ? `C$${p.price.toFixed(1)}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── List view ────────────────────────────────────────────────
export default function DraftHistory() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(false);

  const token = localStorage.getItem('draft_token');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_URL}/api/admin/drafts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setDrafts(d.drafts || []);
      })
      .catch(() => setError('Erro ao carregar drafts.'))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const inProgress = drafts.filter(d => d.status !== 'completed');
  const completed = drafts.filter(d => d.status === 'completed');

  if (selectedId) {
    return (
      <div className="card">
        <DraftDetail draftId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-semibold text-gray-300">Historico de Drafts</h2>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-4">Carregando...</p>
          ) : error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : drafts.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">Nenhum draft encontrado.</p>
          ) : (
            <div className="space-y-4">
              {inProgress.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">Em andamento ({inProgress.length})</h3>
                  <DraftTable drafts={inProgress} onSelect={setSelectedId} />
                </div>
              )}
              {completed.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Finalizados ({completed.length})</h3>
                  <DraftTable drafts={completed} onSelect={setSelectedId} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraftTable({ drafts, onSelect }) {
  return (
    <div className="divide-y divide-gray-800">
      {drafts.map(d => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className="w-full flex items-center gap-4 px-2 py-3 hover:bg-gray-800/50 rounded-lg transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="font-mono text-white text-sm font-semibold truncate">{d.id}</div>
            <div className="text-xs text-gray-500 mt-0.5">{formatDate(d.created_at)}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-gray-300">
              <span className="font-semibold text-white">{d.participant_count}</span> participantes
            </span>
            <StatusBadge status={d.status} />
            <span className="text-gray-600 text-xs">→</span>
          </div>
        </button>
      ))}
    </div>
  );
}
