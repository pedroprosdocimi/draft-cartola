import React, { useState } from 'react';

const POS_LABEL = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'DEF RES', 22: 'MEI RES', 23: 'ATA RES' };
const POS_COLORS = {
  1: 'text-yellow-400', 2: 'text-blue-400', 3: 'text-red-400',
  4: 'text-purple-400', 5: 'text-green-400',
  21: 'text-teal-400', 22: 'text-amber-400', 23: 'text-orange-400',
};
const POS_ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 21: 5, 22: 6, 23: 7 };
const BENCH_SLOT_IDS = [21, 22, 23];

export default function EndScreen({ teams, participantId }) {
  const [activeTab, setActiveTab] = useState(participantId);

  const myTeam = teams.find(t => t.id === participantId);

  // Sort teams by pick order
  const sortedTeams = [...teams].sort((a, b) => (a.pickOrder || 0) - (b.pickOrder || 0));

  const totalScore = (picks) =>
    picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id)).reduce((sum, p) => sum + (p.average_score || 0), 0);

  const mainPicks = (picks) =>
    picks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id)).sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));

  const benchPicks = (picks) =>
    picks.filter(p => BENCH_SLOT_IDS.includes(p.position_id)).sort((a, b) => (POS_ORDER[a.position_id] ?? 9) - (POS_ORDER[b.position_id] ?? 9));

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center py-8">
        <div className="text-5xl mb-3">🏆</div>
        <h1 className="text-4xl font-bold text-white mb-2">Draft Completo!</h1>
        <p className="text-gray-400">Veja os times montados por cada participante</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {sortedTeams.map((team, i) => (
          <button
            key={team.id}
            onClick={() => setActiveTab(team.id)}
            className={`card text-left transition-all ${
              activeTab === team.id ? 'border-cartola-green bg-cartola-green/10' : 'hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'}</span>
              <span className={`font-semibold truncate ${team.id === participantId ? 'text-white' : 'text-gray-300'}`}>
                {team.name}
                {team.id === participantId && <span className="text-xs text-gray-500 ml-1">(você)</span>}
              </span>
            </div>
            <div className="text-xs text-gray-500">{team.formation} · {team.picks.length} jogadores</div>
            <div className="text-xs text-cartola-gold mt-1">
              ★ {totalScore(team.picks).toFixed(2)} pontos
            </div>
          </button>
        ))}
      </div>

      {/* Active team detail */}
      {teams.filter(t => t.id === activeTab).map(team => (
        <div key={team.id} className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">{team.name}</h2>
              <p className="text-gray-400 text-sm">{team.formation} · {team.picks.length} jogadores</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-cartola-gold">{totalScore(team.picks).toFixed(2)}</div>
              <div className="text-xs text-gray-500">total de pontos</div>
            </div>
          </div>

          {/* Players table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">#</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Pos</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Jogador</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Clube</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">Média</th>
                </tr>
              </thead>
              <tbody>
                {mainPicks(team.picks).map((p, i) => (
                  <tr key={p.cartola_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-3 text-gray-600">{i + 1}</td>
                    <td className="py-2 px-3">
                      <span className={`font-bold text-xs ${POS_COLORS[p.position_id]}`}>
                        {POS_LABEL[p.position_id]}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {p.photo && <img src={p.photo} className="w-7 h-7 rounded-full object-cover" alt="" />}
                        <span className="font-medium text-white">{p.nickname}</span>
                        {p.cartola_id === team.captainId && (
                          <span className="bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded leading-none flex-shrink-0">C</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-gray-400">{p.club?.abbreviation || `Clube ${p.club_id}`}</td>
                    <td className="py-2 px-3 text-right font-semibold text-cartola-gold">{(p.average_score || 0).toFixed(1)}</td>
                  </tr>
                ))}
                {benchPicks(team.picks).length > 0 && (
                  <>
                    <tr><td colSpan={5} className="py-2 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wide border-t border-gray-800">Reservas</td></tr>
                    {benchPicks(team.picks).map((p, i) => (
                      <tr key={`bench-${p.cartola_id}`} className="border-b border-gray-800/30 hover:bg-gray-800/20 opacity-80">
                        <td className="py-2 px-3 text-gray-700">{i + 1}</td>
                        <td className="py-2 px-3">
                          <span className={`font-bold text-xs ${POS_COLORS[p.position_id]}`}>
                            {POS_LABEL[p.position_id]}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {p.photo && <img src={p.photo} className="w-7 h-7 rounded-full object-cover" alt="" />}
                            <span className="font-medium text-gray-300">{p.nickname}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-gray-500">{p.club?.abbreviation || `Clube ${p.club_id}`}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-400">{(p.average_score || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Comparison table */}
      <div className="card mt-6">
        <h3 className="font-semibold text-gray-300 mb-4">Comparativo de Times</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-gray-500">Participante</th>
                <th className="text-center py-2 px-3 text-gray-500">Formação</th>
                <th className="text-center py-2 px-3 text-gray-500">Picks</th>
                <th className="text-center py-2 px-3 text-gray-500">Total de Pontos</th>
                <th className="text-center py-2 px-3 text-gray-500">Melhor Jogador</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map(team => {
                const best = [...team.picks].sort((a, b) => (b.average_score || 0) - (a.average_score || 0))[0];
                return (
                  <tr key={team.id} className={`border-b border-gray-800/50 ${team.id === participantId ? 'bg-cartola-green/5' : ''}`}>
                    <td className="py-2 px-3 font-medium text-white">
                      {team.name}
                      {team.id === participantId && <span className="text-xs text-gray-500 ml-1">(você)</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-400 font-mono">{team.formation}</td>
                    <td className="py-2 px-3 text-center text-gray-400">{team.picks.length}</td>
                    <td className="py-2 px-3 text-center text-cartola-gold font-semibold">
                      {totalScore(team.picks).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-300">
                      {best ? `${best.nickname} (${(best.average_score || 0).toFixed(1)})` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center mt-8 pb-8">
        <button onClick={() => window.location.reload()} className="btn-primary">
          Voltar para a página inicial
        </button>
      </div>
    </div>
  );
}
