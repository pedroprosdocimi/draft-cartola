import React from 'react';

const FORMATION_COUNTS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 }
};

const POSITION_COLORS = {
  1: 'border-blue-600 bg-blue-900/20',
  2: 'border-green-700 bg-green-900/20',
  3: 'border-green-700 bg-green-900/20',
  4: 'border-yellow-600 bg-yellow-900/20',
  5: 'border-red-600 bg-red-900/20',
  21: 'border-green-800 bg-green-950/30',
  22: 'border-yellow-700 bg-yellow-950/30',
  23: 'border-red-700 bg-red-950/30',
};

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'DEF RES', 22: 'MEI RES', 23: 'ATA RES' };

const BENCH_SLOT_IDS = [21, 22, 23];

export default function TeamSlots({ formation, picks }) {
  if (!formation) return <div className="card text-gray-500 text-sm text-center py-8">Sem formação</div>;

  const counts = FORMATION_COUNTS[formation];

  const picksByPos = {};
  for (const pick of picks) {
    if (!picksByPos[pick.position_id]) picksByPos[pick.position_id] = [];
    picksByPos[pick.position_id].push(pick);
  }

  const mainPicks = picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
  const benchPicks = picks.filter(p => BENCH_SLOT_IDS.includes(p.position_id));

  const mainPicksByPos = {};
  for (const pick of mainPicks) {
    if (!mainPicksByPos[pick.position_id]) mainPicksByPos[pick.position_id] = [];
    mainPicksByPos[pick.position_id].push(pick);
  }

  const positions = Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => parseInt(k));
  const totalMain = Object.values(counts).reduce((a, b) => a + b, 0);

  function PickRow({ p, posId, empty }) {
    return (
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded border mb-1 ${
        empty ? 'border-dashed border-gray-700 opacity-40' : POSITION_COLORS[posId]
      }`}>
        <span className={`text-xs font-bold w-8 flex-shrink-0 ${empty ? 'text-gray-600' : 'text-gray-400'}`}>
          {POS_LABEL[posId]}
        </span>
        {!empty && (p?.photo
          ? <img src={p.photo} className="w-6 h-6 rounded-full object-cover" alt={p?.nickname} />
          : <div className="w-6 h-6 rounded-full bg-gray-600" />
        )}
        {empty && <div className="w-6 h-6 rounded-full bg-gray-700 border border-dashed border-gray-600" />}
        <span className={`text-sm truncate ${empty ? 'text-gray-600' : 'text-white'}`}>
          {empty ? 'vazio' : p?.nickname}
        </span>
        {!empty && <span className="text-xs text-gray-500 ml-auto flex-shrink-0">{p?.club?.abbreviation || ''}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-300">Meu Time</h3>
        <span className="text-xs text-gray-500 font-mono">{formation}</span>
      </div>

      {/* Main picks */}
      {positions.map(posId => {
        const required = counts[posId];
        const filled = mainPicksByPos[posId] || [];
        const empty = required - filled.length;
        return (
          <div key={posId}>
            {filled.map(p => <PickRow key={p.cartola_id} p={p} posId={posId} empty={false} />)}
            {Array.from({ length: empty }).map((_, i) => (
              <PickRow key={`empty-${posId}-${i}`} posId={posId} empty={true} />
            ))}
          </div>
        );
      })}

      <div className="text-xs text-gray-600 text-center pt-1">
        {mainPicks.length}/{totalMain} titulares
      </div>

      {/* Bench section */}
      <div className="border-t border-gray-800 pt-2 mt-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reservas</div>
        {BENCH_SLOT_IDS.map(slotId => {
          const filled = benchPicks.find(p => p.position_id === slotId);
          return <PickRow key={slotId} p={filled} posId={slotId} empty={!filled} />;
        })}
      </div>
    </div>
  );
}
