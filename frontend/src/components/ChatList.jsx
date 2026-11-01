import React from 'react';
import { MessageSquare, User, Trash2 } from 'lucide-react';

// Средняя колонка — список диалогов выбранного пользователя.
export default function ChatList({
  chats,
  selectedChatId,
  onSelect,
  loading,
  selectedUserName,
}) {
  return (
    <div className="flex flex-col h-full bg-slate-900/40 border-r border-slate-800">
      {/* Заголовок */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-sm text-slate-200">
            {selectedUserName ? `Чаты: ${selectedUserName}` : 'Диалоги'}
          </span>
        </div>
        {chats && chats.length > 0 && (
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            {chats.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {loading && <div className="p-6 text-sm text-slate-500">Загрузка чатов…</div>}

        {!loading && (!chats || chats.length === 0) && (
          <div className="p-6 text-sm text-slate-500 text-center">
            {selectedUserName
              ? 'У этого пользователя пока нет сохранённых чатов.'
              : 'Выберите пользователя слева для просмотра его переписок.'}
          </div>
        )}

        {chats &&
          chats.map((chat) => {
            const isActive = String(chat.chat_id) === String(selectedChatId);
            const owner = chat.owner_name || selectedUserName || 'Вы';
            const partner = chat.partner_name || chat.title || `Чат ${chat.chat_id}`;

            return (
              <button
                key={chat.chat_id}
                onClick={() => onSelect(chat.chat_id)}
                className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors ${
                  isActive
                    ? 'bg-indigo-600/15 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200 truncate flex items-center gap-1.5 text-sm">
                      <span className="text-indigo-300 font-semibold">{owner}</span>
                      <span className="text-slate-500 text-xs">⟷</span>
                      <span className="text-emerald-400 font-semibold">{partner}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {fmtShort(chat.last_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 truncate">
                      {chat.last_text || '—'}
                    </span>
                    {chat.deleted_count > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-rose-400">
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
