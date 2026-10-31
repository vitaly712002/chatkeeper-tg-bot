import React from 'react';
import { User, Trash2 } from 'lucide-react';

// Левая колонка — список диалогов. Ожидаемая форма чата:
// { chat_id, title, last_text, last_at, count, deleted_count }
export default function ChatList({ chats, selectedChatId, onSelect, loading }) {
  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Загрузка чатов…</div>;
  }
  if (!chats || chats.length === 0) {
    return <div className="p-6 text-sm text-slate-500">Пока нет сохранённых переписок.</div>;
  }

  return (
    <div className="divide-y divide-slate-800/60">
      {chats.map((chat) => {
        const isActive = String(chat.chat_id) === String(selectedChatId);
        return (
          <button
            key={chat.chat_id}
            onClick={() => onSelect(chat.chat_id)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
              isActive ? 'bg-indigo-600/10' : 'hover:bg-slate-800/50'
            }`}
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-200 truncate">
                  {chat.title || `Чат ${chat.chat_id}`}
                </span>
                <span className="text-[11px] text-slate-500 shrink-0">{fmtShort(chat.last_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 truncate">
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
