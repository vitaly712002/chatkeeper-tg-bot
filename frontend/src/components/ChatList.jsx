import React from 'react';
import { MessageSquare, User, Trash2, Users, ChevronDown } from 'lucide-react';
import { parseTelegramName } from '../utils';

// Список диалогов выбранного пользователя / центральная колонка / мобильный главный экран.
export default function ChatList({
  chats,
  selectedChatId,
  onSelect,
  loading,
  selectedUserName,
  users = [],
  selectedConnectionId,
  onSelectConnection,
}) {
  return (
    <div className="flex flex-col h-full bg-slate-900/40 border-r border-slate-800/80">
      {/* Шапка списка диалогов */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-slate-800/90 flex items-center justify-between bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-sm text-slate-200 truncate">
            {selectedUserName ? `Чаты: ${selectedUserName}` : 'Диалоги'}
          </span>
        </div>
        {chats && chats.length > 0 && (
          <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full shrink-0 font-medium">
            {chats.length}
          </span>
        )}
      </div>

      {/* Мобильная панель переключения аккаунтов (видна только на экранах < md) */}
      {users && users.length > 0 && (
        <div className="md:hidden px-3 py-2 border-b border-slate-800/80 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] text-slate-500 shrink-0 mr-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-slate-400" /> Аккаунт:
            </span>
            {users.map((u) => {
              const isSelected = u.connection_id === selectedConnectionId;
              const info = parseTelegramName(u.user_name);
              const label = info.name || `ID ${u.user_id}`;
              return (
                <button
                  key={u.connection_id}
                  onClick={() => onSelectConnection && onSelectConnection(u.connection_id)}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="truncate max-w-[120px]">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Список чатов */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {loading && (
          <div className="p-6 text-sm text-slate-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>Загрузка чатов…</span>
          </div>
        )}

        {!loading && (!chats || chats.length === 0) && (
          <div className="p-6 text-xs sm:text-sm text-slate-500 text-center leading-relaxed">
            {selectedUserName
              ? 'У этого пользователя пока нет сохранённых чатов.'
              : 'Выберите пользователя для просмотра его переписок.'}
          </div>
        )}

        {chats &&
          chats.map((chat) => {
            const isActive = String(chat.chat_id) === String(selectedChatId);
            const owner = chat.owner_name || selectedUserName || 'Вы';
            const partner = chat.partner_name || chat.title || `Чат ${chat.chat_id}`;
            const ownerInfo = parseTelegramName(owner);
            const partnerInfo = parseTelegramName(partner);

            return (
              <button
                key={chat.chat_id}
                onClick={() => onSelect(chat.chat_id)}
                className={`w-full text-left px-3.5 py-3.5 flex items-center gap-3 transition-colors active:bg-slate-800/80 ${
                  isActive
                    ? 'bg-indigo-600/15 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Аватар собеседника */}
                <div className="w-10 h-10 shrink-0 rounded-full bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-slate-300 font-semibold text-sm">
                  {partnerInfo.name ? partnerInfo.name.charAt(0).toUpperCase() : <User className="w-4 h-4 text-slate-400" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200 truncate flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                      <span className="text-indigo-300 font-semibold truncate shrink-0 max-w-[85px] sm:max-w-[100px]">
                        {ownerInfo.name}
                      </span>
                      <span className="text-slate-500 text-[10px] shrink-0">⟷</span>
                      <span className="text-emerald-400 font-semibold truncate min-w-0">
                        {partnerInfo.name}
                      </span>
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-400 shrink-0">
                      {fmtShort(chat.last_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-none">
                      {chat.last_text || '—'}
                    </span>
                    {chat.deleted_count > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 font-medium">
                        <Trash2 className="w-3 h-3" />
                        {chat.deleted_count}
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

function fmtShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
