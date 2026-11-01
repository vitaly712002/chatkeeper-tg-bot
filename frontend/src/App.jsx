import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Pencil, Users, HardDrive } from 'lucide-react';
import Navbar, { formatBytes } from './components/Navbar';
import LoginPage from './components/LoginPage';
import UserList from './components/UserList';
import ChatList from './components/ChatList';
import ChatView from './components/ChatView';
import StatCard from './components/StatCard';
import { getCurrentUser, logout, getUsers, getChats, getStats } from './api';

export default function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [activeTab, setActiveTab] = useState('chats');

  // Пользователи (подключённые аккаунты)
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);

  // Чаты выбранного пользователя
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState(null);

  // Общая статистика
  const [stats, setStats] = useState(null);

  // 1. Первичная загрузка списка пользователей и общей статистики после авторизации
  useEffect(() => {
    if (!user) return;
    setUsersLoading(true);
    getUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setUsers(list);
        // По умолчанию выбираем первого пользователя
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
    setSelectedChatId(null); // Сбрасываем выбранный чат при переключении пользователя
    getChats(selectedConnectionId)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setChats(list);
      })
      .catch(() => setChats([]))
      .finally(() => setChatsLoading(false));
  }, [selectedConnectionId]);

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
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        storage={stats?.storage}
        onStorageUpdate={(newStorage) =>
          setStats((prev) => (prev ? { ...prev, storage: newStorage } : null))
        }
      />

      {activeTab === 'chats' && (
        <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-2 sm:px-4 lg:px-6 py-4">
          <div className="h-full flex rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40">
            {/* Колонка 1: Пользователи (аккаунты Telegram Business) */}
            <aside className="w-52 sm:w-60 shrink-0 overflow-hidden flex flex-col">
              <UserList
                users={users}
                selectedConnectionId={selectedConnectionId}
                onSelect={setSelectedConnectionId}
                loading={usersLoading}
              />
            </aside>

            {/* Колонка 2: Чаты выбранного пользователя */}
            <aside className="w-64 sm:w-80 shrink-0 overflow-hidden flex flex-col">
              <ChatList
                chats={chats}
                loading={chatsLoading}
                selectedChatId={selectedChatId}
                onSelect={setSelectedChatId}
                selectedUserName={selectedUser?.user_name}
              />
            </aside>

            {/* Колонка 3: Сообщения выбранного чата */}
            <ChatView
              chatId={selectedChatId}
              connectionId={selectedConnectionId}
              chatTitle={selectedChat?.title}
              ownerName={selectedChat?.owner_name || selectedUser?.user_name}
              partnerName={selectedChat?.partner_name}
            />
          </div>
        </main>
      )}

      {activeTab === 'dashboard' && (
        <main className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h2 className="text-xl font-bold text-white mb-1">Обзор</h2>
          <p className="text-sm text-slate-400 mb-6">Сводка по сохранённым перепискам и серверу</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Сообщений" value={stats?.total_messages} icon={MessageSquare} color="indigo" subtitle="Всего сохранено" />
            <StatCard title="Чатов" value={stats?.total_chats} icon={Users} color="blue" subtitle="Активных диалогов" />
            <StatCard title="Удалено" value={stats?.deleted_count} icon={Trash2} color="red" subtitle="Пойманных удалений" />
            <StatCard title="Правок" value={stats?.edited_count} icon={Pencil} color="amber" subtitle="Изменённых сообщений" />
            <StatCard
              title="Память диска"
              value={stats?.storage ? `${formatBytes(stats.storage.used_bytes)} / ${formatBytes(stats.storage.total_bytes)}` : '—'}
              icon={HardDrive}
              color="emerald"
              subtitle={stats?.storage ? `Свободно ${formatBytes(stats.storage.free_bytes)} (${Math.round(stats.storage.used_percent)}% занято)` : 'Загрузка...'}
            />
          </div>
        </main>
      )}
    </div>
  );
}
