import React, { useState, useEffect } from 'react';
import { API_URL } from '../config.js';

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'RES', 22: 'RES', 23: 'RES' };
const POS_COLORS = {
  1: 'text-yellow-300', 2: 'text-blue-300', 3: 'text-red-300',
  4: 'text-purple-300', 5: 'text-green-300',
  21: 'text-gray-400', 22: 'text-gray-400', 23: 'text-gray-400',
};
const POS_BG = {
  1: 'bg-yellow-900/60 border-yellow-700/50',
  2: 'bg-blue-900/60 border-blue-700/50',
  3: 'bg-red-900/60 border-red-700/50',
  4: 'bg-purple-900/60 border-purple-700/50',
  5: 'bg-green-900/60 border-green-700/50',
  21: 'bg-gray-800 border-gray-700/50',
  22: 'bg-gray-800 border-gray-700/50',
  23: 'bg-gray-800 border-gray-700/50',
};
const POS_BADGE_BG = {
  1: 'bg-yellow-800/80 text-yellow-300',
  2: 'bg-blue-800/80 text-blue-300',
  3: 'bg-red-800/80 text-red-300',
  4: 'bg-purple-800/80 text-purple-300',
  5: 'bg-green-800/80 text-green-300',
  21: 'bg-gray-700 text-gray-400',
  22: 'bg-gray-700 text-gray-400',
  23: 'bg-gray-700 text-gray-400',
};
const POS_ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 21: 5, 22: 6, 23: 7 };
const BENCH_IDS = [21, 22, 23];

// Participant accent colors for column headers
const PARTICIPANT_COLORS = [
  { ring: 'ring-blue-500',   header: 'bg-blue-900/30 border-blue-700/50',   name: 'text-blue-300'   },
  { ring: 'ring-green-500',  header: 'bg-green-900/30 border-green-700/50', name: 'text-green-300'  },
  { ring: 'ring-yellow-500', header: 'bg-yellow-900/30 border-yellow-700/50',name: 'text-yellow-300' },
  { ring: 'ring-red-500',    header: 'bg-red-900/30 border-red-700/50',     name: 'text-red-300'    },
  { ring: 'ring-purple-500', header: 'bg-purple-900/30 border-purple-700/50',name: 'text-purple-300' },
  { ring: 'ring-orange-500', header: 'bg-orange-900/30 border-orange-700/50',name: 'text-orange-300' },
  { ring: 'ring-pink-500',   header: 'bg-pink-900/30 border-pink-700/50',   name: 'text-pink-300'   },
  { ring: 'ring-teal-500',   header: 'bg-teal-900/30 border-teal-700/50',   name: 'text-teal-300'   },
];

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  if (status === 'complete') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 font-medium">Finalizado</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 font-medium">Em andamento</span>;
}

// ── Pick Cell ─────────────────────────────────────────────────
function PickCell({ pick, pickNum, accentColor }) {
  const isBench = BENCH_IDS.includes(pick.position_id);
  const posLabel = POS_LABEL[pick.position_id] || `P${pick.position_id}`;

  // Options: all except the chosen player
  const otherOptions = pick.options
    ? pick.options.filter(o => o.cartola_id !== pick.cartola_id)
    : [];

  return (
    <div className={`rounded-lg border p-2 ${POS_BG[pick.position_id] || 'bg-gray-800 border-gray-700/50'} ${isBench ? 'opacity-70' : ''}`}>
      {/* Top row: pick number + position badge + score */}
      <div className="flex items-center justify-between mb-2 gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600 font-mono text-xs leading-none">{pickNum}</span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${POS_BADGE_BG[pick.position_id] || 'bg-gray-700 text-gray-400'}`}>
            {posLabel}
          </span>
        </div>
        {pick.average_score != null && (
          <span className="text-xs font-bold text-cartola-gold whitespace-nowrap">
            {pick.average_score.toFixed(1)}
          </span>
        )}
      </div>

      {/* Chosen player */}
      <div className="flex items-center gap-2">
        {pick.photo_url ? (
          <img
            src={pick.photo_url}
            className={`w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ${accentColor?.ring || 'ring-gray-600'}`}
            alt=""
          />
        ) : (
          <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-700 ring-2 ${accentColor?.ring || 'ring-gray-600'} text-gray-500 text-xs`}>
            ?
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-white text-xs font-semibold leading-tight truncate">
            {pick.nickname || `#${pick.cartola_id}`}
          </div>
          <div className="text-gray-500 text-xs truncate mt-0.5">
            {pick.club_abbreviation || '—'}
            {pick.price != null && (
              <span className="ml-1 text-gray-600">C${pick.price.toFixed(0)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Other options */}
      {otherOptions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700/40 space-y-1">
          <div className="text-gray-600 text-xs uppercase tracking-wide mb-1">Outras opcoes</div>
          {otherOptions.map(o => (
            <div key={o.cartola_id} className="flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity">
              {o.photo_url ? (
                <img src={o.photo_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-600" alt="" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gray-700 flex-shrink-0 ring-1 ring-gray-600" />
              )}
              <span className="text-gray-400 text-xs truncate flex-1">{o.nickname || `#${o.cartola_id}`}</span>
              {o.average_score != null && (
                <span className="text-gray-500 text-xs flex-shrink-0">{o.average_score.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyCell() {
  return (
    <div className="rounded-lg border border-dashed border-gray-800 p-2 h-[82px] flex items-center justify-center">
      <span className="text-gray-700 text-xs">—</span>
    </div>
  );
}

// ── Draft Board ───────────────────────────────────────────────
function DraftBoard({ participants, picks }) {
  const N = participants.length;
  if (N === 0 || picks.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-6">Nenhuma pick registrada.</p>;
  }

  // Sort participants by pick_order for consistent column order
  const sortedParticipants = [...participants].sort((a, b) => (a.pick_order || 0) - (b.pick_order || 0));

  // Color map: participantId → accent
  const colorMap = {};
  sortedParticipants.forEach((p, i) => {
    colorMap[p.id] = PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length];
  });

  // Group picks into rounds: round = Math.ceil(overall_pick / N)
  const rounds = {};
  for (const pick of picks) {
    const roundNum = pick.overall_pick != null ? Math.ceil(pick.overall_pick / N) : null;
    if (roundNum == null) continue;
    if (!rounds[roundNum]) rounds[roundNum] = {};
    rounds[roundNum][pick.participant_id] = pick;
  }

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  // Detect where bench rounds start (position_id in BENCH_IDS)
  const firstBenchRound = roundNumbers.find(r =>
    Object.values(rounds[r]).some(p => BENCH_IDS.includes(p.position_id))
  );

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1" style={{ minWidth: `${120 + N * 172}px` }}>
        <thead>
          <tr>
            {/* Round label column */}
            <th className="w-12" />
            {sortedParticipants.map((p, i) => {
              const accent = colorMap[p.id];
              return (
                <th key={p.id} className="text-center px-1 py-1">
                  <div className={`rounded-lg border px-2 py-2 ${accent.header}`}>
                    <div className={`font-bold text-sm ${accent.name}`}>{p.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5 font-mono">{p.formation}</div>
                    <div className="text-gray-600 text-xs mt-0.5">Pick #{i + 1}</div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {roundNumbers.map((roundNum, rowIdx) => {
            const isSnakeReverse = roundNum % 2 === 0;
            const isBenchStart = roundNum === firstBenchRound;
            const isBenchRound = firstBenchRound != null && roundNum >= firstBenchRound;

            return (
              <React.Fragment key={roundNum}>
                {/* Separator before bench rounds */}
                {isBenchStart && (
                  <tr>
                    <td colSpan={N + 1} className="py-1 px-2">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-gray-700" />
                        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide px-2">Reservas</span>
                        <div className="h-px flex-1 bg-gray-700" />
                      </div>
                    </td>
                  </tr>
                )}

                <tr className={isBenchRound ? 'opacity-80' : ''}>
                  {/* Round indicator */}
                  <td className="text-right pr-1 align-middle">
                    <div className="flex flex-col items-center gap-0.5 py-1">
                      <span className={`text-xs font-bold ${isBenchRound ? 'text-gray-600' : 'text-gray-400'}`}>
                        R{roundNum}
                      </span>
                      <span className="text-gray-700 text-xs leading-none">
                        {isSnakeReverse ? '←' : '→'}
                      </span>
                    </div>
                  </td>

                  {/* Cells per participant */}
                  {sortedParticipants.map(p => {
                    const pick = rounds[roundNum]?.[p.id];
                    const globalPickNum = pick?.overall_pick;
                    return (
                      <td key={p.id} className="align-top px-0.5 py-0.5" style={{ width: '172px', minWidth: '172px' }}>
                        {pick
                          ? <PickCell pick={pick} pickNum={globalPickNum} accentColor={colorMap[p.id]} />
                          : <EmptyCell />
                        }
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────
function DraftDetail({ draftId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('board'); // 'board' | 'teams'
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

  // Build team map
  const teamMap = {};
  for (const p of participants) teamMap[p.id] = [];
  for (const pick of picks) {
    if (teamMap[pick.participant_id]) teamMap[pick.participant_id].push(pick);
  }

  const activeTeam = activeParticipant ? (teamMap[activeParticipant] || []) : [];
  const mainPicks = activeTeam.filter(p => !BENCH_IDS.includes(p.position_id)).sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));
  const benchPicks = activeTeam.filter(p => BENCH_IDS.includes(p.position_id));
  const totalScore = (arr) => arr.filter(p => !BENCH_IDS.includes(p.position_id)).reduce((s, p) => s + (p.average_score || 0), 0);

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
          onClick={() => setView('board')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'board' ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Draft Board
        </button>
        <button
          onClick={() => setView('teams')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'teams' ? 'bg-cartola-green text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Times
        </button>
      </div>

      {/* Draft Board view */}
      {view === 'board' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">Draft Board</h3>
            <span className="text-xs text-gray-600">{picks.length} picks · {Math.ceil(picks.length / Math.max(participants.length, 1))} rodadas</span>
          </div>
          <DraftBoard participants={participants} picks={picks} />
        </div>
      )}

      {/* Teams view */}
      {view === 'teams' && (
        <div>
          <div className="flex gap-2 flex-wrap mb-4">
            {[...participants].sort((a, b) => (a.pick_order || 0) - (b.pick_order || 0)).map(p => (
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
                  <h3 className="font-bold text-white">{participants.find(p => p.id === activeParticipant)?.name}</h3>
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
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">Media</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Preco</th>
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

// ── List view ─────────────────────────────────────────────────
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

  const inProgress = drafts.filter(d => d.status !== 'complete');
  const completed = drafts.filter(d => d.status === 'complete');

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
