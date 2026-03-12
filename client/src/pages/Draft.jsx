import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import socket from '../socket.js';
import { API_URL } from '../config.js';
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

export default function Draft({ roomCode, participantId, isAdmin, initialData, onParallelTurnDone, onGoHome }) {
  const [mobileTab, setMobileTab] = useState('status'); // 'order' | 'status' | 'team'
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('sim'); // 'sim' | 'teams' | 'add'
  const [addPick, setAddPick] = useState({ participantId: '', positionId: '', search: '' });
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
  const [myCoins, setMyCoins] = useState(null);

  // Busca moedas iniciais do usuário autenticado
  useEffect(() => {
    const token = localStorage.getItem('draft_token');
    if (!token) return;
    fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.coins != null) setMyCoins(data.coins); })
      .catch(() => {});
  }, []);

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

    const onPicksUpdated = ({ participants: updated }) => {
      setParticipants(updated);
      setPickedIds(() => {
        const ids = new Set();
        for (const p of updated) for (const pick of p.picks || []) ids.add(pick.cartola_id);
        return ids;
      });
    };

    const onCoinsUpdated = ({ coins }) => setMyCoins(coins);

    const onOptionsRerolled = ({ options }) => {
      setOfferedPlayers(options.map(p => ({
        ...p,
        club: p.club || clubs[p.club_id] || clubs[String(p.club_id)] || null,
      })));
    };

    socket.on('draft_started', onDraftStarted);
    socket.on('picks_updated', onPicksUpdated);
    socket.on('parallel_turn_done', onParallelDone);
    socket.on('bench_draft_started', onBenchDraftStarted);
    socket.on('captain_draft_started', onCaptainDraftStarted);
    socket.on('captain_picked', onCaptainPicked);
    socket.on('position_picked', onPositionPicked);
    socket.on('player_picked', onPlayerPicked);
    socket.on('auto_picked', onAutoPicked);
    socket.on('timer_tick', onTimerTick);
    socket.on('error', onError);
    socket.on('coins_updated', onCoinsUpdated);
    socket.on('options_rerolled', onOptionsRerolled);

    return () => {
      socket.off('draft_started', onDraftStarted);
      socket.off('picks_updated', onPicksUpdated);
      socket.off('parallel_turn_done', onParallelDone);
      socket.off('bench_draft_started', onBenchDraftStarted);
      socket.off('captain_draft_started', onCaptainDraftStarted);
      socket.off('captain_picked', onCaptainPicked);
      socket.off('position_picked', onPositionPicked);
      socket.off('player_picked', onPlayerPicked);
      socket.off('auto_picked', onAutoPicked);
      socket.off('timer_tick', onTimerTick);
      socket.off('error', onError);
      socket.off('coins_updated', onCoinsUpdated);
      socket.off('options_rerolled', onOptionsRerolled);
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

  const handleReroll = useCallback(() => {
    const token = localStorage.getItem('draft_token');
    socket.emit('reroll_options', { roomCode, participantId, token });
  }, [roomCode, participantId]);

  // ── Admin helpers ──────────────────────────────────────────────────────────
  const handleAdminForcePick = () => socket.emit('admin_force_pick', { roomCode, participantId });
  const handleAdminSimAll = () => socket.emit('admin_sim_all', { roomCode, participantId });
  const handleAdminRemovePick = (targetId, cartolaId) =>
    socket.emit('admin_remove_pick', { roomCode, participantId, targetParticipantId: targetId, cartolaId });
  const handleAdminAddPick = (cartolaId) => {
    socket.emit('admin_add_pick', {
      roomCode, participantId,
      targetParticipantId: addPick.participantId,
      cartolaId, positionId: parseInt(addPick.positionId),
    });
    setAddPick(prev => ({ ...prev, search: '', positionId: '' }));
  };

  const getAvailableSlots = (pid) => {
    const p = participants.find(p => p.id === pid);
    if (!p?.formation) return [];
    const slots = [];
    const formation = FORMATIONS_CLIENT[p.formation] || {};
    const mainPicks = (p.picks || []).filter(pk => !BENCH_SLOT_IDS.includes(pk.position_id));
    const counts = {};
    for (const pk of mainPicks) counts[pk.position_id] = (counts[pk.position_id] || 0) + 1;
    for (const [posId, required] of Object.entries(formation)) {
      const remaining = required - (counts[parseInt(posId)] || 0);
      for (let i = 0; i < remaining; i++)
        slots.push({ id: parseInt(posId), label: POSITION_LABELS[parseInt(posId)] });
    }
    const filledBench = new Set((p.picks || []).filter(pk => BENCH_SLOT_IDS.includes(pk.position_id)).map(pk => pk.position_id));
    if (!filledBench.has(21)) slots.push({ id: 21, label: 'DEF RES' });
    if (!filledBench.has(22)) slots.push({ id: 22, label: 'MEI RES' });
    if (!filledBench.has(23)) slots.push({ id: 23, label: 'ATA RES' });
    return slots;
  };

  const getFilteredPlayers = (posId, search) => {
    const p = parseInt(posId);
    const allowed = p === 21 ? [2, 3] : p === 22 ? [4] : p === 23 ? [5] : [p];
    const q = search.toLowerCase();
    return (initialData.players || [])
      .filter(pl =>
        !pickedIds.has(pl.cartola_id) &&
        allowed.includes(pl.position_id) &&
        (!q || pl.nickname?.toLowerCase().includes(q) || pl.name?.toLowerCase().includes(q))
      )
      .slice(0, 20);
  };

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

      {/* Admin Modal */}
      {isAdmin && adminOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setAdminOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 className="font-bold text-white text-sm">🔧 Painel Admin</h2>
              <button onClick={() => setAdminOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              {[['sim', '⚡ Simular'], ['teams', '👥 Times'], ['add', '➕ Adicionar']].map(([id, label]) => (
                <button key={id} onClick={() => setAdminTab(id)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${adminTab === id ? 'text-white border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Simular */}
              {adminTab === 'sim' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-4">Executa picks automáticos no lugar do jogador atual.</p>
                  <button onClick={handleAdminForcePick}
                    className="w-full bg-orange-700 hover:bg-orange-600 text-white text-sm font-medium py-3 rounded-lg transition-colors">
                    ⚡ Simular próximo pick
                  </button>
                  <button onClick={() => { handleAdminSimAll(); setAdminOpen(false); }}
                    className="w-full bg-red-900 hover:bg-red-800 text-white text-sm font-medium py-3 rounded-lg transition-colors">
                    ⏩ Simular todos os picks restantes
                  </button>
                  <p className="text-xs text-gray-600 text-center">Simular todos fecha o painel e executa em sequência.</p>
                </div>
              )}

              {/* Times */}
              {adminTab === 'teams' && (
                <div className="space-y-4">
                  {participants.map(p => (
                    <div key={p.id} className="bg-gray-800 rounded-lg p-3">
                      <h3 className="font-semibold text-sm text-white mb-2">
                        {p.name} <span className="text-gray-500 text-xs">({(p.picks || []).length} picks)</span>
                      </h3>
                      {(p.picks || []).length === 0
                        ? <p className="text-gray-600 text-xs">Nenhum pick ainda</p>
                        : (p.picks || []).map(pick => (
                          <div key={pick.cartola_id} className="flex items-center justify-between py-1 border-b border-gray-700/50 last:border-0">
                            <span className="text-xs text-gray-300">
                              <span className="text-gray-500 mr-1">[{POSITION_LABELS[pick.position_id]}]</span>
                              {pick.nickname}
                            </span>
                            <button onClick={() => handleAdminRemovePick(p.id, pick.cartola_id)}
                              className="text-red-500 hover:text-red-400 text-xs ml-2 px-1">✕</button>
                          </div>
                        ))
                      }
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar pick */}
              {adminTab === 'add' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Participante</label>
                    <select value={addPick.participantId}
                      onChange={e => setAddPick({ participantId: e.target.value, positionId: '', search: '' })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm">
                      <option value="">Selecione...</option>
                      {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {addPick.participantId && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Posição / Slot disponível</label>
                      <select value={addPick.positionId}
                        onChange={e => setAddPick(prev => ({ ...prev, positionId: e.target.value, search: '' }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm">
                        <option value="">Selecione...</option>
                        {getAvailableSlots(addPick.participantId).map((s, i) => (
                          <option key={`${s.id}-${i}`} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {addPick.positionId && (
                    <>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Buscar jogador</label>
                        <input type="text" value={addPick.search}
                          onChange={e => setAddPick(prev => ({ ...prev, search: e.target.value }))}
                          placeholder="Nome do jogador..."
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-600" />
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {getFilteredPlayers(addPick.positionId, addPick.search).map(pl => (
                          <div key={pl.cartola_id} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded text-sm">
                            <span className="text-gray-200">
                              {pl.nickname}
                              <span className="text-gray-500 text-xs ml-1">({POSITION_LABELS[pl.position_id]} · {pl.average_score?.toFixed(1) || '-'}pts)</span>
                            </span>
                            <button onClick={() => handleAdminAddPick(pl.cartola_id)}
                              className="text-cartola-green hover:text-green-400 text-xs font-semibold ml-2">
                              + Add
                            </button>
                          </div>
                        ))}
                        {getFilteredPlayers(addPick.positionId, addPick.search).length === 0 && (
                          <p className="text-gray-600 text-xs text-center py-2">Nenhum jogador disponível</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
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
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 text-right">
            <div>{totalPicksDone}/{totalPicksExpected} picks</div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setAdminOpen(true)}
              className="text-xs text-orange-400 hover:text-orange-300 border border-orange-800/60 px-2 py-1 rounded transition-colors"
            >
              🔧
            </button>
          )}
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
        myCoins={myCoins}
        onReroll={handleReroll}
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
