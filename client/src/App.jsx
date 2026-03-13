import React, { useState, useEffect } from 'react';
import { API_URL } from './config.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Draft from './pages/Draft.jsx';
import EndScreen from './pages/EndScreen.jsx';
import Admin from './pages/Admin.jsx';
import socket from './socket.js';

function readSession() {
  try { return JSON.parse(localStorage.getItem('draft_session')); } catch { return null; }
}

function saveSession(roomCode, participantId, isAdmin) {
  if (roomCode && participantId) {
    localStorage.setItem('draft_session', JSON.stringify({ roomCode, participantId, isAdmin }));
  }
}

function clearSession() {
  localStorage.removeItem('draft_session');
}

// Read room code from URL (e.g. /ABC123)
function getRoomCodeFromUrl() {
  const match = window.location.pathname.match(/^\/([A-Z0-9]{6})$/i);
  return match ? match[1].toUpperCase() : null;
}

export default function App() {
  // Auth state
  const [authPage, setAuthPage] = useState('login');
  const [user, setUser] = useState(null);

  // App state — initialized from localStorage so reconnect works on page refresh
  const [page, setPage] = useState('home');
  const [roomCode, setRoomCode] = useState(() => readSession()?.roomCode || null);
  const [participantId, setParticipantId] = useState(() => readSession()?.participantId || null);
  const [isAdmin, setIsAdmin] = useState(() => readSession()?.isAdmin || false);
  const [draftData, setDraftData] = useState(null);
  const [lobbyState, setLobbyState] = useState(null); // initial state for lobby reconnect
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // On load: if URL has a room code, handle invite or reconnect
  useEffect(() => {
    const urlCode = getRoomCodeFromUrl();
    if (!urlCode) return;
    const session = readSession();
    if (!session || session.roomCode !== urlCode) {
      // No matching session → save as invite for Home to pre-fill
      sessionStorage.setItem('draft_invite_code', urlCode);
      window.history.replaceState(null, '', '/');
    }
    // If session matches → keep URL, reconnect will happen via socket connect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser back button → exit room and go home
  useEffect(() => {
    const onPopState = () => {
      if (!getRoomCodeFromUrl()) {
        clearSession();
        setPage('home');
        setRoomCode(null);
        setParticipantId(null);
        setDraftData(null);
        setTeams(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Validate stored token on startup
  useEffect(() => {
    const token = localStorage.getItem('draft_token');
    if (!token) return;
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else localStorage.removeItem('draft_token');
      })
      .catch(() => localStorage.removeItem('draft_token'));
  }, []);

  // On socket connect (covers page refresh + network reconnect):
  // if we have a stored session, re-emit reconnect_participant
  useEffect(() => {
    const tryReconnect = () => {
      const session = readSession();
      if (session?.roomCode && session?.participantId) {
        socket.emit('reconnect_participant', {
          roomCode: session.roomCode,
          participantId: session.participantId
        });
      }
    };

    socket.on('connect', tryReconnect);
    // If socket was already connected when this effect runs (page refresh), trigger now
    if (socket.connected) tryReconnect();

    return () => socket.off('connect', tryReconnect);
  }, []);

  // Socket events
  useEffect(() => {
    socket.on('room_joined', ({ roomCode: rc, participantId: pid, isAdmin: admin }) => {
      setRoomCode(rc);
      setParticipantId(pid);
      setIsAdmin(admin);
      setPage('lobby');
      setLoading(false);
      saveSession(rc, pid, admin);
      window.history.pushState(null, '', `/${rc}`);
    });

    socket.on('loading', ({ message }) => setLoading(message));

    socket.on('draft_started', (data) => {
      setDraftData(data);
      setPage('draft');
      setLoading(false);
    });

    socket.on('draft_complete', ({ teams: t }) => {
      setTeams(t);
      setPage('end');
      clearSession();
      window.history.replaceState(null, '', '/');
    });

    socket.on('deadline_reached', () => {
      setError('⏰ Prazo atingido! Finalizando draft automaticamente...');
      setTimeout(() => setError(null), 5000);
    });

    socket.on('coins_updated', ({ coins }) => {
      setUser(prev => prev ? { ...prev, coins } : prev);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setLoading(false);
      setTimeout(() => setError(null), 4000);
      // If room no longer exists (e.g. server restarted), clear stored session
      if (message.includes('Sala não encontrada') || message.includes('Participante não encontrado')) {
        clearSession();
        setPage('home');
        setRoomCode(null);
        setParticipantId(null);
      }
    });

    return () => {
      socket.off('room_joined');
      socket.off('loading');
      socket.off('draft_started');
      socket.off('draft_complete');
      socket.off('deadline_reached');
      socket.off('error');
      socket.off('coins_updated');
    };
  }, []);

  // Handle room_state for reconnect navigation
  useEffect(() => {
    const onRoomState = (state) => {
      setLoading(false);
      setRoomCode(state.roomCode);
      const pid = readSession()?.participantId;
      setIsAdmin(state.adminId === pid);

      if (state.status === 'lobby' || state.status === 'parallel_waiting') {
        setLobbyState(state);
        setPage('lobby');
      } else if (state.status === 'drafting' || state.status === 'bench_drafting' || state.status === 'captain_drafting') {
        // In parallel mode, non-current-picker stays in lobby
        if (state.mode === 'parallel' && state.currentPickerId !== pid) {
          setLobbyState(state);
          setPage('lobby');
        } else {
          setDraftData(state);
          setPage('draft');
        }
      }
    };
    socket.on('room_state', onRoomState);
    return () => socket.off('room_state', onRoomState);
  }, []);

  // Parallel mode: when drafter finishes their turn, go back to lobby
  useEffect(() => {
    const onParallelTurnDone = () => {
      setDraftData(null);
      setPage('lobby');
      // Re-fetch room state so lobby shows correct waiting state
      const session = readSession();
      if (session?.roomCode && session?.participantId) {
        socket.emit('reconnect_participant', {
          roomCode: session.roomCode,
          participantId: session.participantId,
        });
      }
    };
    socket.on('parallel_turn_done', onParallelTurnDone);
    return () => socket.off('parallel_turn_done', onParallelTurnDone);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setPage('home');
  };

  const handleLogout = () => {
    clearSession();
    localStorage.removeItem('draft_token');
    setUser(null);
    setAuthPage('login');
    setPage('home');
    setRoomCode(null);
    setParticipantId(null);
    setDraftData(null);
    setTeams(null);
  };

  // Not logged in → show auth screens
  if (!user) {
    return (
      <div className="min-h-screen">
        {authPage === 'login' && (
          <Login
            onLogin={handleLogin}
            onGoRegister={() => setAuthPage('register')}
          />
        )}
        {authPage === 'register' && (
          <Register
            onLogin={handleLogin}
            onGoLogin={() => setAuthPage('login')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900 border border-red-600 text-red-100 px-6 py-3 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="card text-center p-8">
            <div className="animate-spin text-4xl mb-4">⚽</div>
            <p className="text-gray-300">{loading}</p>
          </div>
        </div>
      )}

      {page === 'home' && (
        <Home
          user={user}
          onLogout={handleLogout}
          onGoAdmin={() => setPage('admin')}
          onRejoin={() => {
            const session = readSession();
            if (session?.roomCode && session?.participantId) {
              socket.emit('reconnect_participant', {
                roomCode: session.roomCode,
                participantId: session.participantId,
              });
            }
          }}
        />
      )}

      {page === 'admin' && <Admin onBack={() => setPage('home')} />}

      {page === 'lobby' && (
        <Lobby
          roomCode={roomCode}
          participantId={participantId}
          isAdmin={isAdmin}
          initialState={lobbyState}
          onLeave={() => {
            clearSession();
            setPage('home');
            setRoomCode(null);
            setParticipantId(null);
            setLobbyState(null);
            window.history.replaceState(null, '', '/');
          }}
          onGoHome={() => setPage('home')}
        />
      )}

      {page === 'draft' && draftData && (
        <Draft
          roomCode={roomCode}
          participantId={participantId}
          isAdmin={isAdmin}
          initialData={draftData}
          onParallelTurnDone={() => {
            setDraftData(null);
            setPage('lobby');
          }}
          onGoHome={() => setPage('home')}
        />
      )}

      {page === 'end' && teams && (
        <EndScreen teams={teams} participantId={participantId} />
      )}
    </div>
  );
}
