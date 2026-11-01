// Клиент для REST API бота Chatkeeper.
// Паттерн тот же, что в secure-ask-admin: токен лежит в localStorage и
// отправляется заголовком Authorization: Bearer. При 401 — выходим и перезагружаем.

const API_BASE = '/api';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Обёртка над fetch: сама подставляет заголовки и обрабатывает 401.
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: getHeaders() });
  if (res.status === 401) {
    logout();
    window.location.reload();
    throw new Error('Требуется авторизация');
  }
  if (!res.ok) {
    throw new Error(`Ошибка запроса (${res.status})`);
  }
  return res.json();
}

// --- Авторизация ---

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка входа');
  }
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getCurrentUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

// --- Данные ---

// Общая статистика для дашборда.
export function getStats() {
  return apiGet('/stats');
}

// Информация о дисковой памяти (свободно / всего).
export function getStorage() {
  return apiGet('/storage');
}

// Очистка всех сохранённых медиафайлов с диска сервера.
export async function cleanMedia() {
  const res = await fetch(`${API_BASE}/media/clean`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (res.status === 401) {
    logout();
    window.location.reload();
    throw new Error('Требуется авторизация');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Ошибка очистки медиа (${res.status})`);
  }
  return data;
}

// Список пользователей (подключённых аккаунтов Telegram Business).
export function getUsers() {
  return apiGet('/users');
}

// Список чатов (диалогов). connectionId — опциональная фильтрация по конкретному аккаунту.
export function getChats(connectionId = null) {
  let path = '/chats';
  if (connectionId) {
    path += `?connection_id=${encodeURIComponent(connectionId)}`;
  }
  return apiGet(path);
}

// Сообщения конкретного чата. before — курсор пагинации (id самого старого
// загруженного сообщения), чтобы подгружать историю вверх.
export function getChatMessages(chatId, { connectionId = null, limit = 50, before = null } = {}) {
  let path = `/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`;
  if (connectionId) path += `&connection_id=${encodeURIComponent(connectionId)}`;
  if (before != null) path += `&before=${before}`;
  return apiGet(path);
}

// История правок одного сообщения («было → стало»).
export function getMessageEdits(messageId) {
  return apiGet(`/messages/${messageId}/edits`);
}

// URL медиа для вставки в <img>/<video>. Токен передаём в query, т.к. тег <img>
// не умеет слать заголовок Authorization (см. примечание в docs/10-webapp-plan.md).
export function getMediaUrl(fileId) {
  const token = localStorage.getItem('token') || '';
  return `${API_BASE}/media/${encodeURIComponent(fileId)}?t=${encodeURIComponent(token)}`;
}
