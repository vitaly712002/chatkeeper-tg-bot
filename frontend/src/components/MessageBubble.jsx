import React, { useState } from 'react';
import {
  Trash2,
  Pencil,
  FileText,
  Mic,
  Film,
  Image as ImageIcon,
  Download,
  Loader2,
} from 'lucide-react';
import { getMediaUrl } from '../api';

// Один «пузырь» сообщения. Ожидаемая форма:
// { id, sender_name, recipient_name, is_outgoing, text, media_type, file_id, sent_at,
//   deleted_at (null если не удалено), edited (bool) }
export default function MessageBubble({ msg, onShowEdits, fallbackOwner, fallbackPartner }) {
  const deleted = !!msg.deleted_at;
  const outgoing = !!msg.is_outgoing;

  // Цвет пузыря: удалённые — красные, исходящие — индиго, входящие — серые.
  const bubbleClass = deleted
    ? 'bg-rose-500/10 border border-rose-500/30'
    : outgoing
      ? 'bg-indigo-600/20 border border-indigo-500/30'
      : 'bg-slate-800/70 border border-slate-700/60';

  const fromName = outgoing
    ? (msg.sender_name || fallbackOwner || 'Вы')
    : (msg.sender_name || fallbackPartner || 'Собеседник');

  const toName = outgoing
    ? (msg.recipient_name || fallbackPartner || 'Собеседник')
    : (msg.recipient_name || fallbackOwner || 'Вы');

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${bubbleClass}`}>
        <div className="text-[11px] font-medium mb-1 flex items-center gap-1.5 flex-wrap">
          <span className={outgoing ? 'text-indigo-300 font-semibold' : 'text-emerald-400 font-semibold'}>
            {fromName}
          </span>
          <span className="text-slate-400 text-[10px]">➔</span>
          <span className={outgoing ? 'text-emerald-300/90 font-medium' : 'text-indigo-300 font-medium'}>
            {toName}
          </span>
        </div>

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

// Отображение медиа. По умолчанию ленивое: показывается плашка с кнопкой загрузки,
// и только при клике медиа запрашивается и скачивается с сервера.
function MediaView({ type, fileId }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const url = getMediaUrl(fileId);

  if (!isLoaded) {
    const Icon = iconFor(type);
    const label = labelFor(type);

    return (
      <button
        type="button"
        onClick={() => {
          setLoading(true);
          setIsLoaded(true);
        }}
        className="w-full max-w-sm flex items-center justify-between gap-3 px-3 py-2.5 my-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-900/80 border border-slate-700/60 hover:border-indigo-500/50 transition-all text-left group cursor-pointer"
        title="Нажмите для загрузки"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0 group-hover:bg-indigo-600/30 group-hover:text-indigo-300 transition-colors">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-200 transition-colors truncate">
              {label}
            </div>
            <div className="text-[10px] text-slate-400">Нажмите для загрузки</div>
          </div>
        </div>

        <div className="shrink-0 text-slate-400 group-hover:text-indigo-300 transition-colors">
          <Download className="w-4 h-4" />
        </div>
      </button>
    );
  }

  if (type === 'photo' || type === 'sticker') {
    return (
      <div className="relative my-1.5">
        {loading && (
          <div className="w-48 h-36 rounded-xl bg-slate-900/60 flex items-center justify-center text-xs text-slate-400 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400 mr-2" /> Загрузка…
          </div>
        )}
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={labelFor(type)}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
            className={`rounded-xl max-h-72 w-auto object-cover hover:opacity-95 transition-opacity ${
              loading ? 'hidden' : 'block'
            }`}
          />
        </a>
      </div>
    );
  }

  if (type === 'video' || type === 'video_note' || type === 'animation') {
    return (
      <div className="my-1.5">
        <video
          src={url}
          controls
          autoPlay
          className="rounded-xl max-h-72 w-auto"
        />
      </div>
    );
  }

  if (type === 'voice' || type === 'audio') {
    return (
      <div className="my-1.5">
        <audio src={url} controls autoPlay className="w-64 max-w-full" />
      </div>
    );
  }

  const Icon = iconFor(type);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200 my-1 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60"
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
    photo: 'Фото',
    document: 'Документ',
    sticker: 'Стикер',
    audio: 'Аудио',
    voice: 'Голосовое сообщение',
    video: 'Видео',
    video_note: 'Видеосообщение',
    animation: 'GIF анимация',
  };
  return map[type] || `Вложение (${type})`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
