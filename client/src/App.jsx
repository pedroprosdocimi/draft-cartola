import React, { useState, useEffect } from 'react';
import { API_URL } from './config.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Draft from './pages/Draft.jsx';
import EndScreen from './pages/EndScreen.jsx';
import socket from './socket.js';

export default function App() {
  // Auth state
  const [authPage, setAuthPage] = useState('login'); // 'login' | 'register'
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // App state
  const [page, setPage] = useState('home');
  const [roomCode, setRoomCode] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [draftData, setDraftData] = useState(null);
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Validate stored token on startup
  useEffect(() => {
    const token = localStorage.getItem('draft_token');
    if (!token) {
      setAuthChecked(true);
      return;
    }
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else localStorage.removeItem('draft_token');
      })
      .catch(() => localStorage.removeItem('draft_token'))
      .finally(() => setAuthChecked(false)); // false = don't show loading screen
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setPage('home');
  };

  const handleLogout = () => {
    localStorage.removeItem('draft_token');
    setUser(null);
    setAuthPage('login');
    setPage('home');
    setRoomCode(null);
    setParticipantId(null);
    setDraftData(null);
    setTeams(null);
  };

  // Socket events
  useEffect(() => {
    socket.on('room_joined', ({ roomCode, participantId, isAdmin }) => {
      setRoomCode(roomCode);
      setParticipantId(participantId);
      setIsAdmin(isAdmin);
      setPage('lobby');
      setLoading(false);
    });

    socket.on('loading', ({ message }) => setLoading(message));

    socket.on('draft_started', (data) => {
      setDraftData(data);
      setPage('draft');
      setLoading(false);
    });

    socket.on('draft_complete', ({ teams }) => {
      setTeams(teams);
      setPage('end');
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setLoading(false);
      setTimeout(() => setError(null), 4000);
    });

    return () => {
      socket.off('room_joined');
      socket.off('loading');
      socket.off('draft_started');
      socket.off('draft_complete');
      socket.off('error');
    };
  }, []);

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

  // Logged in → show app
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

      {page === 'home' && <Home user={user} onLogout={handleLogout} />}

      {page === 'lobby' && (
        <Lobby roomCode={roomCode} participantId={participantId} isAdmin={isAdmin} />
      )}

      {page === 'draft' && draftData && (
        <Draft roomCode={roomCode} participantId={participantId} initialData={draftData} />
      )}

      {page === 'end' && teams && (
        <EndScreen teams={teams} participantId={participantId} />
      )}
    </div>
  );
}
