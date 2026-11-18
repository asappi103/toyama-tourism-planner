import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_CATEGORIES,
  normalizeResearcherGroup,
  OriginPoint,
  RouteCondition,
  Spot,
  SpotCategory,
} from './types/tourism';
import { DEFAULT_ORIGINS, INITIAL_SPOTS } from './data/initialSpots';
import {
  buildRouteFromOrderedSpots,
  decodeRouteFromUrlSearch,
  encodeRouteToUrlSearch,
  optimizeTourismRoute,
} from './utils/routeOptimizer';
import { PlannerSidebar } from './components/PlannerSidebar';
import { MapView } from './components/MapView';
import { SpotDetailModal } from './components/SpotDetailModal';
import { DataManagerModal } from './components/DataManagerModal';

const STORAGE_KEY_SPOTS = 'toyama_tourism_spots_v3';
const STORAGE_KEY_ORIGINS = 'toyama_tourism_origins_v2';
const LEGACY_STORAGE_KEY_SPOTS = 'toyama_tourism_spots_v2';

export function App() {
  // 1. スポット一覧データの状態管理（LocalStorage永続化＋18件初期データのGoogle Maps正確座標＆5班名同期）
  const [spots, setSpots] = useState<Spot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SPOTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: Spot) => ({
            ...s,
            researcherGroup: normalizeResearcherGroup(
              s.researcherGroup,
              s.category
            ),
          }));
        }
      }
      // 旧キャッシュ(v2)にユーザーがカスタム追加したスポットがあれば引き継ぎつつ初期18件は最新データへ更新
      const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY_SPOTS);
      if (legacySaved) {
        const legacyParsed = JSON.parse(legacySaved);
        if (Array.isArray(legacyParsed)) {
          const initialIdSet = new Set(INITIAL_SPOTS.map((s) => s.id));
          const customOnly = legacyParsed
            .filter((s: Spot) => s && s.id && !initialIdSet.has(s.id))
            .map((s: Spot) => ({
              ...s,
              researcherGroup: normalizeResearcherGroup(
                s.researcherGroup,
                s.category
              ),
            }));
          return [...customOnly, ...INITIAL_SPOTS];
        }
      }
    } catch {
      // 読み込みエラー時は初期データへフォールバック
    }
    return INITIAL_SPOTS;
  });

  // 2. 出発・到着拠点データの状態管理（3デフォルト拠点＋カスタム追加拠点の永続化）
  const [origins, setOrigins] = useState<OriginPoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORIGINS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // 読み込みエラー時はデフォルト拠点へフォールバック
    }
    return DEFAULT_ORIGINS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
    } catch {
      // ストレージ上限等は無視
    }
  }, [spots]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORIGINS, JSON.stringify(origins));
    } catch {
      // ストレージ上限等は無視
    }
  }, [origins]);

  // 3. ルート算出条件の状態
  const [condition, setCondition] = useState<RouteCondition>({
    originId: DEFAULT_ORIGINS[0].id,
    destinationType: 'return_to_origin',
    destinationOriginId: DEFAULT_ORIGINS[0].id,
    startTime: '09:00',
    endTime: '15:00',
    availableMinutes: 360,
    includeStay: false,
    transportMode: 'public',
    preferredCategories: ['experience', 'scenery', 'food'],
    pinnedSpotIds: [],
  });

  // 4. マップ上のカテゴリ表示フィルタ・選択スポット・モーダル開閉状態
  const [visibleCategories, setVisibleCategories] =
    useState<SpotCategory[]>(ALL_CATEGORIES);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [detailModalSpot, setDetailModalSpot] = useState<Spot | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);

  // 5. マップクリックによる座標取得モード
  const [mapPickMode, setMapPickMode] = useState<
    'none' | 'pick_origin' | 'pick_spot'
  >('none');
  const [pickedOriginCoordinate, setPickedOriginCoordinate] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pickedSpotCoordinate, setPickedSpotCoordinate] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // 6. マップのFlyToターゲット座標 ＆ ルート全体fitBoundsトリガー（FE-5）
  const [flyToTarget, setFlyToTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    timestamp: number;
  } | null>(null);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState<number>(1);

  // 7. ルート内の手動順序・構成カスタマイズ状態（nullの場合は自動最適算出）
  const [customRouteSpotIds, setCustomRouteSpotIds] = useState<string[] | null>(
    null
  );

  // BE-5: 初回マウント時にURLクエリパラメータに共有ルート情報があれば自動復元
  useEffect(() => {
    try {
      const decoded = decodeRouteFromUrlSearch(window.location.search);
      if (decoded) {
        setCondition((prev) => ({
          ...prev,
          ...decoded.partialCondition,
        }));
        if (decoded.customSpotIds) {
          setCustomRouteSpotIds(decoded.customSpotIds);
        }
        setFitBoundsTrigger((c) => c + 1);
      }
    } catch {
      // ignore invalid query params
    }
  }, []);

  // 自動最適化による観光ルート算出
  const autoOptimizedRoute = useMemo(() => {
    return optimizeTourismRoute(spots, origins, condition);
  }, [spots, origins, condition]);

  // 実際に画面・マップに表示するルート（手動編集がある場合はその順序・構成を反映）
  const activeRoute = useMemo(() => {
    if (customRouteSpotIds !== null) {
      const ordered = customRouteSpotIds
        .map((id) => spots.find((s) => s.id === id))
        .filter((s): s is Spot => Boolean(s));
      return buildRouteFromOrderedSpots(ordered, origins, condition);
    }
    return autoOptimizedRoute;
  }, [customRouteSpotIds, autoOptimizedRoute, spots, origins, condition]);

  // 条件の更新ハンドラ
  const handleUpdateCondition = useCallback(
    (partial: Partial<RouteCondition>) => {
      // 観光時間・開始終了時刻・宿泊有無・優先カテゴリ・起点が変わった場合は自動最適化を再実行
      if (
        partial.availableMinutes !== undefined ||
        partial.startTime !== undefined ||
        partial.endTime !== undefined ||
        partial.includeStay !== undefined ||
        partial.originId !== undefined ||
        partial.preferredCategories !== undefined
      ) {
        setCustomRouteSpotIds(null);
      }

      setCondition((prev) => {
        const next = { ...prev, ...partial };
        // 起点が変更された場合はマップをその起点へスムーズに移動
        if (partial.originId && partial.originId !== prev.originId) {
          const foundOrigin = origins.find((o) => o.id === partial.originId);
          if (foundOrigin) {
            setFlyToTarget({
              lat: foundOrigin.lat,
              lng: foundOrigin.lng,
              zoom: 12,
              timestamp: Date.now(),
            });
          }
        }
        return next;
      });
    },
    [origins]
  );

  // 「最適観光ルートを算出」ボタン押下時：手動順序をリセットし自動最適化＋ルート全体が収まるようマップfitBounds（FE-5）
  const handleRecalculateRoute = useCallback(() => {
    setCustomRouteSpotIds(null);
    setSelectedSpot(null);
    setFitBoundsTrigger((c) => c + 1);
  }, []);

  // FE-2: タイムライン上でのスポット別滞在時間のクイック微調整（±15分）
  const handleAdjustSpotStayDuration = useCallback(
    (spotId: string, deltaMinutes: number) => {
      const targetSpot = spots.find((s) => s.id === spotId);
      if (!targetSpot) return;
      setCondition((prev) => {
        const currentStay =
          prev.customStayDurations?.[spotId] ?? targetSpot.stayDurationMinutes;
        const nextStay = Math.max(15, Math.min(300, currentStay + deltaMinutes));
        return {
          ...prev,
          customStayDurations: {
            ...(prev.customStayDurations || {}),
            [spotId]: nextStay,
          },
        };
      });
    },
    [spots]
  );

  // BE-5: 現在のルート状態と訪問順をURLクエリ化してクリップボードへコピー
  const handleCopyShareUrl = useCallback(() => {
    try {
      const spotIds = activeRoute.orderedSpots.map((s) => s.id);
      const searchStr = encodeRouteToUrlSearch(condition, spotIds);
      const fullUrl = `${window.location.origin}${window.location.pathname}${searchStr}`;
      window.history.replaceState(null, '', searchStr);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl);
      }
    } catch {
      // ignore clipboard error
    }
  }, [condition, activeRoute.orderedSpots]);

  // ルート内スポットの訪問順序入れ替え（↑上へ / ↓下へ）
  const handleMoveRouteSpot = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const currentIds = activeRoute.orderedSpots.map((s) => s.id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= currentIds.length) {
        return;
      }
      const nextIds = [...currentIds];
      const temp = nextIds[index];
      nextIds[index] = nextIds[targetIndex];
      nextIds[targetIndex] = temp;
      setCustomRouteSpotIds(nextIds);
    },
    [activeRoute.orderedSpots]
  );

  // ルート内スポットの削除（除外）
  const handleRemoveRouteSpot = useCallback(
    (index: number) => {
      const currentIds = activeRoute.orderedSpots.map((s) => s.id);
      const removedId = currentIds[index];
      const nextIds = currentIds.filter((_, idx) => idx !== index);
      setCustomRouteSpotIds(nextIds);
      if (removedId) {
        setCondition((prev) => ({
          ...prev,
          pinnedSpotIds: prev.pinnedSpotIds.filter((id) => id !== removedId),
        }));
      }
    },
    [activeRoute.orderedSpots]
  );

  // カタログやマップから現在のルート末尾へスポットを手動追加
  const handleAddSpotToRoute = useCallback(
    (spot: Spot) => {
      const currentIds = activeRoute.orderedSpots.map((s) => s.id);
      if (currentIds.includes(spot.id)) {
        return;
      }
      setCustomRouteSpotIds([...currentIds, spot.id]);
    },
    [activeRoute.orderedSpots]
  );

  // 手動順序をリセットして自動最適順序へ戻す
  const handleResetRouteOrder = useCallback(() => {
    setCustomRouteSpotIds(null);
  }, []);

  // スポット選択＆マップ移動（null指定時は選択解除して全体ルートが画面に収まるようfitBounds）
  const handleSelectSpotOnMap = useCallback((spot: Spot | null) => {
    setSelectedSpot(spot);
    if (spot) {
      setFlyToTarget({
        lat: spot.lat,
        lng: spot.lng,
        zoom: 13,
        timestamp: Date.now(),
      });
    } else {
      setFitBoundsTrigger((c) => c + 1);
    }
  }, []);

  // ピン留め（必須立寄）トグル
  const handleTogglePinSpot = useCallback((spotId: string) => {
    setCondition((prev) => {
      const exists = prev.pinnedSpotIds.includes(spotId);
      const nextPins = exists
        ? prev.pinnedSpotIds.filter((id) => id !== spotId)
        : [...prev.pinnedSpotIds, spotId];
      return {
        ...prev,
        pinnedSpotIds: nextPins,
      };
    });
  }, []);

  // カテゴリ表示ピルのトグル
  const handleToggleCategory = useCallback((category: SpotCategory) => {
    setVisibleCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  // 新しいカスタム起点の登録
  const handleAddCustomOrigin = useCallback((newOrigin: OriginPoint) => {
    setOrigins((prev) => [...prev, newOrigin]);
    setCondition((prev) => ({
      ...prev,
      originId: newOrigin.id,
    }));
    setFlyToTarget({
      lat: newOrigin.lat,
      lng: newOrigin.lng,
      zoom: 13,
      timestamp: Date.now(),
    });
  }, []);

  // カスタム起点の削除
  const handleDeleteCustomOrigin = useCallback((originId: string) => {
    setOrigins((prev) => {
      const filtered = prev.filter((o) => o.id !== originId || !o.isCustom);
      return filtered.length > 0 ? filtered : DEFAULT_ORIGINS;
    });
    setCondition((prev) => ({
      ...prev,
      originId: DEFAULT_ORIGINS[0].id,
    }));
  }, []);

  // 新規スポットの追加
  const handleAddSpot = useCallback((newSpot: Spot) => {
    setSpots((prev) => [newSpot, ...prev]);
    setSelectedSpot(newSpot);
    setFlyToTarget({
      lat: newSpot.lat,
      lng: newSpot.lng,
      zoom: 14,
      timestamp: Date.now(),
    });
  }, []);

  // 既存スポットの再編集・更新
  const handleUpdateSpot = useCallback((updatedSpot: Spot) => {
    setSpots((prev) =>
      prev.map((s) => (s.id === updatedSpot.id ? updatedSpot : s))
    );
    setSelectedSpot((prev) =>
      prev && prev.id === updatedSpot.id ? updatedSpot : prev
    );
    setDetailModalSpot((prev) =>
      prev && prev.id === updatedSpot.id ? updatedSpot : prev
    );
    setEditingSpot(updatedSpot);
    setFlyToTarget({
      lat: updatedSpot.lat,
      lng: updatedSpot.lng,
      zoom: 15,
      timestamp: Date.now(),
    });
  }, []);

  // スポットの削除
  const handleDeleteSpot = useCallback((spotId: string) => {
    setSpots((prev) => {
      const next = prev.filter((s) => s.id !== spotId);
      return next.length > 0 ? next : prev;
    });
    setSelectedSpot((prev) => (prev?.id === spotId ? null : prev));
    setDetailModalSpot((prev) => (prev?.id === spotId ? null : prev));
    setEditingSpot(null);
    setCondition((prev) => ({
      ...prev,
      pinnedSpotIds: prev.pinnedSpotIds.filter((id) => id !== spotId),
    }));
  }, []);

  // スポット編集モーダルの起動
  const handleStartEditSpot = useCallback((spot: Spot) => {
    setDetailModalSpot(null);
    setEditingSpot(spot);
    setIsDataManagerOpen(true);
  }, []);

  // CSV / JSON からの一括インポート統合
  const handleImportSpots = useCallback((importedSpots: Spot[]) => {
    setSpots((prev) => {
      const map = new Map<string, Spot>();
      for (const s of prev) {
        map.set(s.id, s);
      }
      for (const s of importedSpots) {
        map.set(s.id, s);
      }
      return Array.from(map.values());
    });
  }, []);

  // 初期データへのリセット
  const handleResetDefaultData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_SPOTS);
    localStorage.removeItem(STORAGE_KEY_ORIGINS);
    setSpots(INITIAL_SPOTS);
    setOrigins(DEFAULT_ORIGINS);
    setCondition({
      originId: DEFAULT_ORIGINS[0].id,
      destinationType: 'return_to_origin',
      destinationOriginId: DEFAULT_ORIGINS[0].id,
      startTime: '09:00',
      endTime: '15:00',
      availableMinutes: 360,
      includeStay: false,
      transportMode: 'public',
      preferredCategories: ['experience', 'scenery', 'food'],
      pinnedSpotIds: [],
    });
  }, []);

  // マップクリックで座標を取得した際の処理
  const handleMapPickCoordinate = useCallback(
    (lat: number, lng: number) => {
      if (mapPickMode === 'pick_origin') {
        setPickedOriginCoordinate({ lat, lng });
        setMapPickMode('none');
      } else if (mapPickMode === 'pick_spot') {
        setPickedSpotCoordinate({ lat, lng });
        setMapPickMode('none');
        setIsDataManagerOpen(true);
      }
    },
    [mapPickMode]
  );

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col-reverse md:flex-row bg-slate-100">
      {/* 左ペイン（モバイル時は下部ドロワー）：条件設定・タイムライン・スポット一覧 */}
      <PlannerSidebar
        spots={spots}
        origins={origins}
        condition={condition}
        onUpdateCondition={handleUpdateCondition}
        activeRoute={activeRoute}
        isCustomRouteOrder={customRouteSpotIds !== null}
        onMoveRouteSpot={handleMoveRouteSpot}
        onRemoveRouteSpot={handleRemoveRouteSpot}
        onAddSpotToRoute={handleAddSpotToRoute}
        onAdjustSpotStayDuration={handleAdjustSpotStayDuration}
        onResetRouteOrder={handleResetRouteOrder}
        onRecalculateRoute={handleRecalculateRoute}
        onCopyShareUrl={handleCopyShareUrl}
        selectedSpot={selectedSpot}
        onSelectSpotOnMap={handleSelectSpotOnMap}
        onOpenSpotDetail={(spot) => setDetailModalSpot(spot)}
        onEditSpot={handleStartEditSpot}
        onTogglePinSpot={handleTogglePinSpot}
        onAddCustomOrigin={handleAddCustomOrigin}
        onDeleteCustomOrigin={handleDeleteCustomOrigin}
        onStartPickOriginOnMap={() => setMapPickMode('pick_origin')}
        pickedOriginCoordinate={pickedOriginCoordinate}
        onOpenDataManager={() => {
          setEditingSpot(null);
          setIsDataManagerOpen(true);
        }}
      />

      {/* 右ペイン：インタラクティブマップ（Google マップ標準搭載） */}
      <MapView
        spots={spots}
        origins={origins}
        activeRoute={activeRoute}
        selectedSpot={selectedSpot}
        onSelectSpot={(spot) => setSelectedSpot(spot)}
        onOpenSpotDetail={(spot) => setDetailModalSpot(spot)}
        onEditSpot={handleStartEditSpot}
        onRemoveRouteSpot={handleRemoveRouteSpot}
        onAddSpotToRoute={handleAddSpotToRoute}
        visibleCategories={visibleCategories}
        onToggleCategory={handleToggleCategory}
        pinnedSpotIds={condition.pinnedSpotIds}
        onTogglePinSpot={handleTogglePinSpot}
        mapPickMode={mapPickMode}
        onMapPickCoordinate={handleMapPickCoordinate}
        onCancelMapPick={() => setMapPickMode('none')}
        flyToTarget={flyToTarget}
        fitBoundsTrigger={fitBoundsTrigger}
      />

      {/* スポット詳細・学生フィールドワークコメントモーダル */}
      <SpotDetailModal
        spot={detailModalSpot}
        onClose={() => setDetailModalSpot(null)}
        isPinned={
          detailModalSpot
            ? condition.pinnedSpotIds.includes(detailModalSpot.id)
            : false
        }
        onTogglePinSpot={handleTogglePinSpot}
        onCenterOnMap={handleSelectSpotOnMap}
        onEditSpot={handleStartEditSpot}
      />

      {/* スポット新規追加・編集 ＆ 調査データCSV/JSONインポート・エクスポートモーダル */}
      <DataManagerModal
        isOpen={isDataManagerOpen}
        onClose={() => setIsDataManagerOpen(false)}
        spots={spots}
        editingSpot={editingSpot}
        onSelectEditingSpot={setEditingSpot}
        onAddSpot={handleAddSpot}
        onUpdateSpot={handleUpdateSpot}
        onDeleteSpot={handleDeleteSpot}
        onImportSpots={handleImportSpots}
        onResetDefaultData={handleResetDefaultData}
        pickedCoordinate={pickedSpotCoordinate}
        onStartPickSpotCoordinate={() => {
          setIsDataManagerOpen(false);
          setMapPickMode('pick_spot');
        }}
      />
    </div>
  );
}

export default App;
