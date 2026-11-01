import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, ChevronUp } from 'lucide-react';
import { getChatMessages } from '../api';
import MessageBubble from './MessageBubble';
import EditHistory from './EditHistory';
import { parseTelegramName } from '../utils';

const PAGE = 50;

// Правая колонка — лента сообщений выбранного чата.
export default function ChatView({ chatId, connectionId, chatTitle, ownerName, partnerName }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // сообщение для модалки правок
  const bottomRef = useRef(null);

  // Первичная загрузка при смене чата или пользователя.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getChatMessages(chatId, { connectionId, limit: PAGE })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setMessages(list);
        setHasMore(list.length >= PAGE);
        // Прокрутка вниз после отрисовки.
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0);
      })
      .catch((e) => !cancelled && setError(e.message || 'Ошибка загрузки'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId, connectionId]);

  // Подгрузка более старых сообщений («вверх»).
  const loadOlder = async () => {
    if (messages.length === 0) return;
    const oldestId = messages[0].id;
    try {
      const older = await getChatMessages(chatId, { connectionId, limit: PAGE, before: oldestId });
      const list = Array.isArray(older) ? older : [];
      setMessages((prev) => [...list, ...prev]);
      setHasMore(list.length >= PAGE);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки истории');
    }
  };

  const refresh = () => {
    // Перезагружаем текущий чат с нуля.
    setMessages([]);
    setLoading(true);
    getChatMessages(chatId, { connectionId, limit: PAGE })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setMessages(list);
        setHasMore(list.length >= PAGE);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0);
      })
      .catch((e) => setError(e.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
        <MessageSquare className="w-10 h-10 mb-3" />
        <p className="text-sm">Выберите чат слева, чтобы посмотреть переписку</p>
      </div>
    );
  }

  const effectiveOwner = ownerName || 'Вы';
  const effectivePartner = partnerName || chatTitle || `Чат ${chatId}`;
  const ownerInfo = parseTelegramName(effectiveOwner);
  const partnerInfo = parseTelegramName(effectivePartner);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Заголовок чата */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/40">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-100 flex-wrap">
            <span className="text-indigo-300">{ownerInfo.name}</span>
            {ownerInfo.username && (
              <a
                href={`https://t.me/${ownerInfo.username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/20 transition-colors"
                title="Открыть профиль в Telegram"
              >
                @{ownerInfo.username}
              </a>
            )}
            <span className="text-slate-500 text-sm">⟷</span>
            <span className="text-emerald-400">{partnerInfo.name}</span>
            {partnerInfo.username && (
              <a
                href={`https://t.me/${partnerInfo.username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/20 transition-colors"
                title="Открыть профиль в Telegram"
              >
                @{partnerInfo.username}
              </a>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            Диалог Telegram Business (ID: {chatId})
          </div>
        </div>
        <button
          onClick={refresh}
          title="Обновить"
          className="p-2 text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 rounded-lg shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Лента */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {error && <div className="text-sm text-rose-400 text-center">{error}</div>}

        {hasMore && !loading && (
          <div className="text-center">
            <button
              onClick={loadOlder}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-300 bg-slate-800/60 px-3 py-1.5 rounded-full"
            >
              <ChevronUp className="w-3.5 h-3.5" /> Загрузить более ранние
            </button>
          </div>
        )}

        {loading && <div className="text-sm text-slate-500 text-center">Загрузка сообщений…</div>}

        {!loading && messages.length === 0 && !error && (
          <div className="text-sm text-slate-500 text-center">В этом чате пока нет сообщений.</div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            onShowEdits={setEditTarget}
            fallbackOwner={effectiveOwner}
            fallbackPartner={effectivePartner}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {editTarget && <EditHistory message={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}
