import React from 'react';
import { CATEGORY_META, getSpotImages, Spot } from '../types/tourism';
import { SpotImageCarousel } from './SpotImageCarousel';
import {
  Clock,
  ExternalLink,
  GraduationCap,
  MapPin,
  Navigation,
  Pencil,
  Pin,
  Wallet,
  X,
} from 'lucide-react';

interface SpotDetailModalProps {
  spot: Spot | null;
  onClose: () => void;
  isPinned: boolean;
  onTogglePinSpot: (spotId: string) => void;
  onCenterOnMap: (spot: Spot) => void;
  onEditSpot: (spot: Spot) => void;
}

export const SpotDetailModal: React.FC<SpotDetailModalProps> = ({
  spot,
  onClose,
  isPinned,
  onTogglePinSpot,
  onCenterOnMap,
  onEditSpot,
}) => {
  if (!spot) return null;

  const meta = CATEGORY_META[spot.category];
  const googleMapsSpotUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  const spotImages = getSpotImages(spot);

  return (
    <div
      className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー画像エリア（左右スワイプ対応カルーセル） */}
        <SpotImageCarousel
          images={spotImages}
          alt={spot.name}
          heightClass="h-56 sm:h-64"
          roundedClass="rounded-none"
          showSwipeHint={true}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent pointer-events-none" />

          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-30 w-9 h-9 rounded-full bg-slate-900/65 hover:bg-slate-900 text-white flex items-center justify-center transition"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>

          {/* カテゴリ＆エリアバッジ */}
          <div className="absolute top-3.5 left-3.5 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-md"
              style={{ backgroundColor: meta.color }}
            >
              {meta.label}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/90 text-slate-800 shadow-md">
              {spot.area}
            </span>
          </div>

          {/* スポットタイトル */}
          <div className="absolute bottom-8 left-4 right-4 z-20 text-white pointer-events-none">
            <h2 className="text-xl sm:text-2xl font-bold leading-snug drop-shadow">
              {spot.name}
            </h2>
          </div>
        </SpotImageCarousel>

        {/* コンテンツ本体 */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 基本メタ情報バー */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="w-4 h-4 text-sky-600 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  推奨滞在時間
                </div>
                <div className="font-bold text-slate-900">
                  約 {spot.stayDurationMinutes} 分
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  料金・予算目安
                </div>
                <div className="font-bold text-slate-900">{spot.priceRange}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  営業時間
                </div>
                <div className="font-bold text-slate-900">
                  {spot.openingHours}
                </div>
              </div>
            </div>
          </div>

          {/* スポット概要解説 */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              スポット概要
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {spot.description}
            </p>
          </div>

          {/* 富山大学 都市デザイン学部 フィールドワーク知見・推しコメント */}
          <div className="bg-gradient-to-br from-sky-50 via-indigo-50/60 to-emerald-50/40 border border-sky-200 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-900">
                <GraduationCap className="w-4 h-4 text-sky-600" />
                <span>
                  富山大学 都市デザイン学部 フィールドワーク知見・推しコメント
                </span>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-600 text-white">
                {spot.researcherGroup}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
              「{spot.studentComment}」
            </p>
          </div>

          {/* 座標・外部リンク情報 */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
            <span>
              座標: 北緯 {spot.lat.toFixed(4)}° / 東経 {spot.lng.toFixed(4)}°
            </span>
            <div className="flex items-center gap-3">
              {spot.officialUrl && (
                <a
                  href={spot.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 hover:text-sky-800 font-bold inline-flex items-center gap-1 underline"
                >
                  <span>公式サイト</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <a
                href={googleMapsSpotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:text-sky-800 font-bold inline-flex items-center gap-1 underline"
              >
                <span>Googleマップで見る</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* アクションボタン群 */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={() => onTogglePinSpot(spot.id)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border ${
                isPinned
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                  : 'bg-white hover:bg-rose-50 text-slate-800 border-slate-300'
              }`}
            >
              <Pin className="w-4 h-4" />
              <span>
                {isPinned
                  ? 'ルートへのピン留めを解除'
                  : 'このスポットをルートにピン留め（必須立寄）'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onEditSpot(spot)}
              className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center gap-1.5 transition"
            >
              <Pencil className="w-4 h-4" />
              <span>位置・詳細を編集</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onCenterOnMap(spot);
                onClose();
              }}
              className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Navigation className="w-4 h-4" />
              <span>マップの中心に表示</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
