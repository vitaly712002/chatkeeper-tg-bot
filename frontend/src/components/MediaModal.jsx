import React, { useEffect, useState } from 'react';
import { X, Download, ExternalLink, FileText, Mic, Film, Image as ImageIcon, Loader2 } from 'lucide-react';

// Модальное окно (лайтбокс) для просмотра медиафайлов без принудительного скачивания.
export default function MediaModal({ media, onClose }) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!media) return null;

  const { type, url, title, fileId } = media;
  const defaultFilename = getFilename(type, fileId);

  // Скачивание файла с правильным расширением
  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Фолбэк на прямое открытие
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  };

  const Icon = iconFor(type);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] px-3 sm:px-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Верхняя панель управления */}
      <div
        className="w-full max-w-5xl flex items-center justify-between pb-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm sm:text-base text-slate-100 truncate block">
              {title || 'Медиафайл'}
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">({defaultFilename})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-lg disabled:opacity-50"
            title="Скачать файл с расширением"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Скачать</span>
          </button>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
            title="Открыть в новой вкладке"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Основная область отображения контента */}
      <div
        className="flex-1 flex items-center justify-center max-w-5xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'photo' || type === 'sticker' ? (
          <img
            src={url}
            alt={title || 'Фото'}
            className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl select-none"
          />
        ) : type === 'video' || type === 'video_note' || type === 'animation' ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-[82vh] rounded-xl shadow-2xl"
          />
        ) : type === 'voice' || type === 'audio' ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 w-full max-w-md">
            <div className="w-16 h-16 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Mic className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-slate-100">{title || 'Аудиозапись'}</h4>
              <p className="text-xs text-slate-400 mt-1">{defaultFilename}</p>
            </div>
            <audio src={url} controls autoPlay className="w-full" />
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 w-full max-w-md">
            <div className="w-16 h-16 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <FileText className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-slate-100">{title || 'Документ'}</h4>
              <p className="text-xs text-slate-400 mt-1">{defaultFilename}</p>
            </div>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Скачать документ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getFilename(type, fileId) {
  const short = fileId ? fileId.slice(-8) : 'file';
  switch (type) {
    case 'photo':
      return `photo_${short}.jpg`;
    case 'sticker':
      return `sticker_${short}.webp`;
    case 'video':
      return `video_${short}.mp4`;
    case 'video_note':
      return `circle_${short}.mp4`;
    case 'animation':
      return `animation_${short}.mp4`;
    case 'voice':
      return `voice_${short}.ogg`;
    case 'audio':
      return `audio_${short}.mp3`;
    case 'document':
      return `document_${short}`;
    default:
      return `media_${short}`;
  }
}

function iconFor(type) {
  if (type === 'document') return FileText;
  if (type === 'voice' || type === 'audio') return Mic;
  if (type === 'sticker') return ImageIcon;
  if (type === 'photo') return ImageIcon;
  return Film;
}
