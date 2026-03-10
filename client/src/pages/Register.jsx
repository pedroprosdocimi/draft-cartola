import React, { useState } from 'react';
import { API_URL } from '../config.js';

export default function Register({ onLogin, onGoLogin }) {
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    username: '',
    nome_time: '',
    senha: '',
    confirmar_senha: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const { nome, telefone, username, nome_time, senha, confirmar_senha } = form;

    if (!nome.trim() || !telefone.trim() || !username.trim() || !nome_time.trim() || !senha) {
      return setError('Todos os campos são obrigatórios.');
    }
    if (senha !== confirmar_senha) {
      return setError('As senhas não coincidem.');
    }
    if (senha.length < 6) {
      return setError('A senha deve ter no mínimo 6 caracteres.');
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), username: username.trim(), nome_time: nome_time.trim(), senha })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao criar conta.');
        return;
      }

      localStorage.setItem('draft_token', data.token);
      onLogin(data.user);
    } catch {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-3xl font-bold text-white mb-1">Draft Cartola</h1>
          <p className="text-gray-400 text-sm">Crie sua conta para começar</p>
          <div className="mt-3 inline-flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-full">
            🪙 Você recebe 100 moedas ao criar sua conta!
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-6">Criar conta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Nome completo</label>
              <input
                type="text"
                className="input-field"
                placeholder="João Silva"
                value={form.nome}
                onChange={set('nome')}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Telefone</label>
              <input
                type="tel"
                className="input-field"
                placeholder="(11) 99999-9999"
                value={form.telefone}
                onChange={set('telefone')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                className="input-field"
                placeholder="joao_silva"
                value={form.username}
                onChange={set('username')}
                autoCapitalize="none"
              />
              <p className="text-xs text-gray-600 mt-1">Letras, números e underscore. Sem espaços.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Nome do time</label>
              <input
                type="text"
                className="input-field"
                placeholder="Os Crias FC"
                value={form.nome_time}
                onChange={set('nome_time')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Senha</label>
              <input
                type="password"
                className="input-field"
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={set('senha')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Confirmar senha</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••"
                value={form.confirmar_senha}
                onChange={set('confirmar_senha')}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-800 text-center">
            <p className="text-gray-500 text-sm">
              Já tem conta?{' '}
              <button
                onClick={onGoLogin}
                className="text-cartola-green hover:text-green-400 font-medium transition-colors"
              >
                Fazer login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
