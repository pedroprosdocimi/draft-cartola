import React from 'react';
import PlayerCard from './PlayerCard.jsx';
import Timer from './Timer.jsx';

const POSITION_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA' };

const POSITION_COLORS = {
  1: { border: 'border-blue-500',   bg: 'bg-blue-900/50',   text: 'text-blue-300',   btn: 'border-blue-500 bg-blue-900/60 hover:bg-blue-800/80' },
  2: { border: 'border-green-600',  bg: 'bg-green-900/50',  text: 'text-green-300',  btn: 'border-green-600 bg-green-900/60 hover:bg-green-800/80' },
  3: { border: 'border-green-600',  bg: 'bg-green-900/50',  text: 'text-green-300',  btn: 'border-green-600 bg-green-900/60 hover:bg-green-800/80' },
  4: { border: 'border-yellow-500', bg: 'bg-yellow-900/50', text: 'text-yellow-300', btn: 'border-yellow-500 bg-yellow-900/60 hover:bg-yellow-800/80' },
  5: { border: 'border-red-500',    bg: 'bg-red-900/50',    text: 'text-red-300',    btn: 'border-red-500 bg-red-900/60 hover:bg-red-800/80' },
};

const FORMATION_COUNTS = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 }
};

// Rows displayed top→bottom: attack → midfield → defense → goalkeeper (TEC excluded from picker)
const FIELD_ROWS = [[5], [4], [2, 3], [1]];

function AvailableSlot({ posId, onPickPosition }) {
  const c = POSITION_COLORS[posId] || POSITION_COLORS[6];
  return (
    <button
      onClick={() => onPickPosition(posId)}
      className={`w-20 h-28 sm:w-32 sm:h-40 flex flex-col items-center justify-center rounded-2xl border-2 ${c.btn} transition-all hover:scale-105 active:scale-95`}
    >
      <span className={`text-base sm:text-xl font-bold ${c.text}`}>{POSITION_LABELS[posId]}</span>
    </button>
  );
}

function FilledSlot({ player, posId }) {
  const c = POSITION_COLORS[posId] || POSITION_COLORS[6];
  return (
    <div className={`w-20 h-28 sm:w-32 sm:h-40 flex flex-col rounded-2xl border ${c.border} bg-gray-800/80 overflow-hidden opacity-60`}>
      <div className="h-16 sm:h-24 w-full overflow-hidden flex-shrink-0">
        {player.photo
          ? <img src={player.photo} className="w-full h-full object-cover object-top" alt="" />
          : <div className={`w-full h-full ${c.bg}`} />}
      </div>
      <div className={`flex-1 ${c.bg} flex flex-col items-center justify-center px-1 sm:px-2`}>
        <span className={`text-xs font-bold ${c.text} leading-none`}>{POSITION_LABELS[posId]}</span>
        <span className="text-[10px] sm:text-[11px] text-gray-200 leading-none w-full text-center truncate mt-1">{player.nickname}</span>
      </div>
    </div>
  );
}

function FormationPicker({ myFormation, myPicks, neededPositions, onPickPosition }) {
  const counts = FORMATION_COUNTS[myFormation] || {};
  const neededMap = Object.fromEntries(neededPositions.map(({ posId, remaining }) => [posId, remaining]));

  const picksByPos = {};
  for (const pick of myPicks) {
    if (!picksByPos[pick.position_id]) picksByPos[pick.position_id] = [];
    picksByPos[pick.position_id].push(pick);
  }

  const buildSlots = (posId) => {
    const total = counts[posId] || 0;
    if (total === 0) return [];
    const filled = picksByPos[posId] || [];
    const remaining = neededMap[posId] || 0;
    return [
      ...filled.map(player => ({ type: 'filled', player, posId })),
      ...Array.from({ length: remaining }, (_, i) => ({ type: 'available', posId, key: `${posId}-${i}` }))
    ];
  };

  const renderRow = (posIds) => {
    let slots;

    // Defense row: LAT on the outside, ZAG in the middle
    if (posIds.includes(2) && posIds.includes(3)) {
      const latSlots = buildSlots(2);
      const zagSlots = buildSlots(3);
      if (latSlots.length >= 2) {
        slots = [latSlots[0], ...zagSlots, latSlots[1]];
      } else {
        slots = [...latSlots, ...zagSlots];
      }
    } else {
      slots = posIds.flatMap(buildSlots);
    }

    if (slots.length === 0) return null;
    return (
      <div className="flex gap-2 justify-center">
        {slots.map((slot, i) =>
          slot.type === 'filled'
            ? <FilledSlot key={slot.player.cartola_id} player={slot.player} posId={slot.posId} />
            : <AvailableSlot key={slot.key || `avail-${i}`} posId={slot.posId} onPickPosition={onPickPosition} />
        )}
      </div>
    );
  };

  return (
    <div className="bg-green-950/40 border border-green-900/30 rounded-2xl p-3 sm:p-5 flex flex-col gap-2 sm:gap-3">
      {FIELD_ROWS.map(posIds => {
        const row = renderRow(posIds);
        if (!row) return null;
        return <div key={posIds.join('-')}>{row}</div>;
      })}
    </div>
  );
}

export default function PickPanel({
  isMyTurn,
  offeredPlayers,
  currentPickerPositionId,
  neededPositions,
  onPickPosition,
  onPickPlayer,
  currentPickerName,
  clubMatches = {},
  positionAverages = {},
  scoutPositionAverages = {},
  myFormation,
  myPicks = [],
  timeLeft = 60,
}) {
  const posLabel = POSITION_LABELS[currentPickerPositionId] || '';
  const posBadgeColor = (POSITION_COLORS[currentPickerPositionId]?.btn || 'border-gray-600 bg-gray-600').split(' ')[0];

  // ── Modal: 5 player cards (shown to everyone) ────────────────────────────
  if (offeredPlayers) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-5 overflow-y-auto">
        <Timer timeLeft={timeLeft} isMyTurn={isMyTurn} />
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className={`border ${posBadgeColor} text-white text-sm font-bold px-4 py-1.5 rounded-lg`}>
              {posLabel}
            </span>
          </div>
          <p className="text-gray-300 text-sm">
            {isMyTurn
              ? <span className="text-cartola-gold font-semibold">Escolha um jogador</span>
              : <><strong className="text-white">{currentPickerName}</strong> está escolhendo...</>}
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-center">
          {offeredPlayers.map(player => (
            <PlayerCard
              key={player.cartola_id}
              player={player}
              card={true}
              isMyTurn={isMyTurn}
              match={clubMatches[player.club_id] || clubMatches[String(player.club_id)] || null}
              onClick={() => onPickPlayer(player.cartola_id)}
              positionAverages={positionAverages}
              scoutPositionAverages={scoutPositionAverages}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Modal: formation picker (only when it's my turn) ─────────────────────
  if (isMyTurn && myFormation) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center gap-4 sm:gap-6 p-4 overflow-y-auto">
        <Timer timeLeft={timeLeft} isMyTurn={isMyTurn} />
        <p className="text-cartola-gold font-bold text-xl sm:text-2xl tracking-wide">Escolha uma posição</p>
        <FormationPicker
          myFormation={myFormation}
          myPicks={myPicks}
          neededPositions={neededPositions}
          onPickPosition={onPickPosition}
        />
      </div>
    );
  }

  return null;
}
