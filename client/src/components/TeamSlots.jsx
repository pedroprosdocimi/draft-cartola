import React from 'react';

const FORMATION_COUNTS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 1 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2, 6: 1 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2, 6: 1 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1, 6: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3, 6: 1 }
};

const POSITION_COLORS = {
  1: 'border-blue-600 bg-blue-900/20',
  2: 'border-green-700 bg-green-900/20',
  3: 'border-green-700 bg-green-900/20',
  4: 'border-yellow-600 bg-yellow-900/20',
  5: 'border-red-600 bg-red-900/20',
  6: 'border-gray-600 bg-gray-800'
};

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 6: 'TEC' };

export default function TeamSlots({ formation, picks }) {
  if (!formation) return <div className="card text-gray-500 text-sm text-center py-8">Sem formação</div>;

  const counts = FORMATION_COUNTS[formation];

  const picksByPos = {};
  for (const pick of picks) {
    if (!picksByPos[pick.position_id]) picksByPos[pick.position_id] = [];
    picksByPos[pick.position_id].push(pick);
  }

  const positions = Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => parseInt(k));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-300">Meu Time</h3>
        <span className="text-xs text-gray-500 font-mono">{formation}</span>
      </div>

      {positions.map(posId => {
        const required = counts[posId];
        const filled = picksByPos[posId] || [];
        const empty = required - filled.length;

        return (
          <div key={posId}>
            {filled.map((p) => (
              <div
                key={p.cartola_id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border mb-1 ${POSITION_COLORS[posId]}`}
              >
                <span className="text-xs font-bold text-gray-400 w-8 flex-shrink-0">{POS_LABEL[posId]}</span>
                {p.photo ? (
                  <img src={p.photo} className="w-6 h-6 rounded-full object-cover" alt={p.nickname} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-600" />
                )}
                <span className="text-sm text-white truncate">{p.nickname}</span>
                <span className="text-xs text-gray-500 ml-auto flex-shrink-0">{p.club?.abbreviation || ''}</span>
              </div>
            ))}

            {Array.from({ length: empty }).map((_, i) => (
              <div
                key={`empty-${posId}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-gray-700 mb-1 opacity-40"
              >
                <span className="text-xs font-bold text-gray-600 w-8 flex-shrink-0">{POS_LABEL[posId]}</span>
                <div className="w-6 h-6 rounded-full bg-gray-700 border border-dashed border-gray-600" />
                <span className="text-xs text-gray-600">vazio</span>
              </div>
            ))}
          </div>
        );
      })}

      <div className="text-xs text-gray-600 text-center pt-1">
        {picks.length}/{Object.values(counts).reduce((a, b) => a + b, 0)} picks
      </div>
    </div>
  );
}
