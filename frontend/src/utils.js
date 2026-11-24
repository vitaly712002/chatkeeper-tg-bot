// parseTelegramName разбирает строку вида "Иван Иванов (@ivanov)" на имя и юзернейм.
// Если юзернейм есть, возвращает { name: "Иван Иванов", username: "ivanov" }.
// Если юзернейма нет, возвращает { name: "Иван Иванов", username: null }.
export function parseTelegramName(raw) {
  if (!raw) return { name: '', username: null };
  const str = String(raw).trim();

  // Формат: "Иван Иванов (@ivanov)"
  const m = str.match(/^(.*?)\s*\(@([a-zA-Z0-9_]+)\)$/);
  if (m) {
    const displayName = m[1].trim();
    return { name: displayName || ('@' + m[2]), username: m[2] };
  }

  // Формат: "@ivanov"
  const mSolo = str.match(/^@([a-zA-Z0-9_]+)$/);
  if (mSolo) {
    return { name: '@' + mSolo[1], username: mSolo[1] };
  }

  return { name: str, username: null };
}

export function getPreferredTgClient() {
  try {
    return localStorage.getItem('tg_web_client') || 'k';
  } catch {
    return 'k';
  }
}

export function setPreferredTgClient(client) {
  try {
    localStorage.setItem('tg_web_client', client);
  } catch {}
}

/**
 * getTelegramLinks формирует ссылки для открытия диалога в Telegram:
 * - webK: Telegram Web K (https://web.telegram.org/k/#...)
 * - webA: Telegram Web A (https://web.telegram.org/a/#...)
 * - app: Ссылка для приложения Telegram Desktop / Mobile (tg://...)
 * - preferred: Ссылка по умолчанию согласно выбору пользователя (по умолчанию Web K)
 */
export function getTelegramLinks(chatId, username = null) {
  const cleanUsername = username ? String(username).replace(/^@/, '').trim() : null;
  const cleanId = chatId != null ? String(chatId).trim() : '';

  // Для Web K и Web A: если есть username, используем @username, иначе цифровой ID
  const target = cleanUsername ? `@${cleanUsername}` : cleanId;

  const webK = target ? `https://web.telegram.org/k/#${target}` : 'https://web.telegram.org/k/';
  const webA = target ? `https://web.telegram.org/a/#${target}` : 'https://web.telegram.org/a/';
  const app = cleanUsername
    ? `tg://resolve?domain=${cleanUsername}`
    : cleanId
      ? `tg://user?id=${cleanId}`
      : 'tg://';

  const pref = getPreferredTgClient();
  let preferred = webK;
  if (pref === 'a') preferred = webA;
  else if (pref === 'app') preferred = app;

  return {
    webK,
    webA,
    app,
    preferred,
    web: webK,
  };
}

/**
 * fmtDateTime форматирует дату и время отправки сообщения: "23.11.2026, 19:45"
 */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateStr}, ${timeStr}`;
}

/**
 * fmtFullDateTime форматирует полную дату и время с секундами для всплывающих подсказок (title tooltip):
 * "23 ноября 2026 г., 19:45:12"
 */
export function fmtFullDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * formatDateDivider возвращает текст для разделителя дней в ленте переписки:
 * "Сегодня, 23 ноября 2026 г.", "Вчера, 22 ноября 2026 г.", "15 октября 2026 г."
 */
export function formatDateDivider(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const dateStr = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return `Сегодня, ${dateStr}`;
  if (isYesterday) return `Вчера, ${dateStr}`;
  return dateStr;
}

/**
 * isDifferentDay проверяет, относятся ли две даты к разным календарным дням
 */
export function isDifferentDay(iso1, iso2) {
  if (!iso1 || !iso2) return true;
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return true;
  return d1.toDateString() !== d2.toDateString();
}

