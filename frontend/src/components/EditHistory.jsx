import React, { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { getMessageEdits } from '../api';

// Модальное окно с историей правок сообщения.
// Ожидаемая форма ответа API: массив версий, от старой к новой:
// [{ text, edited_at }], где последний элемент — текущая версия.
export default function EditHistory({ message, onClose }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMessageEdits(message.id)
      .then((data) => {
        if (!cancelled) setVersions(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Не удалось загрузить историю');
      });
    return () => {
      cancelled = true;
    };
  }, [message.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400">
            <Pencil className="w-4 h-4" />
            <h3 className="font-semibold text-white">История изменений</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && <div className="text-sm text-rose-400">{error}</div>}
          {!versions && !error && <div className="text-sm text-slate-500">Загрузка…</div>}
          {versions && versions.length === 0 && (
            <div className="text-sm text-slate-500">Нет сохранённых версий.</div>
          )}
          {versions &&
            versions.map((v, i) => {
              const isCurrent = i === versions.length - 1;
              return (
                <div
                  key={i}
                  className={`rounded-xl p-3 border ${
                    isCurrent
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-700/60 bg-slate-800/40'
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wide mb-1 text-slate-500">
                    {isCurrent ? 'Текущая версия' : `Версия ${i + 1}`} · {fmtTime(v.edited_at)}
                  </div>
                  <div className="text-sm text-slate-100 whitespace-pre-wrap break-words">
                    {v.text || <span className="italic text-slate-500">[пусто]</span>}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
