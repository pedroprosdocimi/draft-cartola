import React, { useState, useEffect, useRef, useCallback } from 'react';

const TEAM_NAMES = [
  'Dragões', 'Falcões', 'Leões', 'Tigres',
  'Águias', 'Cobras', 'Lobos', 'Panteras',
  'Touros', 'Ursos', 'Gaviões', 'Onças',
];

const FORMATIONS = ['4-3-3', '4-4-2', '3-5-2', '4-5-1', '3-4-3'];

const FORMATION_COUNTS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 },
};

const POS_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA' };
const POS_SORT  = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
const POS_COLORS = {
  1: 'text-blue-400', 2: 'text-green-400', 3: 'text-green-400',
  4: 'text-yellow-400', 5: 'text-red-400',
};

const PICK_SECONDS = 5;
const CIRCUMFERENCE = 2 * Math.PI * 24; // r=24

// ── helpers ──────────────────────────────────────────────────────────────────

function buildSnakeOrder(numTeams, picksPerTeam) {
  const order = [];
  for (let round = 0; round < picksPerTeam; round++) {
    if (round % 2 === 0) {
      for (let i = 0; i < numTeams; i++) order.push(i);
    } else {
      for (let i = numTeams - 1; i >= 0; i--) order.push(i);
    }
  }
  return order;
}

function getNeededPositions(team) {
  const counts = FORMATION_COUNTS[team.formation] || {};
  const needed = [];
  for (const [posIdStr, required] of Object.entries(counts)) {
    const posId = parseInt(posIdStr);
    if (!required) continue;
    const filled = team.picks.filter(p => p.position_id === posId).length;
    for (let i = 0; i < required - filled; i++) needed.push(posId);
  }
  return needed;
}

function getBestPlayer(players, pickedIds, posId) {
  return players
    .filter(p => p.position_id === posId && !pickedIds.has(p.cartola_id))
    .sort((a, b) => (b.average_score || 0) - (a.average_score || 0))[0] || null;
}

function totalScore(picks) {
  return picks.reduce((s, p) => s + (p.average_score || 0), 0);
}

// ── sub-components ────────────────────────────────────────────────────────────

function TimerRing({ timeLeft }) {
  const offset = CIRCUMFERENCE * (1 - timeLeft / PICK_SECONDS);
  const color = timeLeft <= 2 ? '#EF4444' : '#F59E0B';
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="24" fill="none" stroke="#374151" strokeWidth="4" />
        <circle
          cx="28" cy="28" r="24"
          fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold text-lg"
        style={{ color }}
      >
        {timeLeft}
      </span>
    </div>
  );
}

function TeamCard({ team, isActive }) {
  const sorted = [...team.picks].sort(
    (a, b) => (POS_SORT[a.position_id] ?? 9) - (POS_SORT[b.position_id] ?? 9)
  );
  const score = totalScore(sorted);

  return (
    <div
      className={`flex-shrink-0 w-52 rounded-xl border p-3 transition-all ${
        isActive
          ? 'border-cartola-gold bg-cartola-gold/5 shadow-lg shadow-cartola-gold/10'
          : 'border-gray-700 bg-gray-900'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className={`font-bold text-sm ${isActive ? 'text-cartola-gold' : 'text-white'}`}>
            {isActive && <span className="mr-1">▶</span>}{team.name}
          </div>
          <div className="text-xs text-gray-500 font-mono">{team.formation}</div>
        </div>
        <div className="text-xs font-bold text-cartola-gold">★ {score.toFixed(1)}</div>
      </div>

      {/* Picks */}
      <div className="space-y-0.5 min-h-[132px]">
        {sorted.map(p => (
          <div key={p.cartola_id} className="flex items-center gap-1.5 text-xs">
            <span className={`font-bold w-7 flex-shrink-0 ${POS_COLORS[p.position_id]}`}>
              {POS_LABELS[p.position_id]}
            </span>
            <span className="text-gray-200 truncate flex-1">{p.nickname}</span>
            <span className="text-gray-600 flex-shrink-0">{(p.average_score || 0).toFixed(1)}</span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-xs text-gray-700 italic">Aguardando picks...</div>
        )}
      </div>
    </div>
  );
}

function FinalRanking({ teams }) {
  const sorted = [...teams].sort((a, b) => totalScore(b.picks) - totalScore(a.picks));
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-300 mb-3">🏆 Classificação Final</h4>
      <div className="space-y-2">
        {sorted.map((team, i) => {
          const score = totalScore(team.picks);
          const best = [...team.picks].sort((a, b) => (b.average_score || 0) - (a.average_score || 0))[0];
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
          return (
            <div key={team.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/60">
              <span className="text-base w-7 flex-shrink-0 text-center">{medal}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{team.name}</div>
                <div className="text-xs text-gray-500">
                  {team.formation} · {team.picks.length} jogadores
                  {best && <> · Melhor: <span className="text-gray-300">{best.nickname} ({(best.average_score || 0).toFixed(1)})</span></>}
                </div>
              </div>
              <div className="text-cartola-gold font-bold flex-shrink-0">★ {score.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SimDraft({ players }) {
  const [numParticipants, setNumParticipants] = useState(4);
  const [sim, setSim] = useState(null);
  const playersRef = useRef(players);

  useEffect(() => { playersRef.current = players; }, [players]);

  const startSim = useCallback(() => {
    const n = Math.max(2, Math.min(12, numParticipants));
    const shuffled = [...TEAM_NAMES].sort(() => Math.random() - 0.5);
    const teams = Array.from({ length: n }, (_, i) => ({
      id: i,
      name: shuffled[i] || `Time ${i + 1}`,
      formation: FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)],
      picks: [],
    }));

    setSim({
      teams,
      pickOrder: buildSnakeOrder(n, 11),
      currentPickIndex: 0,
      pickedIds: new Set(),
      timeLeft: PICK_SECONDS,
      status: 'running',
      lastPick: null,
    });
  }, [numParticipants]);

  // Interval: runs while status === 'running'
  useEffect(() => {
    if (sim?.status !== 'running') return;

    const id = setInterval(() => {
      setSim(prev => {
        if (!prev || prev.status !== 'running') return prev;

        // Count down
        if (prev.timeLeft > 1) return { ...prev, timeLeft: prev.timeLeft - 1 };

        // Execute pick
        const allPlayers = playersRef.current;
        const teamIdx = prev.pickOrder[prev.currentPickIndex];
        const team = prev.teams[teamIdx];
        const needed = getNeededPositions(team);
        const nextIdx = prev.currentPickIndex + 1;
        const done = nextIdx >= prev.pickOrder.length;

        if (!needed.length) {
          return done ? { ...prev, status: 'done' } : { ...prev, currentPickIndex: nextIdx, timeLeft: PICK_SECONDS };
        }

        // Random position from needed
        const posId = needed[Math.floor(Math.random() * needed.length)];
        const player = getBestPlayer(allPlayers, prev.pickedIds, posId);

        if (!player) {
          return done ? { ...prev, status: 'done' } : { ...prev, currentPickIndex: nextIdx, timeLeft: PICK_SECONDS };
        }

        const newTeams = prev.teams.map((t, i) =>
          i === teamIdx ? { ...t, picks: [...t.picks, { ...player, position_id: posId }] } : t
        );
        const newPickedIds = new Set(prev.pickedIds);
        newPickedIds.add(player.cartola_id);

        return {
          ...prev,
          teams: newTeams,
          pickedIds: newPickedIds,
          currentPickIndex: nextIdx,
          timeLeft: PICK_SECONDS,
          status: done ? 'done' : 'running',
          lastPick: { teamName: team.name, posId, player },
        };
      });
    }, 1000);

    return () => clearInterval(id);
  }, [sim?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (!sim) {
    return (
      <div className="card mt-6">
        <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
          🎲 Simular Draft
        </h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Número de participantes</label>
            <input
              type="number"
              min={2} max={12}
              value={numParticipants}
              onChange={e => setNumParticipants(Math.max(2, Math.min(12, parseInt(e.target.value) || 2)))}
              className="input-field w-24 text-center"
            />
          </div>
          <button
            onClick={startSim}
            disabled={!players.length}
            className="btn-primary"
          >
            ▶ Iniciar Simulação
          </button>
        </div>
        {!players.length && (
          <p className="text-xs text-gray-600 mt-3">Sincronize os jogadores antes de simular.</p>
        )}
      </div>
    );
  }

  // ── Running / Done ────────────────────────────────────────────────────────
  const currentTeamIdx = sim.status === 'running' ? sim.pickOrder[sim.currentPickIndex] : -1;
  const currentTeam = currentTeamIdx >= 0 ? sim.teams[currentTeamIdx] : null;
  const totalPicks = sim.pickOrder.length;
  const donePicks = sim.currentPickIndex;
  const progress = Math.round((donePicks / totalPicks) * 100);

  return (
    <div className="card mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-300 flex items-center gap-2">
          🎲 Simulação de Draft
          {sim.status === 'done' && <span className="text-green-400 text-sm font-normal">— Concluída!</span>}
        </h3>
        <button
          onClick={() => setSim(null)}
          className="text-xs text-gray-600 hover:text-gray-300 underline transition-colors"
        >
          {sim.status === 'done' ? 'Nova simulação' : 'Cancelar'}
        </button>
      </div>

      {/* Status bar (running) */}
      {sim.status === 'running' && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-gray-800/60 rounded-xl border border-gray-700">
          <TimerRing timeLeft={sim.timeLeft} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-cartola-gold truncate">
              {currentTeam?.name} está escolhendo
            </div>
            <div className="text-xs text-gray-500">
              Pick {donePicks + 1} de {totalPicks} · {currentTeam?.formation}
            </div>
            {sim.lastPick && (
              <div className="text-xs text-gray-400 mt-0.5 truncate">
                Último:{' '}
                <span className={POS_COLORS[sim.lastPick.posId]}>
                  {POS_LABELS[sim.lastPick.posId]}
                </span>{' '}
                <span className="text-white">{sim.lastPick.player.nickname}</span>{' '}
                <span className="text-gray-600">
                  ({(sim.lastPick.player.average_score || 0).toFixed(1)} pts)
                </span>{' '}
                → <span className="text-gray-300">{sim.lastPick.teamName}</span>
              </div>
            )}
          </div>
          {/* Progress */}
          <div className="flex-shrink-0 text-right hidden sm:block">
            <div className="text-xs text-gray-500 mb-1">{progress}%</div>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cartola-green rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Done banner */}
      {sim.status === 'done' && (
        <div className="mb-4 px-3 py-2 bg-green-900/20 border border-green-800/40 rounded-xl text-sm text-green-300">
          ✅ Draft simulado com {sim.teams.length} times e {totalPicks} picks no total.
        </div>
      )}

      {/* Teams horizontal scroll */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3">
          {sim.teams.map((team, i) => (
            <TeamCard
              key={team.id}
              team={team}
              isActive={sim.status === 'running' && i === currentTeamIdx}
            />
          ))}
        </div>
      </div>

      {/* Final ranking (done only) */}
      {sim.status === 'done' && <FinalRanking teams={sim.teams} />}
    </div>
  );
}
