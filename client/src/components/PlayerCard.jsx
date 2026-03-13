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

const STATUS_INFO = {
  7: { label: 'Provável',  bg: 'bg-green-900/50',  text: 'text-green-300',  dot: 'bg-green-400'  },
  2: { label: 'Dúvida',    bg: 'bg-yellow-900/50', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  3: { label: 'Suspenso',  bg: 'bg-red-900/50',    text: 'text-red-300',    dot: 'bg-red-400'    },
  5: { label: 'Lesionado', bg: 'bg-red-900/50',    text: 'text-red-300',    dot: 'bg-red-400'    },
  6: { label: 'Nulo',      bg: 'bg-gray-800',      text: 'text-gray-400',   dot: 'bg-gray-500'   },
};

function StatusBadge({ statusId, small = false }) {
  const info = STATUS_INFO[statusId];
  if (!info) return null;
  if (small) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${info.bg} ${info.text} flex-shrink-0`}>
        <span className={`w-1.5 h-1.5 rounded-full ${info.dot} flex-shrink-0`} />
        {info.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${info.bg} ${info.text}`}>
      <span className={`w-2 h-2 rounded-full ${info.dot} flex-shrink-0`} />
      {info.label}
    </span>
  );
}

const SCOUT_CONFIG = {
  1: [ // GOL
    { key: 'DE',  label: 'Defesa',              icon: '🧤', positive: true  },
    { key: 'SG',  label: 'Sem Gol Sofrido',     icon: '🔒', positive: true  },
    { key: 'DD',  label: 'Defesa Difícil',       icon: '⭐', positive: true  },
    { key: 'DP',  label: 'Defesa de Pênalti',   icon: '🏆', positive: true  },
    { key: 'GS',  label: 'Gol Sofrido',         icon: '💀', positive: false },
    { key: 'CV',  label: 'Cartão Vermelho',      icon: '🟥', positive: false },
  ],
  2: [ // LAT
    { key: 'DS',  label: 'Desarme',             icon: '🛡️', positive: true  },
    { key: 'SG',  label: 'Sem Gol Sofrido',     icon: '🔒', positive: true  },
    { key: 'A',   label: 'Assistência',          icon: '🎯', positive: true  },
    { key: 'FS',  label: 'Falta Sofrida',        icon: '🤸', positive: true  },
    { key: 'CA',  label: 'Cartão Amarelo',       icon: '🟨', positive: false },
    { key: 'CV',  label: 'Cartão Vermelho',      icon: '🟥', positive: false },
  ],
  3: [ // ZAG
    { key: 'DS',  label: 'Desarme',             icon: '🛡️', positive: true  },
    { key: 'SG',  label: 'Sem Gol Sofrido',     icon: '🔒', positive: true  },
    { key: 'G',   label: 'Gol',                 icon: '⚽', positive: true  },
    { key: 'A',   label: 'Assistência',          icon: '🎯', positive: true  },
    { key: 'CA',  label: 'Cartão Amarelo',       icon: '🟨', positive: false },
    { key: 'CV',  label: 'Cartão Vermelho',      icon: '🟥', positive: false },
  ],
  4: [ // MEI
    { key: 'A',   label: 'Assistência',          icon: '🎯', positive: true  },
    { key: 'G',   label: 'Gol',                 icon: '⚽', positive: true  },
    { key: 'DS',  label: 'Desarme',             icon: '🛡️', positive: true  },
    { key: 'FS',  label: 'Falta Sofrida',        icon: '🤸', positive: true  },
    { key: 'CA',  label: 'Cartão Amarelo',       icon: '🟨', positive: false },
    { key: 'CV',  label: 'Cartão Vermelho',      icon: '🟥', positive: false },
  ],
  5: [ // ATA
    { key: 'G',   label: 'Gol',                 icon: '⚽', positive: true  },
    { key: 'A',   label: 'Assistência',          icon: '🎯', positive: true  },
    { key: 'FF',  label: 'Finalização Fora',     icon: '📤', positive: true  },
    { key: 'FT',  label: 'Finalização na Trave', icon: '🏗️', positive: true  },
    { key: 'CA',  label: 'Cartão Amarelo',       icon: '🟨', positive: false },
    { key: 'CV',  label: 'Cartão Vermelho',      icon: '🟥', positive: false },
  ],
};

function AvgScore({ score, posAvg }) {
  const s = score || 0;
  let color;
  if (posAvg != null) {
    color = s >= posAvg ? 'text-green-400' : 'text-red-400';
  } else {
    // fallback thresholds when position average isn't available
    color = s >= 6 ? 'text-green-400' : s >= 3 ? 'text-cartola-gold' : 'text-red-400';
  }
  return <span className={`${color} text-xs font-semibold`}>{s.toFixed(1)}</span>;
}

// Row: icon + full label on the left, value on the right
function StatRow({ icon, label, val, positive, posAvg }) {
  const roundedVal = Math.round(val);
  let color;
  if (posAvg == null) {
    color = positive ? 'text-green-400' : 'text-red-400';
  } else if (val === posAvg) {
    color = 'text-yellow-400';
  } else {
    const rawAbove = val > posAvg;
    color = (positive ? rawAbove : !rawAbove) ? 'text-green-400' : 'text-red-400';
  }

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="text-sm leading-none w-5 text-center flex-shrink-0">{icon}</span>
      <span className="text-gray-400 text-xs flex-1 leading-tight">{label}</span>
      <span className={`text-xs font-bold flex-shrink-0 ${color}`}>{roundedVal}</span>
    </div>
  );
}

function StatRows({ scouts, positionId, scoutPositionAvgs }) {
  const config = SCOUT_CONFIG[positionId];
  if (!config) return null;
  return (
    <div className="divide-y divide-gray-700/40">
      {config.map(({ key, label, icon, positive }) => (
        <StatRow
          key={key}
          icon={icon}
          label={label}
          val={scouts?.stats?.[key] ?? 0}
          positive={positive}
          posAvg={scoutPositionAvgs?.[key] ?? null}
        />
      ))}
    </div>
  );
}

export default function PlayerCard({
  player,
  onClick,
  isMyTurn,
  compact = false,
  card = false,
  match = null,
  positionAverages = {},
  scoutPositionAverages = {},
  isCaptain = false,
}) {
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
        {player.status_id != null && <StatusBadge statusId={player.status_id} small />}
        <div className="text-right flex-shrink-0">
          <AvgScore score={player.average_score} posAvg={posAvg} />
          <div className="text-xs text-gray-600">C${player.price?.toFixed(0)}</div>
        </div>
      </button>
    );
  }

  // ── Card: vertical with stats ─────────────────────────────────────────────
  if (card) {
    return (
      <button
        onClick={isMyTurn ? onClick : undefined}
        disabled={!isMyTurn}
        className={`w-full flex flex-col bg-gray-800 border rounded-xl overflow-hidden transition-all text-left
          ${isMyTurn
            ? `border-gray-600 hover:border-cartola-green hover:scale-105 hover:shadow-lg ${POSITION_GLOW[player.position_id]} cursor-pointer active:scale-100`
            : 'border-gray-700 opacity-80 cursor-default'
          }`}
      >
        {/* Photo */}
        <div className="relative bg-gray-900 h-44 w-full overflow-hidden flex-shrink-0">
          <div className={`absolute top-0 left-0 right-0 h-1.5 z-10 ${posBg}`} />
          {player.photo
            ? <img src={player.photo} alt={player.nickname} className="w-full h-full object-cover object-top" />
            : <span className="absolute inset-0 flex items-center justify-center text-5xl text-gray-700">?</span>}
          {isCaptain && (
            <div className="absolute top-2 right-2 z-20 w-6 h-6 bg-black rounded-full flex items-center justify-center border-2 border-gray-300 shadow-lg">
              <span className="text-white text-xs font-black leading-none">C</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col p-2 gap-1.5 flex-1">
          {/* Name */}
          <div className="flex items-center justify-center">
            <span className="font-extrabold text-white text-base leading-tight line-clamp-2 text-center">
              {player.nickname}
            </span>
          </div>

          {/* Status */}
          {player.status_id != null && (
            <div className="flex justify-center">
              <StatusBadge statusId={player.status_id} />
            </div>
          )}

          {/* Divider: scores */}
          <div className="border-t border-gray-700 pt-1.5 w-full">
            <div className="flex justify-around text-center">
              <div>
                <div className="text-gray-400 text-xs leading-none mb-0.5">Média</div>
                <AvgScore score={player.average_score} posAvg={posAvg} />
              </div>
              <div>
                <div className="text-gray-400 text-xs leading-none mb-0.5">Última</div>
                {(() => {
                  const s = player.recentScores?.[0]?.score ?? 0;
                  const color = s >= 6 ? 'text-green-400' : s >= 3 ? 'text-cartola-gold' : 'text-red-400';
                  return <span className={`text-xs font-semibold ${color}`}>{s.toFixed(1)}</span>;
                })()}
              </div>
              {posAvg != null && (
                <div>
                  <div className="text-gray-400 text-xs leading-none mb-0.5">Média pos.</div>
                  <span className="text-xs font-semibold text-gray-400">{posAvg.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Divider + match */}
          {match && (
            <>
              <div className="border-t border-gray-700" />
              <div className="text-center">
                <div className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Próximo confronto</div>
                <div className="text-xs text-blue-400 font-medium">{match}</div>
              </div>
            </>
          )}

          {/* Stats */}
          <div className="border-t border-gray-700 pt-1">
            <StatRows
              scouts={player.scouts}
              positionId={player.position_id}
              scoutPositionAvgs={scoutPositionAvgs}
            />
          </div>
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
