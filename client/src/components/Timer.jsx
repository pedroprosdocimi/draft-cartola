import React from 'react';

export default function Timer({ timeLeft, isMyTurn }) {
  const pct = (timeLeft / 15) * 100;
  const urgent = timeLeft <= 5;

  return (
    <div className={`w-full max-w-sm text-center px-8 py-6 rounded-2xl border ${
      isMyTurn
        ? urgent ? 'border-red-600 bg-red-900/20' : 'border-cartola-green bg-cartola-green/10'
        : 'border-gray-700 bg-gray-900'
    }`}>
      <div className={`text-8xl font-bold font-mono tabular-nums ${
        urgent ? 'text-red-400 animate-pulse' : isMyTurn ? 'text-white' : 'text-gray-400'
      }`}>
        {timeLeft}s
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            urgent ? 'bg-red-500' : 'bg-cartola-green'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {isMyTurn && (
        <p className={`text-sm mt-3 font-semibold ${urgent ? 'text-red-400' : 'text-cartola-gold'}`}>
          {urgent ? '⚠️ AUTO-PICK EM BREVE!' : '🎯 SUA VEZ!'}
        </p>
      )}
    </div>
  );
}
