import React, { useState, useMemo } from 'react';
import PlayerCard from './PlayerCard.jsx';

const POSITION_LABELS = { 0: 'Todos', 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA' };

export default function PlayerList({ players, pickedIds, isMyTurn, onPick }) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState(0);

  const available = useMemo(() => {
    return players
      .filter(p => !pickedIds.has(p.cartola_id))
      .filter(p => posFilter === 0 || p.position_id === posFilter)
      .filter(p => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.nickname?.toLowerCase().includes(q) ||
               p.name?.toLowerCase().includes(q) ||
               p.club?.abbreviation?.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.average_score || 0) - (a.average_score || 0));
  }, [players, pickedIds, posFilter, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          className="input-field text-sm"
          placeholder="Buscar jogador ou clube..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Position filter */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {Object.entries(POSITION_LABELS).map(([posId, label]) => (
          <button
            key={posId}
            onClick={() => setPosFilter(parseInt(posId))}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              posFilter === parseInt(posId)
                ? 'bg-cartola-green text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Player count */}
      <div className="text-xs text-gray-600 mb-2">
        {available.length} jogadores disponíveis
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {available.length === 0 ? (
          <div className="text-center text-gray-600 py-8">Nenhum jogador encontrado</div>
        ) : (
          available.map(player => (
            <PlayerCard
              key={player.cartola_id}
              player={player}
              isMyTurn={isMyTurn}
              compact={true}
              onClick={() => isMyTurn && onPick(player.cartola_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
