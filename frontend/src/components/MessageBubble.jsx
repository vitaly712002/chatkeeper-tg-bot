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
  Eye,
  Maximize2,
} from 'lucide-react';
import { getMediaUrl } from '../api';
import { parseTelegramName } from '../utils';

// Один «пузырь» сообщения. Ожидаемая форма:
// { id, sender_name, recipient_name, is_outgoing, text, media_type, file_id, sent_at,
//   deleted_at (null если не удалено), edited (bool) }
export default function MessageBubble({ msg, onShowEdits, onPreviewMedia, fallbackOwner, fallbackPartner }) {
  const deleted = !!msg.deleted_at;
  const outgoing = !!msg.is_outgoing;

  // Цвет пузыря: удалённые — красные, исходящие — индиго, входящие — серые.
  const bubbleClass = deleted
    ? 'bg-rose-500/10 border border-rose-500/30'
    : outgoing
      ? 'bg-indigo-600/20 border border-indigo-500/30'
      : 'bg-slate-800/70 border border-slate-700/60';

  const rawFrom = outgoing
    ? (msg.sender_name || fallbackOwner || 'Вы')
    : (msg.sender_name || fallbackPartner || 'Собеседник');

  const rawTo = outgoing
    ? (msg.recipient_name || fallbackPartner || 'Собеседник')
    : (msg.recipient_name || fallbackOwner || 'Вы');

  const fromInfo = parseTelegramName(rawFrom);
  const toInfo = parseTelegramName(rawTo);

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] sm:max-w-[78%] md:max-w-[75%] rounded-2xl px-3 sm:px-3.5 py-2 ${bubbleClass}`}>
        <div className="text-[11px] font-medium mb-1 flex items-center gap-1.5 flex-wrap">
          <span className={outgoing ? 'text-indigo-300 font-semibold' : 'text-emerald-400 font-semibold'}>
            {fromInfo.name}
            {fromInfo.username && (
              <span className="text-[10px] font-normal opacity-80 ml-1">
                @{fromInfo.username}
              </span>
            )}
          </span>
          <span className="text-slate-400 text-[10px]">➔</span>
          <span className={outgoing ? 'text-emerald-300/90 font-medium' : 'text-indigo-300 font-medium'}>
            {toInfo.name}
            {toInfo.username && (
              <span className="text-[10px] font-normal opacity-80 ml-1">
                @{toInfo.username}
              </span>
            )}
          </span>
        </div>

        {msg.media_type && msg.file_id && (
          <MediaView type={msg.media_type} fileId={msg.file_id} onPreviewMedia={onPreviewMedia} />
        )}

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

// Отображение медиа. По умолчанию ленивое: показывается плашка с кнопкой просмотра,
// и только при клике медиа запрашивается с сервера.
function MediaView({ type, fileId, onPreviewMedia }) {
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
        title="Нажмите для просмотра"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0 group-hover:bg-indigo-600/30 group-hover:text-indigo-300 transition-colors">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-200 transition-colors truncate">
              {label}
            </div>
            <div className="text-[10px] text-slate-400">Нажмите для просмотра</div>
          </div>
        </div>

        <div className="shrink-0 text-slate-400 group-hover:text-indigo-300 transition-colors">
          <Eye className="w-4 h-4" />
        </div>
      </button>
    );
  }

  if (type === 'photo' || type === 'sticker') {
    return (
      <div
        className="relative my-1.5 inline-block cursor-pointer group"
        onClick={() => onPreviewMedia && onPreviewMedia({ type, fileId, url, title: labelFor(type) })}
        title="Нажмите для полноэкранного просмотра"
      >
        {loading && (
          <div className="w-48 h-36 rounded-xl bg-slate-900/60 flex items-center justify-center text-xs text-slate-400 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400 mr-2" /> Загрузка…
          </div>
        )}
        <img
          src={url}
          alt={labelFor(type)}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          className={`rounded-xl max-h-72 w-auto object-cover hover:opacity-95 transition-all shadow-md group-hover:ring-2 group-hover:ring-indigo-500/50 ${
            loading ? 'hidden' : 'block'
          }`}
        />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center pointer-events-none">
          <span className="p-2 rounded-full bg-slate-900/80 text-white backdrop-blur-sm shadow-lg">
            <Maximize2 className="w-4 h-4" />
          </span>
        </div>
      </div>
    );
  }

  if (type === 'video' || type === 'video_note' || type === 'animation') {
    return (
      <div className="relative my-1.5 group inline-block">
        <video
          src={url}
          controls
          autoPlay
          className="rounded-xl max-h-72 w-auto"
        />
        <button
          type="button"
          onClick={() => onPreviewMedia && onPreviewMedia({ type, fileId, url, title: labelFor(type) })}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-900 transition-all shadow opacity-0 group-hover:opacity-100"
          title="Полноэкранный просмотр"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
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
    <button
      type="button"
      onClick={() => onPreviewMedia && onPreviewMedia({ type, fileId, url, title: labelFor(type) })}
      className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200 my-1 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60 hover:border-indigo-500/50 transition-colors"
      title="Просмотр и скачивание документа"
    >
      <Icon className="w-4 h-4" /> {labelFor(type)}
    </button>
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
