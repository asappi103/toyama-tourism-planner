import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_SPOT_IMAGE_URL } from '../types/tourism';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

interface SpotImageCarouselProps {
  images: string[];
  alt: string;
  heightClass?: string;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  onRemoveImage?: (index: number) => void;
  showSwipeHint?: boolean;
  roundedClass?: string;
  children?: React.ReactNode;
}

/**
 * 左右スワイプ（タッチ操作＆マウスドラッグ）および矢印ボタンで
 * 前後の写真へ切り替えられるスポット写真カルーセル
 */
export const SpotImageCarousel: React.FC<SpotImageCarouselProps> = ({
  images,
  alt,
  heightClass = 'h-48',
  activeIndex,
  onIndexChange,
  onRemoveImage,
  showSwipeHint = true,
  roundedClass = 'rounded-2xl',
  children,
}) => {
  const normalizedImages =
    images.length > 0 ? images : [DEFAULT_SPOT_IMAGE_URL];

  const [internalIndex, setInternalIndex] = useState(0);
  const currentIndex =
    activeIndex !== undefined
      ? Math.min(Math.max(0, activeIndex), normalizedImages.length - 1)
      : Math.min(internalIndex, normalizedImages.length - 1);

  const setIndex = (nextIdx: number) => {
    const count = normalizedImages.length;
    if (count <= 0) return;
    const wrapped = ((nextIdx % count) + count) % count;
    setInternalIndex(wrapped);
    onIndexChange?.(wrapped);
  };

  useEffect(() => {
    if (currentIndex >= normalizedImages.length) {
      setIndex(Math.max(0, normalizedImages.length - 1));
    }
  }, [normalizedImages.length]);

  // スワイプ検知用の状態（タッチ・マウスドラッグ両対応）
  const pointerStartXRef = useRef<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handlePointerStart = (clientX: number) => {
    if (normalizedImages.length <= 1) return;
    pointerStartXRef.current = clientX;
    setIsDragging(true);
    setDragOffsetX(0);
  };

  const handlePointerMove = (clientX: number) => {
    if (!isDragging || pointerStartXRef.current === null) return;
    const deltaX = clientX - pointerStartXRef.current;
    setDragOffsetX(deltaX);
  };

  const handlePointerEnd = () => {
    if (!isDragging || pointerStartXRef.current === null) return;
    const threshold = 36;
    if (dragOffsetX <= -threshold) {
      // 左スワイプ → 次の写真へ
      setIndex(currentIndex + 1);
    } else if (dragOffsetX >= threshold) {
      // 右スワイプ → 前の写真へ
      setIndex(currentIndex - 1);
    }
    pointerStartXRef.current = null;
    setIsDragging(false);
    setDragOffsetX(0);
  };

  return (
    <div
      className={`relative w-full ${heightClass} ${roundedClass} overflow-hidden bg-slate-900 select-none group`}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          handlePointerStart(e.touches[0].clientX);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          handlePointerMove(e.touches[0].clientX);
        }
      }}
      onTouchEnd={handlePointerEnd}
      onMouseDown={(e) => {
        if (e.button === 0) {
          handlePointerStart(e.clientX);
        }
      }}
      onMouseMove={(e) => {
        handlePointerMove(e.clientX);
      }}
      onMouseUp={handlePointerEnd}
      onMouseLeave={() => {
        if (isDragging) {
          handlePointerEnd();
        }
      }}
    >
      {/* スライドトラック */}
      <div
        className="w-full h-full flex"
        style={{
          transform: `translateX(calc(${-currentIndex * 100}% + ${dragOffsetX}px))`,
          transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {normalizedImages.map((imgSrc, idx) => (
          <div
            key={`slide-${idx}`}
            className="w-full h-full shrink-0 relative bg-slate-800"
          >
            <img
              src={imgSrc}
              alt={`${alt} (${idx + 1}/${normalizedImages.length})`}
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_SPOT_IMAGE_URL;
              }}
            />
          </div>
        ))}
      </div>

      {/* オーバーレイ子要素（タイトルやグラデーション等） */}
      {children}

      {/* 複数枚ある場合の左右切り替えボタン */}
      {normalizedImages.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex(currentIndex - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white border border-white/30 shadow-md flex items-center justify-center transition"
            aria-label="前の写真"
            title="前の写真（右スワイプ）"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex(currentIndex + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white border border-white/30 shadow-md flex items-center justify-center transition"
            aria-label="次の写真"
            title="次の写真（左スワイプ）"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* 枚数バッジ＆スワイプ案内 */}
      <div className="absolute bottom-2 right-2.5 z-20 flex items-center gap-1.5">
        {showSwipeHint && normalizedImages.length > 1 && (
          <span className="px-2 py-0.5 rounded-full bg-slate-900/75 text-sky-200 text-[10px] font-bold border border-white/15 backdrop-blur-sm">
            ⇄ 左右スワイプで切替
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[11px] font-extrabold border border-white/20 backdrop-blur-sm">
          {currentIndex + 1} / {normalizedImages.length}
        </span>
      </div>

      {/* ドットインジケーター（2枚以上時） */}
      {normalizedImages.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/50 backdrop-blur-sm">
          {normalizedImages.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all ${
                idx === currentIndex
                  ? 'w-4 bg-sky-400'
                  : 'w-1.5 bg-white/60 hover:bg-white'
              }`}
              aria-label={`${idx + 1}枚目の写真を表示`}
            />
          ))}
        </div>
      )}

      {/* 編集画面用の「現在の写真を削除」ボタン */}
      {onRemoveImage && normalizedImages.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveImage(currentIndex);
          }}
          className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-md border border-white/25 transition"
          title="表示中の写真を削除"
        >
          <Trash2 className="w-3 h-3" />
          <span>この写真を削除</span>
        </button>
      )}
    </div>
  );
};
