import React from 'react';

export default function DraftOrder({ draftOrder, participants, currentPickerId, participantId, pickNumber }) {
  const participantMap = Object.fromEntries(participants.map(p => [p.id, p]));

  // Show upcoming 8 picks
  const upcoming = draftOrder.slice(0, 8);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-300">Ordem do Draft</h3>
        <span className="text-xs text-gray-500">Pick #{pickNumber + 1}</span>
      </div>

      <div className="space-y-1">
        {upcoming.map((pid, i) => {
          const p = participantMap[pid];
          const isCurrent = i === 0;
          const isMe = pid === participantId;
          return (
            <div
              key={`${i}-${pid}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                isCurrent
                  ? 'bg-cartola-green/20 border border-cartola-green text-white font-semibold'
                  : 'text-gray-500 opacity-70'
              }`}
            >
              <span className="text-xs w-4 text-gray-600">{i + 1}</span>
              <span className={isCurrent ? 'text-cartola-gold' : ''}>
                {isCurrent ? '▶' : '·'}
              </span>
              <span>{p?.name || 'Desconhecido'}</span>
              {isMe && <span className="text-xs text-gray-500">(você)</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
