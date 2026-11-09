import React from 'react';
import { Users, User, ShieldCheck } from 'lucide-react';
import { parseTelegramName } from '../utils';

// Левая колонка — список подключённых аккаунтов (пользователей).
// Ожидаемая форма: { connection_id, user_id, user_name, is_enabled, chats_count, messages_count, last_at }
export default function UserList({
  users,
  selectedConnectionId,
  onSelect,
  loading,
}) {
  return (
    <div className="flex flex-col h-full bg-slate-900/60 border-r border-slate-800">
      {/* Заголовок колонки */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-sm text-slate-200">Пользователи</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
          {users?.length || 0}
        </span>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {loading && (
          <div className="p-4 text-xs text-slate-500">Загрузка аккаунтов…</div>
        )}

        {!loading && (!users || users.length === 0) && (
          <div className="p-4 text-xs text-slate-500 text-center">
            Нет подключённых аккаунтов Telegram Business
          </div>
        )}

        {users &&
          users.map((u) => {
            const isActive = u.connection_id === selectedConnectionId;
            const userInfo = parseTelegramName(u.user_name);
            return (
              <button
                key={u.connection_id}
                onClick={() => onSelect(u.connection_id)}
                className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
                  isActive
                    ? 'bg-indigo-600/15 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="relative w-9 h-9 shrink-0 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 font-semibold text-sm">
                  {userInfo.name ? userInfo.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                  {u.is_enabled && !u.is_paused && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"
                      title="Бот активен"
                    />
                  )}
                  {u.is_paused && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 border-2 border-slate-900 rounded-full"
                      title="Бот на паузе (оповещения выключены)"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm text-slate-200 truncate flex items-center gap-1.5">
                      <span>{userInfo.name || `ID ${u.user_id}`}</span>
                      {userInfo.username && (
                        <span className="text-xs font-normal text-slate-400">
                          @{userInfo.username}
                        </span>
                      )}
                    </span>
                    {u.is_paused && (
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium shrink-0">
                        пауза
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <span>{u.chats_count || 0} чат.</span>
                      <span>•</span>
                      <span>{u.messages_count || 0} сообщ.</span>
                    </div>
                    {Number(u.unread_count) > 0 && (
                      <span className="min-w-[18px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-indigo-600 rounded-full shrink-0">
                        {u.unread_count > 99 ? '99+' : u.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
