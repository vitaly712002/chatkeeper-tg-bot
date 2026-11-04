import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { MessageSquare, RefreshCw, ArrowLeft, Loader2, ArrowDown } from 'lucide-react';
import { getChatMessages } from '../api';
import MessageBubble from './MessageBubble';
import EditHistory from './EditHistory';
import MediaModal from './MediaModal';
import { parseTelegramName } from '../utils';

const PAGE = 50;

// Правая колонка / экран мобильного — лента сообщений выбранного чата.
export default function ChatView({
  chatId,
  connectionId,
  chatTitle,
  ownerName,
  partnerName,
  onBack,
  lastWsEvent,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);

  const scrollContainerRef = useRef(null);
  const topSentinelRef = useRef(null);
  const bottomRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const pendingScrollAdjustRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // 1. Первичная загрузка сообщений при смене чата или пользователя.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    setLoading(true);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    pendingScrollAdjustRef.current = null;
    setError('');

    getChatMessages(chatId, { connectionId, limit: PAGE })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setMessages(list);
        setHasMore(list.length >= PAGE);
        // Мгновенная прокрутка вниз к самым свежим сообщениям
        setTimeout(() => {
          if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'auto' });
          }
        }, 10);
      })
      .catch((e) => !cancelled && setError(e.message || 'Ошибка загрузки'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [chatId, connectionId]);

  // 2. Обработка входящих событий WebSocket в реальном времени
  useEffect(() => {
    if (!lastWsEvent || !chatId) return;
    const { type, data } = lastWsEvent;
    if (!data) return;

    const matchesChat = String(data.chat_id) === String(chatId) &&
      (!connectionId || !data.connection_id || data.connection_id === connectionId);

    if (!matchesChat) return;

    if (type === 'message_created' && data.message) {
      const newMsg = data.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id || (m.message_id === newMsg.message_id && m.sent_at === newMsg.sent_at))) {
          return prev;
        }
        return [...prev, newMsg];
      });

      // Если пользователь читал внизу — мягко докручиваем к новому сообщению
      if (isNearBottomRef.current) {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    } else if (type === 'message_edited') {
      const { message_id, new_text } = data;
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.message_id) === Number(message_id)
            ? { ...m, text: new_text, edited: true }
            : m
        )
      );
    } else if (type === 'messages_deleted') {
      const { message_ids, deleted_at } = data;
      const idsSet = new Set((message_ids || []).map(Number));
      setMessages((prev) =>
        prev.map((m) =>
          idsSet.has(Number(m.message_id))
            ? { ...m, deleted_at: deleted_at || new Date().toISOString() }
            : m
        )
      );
    }
  }, [lastWsEvent, chatId, connectionId]);

  // 3. Сохранение позиции скролла при автоподгрузке старых сообщений («вверх»)
  useLayoutEffect(() => {
    if (pendingScrollAdjustRef.current && scrollContainerRef.current) {
      const { prevScrollHeight, prevScrollTop } = pendingScrollAdjustRef.current;
      const container = scrollContainerRef.current;
      const newScrollHeight = container.scrollHeight;
      const diff = newScrollHeight - prevScrollHeight;
      container.scrollTop = prevScrollTop + diff;
      pendingScrollAdjustRef.current = null;
    }
  }, [messages]);

  // 4. Подгрузка более ранних сообщений (без клика мышью, вызывается при приближении к верху)
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore || messages.length === 0 || loading) return;

    const oldestId = messages[0].id;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const container = scrollContainerRef.current;
    if (container) {
      pendingScrollAdjustRef.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
    }

    try {
      const older = await getChatMessages(chatId, {
        connectionId,
        limit: PAGE,
        before: oldestId,
      });
      const list = Array.isArray(older) ? older : [];
      if (list.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = list.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        });
      }
      setHasMore(list.length >= PAGE);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки истории');
      pendingScrollAdjustRef.current = null;
    } finally {
      setLoadingOlder(false);
      loadingOlderRef.current = false;
    }
  }, [chatId, connectionId, hasMore, messages, loading]);

  // 5. IntersectionObserver для верхнего сенсора (автоматический loading list)
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          hasMore &&
          !loadingOlderRef.current &&
          !loading &&
          messages.length > 0
        ) {
          loadOlder();
        }
      },
      {
        root: container,
        rootMargin: '160px 0px 0px 0px',
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadOlder, messages.length]);

  // 6. Обработка прокрутки: отслеживание низа и резервный триггер загрузки
  const handleScroll = (e) => {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
    setShowScrollBottom(distanceFromBottom > 280);

    // Резервная проверка приближения к верху (на случай тач-фликов на мобильном)
    if (target.scrollTop < 120 && hasMore && !loadingOlderRef.current && !loading && messages.length > 0) {
      loadOlder();
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const refresh = () => {
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
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center text-indigo-400 mb-3 border border-slate-700/60 shadow-lg">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h3 className="font-semibold text-slate-300 text-base mb-1">Чат не выбран</h3>
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
          Выберите диалог из списка слева, чтобы просмотреть сохранённые сообщения и историю изменений.
        </p>
      </div>
    );
  }

  const effectiveOwner = ownerName || 'Вы';
  const effectivePartner = partnerName || chatTitle || `Чат ${chatId}`;
  const ownerInfo = parseTelegramName(effectiveOwner);
  const partnerInfo = parseTelegramName(effectivePartner);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-slate-950/60">
      {/* Шапка чата: оптимизирована под мобильные экраны и iPhone 15 Pro */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-800/90 bg-slate-900/70 backdrop-blur shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Кнопка Назад для мобильных устройств */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden flex items-center gap-1 -ml-1 p-2 text-indigo-400 hover:text-indigo-300 active:bg-slate-800 rounded-xl transition-colors shrink-0"
              title="Назад к списку чатов"
              aria-label="Назад к чатам"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-xs font-semibold">Чаты</span>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-100 flex-wrap">
              <span className="text-indigo-300 truncate max-w-[130px] sm:max-w-none">
                {ownerInfo.name}
              </span>
              {ownerInfo.username && (
                <a
                  href={`https://t.me/${ownerInfo.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] sm:text-xs font-normal text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 transition-colors"
                >
                  @{ownerInfo.username}
                </a>
              )}
              <span className="text-slate-500 text-xs">⟷</span>
              <span className="text-emerald-400 truncate max-w-[140px] sm:max-w-none">
                {partnerInfo.name}
              </span>
              {partnerInfo.username && (
                <a
                  href={`https://t.me/${partnerInfo.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] sm:text-xs font-normal text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 transition-colors"
                >
                  @{partnerInfo.username}
                </a>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Диалог Telegram Business (ID: {chatId})</span>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="hidden sm:inline text-indigo-400/80">Синхронизация в реальном времени</span>
            </div>
          </div>
        </div>

        <button
          onClick={refresh}
          title="Обновить переписку"
          className="p-2 text-slate-400 hover:text-indigo-300 hover:bg-slate-800/70 active:bg-slate-800 rounded-xl shrink-0 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Лента сообщений: плавный скролл, автоподгрузка истории вверх */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2.5 sm:px-4 py-3 sm:py-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Сенсор верхней границы для автоматического loading list */}
        <div ref={topSentinelRef} className="h-1 w-full pointer-events-none" />

        {/* Анимированный индикатор фоновой подгрузки истории при скролле вверх */}
        {loadingOlder && (
          <div className="py-2.5 flex items-center justify-center gap-2 text-xs text-indigo-300 bg-slate-900/60 rounded-xl my-2 border border-slate-800 animate-in fade-in duration-150">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Загрузка предыдущих сообщений…</span>
          </div>
        )}

        {/* Начало переписки, когда все сообщения подтянуты */}
        {!hasMore && messages.length > 0 && !loading && (
          <div className="text-center text-[11px] text-slate-500 py-3 select-none flex items-center justify-center gap-2">
            <span className="w-8 h-[1px] bg-slate-800" />
            <span>Начало переписки</span>
            <span className="w-8 h-[1px] bg-slate-800" />
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span>Загрузка сообщений…</span>
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="py-16 text-center text-xs text-slate-500">
            В этом чате пока нет сообщений.
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            onShowEdits={setEditTarget}
            onPreviewMedia={setPreviewMedia}
            fallbackOwner={effectiveOwner}
            fallbackPartner={effectivePartner}
          />
        ))}

        <div ref={bottomRef} className="h-0.5" />
      </div>

      {/* Плавающая кнопка прокрутки вниз к новым сообщениям */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] p-2.5 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 backdrop-blur border border-indigo-400/30 transition-all hover:scale-105 active:scale-95 z-20"
          title="Прокрутить в конец"
          aria-label="Вниз"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {editTarget && <EditHistory message={editTarget} onClose={() => setEditTarget(null)} />}
      {previewMedia && <MediaModal media={previewMedia} onClose={() => setPreviewMedia(null)} />}
    </div>
  );
}
