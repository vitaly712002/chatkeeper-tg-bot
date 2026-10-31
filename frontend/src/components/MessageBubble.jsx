import React from 'react';
import { Trash2, Pencil, FileText, Mic, Film, Image as ImageIcon } from 'lucide-react';
import { getMediaUrl } from '../api';

// Один «пузырь» сообщения. Ожидаемая форма:
// { id, sender_name, is_outgoing, text, media_type, file_id, sent_at,
//   deleted_at (null если не удалено), edited (bool) }
export default function MessageBubble({ msg, onShowEdits }) {
  const deleted = !!msg.deleted_at;
  const outgoing = !!msg.is_outgoing;

  // Цвет пузыря: удалённые — красные, исходящие — индиго, входящие — серые.
  const bubbleClass = deleted
    ? 'bg-rose-500/10 border border-rose-500/30'
    : outgoing
      ? 'bg-indigo-600/20 border border-indigo-500/30'
      : 'bg-slate-800/70 border border-slate-700/60';

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${bubbleClass}`}>
        {!outgoing && (
          <div className="text-[11px] font-medium text-indigo-300 mb-0.5">{msg.sender_name}</div>
        )}

        {msg.media_type && msg.file_id && <MediaView type={msg.media_type} fileId={msg.file_id} />}

        {msg.text && (
          <div
            className={`text-sm whitespace-pre-wrap break-words ${
              deleted ? 'line-through text-rose-200/80' : 'text-slate-100'
            }`}
          >
            {msg.text}
          </div>
        )}

        {!msg.text && !msg.media_type && (
          <div className="text-sm italic text-slate-500">[пустое сообщение]</div>
        )}

        <div className="mt-1 flex items-center gap-2 justify-end text-[11px] text-slate-400">
          {msg.edited && (
            <button
              onClick={() => onShowEdits(msg)}
              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
              title="История изменений"
            >
              <Pencil className="w-3 h-3" /> изменено
            </button>
          )}
          {deleted && (
            <span className="inline-flex items-center gap-1 text-rose-400">
              <Trash2 className="w-3 h-3" /> удалено
            </span>
          )}
          <span>{fmtTime(msg.sent_at)}</span>
        </div>
      </div>
    </div>
  );
}

// Отображение медиа. Фото/видео показываем, остальное — иконкой со ссылкой.
function MediaView({ type, fileId }) {
  const url = getMediaUrl(fileId);

  if (type === 'photo') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="фото" className="rounded-xl max-h-72 mb-1.5 object-cover" />
      </a>
    );
  }
  if (type === 'video' || type === 'video_note' || type === 'animation') {
    return <video src={url} controls className="rounded-xl max-h-72 mb-1.5" />;
  }
  if (type === 'voice' || type === 'audio') {
    return <audio src={url} controls className="mb-1.5 w-56 max-w-full" />;
  }

  const Icon = iconFor(type);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200 mb-1"
    >
      <Icon className="w-4 h-4" /> {labelFor(type)}
    </a>
  );
}

function iconFor(type) {
  if (type === 'document') return FileText;
  if (type === 'voice' || type === 'audio') return Mic;
  if (type === 'sticker') return ImageIcon;
  return Film;
}

function labelFor(type) {
  const map = {
    document: 'Документ',
    sticker: 'Стикер',
    audio: 'Аудио',
  };
  return map[type] || `Вложение (${type})`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
