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

// WebSocket клиент реального времени для синхронизации сообщений и чатов.
export function createWebSocketClient(onEvent, onStatusChange) {
  let ws = null;
  let reconnectTimer = null;
  let isDestroyed = false;
  let retryCount = 0;
  let pingInterval = null;

  function getWsUrl() {
    const token = localStorage.getItem('token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;
  }

  function connect() {
    if (isDestroyed) return;
    const token = localStorage.getItem('token');
    if (!token) {
      if (onStatusChange) onStatusChange('disconnected');
      return;
    }

    if (onStatusChange) onStatusChange('connecting');

    try {
      ws = new WebSocket(getWsUrl());
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryCount = 0;
      if (onStatusChange) onStatusChange('connected');

      // Heartbeat ping каждые 25 сек для поддержания соединения через прокси
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const text = event.data;
        if (!text) return;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = JSON.parse(trimmed);
          if (msg.type === 'pong') continue;
          if (onEvent) onEvent(msg);
        }
      } catch (err) {
        console.error('Ошибка разбора WebSocket сообщения:', err);
      }
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      if (onStatusChange) onStatusChange('disconnected');
      if (!isDestroyed) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
    };
  }

  function scheduleReconnect() {
    if (isDestroyed) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
    retryCount++;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    disconnect() {
      isDestroyed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
    },
  };
}
