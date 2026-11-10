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
