import React, { useState, useEffect } from 'react';
import { MessageSquare, BarChart2, LogOut, HardDrive, Trash2, Loader2, X, AlertTriangle } from 'lucide-react';
import { getStorage, cleanMedia } from '../api';

// Верхняя панель: логотип, вкладки (Переписки / Обзор), круговой индикатор дисковой памяти, кнопка очистки и выход.
export default function Navbar({ activeTab, setActiveTab, user, onLogout, storage: propStorage, onStorageUpdate }) {
  const [storage, setStorage] = useState(propStorage || null);
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const [cleanError, setCleanError] = useState('');

  useEffect(() => {
    if (propStorage) {
      setStorage(propStorage);
      return;
    }
    getStorage().then(setStorage).catch(() => {});
  }, [propStorage]);

  // Периодическое обновление данных памяти каждые 60 секунд
  useEffect(() => {
    const timer = setInterval(() => {
      getStorage().then(setStorage).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const tabs = [
    { id: 'chats', label: 'Переписки', icon: MessageSquare },
    { id: 'dashboard', label: 'Обзор', icon: BarChart2 },
  ];

  const handleClean = async () => {
    setCleaning(true);
    setCleanError('');
    try {
      const res = await cleanMedia();
      setCleanResult(res);
      if (res.storage) {
        setStorage(res.storage);
        if (onStorageUpdate) {
          onStorageUpdate(res.storage);
        }
      }
    } catch (err) {
      setCleanError(err.message || 'Ошибка очистки медиа');
    } finally {
      setCleaning(false);
    }
  };

  // Геометрия кругового индикатора
  const percent = storage?.used_percent || 0;
  const circumference = 88; // 2 * PI * 14
  const dashOffset = Math.max(0, circumference - (circumference * Math.min(100, percent)) / 100);

  let strokeColor = 'stroke-emerald-400';
  let textColor = 'text-emerald-400';
  if (percent >= 90) {
    strokeColor = 'stroke-rose-400';
    textColor = 'text-rose-400';
  } else if (percent >= 75) {
    strokeColor = 'stroke-amber-400';
    textColor = 'text-amber-400';
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 gap-4">
        {/* Логотип */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Chatkeeper</h1>
            <p className="text-xs text-slate-400">Архив переписок</p>
          </div>
        </div>

        {/* Навигация */}
        <nav className="flex space-x-1 sm:space-x-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Правый блок: кружок памяти + пользователь + выход */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Круговой индикатор памяти диска */}
          {storage && storage.total_bytes > 0 && (
            <div
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800/90 transition-all cursor-default"
              title={`Память диска: свободно ${formatBytes(storage.free_bytes)} из ${formatBytes(
                storage.total_bytes
              )} (занято ${Math.round(percent)}%)`}
            >
              {/* Круг со шкалой и процентами */}
              <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    className="stroke-slate-700/70"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    className={`${strokeColor} transition-all duration-500`}
                    strokeWidth="3.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={`absolute text-[9px] font-bold ${textColor}`}>
                  {Math.round(percent)}%
                </span>
              </div>

              {/* Метка: занято/всего и свободно */}
              <div className="flex flex-col text-left leading-tight hidden xs:flex sm:flex">
                <div className="text-xs font-semibold text-slate-200">
                  {formatBytes(storage.used_bytes)} / {formatBytes(storage.total_bytes)}
                </div>
                <div className="text-[10px] text-slate-400">
                  свободно: <span className="text-slate-300 font-medium">{formatBytes(storage.free_bytes)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Кнопка быстрой очистки медиафайлов */}
          <button
            onClick={() => {
              setShowCleanModal(true);
              setCleanResult(null);
              setCleanError('');
            }}
            title="Очистить сохранённые медиафайлы"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 text-xs font-medium transition-all group shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400 transition-colors" />
            <span className="hidden sm:inline">Очистить медиа</span>
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-slate-200">{user?.username}</div>
            <div className="text-xs text-indigo-400">владелец</div>
          </div>
          <button
            onClick={onLogout}
            title="Выйти"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Модальное окно подтверждения очистки медиафайлов */}
      {showCleanModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !cleaning && setShowCleanModal(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400">
                <Trash2 className="w-4 h-4" />
                <h3 className="font-semibold text-white">Очистка медиафайлов</h3>
              </div>
              {!cleaning && (
                <button
                  onClick={() => setShowCleanModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {cleanResult ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300">
                  {cleanResult.deleted_count > 0 ? (
                    <>
                      Успешно удалено <b>{cleanResult.deleted_count}</b> файлов.
                      <br />
                      Освобождено на диске: <b>{formatBytes(cleanResult.freed_bytes)}</b>.
                    </>
                  ) : (
                    <>Папка медиафайлов уже пуста, нечего удалять.</>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Вы собираетесь удалить все сохранённые на сервере медиафайлы (спасённые исчезающие фото и видео).
                  </p>
                  <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Файлов на диске:</span>
                      <span className="text-slate-200 font-semibold">{storage?.media_files ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Занято медиафайлами:</span>
                      <span className="text-slate-200 font-semibold">{formatBytes(storage?.media_bytes || 0)}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Текстовые сообщения и история диалогов сохранятся в полном объёме. Будут удалены только файлы с диска для освобождения места.
                    </span>
                  </div>
                  {cleanError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                      {cleanError}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 bg-slate-900/60">
              {cleanResult ? (
                <button
                  onClick={() => setShowCleanModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white transition-colors"
                >
                  Закрыть
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowCleanModal(false)}
                    disabled={cleaning}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleClean}
                    disabled={cleaning}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                  >
                    {cleaning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Очистка…</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Да, очистить всё</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes === 0) return '0 Б';
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${sizes[i]}`;
}
