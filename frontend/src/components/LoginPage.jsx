import React, { useState } from 'react';
import { MessageSquare, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { login } from '../api';

// Страница входа. Логин по умолчанию — admin, пароль задаётся на сервере
// (переменная ADMIN_PASSWORD). При успехе родитель (App) получает user.
export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 safe-top safe-bottom">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25 mb-4">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Chatkeeper</h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">Приватный архив переписок — вход для владельца</p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/80 border border-slate-800 py-6 sm:py-8 px-4 sm:px-10 shadow-xl rounded-3xl backdrop-blur">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center space-x-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Логин</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 sm:py-2 bg-slate-950 border border-slate-800 rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Пароль</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 sm:py-2 bg-slate-950 border border-slate-800 rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3 sm:py-2.5 px-4 border border-transparent rounded-xl shadow-lg shadow-indigo-600/30 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Проверка...' : 'Войти'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center text-[11px] sm:text-xs text-slate-500">
            Пароль задаётся на сервере в переменной <span className="text-slate-400 font-mono">ADMIN_PASSWORD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
