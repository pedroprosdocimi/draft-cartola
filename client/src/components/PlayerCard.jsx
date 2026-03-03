import React from 'react';

const POSITION_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA' };
const POSITION_COLORS = {
  1: 'bg-blue-600',
  2: 'bg-green-700',
  3: 'bg-green-700',
  4: 'bg-yellow-600',
  5: 'bg-red-600',
};
const POSITION_GLOW = {
  1: 'hover:shadow-blue-600/40',
  2: 'hover:shadow-green-700/40',
  3: 'hover:shadow-green-700/40',
  4: 'hover:shadow-yellow-600/40',
  5: 'hover:shadow-red-600/40',
};

// Full descriptions shown in tooltip on hover
const SCOUT_LABELS = {
  G:  'Gol',
  A:  'Assistência',
  DS: 'Desarme',
  DE: 'Defesa',
  SG: 'Sem Gol Sofrido (clean sheet)',
  DD: 'Defesa Difícil',
  DP: 'Defesa de Pênalti',
  GS: 'Gol Sofrido',
  FF: 'Finalização pra Fora',
  FT: 'Finalização na Trave',
  FS: 'Falta Sofrida',
  FD: 'Falta Desfeita',
  CA: 'Cartão Amarelo',
  CV: 'Cartão Vermelho',
  I:  'Impedimento',
  PP: 'Pênalti Perdido',
  PC: 'Pênalti Cometido',
  FC: 'Falta Cometida',
};

// [key, isPositive] — ordered by relevance per position
const SCOUT_CONFIG = {
  1: [ // GOL
    ['DE', true],
    ['SG', true],
    ['DD', true],
    ['DP', true],
    ['GS', false],
    ['CV', false],
  ],
  2: [ // LAT
    ['DS', true],
    ['SG', true],
    ['A',  true],
    ['FS', true],
    ['CA', false],
    ['CV', false],
  ],
  3: [ // ZAG
    ['DS', true],
    ['SG', true],
    ['G',  true],
    ['A',  true],
    ['CA', false],
    ['CV', false],
  ],
  4: [ // MEI
    ['A',  true],
    ['G',  true],
    ['DS', true],
    ['FS', true],
    ['CA', false],
    ['CV', false],
  ],
  5: [ // ATA
    ['G',  true],
    ['A',  true],
    ['FF', true],
    ['FT', true],
    ['CA', false],
    ['CV', false],
  ],
};

function AvgScore({ score, posAvg }) {
  const s = score || 0;
  const hasAvg = posAvg != null;
  const above = s >= posAvg;
  const color = !hasAvg ? 'text-cartola-gold' : above ? 'text-green-400' : 'text-red-400';

  return (
    <span className="relative group cursor-default">
      <span className={`${color} text-xs font-semibold`}>{s.toFixed(1)}</span>
      {hasAvg && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-30">
          Média por Posição: {posAvg.toFixed(1)} · <span className={above ? 'text-green-400' : 'text-red-400'}>{above ? 'Acima' : 'Abaixo'} da média</span>
        </span>
      )}
    </span>
  );
}

function ScoutBadge({ scoutKey, val, positive, posAvg }) {
  const hasAvg = posAvg != null;
  const roundedVal = Math.round(val);

  let color, tooltipSuffix;
  if (!hasAvg) {
    color = positive ? 'text-green-400' : 'text-red-400';
  } else if (val === posAvg) {
    color = 'text-yellow-400';
    tooltipSuffix = <span className="text-yellow-400">Na média</span>;
  } else {
    const rawAbove = val > posAvg;
    const good = positive ? rawAbove : !rawAbove;
    color = good ? 'text-green-400' : 'text-red-400';
    tooltipSuffix = (
      <span className={good ? 'text-green-400' : 'text-red-400'}>
        {rawAbove ? 'Acima' : 'Abaixo'} da média
      </span>
    );
  }

  return (
    <span className="relative group cursor-default">
      <span className={color}>
        {scoutKey}{' '}
        <span className="font-semibold">{roundedVal}</span>
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-30">
        {SCOUT_LABELS[scoutKey] || scoutKey}
        {hasAvg && <> · Média: {posAvg.toFixed(1)} · {tooltipSuffix}</>}
      </span>
    </span>
  );
}

function ScoutBadges({ scouts, positionId, scoutPositionAvgs }) {
  const config = SCOUT_CONFIG[positionId];
  if (!config) return null;

  const badges = config
    .map(([key, positive]) => ({ key, positive, val: scouts?.stats?.[key] ?? 0 }));

  return (
    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs pt-0.5">
      {badges.map(({ key, positive, val }) => (
        <ScoutBadge key={key} scoutKey={key} val={val} positive={positive} posAvg={scoutPositionAvgs?.[key] ?? null} />
      ))}
    </div>
  );
}

export default function PlayerCard({ player, onClick, isMyTurn, compact = false, card = false, match = null, positionAverages = {}, scoutPositionAverages = {} }) {
  const posAvg = positionAverages[player.position_id] ?? null;
  const scoutPositionAvgs = scoutPositionAverages[player.position_id] ?? null;
  const posLabel = POSITION_LABELS[player.position_id] || '?';
  const posBg = POSITION_COLORS[player.position_id] || 'bg-gray-600';

  // ── Compact: small list row ───────────────────────────────────────────────
  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={!isMyTurn}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
          isMyTurn ? 'hover:bg-gray-700 cursor-pointer active:scale-95' : 'opacity-60 cursor-default'
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
          {player.photo
            ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">?</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-white truncate">{player.nickname}</div>
          <div className="text-xs text-gray-400">
            {player.club?.abbreviation || `Clube ${player.club_id}`}
            {match && <span className="text-gray-600 ml-1">· {match}</span>}
          </div>
        </div>
        <span className={`${posBg} text-white text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>{posLabel}</span>
        <div className="text-right flex-shrink-0">
          <AvgScore score={player.average_score} posAvg={posAvg} />
          <div className="text-xs text-gray-600">C${player.price?.toFixed(0)}</div>
        </div>
      </button>
    );
  }

  // ── Card: vertical "cartinha" for the pick modal ──────────────────────────
  if (card) {
    return (
      <button
        onClick={isMyTurn ? onClick : undefined}
        disabled={!isMyTurn}
        className={`w-28 sm:w-36 flex flex-col bg-gray-800 border rounded-xl overflow-visible transition-all text-left
          ${isMyTurn
            ? `border-gray-600 hover:border-cartola-green hover:scale-105 hover:shadow-lg ${POSITION_GLOW[player.position_id]} cursor-pointer active:scale-100`
            : 'border-gray-700 opacity-80 cursor-default'
          }`}
      >
        {/* Photo area */}
        <div className="relative bg-gray-900 h-28 sm:h-36 overflow-hidden rounded-t-xl flex items-center justify-center">
          <div className={`absolute top-0 left-0 right-0 h-1.5 ${posBg}`} />
          {player.photo
            ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover object-top" />
            : <span className="text-4xl sm:text-5xl text-gray-700">?</span>}
        </div>

        {/* Info area */}
        <div className="flex-1 p-1.5 sm:p-2 flex flex-col items-center text-center gap-0.5 sm:gap-1">
          <div className="font-bold text-white text-xs sm:text-sm leading-tight w-full truncate">{player.nickname}</div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className={`${posBg} text-white text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded`}>{posLabel}</span>
            <AvgScore score={player.average_score} posAvg={posAvg} />
          </div>

          <div className="w-full border-t border-gray-700 my-0.5 sm:my-1" />

          <div className="text-xs text-gray-400 font-medium">{player.club?.abbreviation || ''}</div>
          {match && <div className="text-xs text-blue-400 font-medium">{match}</div>}

          <ScoutBadges scouts={player.scouts} positionId={player.position_id} scoutPositionAvgs={scoutPositionAvgs} />
        </div>
      </button>
    );
  }

  // ── Full: horizontal fallback ─────────────────────────────────────────────
  return (
    <button
      onClick={onClick}
      disabled={!isMyTurn}
      className={`card text-left w-full transition-all ${
        isMyTurn ? 'hover:border-cartola-green hover:bg-gray-800 cursor-pointer active:scale-95' : 'opacity-50 cursor-default'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
          {player.photo
            ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-500">?</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{player.nickname}</div>
          <div className="text-sm text-gray-400">{player.club?.abbreviation || `Clube ${player.club_id}`}</div>
          {match && <div className="text-xs text-blue-400 font-medium mt-0.5">{match}</div>}
        </div>
        <div className="text-right">
          <span className={`${posBg} text-white text-xs font-bold px-2 py-0.5 rounded block mb-1`}>{posLabel}</span>
          <AvgScore score={player.average_score} posAvg={posAvg} />
        </div>
      </div>
    </button>
  );
}
