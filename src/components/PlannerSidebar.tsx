import React, { useMemo, useRef, useState } from 'react';
import {
  ALL_CATEGORIES,
  CATEGORY_META,
  DestinationType,
  estimateRouteBudgetJa,
  getOneSentenceStudentAppeal,
  getSpotImages,
  OptimizedRoute,
  OriginPoint,
  RouteCondition,
  SPOT_AREAS,
  Spot,
  SpotArea,
  SpotCategory,
  TransportMode,
} from '../types/tourism';
import {
  formatMinutesToClockTime,
  optimizeTourismRoute,
  parseTimeToMinutes,
} from '../utils/routeOptimizer';
import { SpotImageCarousel } from './SpotImageCarousel';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BedDouble,
  Bike,
  BookOpen,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Database,
  ExternalLink,
  Filter,
  Footprints,
  GraduationCap,
  ListOrdered,
  MapPin,
  Minus,
  Navigation,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Route,
  Search,
  Share2,
  Sparkles,
  TrainFront,
  Trash2,
  Wallet,
} from 'lucide-react';

interface PlannerSidebarProps {
  spots: Spot[];
  origins: OriginPoint[];
  condition: RouteCondition;
  onUpdateCondition: (partial: Partial<RouteCondition>) => void;
  activeRoute: OptimizedRoute;
  isCustomRouteOrder: boolean;
  onMoveRouteSpot: (index: number, direction: 'up' | 'down') => void;
  onRemoveRouteSpot: (index: number) => void;
  onAddSpotToRoute: (spot: Spot) => void;
  onAdjustSpotStayDuration: (spotId: string, deltaMinutes: number) => void;
  onResetRouteOrder: () => void;
  onRecalculateRoute: () => void;
  onCopyShareUrl: () => void;
  selectedSpot: Spot | null;
  onSelectSpotOnMap: (spot: Spot | null) => void;
  onOpenSpotDetail: (spot: Spot) => void;
  onEditSpot: (spot: Spot) => void;
  onTogglePinSpot: (spotId: string) => void;
  onAddCustomOrigin: (newOrigin: OriginPoint) => void;
  onDeleteCustomOrigin: (originId: string) => void;
  onStartPickOriginOnMap: () => void;
  pickedOriginCoordinate: { lat: number; lng: number } | null;
  onOpenDataManager: () => void;
}

const TIME_BUDGET_OPTIONS = [
  { minutes: 60, label: '1時間（60分・短時間立寄プラン）' },
  { minutes: 90, label: '1時間半（90分・スキマ時間プラン）' },
  { minutes: 120, label: '2時間（120分・短時間回遊）' },
  { minutes: 240, label: '4時間（240分・半日プラン）' },
  { minutes: 360, label: '6時間（360分・充実プラン）' },
  { minutes: 480, label: '8時間（480分・日帰りフル）' },
  { minutes: 720, label: '1泊2日（720分・宿泊滞在プラン）' },
  { minutes: 1440, label: '2泊3日（1440分・県内広域周遊プラン）' },
];

// 15分刻みの時刻選択肢（00:00 〜 23:45）
const FIFTEEN_MINUTE_TIME_OPTIONS: string[] = Array.from(
  { length: 96 },
  (_, idx) => {
    const totalMin = idx * 15;
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
);

function formatMinutesJa(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}分`;
  if (mins === 0) return `${hours}時間`;
  return `${hours}時間${mins}分`;
}

// 総滞在時間用の「何時間何分」表記ヘルパー
function formatHoursAndMinutesJa(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}時間${mins}分`;
}

export const PlannerSidebar: React.FC<PlannerSidebarProps> = ({
  spots,
  origins,
  condition,
  onUpdateCondition,
  activeRoute,
  isCustomRouteOrder,
  onMoveRouteSpot,
  onRemoveRouteSpot,
  onAddSpotToRoute,
  onAdjustSpotStayDuration,
  onResetRouteOrder,
  onRecalculateRoute,
  onCopyShareUrl,
  selectedSpot,
  onSelectSpotOnMap,
  onOpenSpotDetail,
  onEditSpot,
  onTogglePinSpot,
  onAddCustomOrigin,
  onDeleteCustomOrigin,
  onStartPickOriginOnMap,
  pickedOriginCoordinate,
  onOpenDataManager,
}) => {
  const [activeTab, setActiveTab] = useState<
    'planner' | 'model_routes' | 'catalog'
  >('planner');
  const [isConditionExpanded, setIsConditionExpanded] = useState(true);
  const [isMobileExpanded, setIsMobileExpanded] = useState(true);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const timelineSectionRef = useRef<HTMLDivElement | null>(null);

  // ③ モデルルートタブ用の出発拠点・観光可能時間フィルタ状態
  const [modelOriginFilter, setModelOriginFilter] = useState<string>('ALL');
  const [modelTimeFilter, setModelTimeFilter] = useState<number | 'ALL'>('ALL');

  // 新しいカスタム起点追加フォームの状態
  const [showOriginForm, setShowOriginForm] = useState(false);
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginLat, setNewOriginLat] = useState('36.7013');
  const [newOriginLng, setNewOriginLng] = useState('137.2133');

  // スポット一覧タブ用の検索・フィルタ状態
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<SpotArea | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<SpotCategory | 'ALL'>(
    'ALL'
  );

  // ③ 各出発拠点別に、それぞれの観光可能時間ごとのモデルルートを算出
  const modelRoutesByOrigin = useMemo(() => {
    return origins
      .filter((origin) =>
        modelOriginFilter === 'ALL' ? true : origin.id === modelOriginFilter
      )
      .map((origin) => {
        const plans = TIME_BUDGET_OPTIONS.filter((opt) =>
          modelTimeFilter === 'ALL' ? true : opt.minutes === modelTimeFilter
        ).map((timeOpt) => {
          const defaultMode: TransportMode =
            origin.id === 'origin-toyama-airport' || timeOpt.minutes >= 480
              ? 'car'
              : 'public';
          const includeStay = timeOpt.minutes >= 720;
          const baseCond: RouteCondition = {
            originId: origin.id,
            destinationType:
              timeOpt.minutes <= 90 ? 'end_at_last_spot' : 'return_to_origin',
            destinationOriginId: origin.id,
            startTime: '09:00',
            endTime: '15:00',
            availableMinutes: timeOpt.minutes,
            includeStay,
            transportMode: defaultMode,
            preferredCategories: ALL_CATEGORIES,
            pinnedSpotIds: [],
          };

          let route = optimizeTourismRoute(spots, origins, baseCond);
          // 短時間プラン等で公共交通では到達スポットが0件になる場合は車移動または片道終着で補完
          if (route.orderedSpots.length === 0) {
            route = optimizeTourismRoute(spots, origins, {
              ...baseCond,
              destinationType: 'end_at_last_spot',
              transportMode: 'car',
            });
          }

          return {
            timeOption: timeOpt,
            route,
            budgetText: estimateRouteBudgetJa(route.orderedSpots),
            conditionToApply: {
              ...baseCond,
              destinationType: route.destinationType,
              transportMode: route.transportMode,
            } as RouteCondition,
          };
        });

        return {
          origin,
          plans,
        };
      });
  }, [origins, spots, modelOriginFilter, modelTimeFilter]);

  // マップクリックで起点座標を取得した際にフォームを自動展開して反映
  React.useEffect(() => {
    if (pickedOriginCoordinate) {
      setShowOriginForm(true);
      setIsConditionExpanded(true);
      setActiveTab('planner');
      setNewOriginLat(String(pickedOriginCoordinate.lat));
      setNewOriginLng(String(pickedOriginCoordinate.lng));
      if (!newOriginName) {
        setNewOriginName('カスタム出発拠点');
      }
    }
  }, [pickedOriginCoordinate, newOriginName]);

  // カタログフィルタ結果
  const catalogSpots = useMemo(() => {
    return spots.filter((spot) => {
      if (areaFilter !== 'ALL' && spot.area !== areaFilter) return false;
      if (categoryFilter !== 'ALL' && spot.category !== categoryFilter)
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = spot.name.toLowerCase().includes(q);
        const matchDesc = spot.description.toLowerCase().includes(q);
        const matchComment = spot.studentComment.toLowerCase().includes(q);
        return matchName || matchDesc || matchComment;
      }
      return true;
    });
  }, [spots, areaFilter, categoryFilter, searchQuery]);

  // カスタム起点の登録ハンドラ
  const handleCreateCustomOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = parseFloat(newOriginLat);
    const parsedLng = parseFloat(newOriginLng);
    if (!newOriginName.trim() || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return;
    }
    const created: OriginPoint = {
      id: `origin-custom-${Date.now()}`,
      name: newOriginName.trim(),
      lat: parsedLat,
      lng: parsedLng,
      area: '富山市エリア',
      isCustom: true,
    };
    onAddCustomOrigin(created);
    setNewOriginName('');
    setShowOriginForm(false);
  };

  // 優先カテゴリのトグル
  const handleTogglePreferredCategory = (cat: SpotCategory) => {
    const exists = condition.preferredCategories.includes(cat);
    const next = exists
      ? condition.preferredCategories.filter((c) => c !== cat)
      : [...condition.preferredCategories, cat];
    onUpdateCondition({ preferredCategories: next });
  };

  return (
    <aside
      className={`w-full md:w-[440px] lg:w-[460px] shrink-0 bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl transition-all ${
        isMobileExpanded ? 'h-[62vh] md:h-full' : 'h-[76px] md:h-full'
      }`}
    >
      {/* ブランドヘッダー：立山連峰コバルトブルー＆都市デザイングラデーション */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white px-3.5 pt-3 pb-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shadow-inner shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-extrabold tracking-wide px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 border border-sky-400/30 whitespace-nowrap">
                富大生発 -富山のまちなか観光ルートの開発-
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {/* サイト自体をリンク共有するボタン */}
                <button
                  type="button"
                  onClick={() => {
                    onCopyShareUrl();
                    setCopiedShareUrl(true);
                    setTimeout(() => setCopiedShareUrl(false), 2500);
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      navigator
                        .share({
                          title:
                            '富大生発 -富山のまちなか観光ルートの開発- | TOYAMA NAVI LAB — Design Your Own Toyama.',
                          text: '富山県の観光ルートを自動算出・ナビゲーションする TOYAMA NAVI LAB',
                          url: window.location.href,
                        })
                        .catch(() => {
                          // キャンセル時はクリップボードコピー済み
                        });
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-sky-500/25 hover:bg-sky-500/40 border border-sky-400/40 text-sky-100 text-[10px] font-bold inline-flex items-center gap-1 transition whitespace-nowrap"
                  title="このサイトの共有リンクをコピー"
                >
                  {copiedShareUrl ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-300" />
                      <span className="text-emerald-200">コピー済</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3 h-3 text-sky-300" />
                      <span>サイト共有</span>
                    </>
                  )}
                </button>

                {/* モバイル用ドロワー開閉ボタン */}
                <button
                  type="button"
                  onClick={() => setIsMobileExpanded((prev) => !prev)}
                  className="md:hidden p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
                  aria-label="パネル開閉"
                >
                  {isMobileExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* ④ 1行に収まるよう文字サイズを調整し改行を防止 */}
            <h1 className="text-[11px] sm:text-[12.5px] font-extrabold tracking-tight text-white mt-1 whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
              TOYAMA NAVI LAB — Design Your Own Toyama.
            </h1>
          </div>
        </div>

        {/* 4タブナビゲーション：「ルート算出」「モデルルート」「スポット」「データ管理」 */}
        <div className="grid grid-cols-4 gap-1 mt-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('planner');
              setIsMobileExpanded(true);
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition whitespace-nowrap ${
              activeTab === 'planner'
                ? 'bg-sky-500 text-white shadow-md'
                : 'bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
          >
            <Route className="w-3.5 h-3.5 shrink-0" />
            <span>ルート算出</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('model_routes');
              setIsMobileExpanded(true);
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition whitespace-nowrap ${
              activeTab === 'model_routes'
                ? 'bg-sky-500 text-white shadow-md'
                : 'bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>モデルルート</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('catalog');
              setIsMobileExpanded(true);
            }}
            className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'bg-sky-500 text-white shadow-md'
                : 'bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 shrink-0" />
            <span>スポット({spots.length})</span>
          </button>

          <button
            type="button"
            onClick={onOpenDataManager}
            className="py-2 px-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 bg-emerald-600/90 hover:bg-emerald-500 text-white transition shadow-sm whitespace-nowrap"
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>データ管理</span>
          </button>
        </div>
      </div>

      {/* メインスクロール領域 */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
        {activeTab === 'planner' ? (
          <>
            {/* セクション1：観光条件設定パネル */}
            <div className="p-4 bg-slate-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <button
                  type="button"
                  onClick={() => setIsConditionExpanded((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 uppercase tracking-wider"
                >
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>観光条件・発着拠点の設定</span>
                  {isConditionExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsConditionExpanded(true);
                    setShowOriginForm((prev) => !prev);
                  }}
                  className="text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-sky-100/80 hover:bg-sky-200/70 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>＋新しい起点を追加</span>
                </button>
              </div>

              {/* FE-1: 折りたたみ時も現在の設定条件がひと目で分かりワンクリックで再展開できる要約バー */}
              {!isConditionExpanded && (
                <button
                  type="button"
                  onClick={() => setIsConditionExpanded(true)}
                  className="w-full text-left bg-white hover:bg-sky-50/60 border border-slate-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm transition"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      発: {activeRoute.origin.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                      {condition.startTime || '09:00'}〜{condition.endTime || '15:00'}（
                      {formatHoursAndMinutesJa(condition.availableMinutes)}）
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800">
                      {condition.transportMode === 'public'
                        ? '鉄道・交通'
                        : condition.transportMode === 'car'
                        ? '車'
                        : condition.transportMode === 'bicycle'
                        ? '自転車'
                        : '徒歩'}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-sky-600 inline-flex items-center gap-0.5 shrink-0">
                    <span>条件を変更</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}

              {isConditionExpanded && (
                <div className="space-y-3 text-xs">
                  {/* 新しい起点追加フォーム（展開時） */}
                  {showOriginForm && (
                    <form
                      onSubmit={handleCreateCustomOrigin}
                      className="bg-white p-3 rounded-2xl border-2 border-sky-200 shadow-sm space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-900 text-xs">
                          新しい出発・到着拠点を追加（自動保存）
                        </span>
                        <button
                          type="button"
                          onClick={onStartPickOriginOnMap}
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>マップクリックで座標取得</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        required
                        value={newOriginName}
                        onChange={(e) => setNewOriginName(e.target.value)}
                        placeholder="拠点名（例：富山大学 五福キャンパス / 氷見駅）"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-semibold">
                            北緯 (lat)
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={newOriginLat}
                            onChange={(e) => setNewOriginLat(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-semibold">
                            東経 (lng)
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={newOriginLng}
                            onChange={(e) => setNewOriginLng(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-slate-300 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowOriginForm(false)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold"
                        >
                          キャンセル
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 rounded-lg bg-sky-600 text-white font-bold"
                        >
                          拠点を登録して選択
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 出発地（起点）セレクタ */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      出発地（起点）を選択
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="出発地（起点）を選択"
                        value={condition.originId}
                        onChange={(e) =>
                          onUpdateCondition({ originId: e.target.value })
                        }
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:border-sky-500 focus:outline-none"
                      >
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} {o.isCustom ? '（カスタム追加）' : ''}
                          </option>
                        ))}
                      </select>

                      {/* カスタム拠点選択時は削除ボタンを表示 */}
                      {origins.find((o) => o.id === condition.originId)
                        ?.isCustom && (
                        <button
                          type="button"
                          onClick={() =>
                            onDeleteCustomOrigin(condition.originId)
                          }
                          className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                          title="このカスタム起点を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 終着地タイプ選択 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        帰着・終着スタイル
                      </label>
                      <select
                        aria-label="帰着・終着スタイル"
                        value={condition.destinationType}
                        onChange={(e) =>
                          onUpdateCondition({
                            destinationType: e.target.value as DestinationType,
                          })
                        }
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                      >
                        <option value="return_to_origin">出発地に戻る</option>
                        <option value="another_origin">別の拠点へ抜ける</option>
                        <option value="end_at_last_spot">
                          最終スポットで終了
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        観光可能時間（プラン選択）
                      </label>
                      <select
                        aria-label="観光可能時間"
                        value={condition.availableMinutes}
                        onChange={(e) => {
                          const minutes = Number(e.target.value);
                          const startMin = parseTimeToMinutes(
                            condition.startTime || '09:00',
                            540
                          );
                          const endTotal = (startMin + minutes) % 1440;
                          const roundedEndMin =
                            (Math.round(endTotal / 15) * 15) % 1440;
                          const nextEnd = `${String(
                            Math.floor(roundedEndMin / 60)
                          ).padStart(2, '0')}:${String(
                            roundedEndMin % 60
                          ).padStart(2, '0')}`;

                          onUpdateCondition({
                            availableMinutes: minutes,
                            endTime: nextEnd,
                            ...(minutes >= 720
                              ? { includeStay: true }
                              : minutes <= 120
                              ? { includeStay: false }
                              : {}),
                          });
                        }}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sky-900"
                      >
                        {!TIME_BUDGET_OPTIONS.some(
                          (opt) => opt.minutes === condition.availableMinutes
                        ) && (
                          <option value={condition.availableMinutes}>
                            時刻指定（{formatHoursAndMinutesJa(condition.availableMinutes)} / {condition.availableMinutes}分）
                          </option>
                        )}
                        {TIME_BUDGET_OPTIONS.map((opt) => (
                          <option key={opt.minutes} value={opt.minutes}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 観光スタート時刻 ＆ 観光終了予定時刻（15分刻みセレクタ） */}
                  <div className="bg-sky-50/70 p-2.5 rounded-xl border border-sky-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-sky-600" />
                        <span>観光スタート時刻・終了予定時刻（15分刻み）</span>
                      </span>
                      <span className="text-[10px] font-bold text-sky-700 bg-white px-2 py-0.5 rounded-full border border-sky-200">
                        計 {formatHoursAndMinutesJa(condition.availableMinutes)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          観光スタート時刻
                        </label>
                        <select
                          aria-label="観光スタート時刻"
                          value={condition.startTime || '09:00'}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            const currentEnd = condition.endTime || '15:00';
                            const sMin = parseTimeToMinutes(nextStart, 540);
                            const eMin = parseTimeToMinutes(currentEnd, 900);
                            let diff = eMin - sMin;
                            if (diff <= 0) diff += 1440;
                            // FE-3: 1泊2日(720分)・2泊3日(1440分)の宿泊プラン選択中はその時間枠を維持
                            const isMultiDayStay =
                              condition.includeStay &&
                              condition.availableMinutes >= 720;
                            onUpdateCondition({
                              startTime: nextStart,
                              endTime: currentEnd,
                              availableMinutes: isMultiDayStay
                                ? condition.availableMinutes
                                : Math.max(15, diff),
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                        >
                          {FIFTEEN_MINUTE_TIME_OPTIONS.map((t) => (
                            <option key={`start-${t}`} value={t}>
                              {t} スタート
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          観光終了予定時刻
                        </label>
                        <select
                          aria-label="観光終了予定時刻"
                          value={condition.endTime || '15:00'}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            const currentStart = condition.startTime || '09:00';
                            const sMin = parseTimeToMinutes(currentStart, 540);
                            const eMin = parseTimeToMinutes(nextEnd, 900);
                            let diff = eMin - sMin;
                            if (diff <= 0) diff += 1440;
                            // FE-3: 1泊2日(720分)・2泊3日(1440分)の宿泊プラン選択中はその時間枠を維持
                            const isMultiDayStay =
                              condition.includeStay &&
                              condition.availableMinutes >= 720;
                            onUpdateCondition({
                              startTime: currentStart,
                              endTime: nextEnd,
                              availableMinutes: isMultiDayStay
                                ? condition.availableMinutes
                                : Math.max(15, diff),
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                        >
                          {FIFTEEN_MINUTE_TIME_OPTIONS.map((t) => (
                            <option key={`end-${t}`} value={t}>
                              {t} 終了予定
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 別拠点へ抜ける場合の到着拠点選択 */}
                  {condition.destinationType === 'another_origin' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        最終到着拠点を選択
                      </label>
                      <select
                        aria-label="最終到着拠点を選択"
                        value={
                          condition.destinationOriginId || origins[0]?.id || ''
                        }
                        onChange={(e) =>
                          onUpdateCondition({
                            destinationOriginId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                      >
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 宿泊有無 ＆ 移動手段トグル */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        宿泊の有無
                      </label>
                      <div className="grid grid-cols-2 bg-slate-200/80 p-1 rounded-xl gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({ includeStay: false })
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition ${
                            !condition.includeStay
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          日帰り
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({ includeStay: true })
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                            condition.includeStay
                              ? 'bg-indigo-700 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <BedDouble className="w-3 h-3" />
                          <span>宿泊あり</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        移動手段モード（鉄道は路線上、車・自転車・徒歩は道路上にルート描画）
                      </label>
                      <div className="grid grid-cols-4 bg-slate-200/80 p-1 rounded-xl gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({
                              transportMode: 'public' as TransportMode,
                            })
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                            condition.transportMode === 'public'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <TrainFront className="w-3 h-3 shrink-0" />
                          <span>鉄道・交通</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({
                              transportMode: 'car' as TransportMode,
                            })
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                            condition.transportMode === 'car'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Car className="w-3 h-3 shrink-0" />
                          <span>車</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({
                              transportMode: 'bicycle' as TransportMode,
                            })
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                            condition.transportMode === 'bicycle'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Bike className="w-3 h-3 shrink-0" />
                          <span>自転車</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCondition({
                              transportMode: 'walk' as TransportMode,
                            })
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                            condition.transportMode === 'walk'
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Footprints className="w-3 h-3 shrink-0" />
                          <span>徒歩</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 重視したいカテゴリ選択チップ */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      優先して組み込みたいカテゴリ（複数選択可）
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_CATEGORIES.map((cat) => {
                        const meta = CATEGORY_META[cat];
                        const isSelected =
                          condition.preferredCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleTogglePreferredCategory(cat)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                              isSelected
                                ? 'text-white shadow-sm'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            }`}
                            style={
                              isSelected
                                ? {
                                    backgroundColor: meta.color,
                                    borderColor: meta.color,
                                  }
                                : undefined
                            }
                          >
                            {meta.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ピン留め中のスポット表示 */}
                  {condition.pinnedSpotIds.length > 0 && (
                    <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-2.5">
                      <div className="text-[11px] font-bold text-rose-800 mb-1 flex items-center gap-1">
                        <Pin className="w-3 h-3" />
                        <span>必須立寄（ピン留め）スポット:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {condition.pinnedSpotIds.map((id) => {
                          const sp = spots.find((s) => s.id === id);
                          if (!sp) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-rose-300 text-[11px] font-bold text-rose-700"
                            >
                              {sp.name}
                              <button
                                type="button"
                                onClick={() => onTogglePinSpot(id)}
                                className="hover:text-rose-950 ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 最適ルート算出実行ボタン（FE-1: 押下時に条件パネルを折りたたみタイムラインへスムーズスクロール） */}
                  <button
                    type="button"
                    onClick={() => {
                      onRecalculateRoute();
                      setIsConditionExpanded(false);
                      setTimeout(() => {
                        timelineSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }, 80);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>最適観光ルートを算出</span>
                  </button>
                </div>
              )}
            </div>

            {/* セクション2：算出結果サマリー＆タイムライン */}
            <div ref={timelineSectionRef} className="p-4 space-y-4">
              {/* サマリー指標カード */}
              <div
                className={`text-white p-4 rounded-2xl shadow-lg space-y-3 ${
                  activeRoute.isOverBudget
                    ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-amber-950 border-2 border-rose-400/60'
                    : 'bg-gradient-to-br from-slate-900 to-sky-950'
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                  <div>
                    <div className="text-[10px] text-sky-300 font-bold uppercase tracking-wider">
                      算出された最適タイムライン（上限 {condition.availableMinutes}
                      分以内）
                    </div>
                    <div className="text-lg font-extrabold tracking-tight mt-0.5">
                      合計 {formatMinutesJa(activeRoute.totalMinutes)}
                      <span className="text-xs font-normal text-sky-200 ml-1.5">
                        （{activeRoute.totalMinutes}分 / 上限
                        {condition.availableMinutes}分）
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-sky-500/30 border border-sky-400/40 text-xs font-extrabold text-sky-200">
                      全 {activeRoute.orderedSpots.length} スポット
                    </span>
                  </div>
                </div>

                {/* FE-4: 制限時間超過時の赤色警告バナー */}
                {activeRoute.isOverBudget && (
                  <div className="bg-rose-500/25 border border-rose-400/60 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-rose-100 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
                    <span>
                      設定した観光可能時間を{' '}
                      <strong className="text-white underline">
                        +{activeRoute.overBudgetMinutes}分（
                        {formatMinutesJa(activeRoute.overBudgetMinutes || 0)}）
                      </strong>{' '}
                      超過しています。スポット数または滞在時間を調整してください。
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white/10 rounded-xl p-2">
                    <div className="text-[10px] text-slate-300">総移動時間</div>
                    <div className="font-bold text-white mt-0.5">
                      {activeRoute.totalTravelMinutes}分
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2">
                    <div className="text-[10px] text-slate-300">総滞在時間</div>
                    <div className="font-bold text-white mt-0.5">
                      {formatHoursAndMinutesJa(activeRoute.totalStayMinutes)}
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2">
                    <div className="text-[10px] text-slate-300">総移動距離</div>
                    <div className="font-bold text-white mt-0.5">
                      約 {activeRoute.totalDistanceKm} km
                    </div>
                  </div>
                </div>

                {/* Googleマップ全行程ナビ起動ボタン ＆ BE-5: ルート共有URLコピーボタン */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <a
                      href={activeRoute.googleMapsFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Googleマップで全行程ナビを起動</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        onCopyShareUrl();
                        setCopiedShareUrl(true);
                        setTimeout(() => setCopiedShareUrl(false), 2500);
                      }}
                      className="py-2.5 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/20 transition shrink-0"
                      title="現在のルートと条件を共有用URLとしてコピー"
                    >
                      {copiedShareUrl ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span className="text-emerald-200">URLコピー済</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 text-sky-300" />
                          <span>共有URL</span>
                        </>
                      )}
                    </button>
                  </div>
                  {activeRoute.transportMode === 'public' &&
                    activeRoute.orderedSpots.length > 1 && (
                      <div className="text-[10px] text-slate-300 text-center">
                        ※Googleマップ仕様上、複数経由地の全行程一括表示は道路ルートで開きます（鉄道・バスの乗換案内は各区間の「この区間をナビ」をご利用ください）
                      </div>
                    )}
                </div>

                {/* 手動順序編集中の案内バー */}
                {isCustomRouteOrder && (
                  <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-amber-200 font-bold text-[11px]">
                      ✏️ スポット順序・構成を手動調整中
                    </span>
                    <button
                      type="button"
                      onClick={onResetRouteOrder}
                      className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold inline-flex items-center gap-1 transition shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>自動最適順に戻す</span>
                    </button>
                  </div>
                )}

                {/* 選択中スポットの前後ルート表示案内バー */}
                {selectedSpot &&
                  activeRoute.orderedSpots.some(
                    (s) => s.id === selectedSpot.id
                  ) && (
                    <div className="bg-sky-500/20 border border-sky-400/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="text-[11px]">
                        <div className="text-sky-200 font-bold">
                          📍 「{selectedSpot.name}」の前後ルートを表示中
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          前からの移動＝グレー点線 ／ 次への移動＝青色点線
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectSpotOnMap(null)}
                        className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition shrink-0"
                      >
                        全体ルート表示
                      </button>
                    </div>
                  )}
              </div>

              {/* ステップバイステップ・タイムライン表示 */}
              <div className="relative pl-4 border-l-2 border-sky-200 space-y-4">
                {/* 出発地ノード */}
                <div className="relative">
                  <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-sky-600 ring-4 ring-sky-100" />
                  <div className="bg-slate-100 rounded-xl p-3 border border-slate-200">
                    <div className="flex items-center justify-between text-[11px] font-bold text-sky-700">
                      <span>START 出発拠点</span>
                      <span>
                        {condition.startTime || '09:00'} 出発（終了予定{' '}
                        {condition.endTime || '15:00'}）
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {activeRoute.origin.name}
                    </div>
                  </div>
                </div>

                {/* 各区間＋立ち寄りスポットカード */}
                {activeRoute.legs.map((leg, idx) => {
                  const spot = leg.toSpot;
                  const selectedRouteIdx = selectedSpot
                    ? activeRoute.orderedSpots.findIndex(
                        (s) => s.id === selectedSpot.id
                      )
                    : -1;
                  const isPrevLegForSelected =
                    selectedRouteIdx !== -1 && idx === selectedRouteIdx;
                  const isNextLegForSelected =
                    selectedRouteIdx !== -1 && idx === selectedRouteIdx + 1;

                  return (
                    <div key={`${leg.fromName}-${leg.toName}-${idx}`} className="space-y-3">
                      {/* 移動コネクタ */}
                      <div
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs border transition ${
                          isPrevLegForSelected
                            ? 'bg-slate-200/90 border-slate-400 shadow-sm'
                            : isNextLegForSelected
                            ? 'bg-sky-100/90 border-sky-400 shadow-sm'
                            : 'bg-sky-50/70 border-sky-200/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-slate-700 font-semibold flex-wrap">
                          {activeRoute.transportMode === 'public' ? (
                            <TrainFront
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isPrevLegForSelected
                                  ? 'text-slate-700'
                                  : 'text-sky-600'
                              }`}
                            />
                          ) : activeRoute.transportMode === 'car' ? (
                            <Car
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isPrevLegForSelected
                                  ? 'text-slate-700'
                                  : 'text-sky-600'
                              }`}
                            />
                          ) : activeRoute.transportMode === 'bicycle' ? (
                            <Bike
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isPrevLegForSelected
                                  ? 'text-slate-700'
                                  : 'text-sky-600'
                              }`}
                            />
                          ) : (
                            <Footprints
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isPrevLegForSelected
                                  ? 'text-slate-700'
                                  : 'text-sky-600'
                              }`}
                            />
                          )}
                          <span>
                            移動 約{leg.travelMinutes}分（{leg.distanceKm}km）
                          </span>
                          {isPrevLegForSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-600 text-white text-[10px] font-bold">
                              前の観光地からのルート（グレー）
                            </span>
                          )}
                          {isNextLegForSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[10px] font-bold">
                              次の観光地へのルート（青色）
                            </span>
                          )}
                        </div>
                        <a
                          href={leg.googleMapsLegUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-sky-700 hover:text-sky-900 underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>この区間をナビ</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* スポットカード または 最終帰着拠点ノード */}
                      {spot ? (
                        <div className="relative">
                          <div
                            className="absolute -left-[25px] top-3 w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shadow"
                            style={{
                              backgroundColor: CATEGORY_META[spot.category].color,
                            }}
                          >
                            {idx + 1}
                          </div>

                          <div
                            onClick={() =>
                              onSelectSpotOnMap(
                                selectedSpot?.id === spot.id ? null : spot
                              )
                            }
                            className={`rounded-2xl p-3.5 border transition cursor-pointer ${
                              selectedSpot?.id === spot.id
                                ? 'bg-sky-50/70 border-2 border-sky-500 shadow-md'
                                : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                                style={{
                                  backgroundColor:
                                    CATEGORY_META[spot.category].color,
                                }}
                              >
                                {CATEGORY_META[spot.category].label}
                              </span>

                              {/* FE-2: タイムライン上での滞在時間クイック微調整（-15分 / +15分） */}
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-sky-600" />
                                  {formatMinutesToClockTime(
                                    parseTimeToMinutes(
                                      condition.startTime || '09:00',
                                      540
                                    ) + leg.arrivalTimeMinutes
                                  )}
                                  〜
                                  {formatMinutesToClockTime(
                                    parseTimeToMinutes(
                                      condition.startTime || '09:00',
                                      540
                                    ) + leg.departureTimeMinutes
                                  )}
                                </span>

                                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-bold text-slate-700">
                                  <button
                                    type="button"
                                    disabled={spot.stayDurationMinutes <= 15}
                                    onClick={() =>
                                      onAdjustSpotStayDuration(spot.id, -15)
                                    }
                                    className="px-1 hover:text-sky-700 disabled:text-slate-300"
                                    title="滞在時間を15分短縮"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="px-1">
                                    滞在{spot.stayDurationMinutes}分
                                  </span>
                                  <button
                                    type="button"
                                    disabled={spot.stayDurationMinutes >= 300}
                                    onClick={() =>
                                      onAdjustSpotStayDuration(spot.id, 15)
                                    }
                                    className="px-1 hover:text-sky-700 disabled:text-slate-300"
                                    title="滞在時間を15分延長"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* FE-4 & BE-2: 営業時間外アラートバッジ */}
                            {leg.isOutsideOpeningHours && (
                              <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{leg.openingHoursNote}</span>
                              </div>
                            )}

                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="text-sm font-bold text-slate-900">
                                {spot.name}
                              </div>

                              {/* 順序入れ替え（↑/↓）＆ ルートから削除ボタン */}
                              <div
                                className="flex items-center gap-1 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => onMoveRouteSpot(idx, 'up')}
                                  className={`p-1 rounded-lg border text-xs font-bold transition ${
                                    idx === 0
                                      ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed'
                                      : 'border-slate-200 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 hover:border-sky-300'
                                  }`}
                                  title="訪問順序を1つ前（上）へ移動"
                                  aria-label="上へ移動"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    idx === activeRoute.orderedSpots.length - 1
                                  }
                                  onClick={() => onMoveRouteSpot(idx, 'down')}
                                  className={`p-1 rounded-lg border text-xs font-bold transition ${
                                    idx === activeRoute.orderedSpots.length - 1
                                      ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed'
                                      : 'border-slate-200 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 hover:border-sky-300'
                                  }`}
                                  title="訪問順序を1つ後（下）へ移動"
                                  aria-label="下へ移動"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveRouteSpot(idx)}
                                  className="px-1.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold inline-flex items-center gap-0.5 transition"
                                  title="このスポットをルートから削除"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>削除</span>
                                </button>
                              </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 mb-2.5">
                              <div className="text-[10px] font-bold text-sky-800 flex items-center gap-1 mb-0.5">
                                <GraduationCap className="w-3.5 h-3.5 text-sky-600" />
                                <span>{spot.researcherGroup}</span>
                              </div>
                              <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                                {spot.studentComment}
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenSpotDetail(spot);
                                }}
                                className="text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-100/80 hover:bg-sky-200/70 px-3 py-1.5 rounded-lg transition"
                              >
                                詳細・学生コメントを見る
                              </button>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditSpot(spot);
                                  }}
                                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 inline-flex items-center gap-1 transition"
                                  title="このスポットの位置情報・詳細を編集"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>編集</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePinSpot(spot.id);
                                  }}
                                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 transition ${
                                    condition.pinnedSpotIds.includes(spot.id)
                                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Pin className="w-3 h-3" />
                                  <span>
                                    {condition.pinnedSpotIds.includes(spot.id)
                                      ? 'ピン留め中'
                                      : 'ピン留め'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-slate-900 ring-4 ring-slate-200" />
                          <div className="bg-slate-100 rounded-xl p-3 border border-slate-300">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                              <span>GOAL 最終帰着拠点</span>
                              <span>
                                {formatMinutesToClockTime(
                                  parseTimeToMinutes(
                                    condition.startTime || '09:00',
                                    540
                                  ) + leg.arrivalTimeMinutes
                                )}{' '}
                                到着（+{leg.arrivalTimeMinutes}分）
                              </span>
                            </div>
                            <div className="text-sm font-bold text-slate-900 mt-0.5">
                              {leg.toName}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : activeTab === 'model_routes' ? (
          /* ③ タブ2：モデルルート（各出発拠点別 × それぞれの観光可能時間ごと） */
          <div className="p-4 space-y-4 bg-slate-50/60">
            {/* 出発拠点および観光可能時間の絞り込みバー */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div>
                <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  <span>出発拠点を選択（各出発拠点別に掲載）</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setModelOriginFilter('ALL')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                      modelOriginFilter === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    全出発拠点（{origins.length}拠点）
                  </button>
                  {origins.map((origin) => {
                    const isSelected = modelOriginFilter === origin.id;
                    const shortName = origin.name.replace(/（.*?）/g, '');
                    return (
                      <button
                        key={`model-origin-${origin.id}`}
                        type="button"
                        onClick={() => setModelOriginFilter(origin.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                          isSelected
                            ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-sky-50'
                        }`}
                      >
                        {shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>観光可能時間を選択（各時間プラン別に掲載）</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setModelTimeFilter('ALL')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                      modelTimeFilter === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    全時間プラン({TIME_BUDGET_OPTIONS.length})
                  </button>
                  {TIME_BUDGET_OPTIONS.map((opt) => {
                    const shortTimeLabel = opt.label.split('（')[0];
                    const isSelected = modelTimeFilter === opt.minutes;
                    return (
                      <button
                        key={`model-time-${opt.minutes}`}
                        type="button"
                        onClick={() => setModelTimeFilter(opt.minutes)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                          isSelected
                            ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-sky-50'
                        }`}
                      >
                        {shortTimeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 各出発拠点別のモデルルート一覧 */}
            <div className="space-y-6">
              {modelRoutesByOrigin.map(({ origin, plans }) => (
                <div
                  key={`origin-section-${origin.id}`}
                  className="space-y-3.5"
                >
                  {/* 出発拠点見出しバナー */}
                  <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/30 border border-sky-400/40 text-sky-200 text-[10px] font-extrabold">
                        出発拠点
                      </span>
                      <h2 className="text-sm font-extrabold tracking-tight">
                        {origin.name} 発 モデルルート
                      </h2>
                    </div>
                    <span className="text-[11px] text-sky-200 font-bold shrink-0">
                      全 {plans.length} プラン
                    </span>
                  </div>

                  {/* それぞれの観光可能時間ごとのモデルルートカード */}
                  <div className="space-y-6">
                    {plans.map(
                      ({
                        timeOption,
                        route: modelRoute,
                        budgetText,
                        conditionToApply,
                      }) => (
                        <div
                          key={`model-card-${origin.id}-${timeOption.minutes}`}
                          className="bg-white rounded-2xl border-2 border-sky-400/90 ring-1 ring-sky-200 shadow-lg overflow-hidden"
                        >
                          {/* ② プラン境界線の帯を濃く明瞭にし、ヘッダー水色帯を一段濃い視認性の高い配色へ変更 */}
                          <div className="h-1.5 w-full bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-500" />
                          <div className="bg-gradient-to-r from-sky-200 via-sky-100 to-sky-200/80 px-4 py-3 border-b-2 border-sky-300 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-sky-700 text-white text-[10px] font-extrabold shadow-sm">
                                  {timeOption.label.split('（')[0]}プラン
                                </span>
                                <span className="text-[11px] font-extrabold text-sky-950">
                                  {origin.name.replace(/（.*?）/g, '')} 発 ➔{' '}
                                  {modelRoute.orderedSpots.length}スポット巡回
                                </span>
                              </div>
                              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 mt-1">
                                {timeOption.label}
                              </h3>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onUpdateCondition(conditionToApply);
                                setActiveTab('planner');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition shrink-0"
                            >
                              <Route className="w-3.5 h-3.5" />
                              <span>このルートをマップに反映</span>
                            </button>
                          </div>

                          <div className="p-3.5 space-y-3.5">
                            {/* ②「モデルルート全体サマリー」を濃紺から薄く明るいユーザーフレンドリーな配色に変更 */}
                            <div className="bg-sky-50/85 border border-sky-200 text-slate-800 rounded-xl p-3 shadow-sm">
                              <div className="text-[10px] font-extrabold text-sky-900 mb-2 flex items-center justify-between">
                                <span>📊 モデルルート全体サマリー（スポット紹介前指標）</span>
                                <span className="px-2 py-0.5 rounded-full bg-white border border-sky-200 text-sky-800 font-bold">
                                  推奨移動:{' '}
                                  {modelRoute.transportMode === 'public'
                                    ? '鉄道・公共交通'
                                    : '車・レンタカー'}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-white border border-sky-200/90 rounded-lg p-2 shadow-sm">
                                  <div className="text-[10px] text-sky-700 font-bold flex items-center justify-center gap-1">
                                    <Clock className="w-3 h-3 text-sky-600" />
                                    <span>総滞在時間</span>
                                  </div>
                                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 mt-0.5">
                                    {formatHoursAndMinutesJa(
                                      modelRoute.totalStayMinutes
                                    )}
                                  </div>
                                </div>

                                <div className="bg-white border border-emerald-200/90 rounded-lg p-2 shadow-sm">
                                  <div className="text-[10px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                                    <Wallet className="w-3 h-3 text-emerald-600" />
                                    <span>予算（目安）</span>
                                  </div>
                                  <div className="text-[11px] sm:text-xs font-extrabold text-slate-900 mt-0.5 leading-tight">
                                    {budgetText}
                                  </div>
                                </div>

                                <div className="bg-white border border-amber-200/90 rounded-lg p-2 shadow-sm">
                                  <div className="text-[10px] text-amber-700 font-bold flex items-center justify-center gap-1">
                                    <Navigation className="w-3 h-3 text-amber-600" />
                                    <span>総移動距離</span>
                                  </div>
                                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 mt-0.5">
                                    約 {modelRoute.totalDistanceKm} km
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 要件③：各スポットの名称・画像・一文で伝える学生目線の魅力を掲載 */}
                            <div className="space-y-3">
                              {modelRoute.orderedSpots.map((spot, sIdx) => {
                                const meta = CATEGORY_META[spot.category];
                                const spotImages = getSpotImages(spot);
                                const oneSentenceAppeal =
                                  getOneSentenceStudentAppeal(spot);

                                return (
                                  <div
                                    key={`model-spot-${origin.id}-${timeOption.minutes}-${spot.id}`}
                                    onClick={() => onSelectSpotOnMap(spot)}
                                    className="rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white overflow-hidden transition cursor-pointer shadow-sm"
                                  >
                                    {/* スポット画像（複数枚登録時は左右スワイプ可能） */}
                                    <SpotImageCarousel
                                      images={spotImages}
                                      alt={spot.name}
                                      heightClass="h-36 sm:h-40"
                                      roundedClass="rounded-none"
                                      showSwipeHint={spotImages.length > 1}
                                    >
                                      <div className="absolute top-2 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
                                        <span
                                          className="w-6 h-6 rounded-full text-white text-xs font-extrabold flex items-center justify-center shadow-md border-2 border-white"
                                          style={{
                                            backgroundColor: meta.color,
                                          }}
                                        >
                                          {sIdx + 1}
                                        </span>
                                        <span
                                          className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow"
                                          style={{
                                            backgroundColor: meta.color,
                                          }}
                                        >
                                          {meta.shortLabel}
                                        </span>
                                      </div>
                                    </SpotImageCarousel>

                                    <div className="p-3 space-y-2">
                                      {/* スポットの名称 ＋ 滞在・料金 */}
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                                          {sIdx + 1}. {spot.name}
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
                                          滞在 {spot.stayDurationMinutes}分
                                        </span>
                                      </div>

                                      {/* 一文で伝える学生目線の魅力 */}
                                      <div className="bg-sky-50/90 border border-sky-200/90 rounded-xl p-2.5">
                                        <div className="text-[10px] font-extrabold text-sky-800 flex items-center gap-1 mb-0.5">
                                          <GraduationCap className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                          <span>
                                            学生目線の魅力（{spot.researcherGroup}）
                                          </span>
                                        </div>
                                        <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                                          {oneSentenceAppeal}
                                        </p>
                                      </div>

                                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                                        <span>予算目安: {spot.priceRange}</span>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onEditSpot(spot);
                                            }}
                                            className="text-amber-700 hover:underline font-bold inline-flex items-center gap-0.5"
                                          >
                                            <Pencil className="w-3 h-3" />
                                            <span>写真・情報を編集</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenSpotDetail(spot);
                                            }}
                                            className="text-sky-700 hover:underline font-bold"
                                          >
                                            詳細を見る →
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* タブ3：スポット一覧（調査カタログ） */
          <div className="p-4 space-y-3.5">
            {/* 検索＆フィルタバー */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="スポット名・学生コメント・キーワードで検索..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-0.5">
                    <Filter className="w-3 h-3" />
                    エリア絞り込み
                  </label>
                  <select
                    value={areaFilter}
                    onChange={(e) =>
                      setAreaFilter(e.target.value as SpotArea | 'ALL')
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="ALL">すべてのエリア</option>
                    {SPOT_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-0.5">
                    <Filter className="w-3 h-3" />
                    カテゴリ絞り込み
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as SpotCategory | 'ALL')
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="ALL">すべてのカテゴリ</option>
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* カタログスポットリスト */}
            <div className="space-y-2.5">
              {catalogSpots.map((spot) => {
                const meta = CATEGORY_META[spot.category];
                const isPinned = condition.pinnedSpotIds.includes(spot.id);
                const routeIndex = activeRoute.orderedSpots.findIndex(
                  (s) => s.id === spot.id
                );
                const isInRoute = routeIndex !== -1;
                return (
                  <div
                    key={spot.id}
                    onClick={() => onSelectSpotOnMap(spot)}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3.5 shadow-sm transition cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.shortLabel}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {spot.area}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500">
                        滞在 {spot.stayDurationMinutes}分
                      </span>
                    </div>

                    <div className="text-sm font-bold text-slate-900">
                      {spot.name}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2">
                      {spot.studentComment}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSpotDetail(spot);
                        }}
                        className="text-xs font-bold text-sky-700 hover:underline"
                      >
                        詳細・学生コメントを見る →
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSpot(spot);
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 inline-flex items-center gap-1 transition"
                          title="このスポットの位置情報・詳細を編集"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>編集</span>
                        </button>

                        {isInRoute ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveRouteSpot(routeIndex);
                            }}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center gap-1 transition"
                            title="現在のルートから削除"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>ルートから削除</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddSpotToRoute(spot);
                            }}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 inline-flex items-center gap-1 transition"
                            title="現在のルート末尾に追加"
                          >
                            <Plus className="w-3 h-3" />
                            <span>ルートに追加</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePinSpot(spot.id);
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 ${
                            isPinned
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>{isPinned ? '固定中' : '固定'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
