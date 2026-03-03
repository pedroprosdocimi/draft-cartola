import React, { useState } from 'react';
import socket from '../socket.js';

export default function Home({ user, onLogout, onGoAdmin }) {
  const [roomCode, setRoomCode] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'join' — only admin sees tabs

  const handleCreate = () => {
    socket.emit('create_room', { participantName: user.nomeTime });
  };

  const handleJoin = () => {
    if (roomCode.length < 6) return;
    socket.emit('join_room', { roomCode: roomCode.trim().toUpperCase(), participantName: user.nomeTime });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-4xl font-bold text-white mb-2">Draft Cartola</h1>
          <p className="text-gray-400">Monte seu time com jogadores reais do Brasileirão</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className="text-gray-400 text-sm">
              Olá, <span className="text-white font-medium">{user.nome.split(' ')[0]}</span>
              {' '}·{' '}
              <span className="text-cartola-green font-medium">{user.nomeTime}</span>
              {user.isAdmin && (
                <span className="ml-2 text-xs bg-cartola-gold/20 text-cartola-gold border border-cartola-gold/30 px-2 py-0.5 rounded-full">
                  admin
                </span>
              )}
            </span>
            <button onClick={onLogout} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
              Sair
            </button>
          </div>
        </div>

        {/* Card */}
        <div className="card">

          {/* Admin: tabs to switch between create and join */}
          {user.isAdmin && (
            <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setTab('create')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'create' ? 'bg-cartola-green text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Criar Sala
              </button>
              <button
                onClick={() => setTab('join')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'join' ? 'bg-cartola-green text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Entrar com Código
              </button>
            </div>
          )}

          {/* Non-admin: section label */}
          {!user.isAdmin && (
            <p className="text-sm font-medium text-gray-400 mb-4">Entrar em uma sala</p>
          )}

          {/* Create room — admin only */}
          {user.isAdmin && tab === 'create' && (
            <>
              <div className="mb-6 p-4 bg-gray-800 rounded-lg text-sm text-gray-400">
                Você entrará na sala como{' '}
                <span className="text-white font-semibold">{user.nomeTime}</span>.
              </div>
              <button onClick={handleCreate} className="btn-primary w-full">
                ✨ Criar Sala
              </button>
            </>
          )}

          {/* Join room — everyone */}
          {(!user.isAdmin || tab === 'join') && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Código da sala</label>
                <input
                  type="text"
                  className="input-field uppercase tracking-widest text-xl text-center font-mono"
                  placeholder="ABC123"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  maxLength={6}
                  autoFocus
                />
                <p className="text-xs text-gray-600 mt-2 text-center">
                  Você entrará como <span className="text-white">{user.nomeTime}</span>
                </p>
              </div>
              <button
                onClick={handleJoin}
                className="btn-primary w-full"
                disabled={roomCode.length < 6}
              >
                🚀 Entrar na Sala
              </button>
            </>
          )}
        </div>

        {user.isAdmin && (
          <div className="mt-4 text-center">
            <button
              onClick={onGoAdmin}
              className="text-xs text-gray-600 hover:text-cartola-gold transition-colors border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg"
            >
              ⚙️ Painel Admin
            </button>
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-4">
          Dados dos jogadores via API não-oficial do Cartola FC
        </p>
      </div>
    </div>
  );
}
