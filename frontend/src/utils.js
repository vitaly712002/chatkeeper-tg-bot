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
