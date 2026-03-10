import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import socket from '../socket.js';
import PickPanel from '../components/PickPanel.jsx';
import TeamSlots from '../components/TeamSlots.jsx';
import DraftOrder from '../components/DraftOrder.jsx';
import Timer from '../components/Timer.jsx';

const FORMATIONS_CLIENT = {
  '4-3-3': { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  '4-4-2': { 1: 1, 2: 2, 3: 2, 4: 4, 5: 2 },
  '3-5-2': { 1: 1, 2: 0, 3: 3, 4: 5, 5: 2 },
  '4-5-1': { 1: 1, 2: 2, 3: 2, 4: 5, 5: 1 },
  '3-4-3': { 1: 1, 2: 0, 3: 3, 4: 4, 5: 3 }
};

const POSITION_LABELS = { 1: 'GOL', 2: 'LAT', 3: 'ZAG', 4: 'MEI', 5: 'ATA', 21: 'DEF RES', 22: 'MEI RES', 23: 'ATA RES' };
const BENCH_SLOT_IDS = [21, 22, 23];

export default function Draft({ roomCode, participantId, initialData, onParallelTurnDone, onGoHome }) {
  const [mobileTab, setMobileTab] = useState('status'); // 'order' | 'status' | 'team'
  const clubs = useRef(initialData.clubs || {}).current;        // stable, never changes
  const clubMatches = useRef(initialData.clubMatches || {}).current; // stable, never changes

  // Average scout totals per position, computed from all players with scout data.
  // Denominator = all players at that position (not just those who have the stat),
  // so stats like SG aren't inflated by excluding players with 0.
  const scoutPositionAverages = useMemo(() => {
    const sumByPos = {};   // { posId: { statKey: sum } }
    const countByPos = {}; // { posId: total players with scout data }
    for (const p of initialData.players || []) {
      if (!p.scouts?.stats) continue;
      const posId = p.position_id;
      countByPos[posId] = (countByPos[posId] || 0) + 1;
      if (!sumByPos[posId]) sumByPos[posId] = {};
      for (const [k, v] of Object.entries(p.scouts.stats)) {
        sumByPos[posId][k] = (sumByPos[posId][k] || 0) + v;
      }
    }
    const result = {};
    for (const [posId, stats] of Object.entries(sumByPos)) {
      const total = countByPos[parseInt(posId)] || 1;
      result[parseInt(posId)] = {};
      for (const [k, sum] of Object.entries(stats)) {
        result[parseInt(posId)][k] = sum / total;
      }
    }
    return result;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Average score per position, computed from all probable starters (status_id=7)
  const positionAverages = useMemo(() => {
    const byPos = {};
    for (const p of initialData.players || []) {
      if (p.status_id !== 7) continue;
      if (!byPos[p.position_id]) byPos[p.position_id] = { sum: 0, count: 0 };
      byPos[p.position_id].sum += p.average_score || 0;
      byPos[p.position_id].count++;
    }
    const result = {};
    for (const [posId, { sum, count }] of Object.entries(byPos)) {
      result[parseInt(posId)] = count > 0 ? sum / count : 0;
    }
    return result;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draftOrder] = useState(initialData.draftOrder || []);
  const [participants, setParticipants] = useState(initialData.participants || []);
  const [currentPickerId, setCurrentPickerId] = useState(initialData.currentPickerId);
  const [pickedIds, setPickedIds] = useState(() => {
    const ids = new Set();
    for (const p of initialData.participants || []) {
      for (const pick of p.picks || []) ids.add(pick.cartola_id);
    }
    return ids;
  });
  const [myPicks, setMyPicks] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [mode] = useState(initialData.mode || 'realtime');
  const [pickNumber, setPickNumber] = useState(() =>
    (initialData.participants || []).reduce((sum, p) => sum + (p.picks || []).length, 0)
  );
  const [lastPick, setLastPick] = useState(null);
  const [notification, setNotification] = useState(null);
  const [phase, setPhase] = useState(initialData.phase || 'main'); // 'main' | 'bench' | 'captain'
  const [captainIds, setCaptainIds] = useState(() => {
    const map = {};
    for (const p of initialData.participants || []) {
      if (p.captainId) map[p.id] = p.captainId;
    }
    return map;
  });
  const [offeredPlayers, setOfferedPlayers] = useState(
    initialData.currentOptions
      ? initialData.currentOptions.map(p => ({ ...p, club: initialData.clubs?.[p.club_id] || null }))
      : null
  );
  const [currentPickerPositionId, setCurrentPickerPositionId] = useState(
    initialData.currentPickerPositionId || null
  );

  // Ref so socket handlers always see latest participants without re-registering
  const participantsRef = useRef(participants);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const me = participants.find(p => p.id === participantId);
  const isMyTurn = currentPickerId === participantId;
  const currentPickerName = participants.find(p => p.id === currentPickerId)?.name || '';

  // Sync myPicks whenever participants state updates
  useEffect(() => {
    const me = participants.find(p => p.id === participantId);
    if (me?.picks) setMyPicks(me.picks);
  }, [participants, participantId]);

  // Compute positions I still need based on my formation + picks so far (main draft)
  const myNeededPositions = useMemo(() => {
    if (!me?.formation) return [];
    const formationMap = FORMATIONS_CLIENT[me.formation] || {};
    const mainPicks = myPicks.filter(p => !BENCH_SLOT_IDS.includes(p.position_id));
    const counts = {};
    for (const p of mainPicks) {
      counts[p.position_id] = (counts[p.position_id] || 0) + 1;
    }
    return Object.entries(formationMap)
      .map(([posId, required]) => ({
        posId: parseInt(posId),
        remaining: required - (counts[parseInt(posId)] || 0)
      }))
      .filter(({ remaining }) => remaining > 0);
  }, [me, myPicks]);

  // Bench slots I still need to fill
  const myBenchNeededSlots = useMemo(() => {
    const filledSlots = new Set(myPicks.filter(p => BENCH_SLOT_IDS.includes(p.position_id)).map(p => p.position_id));
    return BENCH_SLOT_IDS.filter(id => !filledSlots.has(id));
  }, [myPicks]);

  const showNotification = useCallback((msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // Register all socket handlers ONCE (empty deps) to avoid re-registration race conditions.
  // Use participantsRef.current for any participant lookups so we always have fresh data.
  useEffect(() => {
    // Restore state on reconnect mid-draft
    const onDraftStarted = (data) => {
      if (data.currentOptions?.length > 0) {
        setOfferedPlayers(data.currentOptions.map(p => ({
          ...p,
          club: clubs[p.club_id] || clubs[String(p.club_id)] || null
        })));
        setCurrentPickerPositionId(data.currentPickerPositionId || null);
      }
    };

    // Step 1 done: position chosen, 5 options revealed
    const onPositionPicked = ({ participantId: pid, positionId, options }) => {
      setOfferedPlayers(options.map(p => ({
        ...p,
        // prefer club already embedded by server, fall back to client map
        club: p.club || clubs[p.club_id] || clubs[String(p.club_id)] || null
      })));
      setCurrentPickerPositionId(positionId);
      const pickerName = participantsRef.current.find(p => p.id === pid)?.name || 'Alguém';
      showNotification(`${pickerName} escolheu ${POSITION_LABELS[positionId] || positionId}`, 'info');
    };

    // Step 2 done: player picked
    const onPlayerPicked = ({ participantId: pid, player, nextParticipantId, pickNumber }) => {
      setOfferedPlayers(null);
      setCurrentPickerPositionId(null);
      setPickedIds(prev => new Set([...prev, player.cartola_id]));
      setCurrentPickerId(nextParticipantId);
      setPickNumber(pickNumber);
      setTimeLeft(60);
      setLastPick({ participantId: pid, player });
      setParticipants(prev => prev.map(p =>
        p.id === pid ? { ...p, picks: [...(p.picks || []), player] } : p
      ));
      const pickerName = participantsRef.current.find(p => p.id === pid)?.name || 'Alguém';
      showNotification(`${pickerName} escolheu ${player.nickname}`, 'pick');
    };

    const onAutoPicked = ({ participantId: pid, player }) => {
      setOfferedPlayers(null);
      setCurrentPickerPositionId(null);
      const pickerName = participantsRef.current.find(p => p.id === pid)?.name || 'Alguém';
      showNotification(`⏰ Auto-pick: ${pickerName} → ${player.nickname}`, 'auto');
    };

    const onTimerTick = ({ timeLeft }) => setTimeLeft(timeLeft);
    const onError = ({ message }) => showNotification(`❌ ${message}`, 'error');

    const onBenchDraftStarted = ({ currentPickerId }) => {
      setPhase('bench');
      setCurrentPickerId(currentPickerId);
      setOfferedPlayers(null);
      setCurrentPickerPositionId(null);
      setTimeLeft(60);
      showNotification('🏃 Segunda fase: Draft de Reservas!', 'info');
    };

    const onCaptainDraftStarted = ({ currentPickerId, options }) => {
      setPhase('captain');
      setCurrentPickerId(currentPickerId);
      setOfferedPlayers(options.map(p => ({
        ...p,
        club: clubs[p.club_id] || clubs[String(p.club_id)] || null,
      })));
      setCurrentPickerPositionId(null);
      setTimeLeft(60);
      showNotification('👑 Terceira fase: Escolha do Capitão!', 'info');
    };

    const onCaptainPicked = ({ participantId: pid, captainId, nextPickerId, nextOptions }) => {
      setCaptainIds(prev => ({ ...prev, [pid]: captainId }));
      setParticipants(prev => prev.map(p => p.id === pid ? { ...p, captainId } : p));
      const pickerName = participantsRef.current.find(p => p.id === pid)?.name || 'Alguém';
      showNotification(`👑 ${pickerName} escolheu seu capitão`, 'pick');
      if (nextPickerId && nextOptions) {
        setCurrentPickerId(nextPickerId);
        setOfferedPlayers(nextOptions.map(p => ({
          ...p,
          club: clubs[p.club_id] || clubs[String(p.club_id)] || null,
        })));
        setTimeLeft(60);
      } else {
        setOfferedPlayers(null);
      }
    };

    const onParallelDone = () => {
      if (onParallelTurnDone) onParallelTurnDone();
    };

    socket.on('draft_started', onDraftStarted);
    socket.on('parallel_turn_done', onParallelDone);
    socket.on('bench_draft_started', onBenchDraftStarted);
    socket.on('captain_draft_started', onCaptainDraftStarted);
    socket.on('captain_picked', onCaptainPicked);
    socket.on('position_picked', onPositionPicked);
    socket.on('player_picked', onPlayerPicked);
    socket.on('auto_picked', onAutoPicked);
    socket.on('timer_tick', onTimerTick);
    socket.on('error', onError);

    return () => {
      socket.off('draft_started', onDraftStarted);
      socket.off('parallel_turn_done', onParallelDone);
      socket.off('bench_draft_started', onBenchDraftStarted);
      socket.off('captain_draft_started', onCaptainDraftStarted);
      socket.off('captain_picked', onCaptainPicked);
      socket.off('position_picked', onPositionPicked);
      socket.off('player_picked', onPlayerPicked);
      socket.off('auto_picked', onAutoPicked);
      socket.off('timer_tick', onTimerTick);
      socket.off('error', onError);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to status tab on mobile when it's the user's turn
  useEffect(() => {
    if (isMyTurn) setMobileTab('status');
  }, [isMyTurn]);

  const handlePickPosition = useCallback((positionId) => {
    socket.emit('pick_position', { roomCode, participantId, positionId });
  }, [roomCode, participantId]);

  const handlePickBenchSlot = useCallback((benchSlotId) => {
    socket.emit('pick_bench_slot', { roomCode, participantId, benchSlotId });
  }, [roomCode, participantId]);

  const handlePickPlayer = useCallback((cartolaId) => {
    socket.emit('pick_player', { roomCode, participantId, cartolaId });
  }, [roomCode, participantId]);

  const handlePickCaptain = useCallback((cartolaId) => {
    socket.emit('pick_captain', { roomCode, participantId, cartolaId });
  }, [roomCode, participantId]);

  const remainingOrder = draftOrder.slice(pickNumber);

  // Progress of the current drafter in parallel mode
  const currentDrafter = participants.find(p => p.id === currentPickerId);
  const drafterTotalPicks = currentDrafter?.formation
    ? (phase === 'bench' ? 3 : Object.values(FORMATIONS_CLIENT[currentDrafter.formation] || {}).reduce((a, b) => a + b, 0))
    : 0;
  const drafterDonePicks = currentDrafter
    ? (phase === 'bench'
        ? (currentDrafter.picks || []).filter(p => BENCH_SLOT_IDS.includes(p.position_id)).length
        : (currentDrafter.picks || []).filter(p => !BENCH_SLOT_IDS.includes(p.position_id)).length)
    : 0;
  const drafterProgressPct = drafterTotalPicks > 0 ? Math.round((drafterDonePicks / drafterTotalPicks) * 100) : 0;

  // Total picks across all participants for status display
  const totalPicksDone = participants.reduce((sum, p) => sum + (p.picks || []).length, 0);
  const totalPicksExpected = participants.reduce((p, part) => {
    const f = FORMATIONS_CLIENT[part.formation];
    return p + (f ? Object.values(f).reduce((a, b) => a + b, 0) : 0) + 3; // +3 bench
  }, 0);

  let turnText;
  if (isMyTurn) {
    turnText = (
      <div className="space-y-1">
        {phase === 'captain'
          ? <p className="text-cartola-gold font-semibold">Escolha seu Capitão!</p>
          : offeredPlayers
            ? <p className="text-cartola-gold font-semibold">Escolha um dos jogadores!</p>
            : phase === 'bench'
              ? <p className="text-cartola-gold font-semibold">Escolha um slot de reserva!</p>
              : <p className="text-cartola-gold font-semibold">Escolha uma posição!</p>}
        {mode === 'parallel' && phase !== 'captain' && (
          <p className="text-xs text-gray-400">
            Seus picks: {drafterDonePicks}/{drafterTotalPicks}
          </p>
        )}
      </div>
    );
  } else {
    turnText = (
      <div className="space-y-3 w-full px-2">
        <p className="text-gray-400 text-sm">
          Aguardando <strong className="text-white">{currentPickerName}</strong>
          {phase === 'captain' ? ' escolher o capitão...' : offeredPlayers ? ' escolher um jogador...' : phase === 'bench' ? ' escolher um reserva...' : ' escolher uma posição...'}
        </p>
        {mode === 'parallel' && phase !== 'captain' && drafterTotalPicks > 0 && (
          <div className="w-full max-w-xs mx-auto">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{currentPickerName}</span>
              <span>{drafterDonePicks}/{drafterTotalPicks} picks</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${drafterProgressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          notification.type === 'error' ? 'bg-red-900 text-red-100 border border-red-600' :
          notification.type === 'auto' ? 'bg-orange-900 text-orange-100 border border-orange-600' :
          notification.type === 'pick' ? 'bg-cartola-dark text-green-100 border border-cartola-green' :
          'bg-gray-800 text-gray-100 border border-gray-600'
        }`}>
          {notification.msg}
        </div>
      )}

      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'parallel' && onGoHome && (
            <button
              onClick={onGoHome}
              className="text-xs text-gray-500 hover:text-white transition-colors mr-1"
              title="Voltar ao início (você pode retornar)"
            >
              ← Home
            </button>
          )}
          <span className="font-bold text-white">⚽ Draft</span>
          <span className="text-xs text-gray-500 font-mono">{roomCode}</span>
          {mode === 'parallel' && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700">
              👤 Paralelo
            </span>
          )}
          {phase === 'bench' && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-700">
              Reservas
            </span>
          )}
          {phase === 'captain' && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300 border border-yellow-700">
              Capitão
            </span>
          )}
        </div>
        <div className="text-sm font-semibold">
          {isMyTurn
            ? <span className="text-cartola-gold animate-pulse">▶ SUA VEZ</span>
            : <span className="text-gray-400 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">Vez de {currentPickerName}</span>}
        </div>
        <div className="text-xs text-gray-500 text-right">
          <div>{totalPicksDone}/{totalPicksExpected} picks</div>
        </div>
      </div>

      {/* Pick modals — rendered as overlays, outside column layout */}
      <PickPanel
        isMyTurn={isMyTurn}
        offeredPlayers={offeredPlayers}
        currentPickerPositionId={currentPickerPositionId}
        neededPositions={myNeededPositions}
        onPickPosition={handlePickPosition}
        onPickPlayer={phase === 'captain' ? handlePickCaptain : handlePickPlayer}
        onPickBenchSlot={handlePickBenchSlot}
        currentPickerName={currentPickerName}
        clubMatches={clubMatches}
        positionAverages={positionAverages}
        scoutPositionAverages={scoutPositionAverages}
        myFormation={me?.formation}
        myPicks={myPicks}
        timeLeft={timeLeft}
        phase={phase}
        benchNeededSlots={myBenchNeededSlots}
      />

      {/* Main layout — 3 columns on desktop, tabs on mobile */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: draft info */}
        <div className={`${mobileTab === 'order' ? 'flex flex-col flex-1' : 'hidden'} md:flex md:flex-none md:flex-col md:w-72 flex-shrink-0 border-r border-gray-800 p-4 overflow-y-auto space-y-4`}>
          <DraftOrder
            draftOrder={remainingOrder}
            participants={participants}
            currentPickerId={currentPickerId}
            participantId={participantId}
            pickNumber={pickNumber}
          />

          {lastPick && (
            <div className="card text-sm">
              <p className="text-gray-500 mb-1">Último pick:</p>
              <div className="flex items-center gap-2">
                {lastPick.player.photo && (
                  <img src={lastPick.player.photo} className="w-8 h-8 rounded-full object-cover" alt="" />
                )}
                <div>
                  <span className="font-semibold text-white">{lastPick.player.nickname}</span>
                  <span className="text-gray-500 text-xs ml-2">
                    por {participantsRef.current.find(p => p.id === lastPick.participantId)?.name}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold text-gray-300 mb-3 text-sm">Times</h3>
            <div className="space-y-2">
              {participants.map(p => {
                const f = FORMATIONS_CLIENT[p.formation];
                const pTotal = f ? Object.values(f).reduce((a, b) => a + b, 0) + 3 : 0;
                const pDone = (p.picks || []).length;
                const pct = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;
                const isCurrent = p.id === currentPickerId;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between text-sm mb-0.5">
                      <span className={`flex items-center gap-1 ${p.id === participantId ? 'text-white font-semibold' : 'text-gray-400'}`}>
                        {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-cartola-gold animate-pulse inline-block" />}
                        {p.name}
                      </span>
                      <span className="text-gray-500 text-xs">{pDone}/{pTotal}</span>
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${p.id === participantId ? 'bg-cartola-green' : 'bg-gray-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: timer + status */}
        <div className={`${mobileTab === 'status' ? 'flex flex-col flex-1' : 'hidden'} md:flex md:flex-1 flex-col items-center justify-center gap-6 sm:gap-8 p-4 sm:p-8`}>
          <Timer timeLeft={timeLeft} isMyTurn={isMyTurn} />
          <div className={`w-full max-w-sm text-center py-5 sm:py-6 rounded-2xl text-lg sm:text-xl font-semibold ${
            isMyTurn ? 'bg-cartola-green/10 border border-cartola-green text-cartola-gold' : 'bg-gray-900 border border-gray-800 text-gray-300'
          }`}>
            {turnText}
          </div>
        </div>

        {/* Right: My Team */}
        <div className={`${mobileTab === 'team' ? 'flex flex-col flex-1' : 'hidden'} md:flex md:flex-none md:flex-col md:w-72 flex-shrink-0 border-l border-gray-800 p-4 overflow-y-auto`}>
          <TeamSlots
            formation={me?.formation}
            picks={myPicks.map(p => ({
              ...p,
              club: clubs[p.club_id] || clubs[String(p.club_id)] || null
            }))}
            captainId={captainIds[participantId] || null}
          />
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <div className="md:hidden flex border-t border-gray-800 bg-gray-900 flex-shrink-0">
        {[
          { id: 'order', label: 'Ordem', icon: '📋' },
          { id: 'status', label: 'Status', icon: '⏱' },
          { id: 'team', label: 'Meu Time', icon: '⚽' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
              mobileTab === tab.id ? 'text-cartola-green' : 'text-gray-500'
            }`}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </div>
            {tab.id === 'status' && isMyTurn && mobileTab !== 'status' && (
              <span className="absolute top-1.5 right-1/4 w-2 h-2 bg-cartola-gold rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
