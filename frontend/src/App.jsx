import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Trash2, Pencil, Users, HardDrive } from 'lucide-react';
import Navbar, { formatBytes } from './components/Navbar';
import LoginPage from './components/LoginPage';
import UserList from './components/UserList';
import ChatList from './components/ChatList';
import ChatView from './components/ChatView';
import StatCard from './components/StatCard';
import { getCurrentUser, logout, getUsers, getChats, getStats, createWebSocketClient } from './api';

export default function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [activeTab, setActiveTab] = useState('chats');

  // Пользователи (подключённые аккаунты Telegram Business)
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);

  // Чаты выбранного пользователя
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState(null);

  // Общая статистика
  const [stats, setStats] = useState(null);

  // WebSocket статус и последнее событие
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [lastWsEvent, setLastWsEvent] = useState(null);

  // Реф для хранения текущего selectedConnectionId без разрыва WebSocket-соединения
  const selectedConnectionIdRef = useRef(selectedConnectionId);
  useEffect(() => {
    selectedConnectionIdRef.current = selectedConnectionId;
  }, [selectedConnectionId]);

  // 1. Первичная загрузка списка пользователей и общей статистики после авторизации
  useEffect(() => {
    if (!user) return;
    setUsersLoading(true);
    getUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setUsers(list);
        if (list.length > 0 && !selectedConnectionId) {
          setSelectedConnectionId(list[0].connection_id);
        }
      })
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));

    getStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [user]);

  // 2. Ленивая подгрузка чатов ТОЛЬКО для выбранного пользователя
  useEffect(() => {
    if (!selectedConnectionId) {
      setChats([]);
      setSelectedChatId(null);
      return;
    }
    setChatsLoading(true);
    setSelectedChatId(null);
    getChats(selectedConnectionId)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setChats(list);
      })
      .catch(() => setChats([]))
      .finally(() => setChatsLoading(false));
  }, [selectedConnectionId]);

  // 3. Подключение WebSocket для мгновенной синхронизации в реальном времени
  const handleWsEvent = useCallback((event) => {
    // Добавляем timestamp, чтобы гарантировать вызов useEffect в ChatView при любых событиях
    setLastWsEvent({ ...event, _ts: Date.now() });
    const { type, data } = event;
    if (!data) return;

    if (type === 'message_created') {
      const { connection_id, chat_id, message } = data;

      // Обновляем общую статистику
      setStats((prev) =>
        prev
          ? {
              ...prev,
              total_messages: (Number(prev.total_messages) || 0) + 1,
            }
          : null
      );

      // Обновляем счётчик сообщений пользователя
      setUsers((prev) =>
        prev.map((u) =>
          u.connection_id === connection_id
            ? {
                ...u,
                messages_count: (Number(u.messages_count) || 0) + 1,
                last_at: message.sent_at,
              }
            : u
        )
      );

      // Если сообщение относится к текущему активному пользователю — обновляем список чатов
      const currentConnId = selectedConnectionIdRef.current;
      if (!currentConnId || connection_id === currentConnId) {
        setChats((prev) => {
          const existingIdx = prev.findIndex((c) => String(c.chat_id) === String(chat_id));
          const previewText = message.text || (message.media_type ? `📎 [${message.media_type}]` : '—');

          if (existingIdx !== -1) {
            const updatedChat = {
              ...prev[existingIdx],
              last_text: previewText,
              last_at: message.sent_at,
              count: (Number(prev[existingIdx].count) || 0) + 1,
            };
            // Перемещаем чат с новым сообщением наверх списка (как в Telegram)
            const rest = prev.filter((_, idx) => idx !== existingIdx);
            return [updatedChat, ...rest];
          } else {
            // Если чата ещё не было в списке — перезагружаем список чатов
            getChats(currentConnId)
              .then((fresh) => {
                if (Array.isArray(fresh)) setChats(fresh);
              })
              .catch(() => {});
            return prev;
          }
        });
      }
    } else if (type === 'message_edited') {
      const { chat_id, new_text } = data;
      setStats((prev) =>
        prev
          ? {
              ...prev,
              edited_count: (Number(prev.edited_count) || 0) + 1,
            }
          : null
      );
      setChats((prev) =>
        prev.map((c) =>
          String(c.chat_id) === String(chat_id)
            ? { ...c, last_text: new_text }
            : c
        )
      );
    } else if (type === 'messages_deleted') {
      const { chat_id, message_ids } = data;
      const count = message_ids?.length || 1;
      setStats((prev) =>
        prev
          ? {
              ...prev,
              deleted_count: (Number(prev.deleted_count) || 0) + count,
            }
          : null
      );
      setChats((prev) =>
        prev.map((c) =>
          String(c.chat_id) === String(chat_id)
            ? { ...c, deleted_count: (Number(c.deleted_count) || 0) + count }
            : c
        )
      );
    } else if (type === 'connection_updated') {
      getUsers()
        .then((data) => {
          if (Array.isArray(data)) setUsers(data);
        })
        .catch(() => {});
    }
  }, []); // Пустой массив зависимостей: соединение стабильно и не рвётся при смене чатов

  useEffect(() => {
    if (!user) return;
    const client = createWebSocketClient(handleWsEvent, setWsStatus);
    return () => {
      client.disconnect();
    };
  }, [user, handleWsEvent]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setUsers([]);
    setSelectedConnectionId(null);
    setChats([]);
    setSelectedChatId(null);
    setStats(null);
  };

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  const selectedUser = users.find((u) => u.connection_id === selectedConnectionId);
  const selectedChat = chats.find((c) => String(c.chat_id) === String(selectedChatId));

  return (
    <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        storage={stats?.storage}
        onStorageUpdate={(newStorage) =>
          setStats((prev) => (prev ? { ...prev, storage: newStorage } : null))
        }
        wsStatus={wsStatus}
      />

      {activeTab === 'chats' && (
        <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-0 sm:px-4 lg:px-6 py-0 sm:py-3 lg:py-4 flex flex-col">
          <div className="flex-1 min-h-0 flex rounded-none sm:rounded-2xl border-0 sm:border border-slate-800/90 overflow-hidden bg-slate-900/40 shadow-xl">
            {/* Колонка 1: Пользователи (аккаунты Telegram Business).
                На экранах < lg скрыта в пользу мобильного переключателя в шапке чатов */}
            <aside className="hidden lg:flex w-56 shrink-0 overflow-hidden flex-col border-r border-slate-800/80">
              <UserList
                users={users}
                selectedConnectionId={selectedConnectionId}
                onSelect={setSelectedConnectionId}
                loading={usersLoading}
              />
            </aside>

            {/* Колонка 2: Чаты выбранного пользователя.
                На мобильных устройствах (< md): скрывается, когда открыт конкретный чат */}
            <aside
              className={`${
                selectedChatId ? 'hidden md:flex' : 'flex'
              } w-full md:w-72 lg:w-80 shrink-0 overflow-hidden flex-col`}
            >
              <ChatList
                chats={chats}
                loading={chatsLoading}
                selectedChatId={selectedChatId}
                onSelect={setSelectedChatId}
                selectedUserName={selectedUser?.user_name}
                users={users}
                selectedConnectionId={selectedConnectionId}
                onSelectConnection={setSelectedConnectionId}
              />
            </aside>

            {/* Колонка 3: Сообщения выбранного чата.
                На мобильных устройствах (< md): скрывается, пока чат не выбран */}
            <section
              className={`${
                selectedChatId ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 overflow-hidden flex-col`}
            >
              <ChatView
                chatId={selectedChatId}
                connectionId={selectedConnectionId}
                chatTitle={selectedChat?.title}
                ownerName={selectedChat?.owner_name || selectedUser?.user_name}
                partnerName={selectedChat?.partner_name}
                onBack={() => setSelectedChatId(null)}
                lastWsEvent={lastWsEvent}
              />
            </section>
          </div>
        </main>
      )}

      {activeTab === 'dashboard' && (
        <main className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Обзор</h2>
            <p className="text-xs sm:text-sm text-slate-400">Сводка по сохранённым перепискам и серверу</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            <StatCard
              title="Сообщений"
              value={stats?.total_messages}
              icon={MessageSquare}
              color="indigo"
              subtitle="Всего сохранено"
            />
            <StatCard
              title="Чатов"
              value={stats?.total_chats}
              icon={Users}
              color="blue"
              subtitle="Активных диалогов"
            />
            <StatCard
              title="Удалено"
              value={stats?.deleted_count}
              icon={Trash2}
              color="red"
              subtitle="Пойманных удалений"
            />
            <StatCard
              title="Правок"
              value={stats?.edited_count}
              icon={Pencil}
              color="amber"
              subtitle="Изменённых сообщений"
            />
            <StatCard
              title="Память диска"
              value={
                stats?.storage
                  ? `${formatBytes(stats.storage.used_bytes)} / ${formatBytes(stats.storage.total_bytes)}`
                  : '—'
              }
              icon={HardDrive}
              color="emerald"
              subtitle={
                stats?.storage
                  ? `Свободно ${formatBytes(stats.storage.free_bytes)} (${Math.round(
                      stats.storage.used_percent
                    )}% занято)`
                  : 'Загрузка...'
              }
            />
          </div>
        </main>
      )}
    </div>
  );
}
