import React, { useState, useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light.min.js';
import { Smile, Loader2, Maximize2 } from 'lucide-react';

/**
 * StickerMedia — универсальный компонент для отображения Telegram-стикеров всех форматов:
 *  1. Статичные стикеры (.webp, .png) -> <img>
 *  2. Видео-стикеры (.webm VP9) -> <video autoPlay loop muted playsInline>
 *  3. Векторные анимированные стикеры (.tgs) -> Lottie (gzip JSON Bodymovin) через SVG/Canvas
 *  4. Если стикер недоступен (404/ошибка) -> аккуратная заглушка вместо битой картинки
 */
export default function StickerMedia({
  url,
  fileId,
  isModal = false,
  className = '',
  onPreviewMedia,
}) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'lottie' | 'video' | 'image' | 'error'
  const [blobUrl, setBlobUrl] = useState(null);
  const [animationData, setAnimationData] = useState(null);
  const containerRef = useRef(null);
  const animInstanceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    setStatus('loading');
    setBlobUrl(null);
    setAnimationData(null);

    async function fetchAndDetect() {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const bytes = new Uint8Array(buffer);

        // 1. Проверяем сигнатуру GZIP: 0x1F, 0x8B -> это TGS (векторный стикер Telegram)
        const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

        // 2. Проверяем WebM: сигнатура EBML 0x1A, 0x45, 0xDF, 0xA3 или video Content-Type
        const isWebm =
          (bytes.length > 4 &&
            bytes[0] === 0x1a &&
            bytes[1] === 0x45 &&
            bytes[2] === 0xdf &&
            bytes[3] === 0xa3) ||
          contentType.includes('video') ||
          contentType.includes('webm');

        if (isGzip || contentType.includes('tgsticker')) {
          try {
            if (typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('gzip');
              const writer = ds.writable.getWriter();
              writer.write(buffer);
              writer.close();
              const decompressed = await new Response(ds.readable).arrayBuffer();
              const jsonStr = new TextDecoder().decode(decompressed);
              const data = JSON.parse(jsonStr);
              if (!cancelled) {
                setAnimationData(data);
                setStatus('lottie');
              }
              return;
            }
          } catch (e) {
            console.warn('[StickerMedia] Ошибка распаковки TGS Lottie:', e);
          }
          // Если декомпрессия не удалась, пробуем показать как изображение
          const blob = new Blob([buffer], { type: 'image/webp' });
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setBlobUrl(createdUrl);
            setStatus('image');
          }
        } else if (isWebm) {
          const blob = new Blob([buffer], { type: 'video/webm' });
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setBlobUrl(createdUrl);
            setStatus('video');
          }
        } else {
          // Обычный статичный WebP / PNG / JPEG
          const mimeType = contentType.startsWith('image/') ? contentType : 'image/webp';
          const blob = new Blob([buffer], { type: mimeType });
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setBlobUrl(createdUrl);
            setStatus('image');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[StickerMedia] Не удалось загрузить стикер:', err);
          setStatus('error');
        }
      }
    }

    fetchAndDetect();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [url]);

  // Запуск Lottie-анимации для TGS
  useEffect(() => {
    if (status !== 'lottie' || !animationData || !containerRef.current) return;

    if (animInstanceRef.current) {
      animInstanceRef.current.destroy();
      animInstanceRef.current = null;
    }

    try {
      animInstanceRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: animationData,
      });
    } catch (err) {
      console.warn('[StickerMedia] Ошибка инициализации lottie-web:', err);
    }

    return () => {
      if (animInstanceRef.current) {
        animInstanceRef.current.destroy();
        animInstanceRef.current = null;
      }
    };
  }, [status, animationData]);

  // Размеры контейнера в зависимости от контекста (сообщение или модальное окно)
  const sizeClasses = isModal
    ? 'w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96'
    : 'w-44 h-44 sm:w-48 sm:h-48';

  if (status === 'loading') {
    return (
      <div
        className={`${sizeClasses} rounded-2xl bg-slate-900/40 border border-slate-800/40 flex flex-col items-center justify-center text-slate-400 gap-2 select-none animate-pulse ${className}`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-xs">Загрузка стикера…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`${sizeClasses} rounded-2xl bg-slate-900/60 border border-slate-800/60 flex flex-col items-center justify-center p-3 text-center text-slate-400 gap-1.5 select-none ${className}`}
        title="Стикер недоступен на серверах Telegram"
      >
        <Smile className="w-8 h-8 text-slate-500 stroke-1" />
        <span className="text-xs font-medium text-slate-300">Стикер недоступен</span>
        <span className="text-[10px] text-slate-500 leading-tight">Файл удалён или недоступен в Telegram</span>
      </div>
    );
  }

  const content = (
    <div className={`relative flex items-center justify-center ${sizeClasses} select-none ${className}`}>
      {status === 'lottie' && (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center" />
      )}

      {status === 'video' && blobUrl && (
        <video
          src={blobUrl}
          autoPlay
          loop
          muted
          playsInline
          className="max-w-full max-h-full object-contain pointer-events-none"
        />
      )}

      {status === 'image' && blobUrl && (
        <img
          src={blobUrl}
          alt="Стикер"
          className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-md"
        />
      )}
    </div>
  );

  // Если это просмотр в модалке — клик по нему не нужен
  if (isModal) {
    return content;
  }

  // Если это в ленте сообщений — оборачиваем с возможностью клика для увеличения
  return (
    <div
      className="relative my-1 inline-block cursor-pointer group"
      onClick={() =>
        onPreviewMedia &&
        onPreviewMedia({
          type: 'sticker',
          fileId,
          url,
          title: 'Стикер',
        })
      }
      title="Нажмите для полноэкранного просмотра"
    >
      {content}
      <div className="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center pointer-events-none">
        <span className="p-2 rounded-full bg-slate-900/80 text-white backdrop-blur-sm shadow-lg">
          <Maximize2 className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}
