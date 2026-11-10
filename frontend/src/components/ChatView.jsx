import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import {
  MessageSquare,
  RefreshCw,
  ArrowLeft,
  Loader2,
  ArrowDown,
  Paperclip,
  Mic,
  Send,
  Trash2,
  X,
  Reply,
  AlertCircle,
  FileText,
  Forward,
  Search,
  CheckCircle2,
  User,
  ExternalLink,
  ChevronDown,
  Check,
  Smartphone,
} from 'lucide-react';
import { getChatMessages, sendMessage, sendMedia, deleteMessage, forwardMessage, markChatRead, sendContactToOwner } from '../api';
import MessageBubble from './MessageBubble';
import EditHistory from './EditHistory';
import MediaModal from './MediaModal';
import { parseTelegramName, getTelegramLinks, getPreferredTgClient, setPreferredTgClient } from '../utils';

const PAGE = 50;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Правая колонка / экран мобильного — лента сообщений выбранного чата и форма отправки от лица бота.
export default function ChatView({
  chatId,
  connectionId,
  chatTitle,
  ownerName,
  partnerName,
  onBack,
  onChatRead,
  lastWsEvent,
  chats = [],
}) {
  const [messages, setMessages] = useState([]);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);

  // Состояние отправки сообщений, файлов и голосовых
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [actionError, setActionError] = useState('');

  // Запись голосового сообщения
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Модалка подтверждения удаления
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Пересылка сообщений в другой чат
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [withAuthorHeader, setWithAuthorHeader] = useState(true);
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardSuccess, setForwardSuccess] = useState('');

  // Меню выбора версии Telegram Web / Desktop
  const [tgMenuOpen, setTgMenuOpen] = useState(false);
  const [preferredClient, setPreferredClient] = useState(getPreferredTgClient);
  const tgMenuRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (tgMenuRef.current && !tgMenuRef.current.contains(e.target)) {
        setTgMenuOpen(false);
      }
    };
    if (tgMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [tgMenuOpen]);

  const handleSelectClient = (client) => {
    setPreferredClient(client);
    setPreferredTgClient(client);
    setTgMenuOpen(false);
  };

  // Отправка карточки собеседника в личный Telegram владельца бота
  const [sendingToOwner, setSendingToOwner] = useState(false);
  const [ownerSendFeedback, setOwnerSendFeedback] = useState(null);

  const handleSendToOwner = async () => {
    if (!chatId || sendingToOwner) return;
    setSendingToOwner(true);
    setOwnerSendFeedback(null);
    try {
      const res = await sendContactToOwner(chatId);
      setOwnerSendFeedback({
        type: 'success',
        text: res.message || 'Карточка собеседника отправлена вам в личный Telegram!',
      });
      setTimeout(() => setOwnerSendFeedback(null), 6000);
      setTgMenuOpen(false);
    } catch (err) {
      setOwnerSendFeedback({
        type: 'error',
        text: err.message || 'Ошибка отправки контакта',
      });
      setTimeout(() => setOwnerSendFeedback(null), 8000);
    } finally {
      setSendingToOwner(false);
    }
  };

  const scrollContainerRef = useRef(null);
  const topSentinelRef = useRef(null);
  const bottomRef = useRef(null);
  const firstUnreadRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const pendingScrollAdjustRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const hasInitialScrolledRef = useRef(false);

  // Рефы для стабильных значений внутри observer и фоновых обработчиков без лишних ре-рендеров
  const onChatReadRef = useRef(onChatRead);
  useEffect(() => {
    onChatReadRef.current = onChatRead;
  }, [onChatRead]);

  const hasMoreRef = useRef(hasMore);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  // Очистка таймеров и микрофона при размонтировании
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 1. Первичная загрузка сообщений при смене чата или пользователя.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    hasInitialScrolledRef.current = false;
    setLoading(true);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    pendingScrollAdjustRef.current = null;
    setError('');
    setActionError('');
    setReplyTo(null);
    setPendingFile(null);
    setInputText('');
    setForwardMsg(null);

    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
    setRecordingDuration(0);

    getChatMessages(chatId, { connectionId, limit: PAGE })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setMessages(list);
        setHasMore(list.length >= PAGE);

        // Ищем первое непрочитанное входящее сообщение
        const firstUnread = list.find((m) => !m.is_read && !m.is_outgoing);
        if (firstUnread) {
          setFirstUnreadId(firstUnread.id);
          // Помечаем чат прочитанным на сервере с небольшой паузой,
          // чтобы пользователь успел увидеть плашку «Непрочитанные сообщения» и новые сообщения
          setTimeout(() => {
            if (!cancelled) {
              markChatRead(chatId, connectionId).catch(() => {});
              if (onChatReadRef.current) onChatReadRef.current(chatId);
            }
          }, 1200);
        } else {
          setFirstUnreadId(null);
        }

        // Первичное позиционирование скролла только ОДИН раз при открытии чата
        if (!hasInitialScrolledRef.current) {
          hasInitialScrolledRef.current = true;
          setTimeout(() => {
            if (firstUnreadRef.current) {
              firstUnreadRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
            } else if (bottomRef.current) {
              bottomRef.current.scrollIntoView({ behavior: 'auto' });
            }
          }, 20);
        }
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

    // Сверяем ID чата
    const matchesChat = String(data.chat_id) === String(chatId);
    if (!matchesChat) return;

    if (type === 'message_created' && data.message) {
      const newMsg = data.message;
      setMessages((prev) => {
        const isDuplicate = prev.some(
          (m) =>
            (newMsg.id && Number(m.id) === Number(newMsg.id)) ||
            (Number(m.message_id) === Number(newMsg.message_id) && Number(m.message_id) !== 0)
        );
        if (isDuplicate) return prev;
        return [...prev, newMsg];
      });

      // Если пришло входящее сообщение, когда чат уже открыт перед глазами пользователя,
      // помечаем его прочитанным сразу
      if (!newMsg.is_outgoing) {
        markChatRead(chatId, connectionId).catch(() => {});
        if (onChatRead) onChatRead(chatId);
      }

      // Если пользователь читал внизу — мягко докручиваем к новому сообщению
      if (isNearBottomRef.current) {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    } else if (type === 'chat_read') {
      // Помечаем прочитанным с задержкой, чтобы пользователь успел увидеть подсветку новых сообщений
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (!m.is_outgoing && !m.is_read ? { ...m, is_read: true } : m))
        );
      }, 2000);
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
      if (diff > 0) {
        container.scrollTop = prevScrollTop + diff;
      }
      pendingScrollAdjustRef.current = null;
    }
  }, [messages]);

  // 4. Подгрузка более ранних сообщений (без клика мышью, вызывается при приближении к верху)
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current || messagesRef.current.length === 0 || loadingRef.current) return;

    const oldestId = messagesRef.current[0].id;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const older = await getChatMessages(chatId, {
        connectionId,
        limit: PAGE,
        before: oldestId,
      });
      const list = Array.isArray(older) ? older : [];
      if (list.length > 0) {
        const existingIds = new Set(messagesRef.current.map((m) => m.id));
        const fresh = list.filter((m) => !existingIds.has(m.id));
        if (fresh.length > 0) {
          // Точно замеряем высоту и скролл ПРЯМО перед добавлением новых сообщений в DOM
          const container = scrollContainerRef.current;
          if (container) {
            pendingScrollAdjustRef.current = {
              prevScrollHeight: container.scrollHeight,
              prevScrollTop: container.scrollTop,
            };
          }
          setMessages((prev) => [...fresh, ...prev]);
        }
      }
      setHasMore(list.length >= PAGE);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки истории');
      pendingScrollAdjustRef.current = null;
    } finally {
      setLoadingOlder(false);
      loadingOlderRef.current = false;
    }
  }, [chatId, connectionId]);

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
          hasMoreRef.current &&
          !loadingOlderRef.current &&
          !loadingRef.current &&
          messagesRef.current.length > 0
        ) {
          loadOlder();
        }
      },
      {
        root: container,
        rootMargin: '120px 0px 0px 0px',
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlder]);

  // 6. Обработка прокрутки: отслеживание низа
  const handleScroll = (e) => {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
    setShowScrollBottom(distanceFromBottom > 280);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMessage = useCallback((targetMessageId) => {
    if (!targetMessageId) return;
    const targetEl = document.getElementById(`msg-${targetMessageId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-500/20');
      setTimeout(() => {
        targetEl.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-500/20');
      }, 1800);
    }
  }, []);

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

  // --- Отправка сообщений, файлов и голосовых ---

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (isSending || isRecording) return;

    const trimmed = inputText.trim();
    if (!trimmed && !pendingFile) return;

    setIsSending(true);
    setActionError('');

    try {
      let res;
      if (pendingFile) {
        res = await sendMedia(chatId, {
          file: pendingFile.file,
          type: pendingFile.type,
          caption: trimmed,
          replyToMessageId: replyTo?.message_id,
          connectionId,
        });
      } else {
        res = await sendMessage(chatId, {
          text: trimmed,
          replyToMessageId: replyTo?.message_id,
          connectionId,
        });
      }

      if (res && res.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.id || m.message_id === res.message_id)) return prev;
          return [...prev, res];
        });
      }

      setInputText('');
      setPendingFile(null);
      setReplyTo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setActionError(err.message || 'Ошибка отправки');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type = 'document';
    if (file.type.startsWith('image/')) {
      type = file.type === 'image/gif' ? 'animation' : 'photo';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    } else if (file.type.startsWith('audio/')) {
      type = 'voice';
    }

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPendingFile({ file, type, name: file.name, size: file.size, previewUrl });
  };

  // Запись аудио с микрофона (голосовое сообщение)
  const startRecording = async () => {
    setActionError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setActionError('Запись аудио не поддерживается вашим браузером');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = '';
      if (window.MediaRecorder) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      console.error(e);
      setActionError('Не удалось включить микрофон: ' + (e.message || 'Доступ запрещён'));
    }
  };

  const cancelRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const stream = audioStreamRef.current;

    recorder.onstop = async () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }

      const mimeType = recorder.mimeType || 'audio/ogg';
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('webm') ? 'webm' : 'ogg';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      if (audioBlob.size === 0) {
        cancelRecording();
        return;
      }

      const audioFile = new File([audioBlob], `voice.${ext}`, { type: mimeType });

      setIsSending(true);
      setActionError('');
      try {
        const res = await sendMedia(chatId, {
          file: audioFile,
          type: 'voice',
          caption: '',
          replyToMessageId: replyTo?.message_id,
          connectionId,
        });

        if (res && res.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.id || m.message_id === res.message_id)) return prev;
            return [...prev, res];
          });
        }
        setReplyTo(null);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } catch (err) {
        setActionError(err.message || 'Ошибка отправки голосового');
      } finally {
        setIsSending(false);
        setIsRecording(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  // Удаление сообщения в Telegram (для обоих участников)
  const handleConfirmDelete = async () => {
    if (!deleteConfirmMsg || isDeleting) return;
    setIsDeleting(true);
    setActionError('');

    try {
      await deleteMessage(chatId, deleteConfirmMsg.message_id, { connectionId });
      // Помечаем удалённым локально
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.message_id) === Number(deleteConfirmMsg.message_id)
            ? { ...m, deleted_at: new Date().toISOString() }
            : m
        )
      );
      setDeleteConfirmMsg(null);
    } catch (err) {
      setActionError(err.message || 'Ошибка удаления в Telegram');
    } finally {
      setIsDeleting(false);
    }
  };

  // Пересылка сообщения в другой диалог
  const handleForward = async (targetChatId) => {
    if (!forwardMsg || isForwarding) return;
    setIsForwarding(true);
    setActionError('');

    try {
      await forwardMessage(forwardMsg.id, {
        targetChatId,
        targetConnectionId: connectionId,
        withAuthorHeader,
      });

      const targetChat = (chats || []).find((c) => String(c.chat_id) === String(targetChatId));
      const targetName = targetChat?.partner_name || `Чат ${targetChatId}`;

      setForwardMsg(null);
      setForwardSearch('');
      setForwardSuccess(`Сообщение переслано в «${targetName}»`);
      setTimeout(() => setForwardSuccess(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Ошибка пересылки сообщения');
    } finally {
      setIsForwarding(false);
    }
  };

  // Список доступных чатов для пересылки (исключая текущий)
  const targetChats = (chats || [])
    .filter((c) => String(c.chat_id) !== String(chatId))
    .filter((c) => {
      if (!forwardSearch.trim()) return true;
      const term = forwardSearch.toLowerCase();
      const pName = (c.partner_name || c.title || '').toLowerCase();
      return pName.includes(term) || String(c.chat_id).includes(term);
    });

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
  const tgLinks = getTelegramLinks(chatId, partnerInfo.username);

  const hasUsername = !!partnerInfo.username;
  const tgButtonTitle = hasUsername
    ? `Открыть @${partnerInfo.username} в Telegram (доступно с любого аккаунта)`
    : `Открыть чат по ID ${chatId} в Telegram (требуется вход под аккаунтом владельца «${ownerInfo.name}», так как у собеседника нет @username)`;

  const getTargetUrl = () => {
    if (preferredClient === 'a') return tgLinks.webA;
    if (preferredClient === 'app') return tgLinks.app;
    return tgLinks.webK;
  };

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
                  href={`https://web.telegram.org/k/#@${ownerInfo.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] sm:text-xs font-normal text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 transition-colors inline-flex items-center gap-1"
                  title="Открыть в Telegram Web"
                >
                  @{ownerInfo.username}
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}
              <span className="text-slate-500 text-xs">⟷</span>
              <span className="text-emerald-400 truncate max-w-[140px] sm:max-w-none">
                {partnerInfo.name}
              </span>
              {partnerInfo.username && (
                <a
                  href={getTargetUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] sm:text-xs font-normal text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 transition-colors inline-flex items-center gap-1"
                  title="Открыть в Telegram Web"
                >
                  @{partnerInfo.username}
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
              <span>Диалог Telegram Business:</span>
              <a
                href={getTargetUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 underline underline-offset-2 font-mono hover:bg-sky-500/10 px-1 py-0.5 rounded transition-colors"
                title="Открыть этот диалог в Telegram Web"
              >
                ID: {chatId}
                <ExternalLink className="w-2.5 h-2.5 opacity-80" />
              </a>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="hidden sm:inline text-indigo-400/80">Синхронизация в реальном времени</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Кнопка быстрого перехода в Telegram Web */}
          <div className="relative" ref={tgMenuRef}>
            <div className="inline-flex items-center rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 shadow-sm transition-all">
              <a
                href={getTargetUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                title={tgButtonTitle}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {preferredClient === 'a'
                    ? 'В Telegram Web A'
                    : preferredClient === 'app'
                      ? 'В Telegram App'
                      : 'В Telegram Web'}
                </span>
                <span className="sm:hidden">Web</span>
              </a>
              <button
                type="button"
                onClick={() => setTgMenuOpen((prev) => !prev)}
                className="px-1.5 py-1.5 text-sky-400 hover:text-sky-300 border-l border-sky-500/20 hover:bg-sky-500/20 rounded-r-xl transition-colors"
                title="Выбрать версию Telegram (Web K, Web A или Desktop)"
                aria-label="Выбрать версию Telegram"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Выпадающее меню вариантов открытия */}
            {tgMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl py-1.5 z-50 backdrop-blur-md">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80">
                  Открыть переписку
                </div>

                <a
                  href={tgLinks.webK}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleSelectClient('k')}
                  className="flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-sky-500/15 hover:text-sky-300 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Telegram Web K</span>
                    <span className="text-[10px] text-slate-400">web.telegram.org/k/#...</span>
                  </div>
                  {preferredClient === 'k' && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                </a>

                <a
                  href={tgLinks.webA}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleSelectClient('a')}
                  className="flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-sky-500/15 hover:text-sky-300 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Telegram Web A</span>
                    <span className="text-[10px] text-slate-400">web.telegram.org/a/#...</span>
                  </div>
                  {preferredClient === 'a' && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                </a>

                <a
                  href={tgLinks.app}
                  onClick={() => handleSelectClient('app')}
                  className="flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-sky-500/15 hover:text-sky-300 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Telegram Desktop / App</span>
                    <span className="text-[10px] text-slate-400">tg://user?id=...</span>
                  </div>
                  {preferredClient === 'app' && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                </a>

                {!hasUsername && (
                  <div className="px-3 py-1.5 mt-1 border-t border-slate-800/80 text-[10px] text-amber-400/90 leading-tight bg-amber-500/5">
                    У собеседника нет @username. Открытие по ID доступно только в аккаунте «{ownerInfo.name}».
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSendToOwner}
                  disabled={sendingToOwner}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-left text-indigo-300 hover:bg-indigo-500/15 hover:text-indigo-200 border-t border-slate-800/80 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                      Прислать мне в Telegram
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Ссылка на профиль в личный чат с ботом
                    </span>
                  </div>
                  {sendingToOwner && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                </button>
              </div>
            )}
          </div>

          {/* Кнопка отправки карточки собеседника в личный Telegram владельца бота */}
          <button
            type="button"
            onClick={handleSendToOwner}
            disabled={sendingToOwner}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 active:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all shadow-sm shrink-0 disabled:opacity-50"
            title="Бот отправит карточку собеседника и ссылку на его профиль в ваш личный Telegram"
          >
            {sendingToOwner ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="hidden md:inline">Мне в Telegram</span>
            <span className="md:hidden">Мне</span>
          </button>

          <button
            onClick={refresh}
            title="Обновить переписку"
            className="p-2 text-slate-400 hover:text-indigo-300 hover:bg-slate-800/70 active:bg-slate-800 rounded-xl shrink-0 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Уведомление об отправке контакта в Telegram */}
      {ownerSendFeedback && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between gap-2 border-b shrink-0 animate-in fade-in duration-200 ${
            ownerSendFeedback.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {ownerSendFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{ownerSendFeedback.text}</span>
          </div>
          <button
            onClick={() => setOwnerSendFeedback(null)}
            className="p-1 hover:bg-white/10 rounded transition-colors text-slate-400 hover:text-white"
            title="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Лента сообщений: плавный скролл, автоподгрузка истории вверх */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ overflowAnchor: 'none' }}
        className="flex-1 overflow-y-auto px-2.5 sm:px-4 py-3 sm:py-4 space-y-2"
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
            В этом чате пока нет сообщений. Напишите первое сообщение ниже!
          </div>
        )}

        {messages.map((m) => {
          const isFirstUnread = firstUnreadId && m.id === firstUnreadId;
          return (
            <React.Fragment key={m.id || m.message_id}>
              {isFirstUnread && (
                <div
                  ref={firstUnreadRef}
                  className="flex items-center justify-center my-3.5 py-1 select-none animate-in fade-in"
                >
                  <div className="flex-1 h-px bg-indigo-500/30" />
                  <span className="mx-3 text-[11px] font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-500/40 px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 backdrop-blur">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Непрочитанные сообщения
                  </span>
                  <div className="flex-1 h-px bg-indigo-500/30" />
                </div>
              )}
              <div id={`msg-${m.message_id}`} className="transition-all duration-300 rounded-2xl">
                <MessageBubble
                  msg={m}
                  onShowEdits={setEditTarget}
                  onPreviewMedia={setPreviewMedia}
                  fallbackOwner={effectiveOwner}
                  fallbackPartner={effectivePartner}
                  onReply={(msg) => setReplyTo(msg)}
                  onForward={(msg) => setForwardMsg(msg)}
                  onDelete={(msg) => setDeleteConfirmMsg(msg)}
                  onScrollToMessage={scrollToMessage}
                />
              </div>
            </React.Fragment>
          );
        })}

        <div ref={bottomRef} className="h-0.5" />
      </div>

      {/* Плавающая кнопка прокрутки вниз к новым сообщениям */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-24 p-2.5 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 backdrop-blur border border-indigo-400/30 transition-all hover:scale-105 active:scale-95 z-20"
          title="Прокрутить в конец"
          aria-label="Вниз"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Нижняя панель действий и отправки сообщений от лица бота */}
      <div className="border-t border-slate-800/90 bg-slate-900/85 backdrop-blur shrink-0 px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
        {/* Уведомление об успешной пересылке */}
        {forwardSuccess && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs rounded-xl animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate">{forwardSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setForwardSuccess('')}
              className="p-1 hover:text-white text-emerald-400/80 rounded-lg transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Ошибка отправки/удаления/пересылки */}
        {actionError && (
          <div className="flex items-start justify-between gap-2.5 px-3.5 py-2.5 bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs rounded-xl animate-in fade-in">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="leading-relaxed break-words font-medium">{actionError}</div>
            </div>
            <button
              type="button"
              onClick={() => setActionError('')}
              className="p-1 hover:text-white text-rose-400/80 rounded-lg transition-colors shrink-0 -mr-1"
              title="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Плашка ответа на сообщение */}
        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/25 rounded-xl text-xs text-slate-300 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <div className="min-w-0 flex items-center gap-1.5 truncate">
                <span className="font-semibold text-indigo-300 shrink-0">
                  {replyTo.is_outgoing ? 'Вы' : replyTo.sender_name || 'Собеседник'}:
                </span>
                <span className="text-slate-400 truncate">
                  {replyTo.text || (replyTo.media_type ? `[${replyTo.media_type}]` : 'Сообщение')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors shrink-0"
              title="Отменить ответ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Превью прикрепленного файла */}
        {pendingFile && (
          <div className="flex items-center justify-between gap-2 p-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-slate-300 animate-in fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              {pendingFile.previewUrl ? (
                <img
                  src={pendingFile.previewUrl}
                  alt="Превью"
                  className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-slate-200 truncate">{pendingFile.name}</div>
                <div className="text-[10px] text-slate-400">{formatBytes(pendingFile.size)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors shrink-0"
              title="Удалить вложение"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Панель активной записи голосового сообщения */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl animate-in fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
              </span>
              <span className="text-xs font-mono font-semibold text-rose-300">
                {formatDuration(recordingDuration)}
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Запись голосового сообщения…
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 rounded-xl transition-colors"
                title="Отменить запись"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-600/30 transition-all disabled:opacity-50"
                title="Отправить голосовое"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Отправить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Обычный ввод текста */
          <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/80 active:bg-slate-800 rounded-xl transition-colors shrink-0"
              title="Прикрепить файл (фото, видео, документ)"
              aria-label="Прикрепить файл"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  pendingFile
                    ? 'Добавьте подпись к файлу… (Enter для отправки)'
                    : 'Написать сообщение от лица бота… (Enter для отправки)'
                }
                rows={1}
                className="w-full resize-none rounded-xl bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none transition-all max-h-32 leading-relaxed"
                style={{ minHeight: '38px' }}
              />
            </div>

            {/* Если текст пустой и файла нет — микрофон для записи ГС, иначе — кнопка отправки */}
            {!inputText.trim() && !pendingFile ? (
              <button
                type="button"
                onClick={startRecording}
                className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 active:bg-slate-800 rounded-xl transition-colors shrink-0"
                title="Записать голосовое сообщение"
                aria-label="Голосовое сообщение"
              >
                <Mic className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSending || (!inputText.trim() && !pendingFile)}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl transition-all shadow-md shadow-indigo-600/30 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Отправить сообщение"
                aria-label="Отправить"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            )}
          </form>
        )}
      </div>

      {/* Модальное окно пересылки сообщения в другой чат */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Шапка модалки */}
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
              <div className="flex items-center gap-2 text-indigo-400">
                <Forward className="w-5 h-5" />
                <h3 className="text-sm font-semibold text-slate-100">Переслать сообщение</h3>
              </div>
              <button
                type="button"
                onClick={() => setForwardMsg(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Тело модалки */}
            <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
              {/* Превью пересылаемого сообщения */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[11px] font-medium text-indigo-300">
                  {forwardMsg.is_outgoing ? 'Вы' : forwardMsg.sender_name || 'Собеседник'}:
                </div>
                {forwardMsg.text && (
                  <div className="text-xs text-slate-200 line-clamp-3 break-words">
                    {forwardMsg.text}
                  </div>
                )}
                {forwardMsg.media_type && (
                  <div className="text-[11px] text-slate-400 italic">
                    📎 [{forwardMsg.media_type}] {forwardMsg.text ? '' : 'Медиавложение'}
                  </div>
                )}
              </div>

              {/* Опция пометки автора */}
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withAuthorHeader}
                  onChange={(e) => setWithAuthorHeader(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500/40 bg-slate-950 w-4 h-4"
                />
                <span>
                  Добавить плашку автора («↪️ Переслано от: {forwardMsg.is_outgoing ? 'Вы' : forwardMsg.sender_name || 'Собеседник'}»)
                </span>
              </label>

              {/* Поле поиска чата */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск диалога по имени…"
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                />
              </div>

              {/* Список диалогов для выбора */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {targetChats.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    {forwardSearch ? 'Диалоги не найдены' : 'Нет доступных диалогов для пересылки'}
                  </div>
                ) : (
                  targetChats.map((c) => {
                    const pInfo = parseTelegramName(c.partner_name || c.title || `Чат ${c.chat_id}`);
                    return (
                      <button
                        key={c.chat_id}
                        type="button"
                        disabled={isForwarding}
                        onClick={() => handleForward(c.chat_id)}
                        className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/80 active:bg-slate-800 border border-transparent hover:border-slate-700/60 transition-all text-left disabled:opacity-50 group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0 group-hover:bg-indigo-600/20 group-hover:text-indigo-300 group-hover:border-indigo-500/30 transition-colors">
                            {pInfo.name ? pInfo.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-200 transition-colors">
                              {pInfo.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              ID: {c.chat_id}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-slate-500 group-hover:text-indigo-400 transition-colors">
                          <Forward className="w-4 h-4" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Подвал модалки */}
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60 text-xs text-slate-400">
              <span>{isForwarding ? 'Пересылка сообщения…' : 'Нажмите на диалог для отправки'}</span>
              <button
                type="button"
                onClick={() => setForwardMsg(null)}
                className="px-3 py-1.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления сообщения в Telegram */}
      {deleteConfirmMsg && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Удалить в Telegram?</h3>
                <p className="text-xs text-slate-400">ID сообщения: {deleteConfirmMsg.message_id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Сообщение будет удалено ботом в Telegram <strong className="text-slate-100">для обоих собеседников</strong> и помечено как удалённое в архиве.
            </p>

            {deleteConfirmMsg.text && (
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 truncate max-h-16">
                «{deleteConfirmMsg.text}»
              </div>
            )}

            <div className="flex items-center gap-2 justify-end pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmMsg(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 rounded-xl transition-colors shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить везде</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && <EditHistory message={editTarget} onClose={() => setEditTarget(null)} />}
      {previewMedia && <MediaModal media={previewMedia} onClose={() => setPreviewMedia(null)} />}
    </div>
  );
}
