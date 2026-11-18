import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  ALL_CATEGORIES,
  CATEGORY_META,
  OptimizedRoute,
  OriginPoint,
  Spot,
  SpotCategory,
} from '../types/tourism';
import {
  buildPerLegPositions,
  computeSyncRouteGeometry,
  enhanceRouteGeometryWithOsrm,
  RouteGeometryResult,
  samplePointAlongPath,
} from '../utils/routeGeometry';
import {
  Compass,
  ExternalLink,
  Eye,
  GitCommitHorizontal,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OSM_TILE_CONFIG = {
  label: 'OpenStreetMap',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

interface MapViewProps {
  spots: Spot[];
  origins: OriginPoint[];
  activeRoute: OptimizedRoute;
  selectedSpot: Spot | null;
  onSelectSpot: (spot: Spot | null) => void;
  onOpenSpotDetail: (spot: Spot) => void;
  onEditSpot: (spot: Spot) => void;
  onRemoveRouteSpot: (index: number) => void;
  onAddSpotToRoute: (spot: Spot) => void;
  visibleCategories: SpotCategory[];
  onToggleCategory: (category: SpotCategory) => void;
  pinnedSpotIds: string[];
  onTogglePinSpot: (spotId: string) => void;
  mapPickMode: 'none' | 'pick_origin' | 'pick_spot';
  onMapPickCoordinate: (lat: number, lng: number) => void;
  onCancelMapPick: () => void;
  flyToTarget: {
    lat: number;
    lng: number;
    zoom?: number;
    timestamp: number;
  } | null;
  fitBoundsTrigger?: number;
}

// 丸数字（①〜⑳）変換ヘルパー
function toCircledNumber(n: number): string {
  const circled = [
    '①',
    '②',
    '③',
    '④',
    '⑤',
    '⑥',
    '⑦',
    '⑧',
    '⑨',
    '⑩',
    '⑪',
    '⑫',
    '⑬',
    '⑭',
    '⑮',
    '⑯',
    '⑰',
    '⑱',
    '⑲',
    '⑳',
  ];
  return n >= 1 && n <= 20 ? circled[n - 1] : `(${n})`;
}

/**
 * 現在のズームレベルと最近傍スポットまでの距離(m)から、
 * 他のスポットの●アイコンと干渉しない最適な直径(px)を算出する
 * （ルート内スポット・ルート外スポットともに視認性の高い一回り大きなサイズ）
 */
function computeDynamicCircleSizePx(
  zoom: number,
  inRoute: boolean,
  isSelected: boolean,
  nearestNeighborMeters: number
): number {
  let baseSize: number;
  if (inRoute) {
    if (zoom <= 10) baseSize = 22;
    else if (zoom === 11) baseSize = 25;
    else if (zoom === 12) baseSize = 28;
    else if (zoom === 13) baseSize = 32;
    else if (zoom === 14) baseSize = 36;
    else if (zoom === 15) baseSize = 39;
    else baseSize = 42;
  } else {
    if (zoom <= 10) baseSize = 18;
    else if (zoom === 11) baseSize = 21;
    else if (zoom === 12) baseSize = 24;
    else if (zoom === 13) baseSize = 27;
    else if (zoom === 14) baseSize = 30;
    else if (zoom === 15) baseSize = 33;
    else baseSize = 36;
  }

  // 富山県付近(北緯36.7度)における現在のズームレベルの1ピクセルあたり地上距離(m/px)
  const metersPerPixel = 125500 / Math.pow(2, zoom);
  const neighborScreenPx = nearestNeighborMeters / Math.max(0.05, metersPerPixel);

  // 隣接スポットとの画面上距離が近い場合は、アイコン同士が重ならないよう自動調整（下限サイズも十分な存在感を維持）
  const maxNonOverlappingSize = Math.floor(neighborScreenPx * 0.85);
  const minAllowedSize = inRoute ? 20 : 16;

  let finalSize =
    neighborScreenPx < baseSize * 1.15
      ? Math.max(minAllowedSize, Math.min(baseSize, maxNonOverlappingSize))
      : baseSize;

  if (isSelected) {
    finalSize += 4;
  }

  return finalSize;
}

interface NeighborProximityInfo {
  distanceMeters: number;
  ux: number;
  uy: number;
}

/**
 * スポット用の●（丸型）DivIconを生成する
 * - 「ルート順序の番号（1, 2, 3...）」と「体験・景色・食・交通・宿泊のいずれかの色」を組み合わせた●アイコン
 * - ルートに含まれていないスポットも存在感のあるサイズとインナーコア●で鮮明に表示
 */
function createSpotCircleDivIcon(
  spot: Spot,
  routeOrderIndex: number | undefined,
  isSelected: boolean,
  isPinned: boolean,
  focusRole: 'selected' | 'prev' | 'next' | 'dimmed' | 'normal',
  zoom: number,
  proximity: NeighborProximityInfo
): { icon: L.DivIcon; sizePx: number } {
  const meta = CATEGORY_META[spot.category];
  const inRoute = routeOrderIndex !== undefined;
  const sizePx = computeDynamicCircleSizePx(
    zoom,
    inRoute,
    isSelected,
    proximity.distanceMeters
  );

  const fontSizePx = inRoute
    ? Math.max(11, Math.round(sizePx * 0.48))
    : Math.max(10, Math.round(sizePx * 0.45));

  const borderWidthPx = sizePx >= 26 ? 3 : sizePx >= 20 ? 2.5 : 2;
  const coreDotPx = Math.max(5, Math.round(sizePx * 0.28));

  const shadowAndOpacityStyle = isSelected
    ? 'box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.6), 0 5px 14px rgba(15, 23, 42, 0.48);'
    : focusRole === 'prev'
    ? 'box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.55), 0 3px 9px rgba(15, 23, 42, 0.38);'
    : focusRole === 'next'
    ? 'box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.55), 0 3px 9px rgba(15, 23, 42, 0.38);'
    : focusRole === 'dimmed'
    ? 'box-shadow: 0 2px 5px rgba(15, 23, 42, 0.22); opacity: 0.58;'
    : inRoute
    ? 'box-shadow: 0 3px 10px rgba(15, 23, 42, 0.42);'
    : 'box-shadow: 0 3px 8px rgba(15, 23, 42, 0.36); opacity: 0.96;';

  const innerContentHtml = inRoute
    ? `${routeOrderIndex + 1}`
    : isPinned
    ? '★'
    : `<span style="width: ${coreDotPx}px; height: ${coreDotPx}px; border-radius: 9999px; background: rgba(255, 255, 255, 0.92); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25); display: block;"></span>`;

  const html = `
    <div style="
      width: ${sizePx}px;
      height: ${sizePx}px;
      border-radius: 9999px;
      background: ${meta.color};
      color: #ffffff;
      border: ${borderWidthPx}px solid #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${fontSizePx}px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      cursor: pointer;
      user-select: none;
      box-sizing: border-box;
      transition: width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease;
      ${shadowAndOpacityStyle}
    ">${innerContentHtml}</div>
  `;

  const half = Math.round(sizePx / 2);

  // 縮尺上で近接スポットと●アイコンが重なる場合、反発ベクトル方向に微小オフセットして重なりを回避
  const metersPerPixel = 125500 / Math.pow(2, zoom);
  const neighborScreenPx =
    proximity.distanceMeters / Math.max(0.05, metersPerPixel);
  const minClearancePx = sizePx + 3;
  const shiftPx =
    neighborScreenPx < minClearancePx
      ? Math.min(15, Math.round((minClearancePx - neighborScreenPx) * 0.58))
      : 0;

  const anchorX = half - Math.round(proximity.ux * shiftPx);
  const anchorY = half - Math.round(proximity.uy * shiftPx);

  return {
    sizePx,
    icon: L.divIcon({
      className: 'custom-spot-marker',
      html,
      iconSize: [sizePx, sizePx],
      iconAnchor: [anchorX, anchorY],
      popupAnchor: [Math.round(proximity.ux * shiftPx), -half - 4],
    }),
  };
}

// 進行方向を示す矢印アイコン（ポリライン上に配置・縮尺連動）
function createDirectionArrowDivIcon(
  angleDeg: number,
  color: string,
  zoom: number
): L.DivIcon {
  const sizePx = zoom <= 11 ? 14 : zoom <= 13 ? 16 : 18;
  const svgSize = Math.max(8, sizePx - 7);
  const half = Math.round(sizePx / 2);

  const html = `
    <div style="
      transform: rotate(${angleDeg.toFixed(1)}deg);
      width: ${sizePx}px;
      height: ${sizePx}px;
      border-radius: 9999px;
      background: ${color};
      color: #ffffff;
      border: 1.5px solid #ffffff;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      box-sizing: border-box;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'custom-spot-marker',
    html,
    iconSize: [sizePx, sizePx],
    iconAnchor: [half, half],
  });
}

// 選択スポットの前後ルート表示時のみのコンパクトな区間バッジ
function createLegStepBadgeDivIcon(
  label: string,
  angleDeg: number,
  bgColor: string
): L.DivIcon {
  const html = `
    <div style="
      transform: translate(-50%, -50%);
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 9999px;
      background: ${bgColor};
      color: #ffffff;
      border: 1.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.28);
      white-space: nowrap;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    ">
      <span>${label}</span>
      <span style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        height: 12px;
        border-radius: 9999px;
        background: rgba(255,255,255,0.22);
        transform: rotate(${angleDeg.toFixed(1)}deg);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </span>
    </div>
  `;
  return L.divIcon({
    className: 'custom-spot-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// 出発地（起点・終点拠点）用のコンパクトなDivIconを生成する（縮尺連動）
function createOriginDivIcon(
  origin: OriginPoint,
  role: 'start' | 'end' | 'start_end' | 'inactive',
  zoom: number
): L.DivIcon {
  const isPrimary = role !== 'inactive';
  const bgColor =
    role === 'start_end'
      ? '#0f172a'
      : role === 'start'
      ? '#0284c7'
      : role === 'end'
      ? '#dc2626'
      : '#64748b';

  const shortOriginName = origin.name.replace(/（.*?）/g, '');
  const showTextLabel = zoom >= 13 || isPrimary;

  if (!showTextLabel) {
    // 広域ズームでの非アクティブ出発地はコンパクトな◆/●ピンで表示して干渉を防ぐ
    const dotSize = zoom <= 10 ? 12 : 15;
    const half = Math.round(dotSize / 2);
    return L.divIcon({
      className: 'custom-spot-marker',
      html: `
        <div style="
          width: ${dotSize}px;
          height: ${dotSize}px;
          border-radius: 4px;
          background: ${bgColor};
          border: 2px solid #ffffff;
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.3);
          box-sizing: border-box;
        "></div>
      `,
      iconSize: [dotSize, dotSize],
      iconAnchor: [half, half],
      popupAnchor: [0, -half - 4],
    });
  }

  const roleBadge =
    role === 'start_end'
      ? '発着'
      : role === 'start'
      ? '出発'
      : role === 'end'
      ? '到着'
      : '出発地';

  const fontSize = zoom <= 11 ? '10px' : '11px';
  const padding = zoom <= 11 ? '2px 6px' : '3px 8px';

  const html = `
    <div style="position: relative; display: inline-flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: ${padding};
        border-radius: 9999px;
        background: ${bgColor};
        color: #ffffff;
        border: 1.5px solid #ffffff;
        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.3);
        white-space: nowrap;
      ">
        <span style="
          font-size: 9px;
          font-weight: 800;
          padding: 0.5px 4px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.22);
        ">${roleBadge}</span>
        <span style="font-size: ${fontSize}; font-weight: 700;">${shortOriginName}</span>
      </div>
      <div style="
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid ${bgColor};
        margin-top: -1px;
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-spot-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -28],
  });
}

// マップのスムーズ移動・ルート全体fitBounds・ズーム検知・クリックイベントを制御する内部コントローラ
const MapInteractionController: React.FC<{
  flyToTarget: {
    lat: number;
    lng: number;
    zoom?: number;
    timestamp: number;
  } | null;
  fitBoundsCoords: [number, number][] | null;
  fitBoundsTrigger: number;
  mapPickMode: 'none' | 'pick_origin' | 'pick_spot';
  onMapPickCoordinate: (lat: number, lng: number) => void;
  onZoomChange: (zoom: number) => void;
}> = ({
  flyToTarget,
  fitBoundsCoords,
  fitBoundsTrigger,
  mapPickMode,
  onMapPickCoordinate,
  onZoomChange,
}) => {
  const map = useMap();

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  useEffect(() => {
    if (flyToTarget) {
      map.flyTo([flyToTarget.lat, flyToTarget.lng], flyToTarget.zoom ?? 14, {
        duration: 1.2,
      });
    }
  }, [flyToTarget, map]);

  // ルート算出時および全体表示復帰時にルート全体が画面内に収まるよう自動ズーム調整
  useEffect(() => {
    if (fitBoundsTrigger > 0 && fitBoundsCoords && fitBoundsCoords.length >= 2) {
      try {
        const bounds = L.latLngBounds(fitBoundsCoords);
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [56, 56],
            maxZoom: 14,
            animate: true,
            duration: 1.0,
          });
        }
      } catch {
        // ignore invalid bounds
      }
    }
  }, [fitBoundsTrigger, fitBoundsCoords, map]);

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
    click(e) {
      if (mapPickMode !== 'none') {
        const roundedLat = Math.round(e.latlng.lat * 1000000) / 1000000;
        const roundedLng = Math.round(e.latlng.lng * 1000000) / 1000000;
        onMapPickCoordinate(roundedLat, roundedLng);
      }
    },
  });

  return null;
};

export const MapView: React.FC<MapViewProps> = ({
  spots,
  origins,
  activeRoute,
  selectedSpot,
  onSelectSpot,
  onOpenSpotDetail,
  onEditSpot,
  onRemoveRouteSpot,
  onAddSpotToRoute,
  visibleCategories,
  onToggleCategory,
  pinnedSpotIds,
  onTogglePinSpot: _onTogglePinSpot,
  mapPickMode,
  onMapPickCoordinate,
  onCancelMapPick,
  flyToTarget,
  fitBoundsTrigger = 0,
}) => {
  // ②「カテゴリ表示」で「出発地」（富山駅・富山高山すし空港・新高岡駅など）の表示/非表示を切り替えるステート
  const [showOrigins, setShowOrigins] = useState<boolean>(true);
  // 選択スポットがある場合に「前後ルートのみ表示（prev=グレー / next=青色）」にするか「全体ルート表示」にするか
  const [focusPrevNextOnly, setFocusPrevNextOnly] = useState<boolean>(true);
  const [currentZoom, setCurrentZoom] = useState<number>(11);
  const [localFitBoundsCount, setLocalFitBoundsCount] = useState<number>(1);

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locatingError, setLocatingError] = useState<string | null>(null);
  const [internalFlyTo, setInternalFlyTo] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    timestamp: number;
  } | null>(null);

  // ユーザーがルート内のスポットを新たに選択した際は自動的に前後ルート表示モードをONにする
  useEffect(() => {
    if (selectedSpot) {
      const inRoute = activeRoute.orderedSpots.some(
        (s) => s.id === selectedSpot.id
      );
      if (inRoute) {
        setFocusPrevNextOnly(true);
      }
    }
  }, [selectedSpot, activeRoute.orderedSpots]);

  // カテゴリ別スポット件数集計
  const categoryCounts = useMemo(() => {
    const counts: Record<SpotCategory, number> = {
      experience: 0,
      scenery: 0,
      food: 0,
      transport: 0,
      stay: 0,
    };
    for (const s of spots) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [spots]);

  // ルート内でのスポット訪問順序マップ (spot.id -> 0-based orderIndex)
  const routeOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    activeRoute.orderedSpots.forEach((spot, index) => {
      map.set(spot.id, index);
    });
    return map;
  }, [activeRoute]);

  // 選択中のスポットがルート内の何番目(0-based)か
  const selectedRouteOrderIndex = useMemo(() => {
    if (!selectedSpot) return undefined;
    return routeOrderMap.get(selectedSpot.id);
  }, [selectedSpot, routeOrderMap]);

  // 現在「選択スポットの前後ルートのみ表示モード」が有効かどうか
  const isPrevNextModeActive =
    focusPrevNextOnly && selectedRouteOrderIndex !== undefined;

  // 表示対象スポット（カテゴリフィルタでONのスポットを表示）
  const filteredSpots = useMemo(() => {
    const visibleSet = new Set(visibleCategories);
    return spots.filter((s) => visibleSet.has(s.category));
  }, [spots, visibleCategories]);

  // 各スポットの最近傍スポットまでの距離(m)と反発単位ベクトルを計算し、●アイコンが干渉しないサイズと配置に利用
  const nearestNeighborInfoMap = useMemo(() => {
    const map = new Map<string, NeighborProximityInfo>();
    const cosLat = Math.cos((36.7 * Math.PI) / 180);

    for (let i = 0; i < filteredSpots.length; i++) {
      const a = filteredSpots[i];
      let minMeters = Infinity;
      let ux = 0;
      let uy = 0;

      for (let j = 0; j < filteredSpots.length; j++) {
        if (i === j) continue;
        const b = filteredSpots[j];
        const distMeters =
          haversineDistanceKm(a.lat, a.lng, b.lat, b.lng) * 1000;
        if (distMeters < minMeters) {
          minMeters = distMeters;
          const dx = (a.lng - b.lng) * cosLat;
          const dy = -(a.lat - b.lat);
          const len = Math.hypot(dx, dy);
          if (len > 1e-9) {
            ux = dx / len;
            uy = dy / len;
          } else {
            const angle = ((i - j) * Math.PI) / 3;
            ux = Math.cos(angle);
            uy = Math.sin(angle);
          }
        }
      }
      map.set(a.id, { distanceMeters: minMeters, ux, uy });
    }
    return map;
  }, [filteredSpots]);

  // 路線（鉄道・路面電車）および実道路網に沿った最短経路ポリラインの座標を算出
  const syncRouteGeometry = useMemo(
    () => computeSyncRouteGeometry(activeRoute),
    [activeRoute]
  );

  const [routeGeometry, setRouteGeometry] =
    useState<RouteGeometryResult>(syncRouteGeometry);

  useEffect(() => {
    let cancelled = false;
    setRouteGeometry(syncRouteGeometry);

    enhanceRouteGeometryWithOsrm(activeRoute, syncRouteGeometry).then(
      (enhanced) => {
        if (!cancelled) {
          setRouteGeometry(enhanced);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeRoute, syncRouteGeometry]);

  // 各移動区間(legIndex = 0, 1, ..., legs.length - 1)ごとの座標列と表示メタデータを構築
  const renderedLegs = useMemo(() => {
    const perLegPositions = buildPerLegPositions(
      routeGeometry,
      activeRoute.legs.length
    );

    const totalSpots = activeRoute.orderedSpots.length;

    return activeRoute.legs
      .map((leg, legIndex) => {
        const positions =
          perLegPositions[legIndex] && perLegPositions[legIndex].length >= 2
            ? perLegPositions[legIndex]
            : ([
                [leg.fromLat, leg.fromLng],
                [leg.toLat, leg.toLng],
              ] as [number, number][]);

        // 区間の始点・終点の順序ラベル作成
        const fromBadge =
          legIndex === 0 ? '発' : toCircledNumber(legIndex);
        const toBadge =
          legIndex < totalSpots
            ? toCircledNumber(legIndex + 1)
            : '着';

        // 選択スポット前後のみ表示モード時の判定
        let role: 'full_route' | 'prev_leg_gray' | 'next_leg_blue' | 'hidden' =
          'full_route';

        if (isPrevNextModeActive && selectedRouteOrderIndex !== undefined) {
          if (legIndex === selectedRouteOrderIndex) {
            role = 'prev_leg_gray';
          } else if (legIndex === selectedRouteOrderIndex + 1) {
            role = 'next_leg_blue';
          } else {
            role = 'hidden';
          }
        }

        // 前後ルートフォーカス時のみ区間バッジを表示（全体ルート表示時は●アイコンとの重複を防ぐため非表示）
        const badgePoint =
          role === 'prev_leg_gray'
            ? samplePointAlongPath(positions, 0.45)
            : role === 'next_leg_blue'
            ? samplePointAlongPath(positions, 0.55)
            : null;

        // 進行方向矢印（短距離区間では間引いて●アイコンとの干渉を防止）
        const showMidArrow =
          role !== 'full_route'
            ? leg.distanceKm >= 0.35
            : leg.distanceKm >= 0.8 &&
              (currentZoom >= 13 || leg.distanceKm >= 2.2);

        const arrowPoint = showMidArrow
          ? samplePointAlongPath(positions, 0.52)
          : null;

        const stepLabel =
          role === 'prev_leg_gray'
            ? `前: ${fromBadge}➔${toBadge} (${leg.travelMinutes}分)`
            : `次: ${fromBadge}➔${toBadge} (${leg.travelMinutes}分)`;

        return {
          legIndex,
          leg,
          positions,
          role,
          stepLabel,
          badgePoint,
          arrowPoints: arrowPoint ? [arrowPoint] : [],
        };
      })
      .filter((item) => item.role !== 'hidden');
  }, [
    routeGeometry,
    activeRoute,
    isPrevNextModeActive,
    selectedRouteOrderIndex,
    currentZoom,
  ]);

  // ルート全体が収まる境界座標リスト
  const routeFitBoundsCoords = useMemo(() => {
    const pts: [number, number][] = [
      [activeRoute.origin.lat, activeRoute.origin.lng],
      ...activeRoute.orderedSpots.map(
        (s) => [s.lat, s.lng] as [number, number]
      ),
    ];
    if (activeRoute.destination) {
      pts.push([activeRoute.destination.lat, activeRoute.destination.lng]);
    }
    return pts;
  }, [activeRoute]);

  // 現在地を取得して移動するハンドラ
  const handleLocateCurrentPosition = () => {
    setLocatingError(null);
    if (!navigator.geolocation) {
      setLocatingError('お使いのブラウザは現在地取得に対応していません。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        setInternalFlyTo({
          lat: coords.lat,
          lng: coords.lng,
          zoom: 14,
          timestamp: Date.now(),
        });
      },
      () => {
        setLocatingError(
          '現在地を取得できませんでした。富山駅周辺へフォーカスします。'
        );
        setInternalFlyTo({
          lat: 36.701552,
          lng: 137.213258,
          zoom: 13,
          timestamp: Date.now(),
        });
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const effectiveFlyTo =
    internalFlyTo &&
    (!flyToTarget || internalFlyTo.timestamp > flyToTarget.timestamp)
      ? internalFlyTo
      : flyToTarget;

  return (
    <div className="relative w-full h-full flex-1 bg-slate-100 overflow-hidden">
      {/* マップ座標取得モード時の上部フローティング案内バナー */}
      {mapPickMode !== 'none' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 text-white px-4 py-2 rounded-xl shadow-2xl border border-sky-400/50 flex items-center gap-2.5 max-w-[92vw] animate-bounce">
          <MapPin className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="text-xs font-medium">
            {mapPickMode === 'pick_origin'
              ? '新しい出発地にしたい場所をマップ上でクリックしてください'
              : 'スポットを設定・移動したい場所をマップ上でクリックしてください'}
          </div>
          <button
            type="button"
            onClick={onCancelMapPick}
            className="ml-1 px-2 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px] font-semibold flex items-center gap-1 shrink-0"
          >
            <X className="w-3 h-3" />
            キャンセル
          </button>
        </div>
      )}

      {/* 選択スポットの前後ルート表示モード時の上部コンパクト切替バー */}
      {selectedRouteOrderIndex !== undefined && selectedSpot && mapPickMode === 'none' && (
        <div className="absolute top-2.5 left-2.5 z-[920] bg-slate-900/95 text-white px-3 py-1.5 rounded-xl shadow-lg border border-sky-400/40 flex flex-wrap items-center gap-2 max-w-[92vw] sm:max-w-[460px]">
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded-full text-white text-[11px] font-extrabold inline-flex items-center justify-center border border-white"
              style={{
                backgroundColor: CATEGORY_META[selectedSpot.category].color,
              }}
            >
              {selectedRouteOrderIndex + 1}
            </span>
            <span className="text-xs font-bold truncate max-w-[150px] sm:max-w-[190px]">
              {selectedSpot.name}
            </span>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setFocusPrevNextOnly(true)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition ${
                focusPrevNextOnly
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              <GitCommitHorizontal className="w-3 h-3" />
              <span>前後のみ</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFocusPrevNextOnly(false);
                onSelectSpot(null);
              }}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition ${
                !focusPrevNextOnly
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>全体ルート</span>
            </button>
          </div>
        </div>
      )}

      {/* 右上フローティング：カテゴリ表示切替（出発地＋5カテゴリ）＆地図種別切替＆現在地ボタン */}
      <div className="absolute top-2.5 right-2.5 z-[900] flex flex-col items-end gap-1.5 max-w-[95vw]">
        <div className="bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-md border border-slate-200/80 flex flex-wrap items-center justify-end gap-1">
          <span className="text-[11px] font-bold text-slate-500 px-1 hidden sm:inline">
            カテゴリ表示:
          </span>

          {/* ②「出発地」表示/非表示トグルボタン（富山駅・富山高山すし空港・新高岡駅など） */}
          <button
            type="button"
            onClick={() => setShowOrigins((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
              showOrigins
                ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                : 'bg-slate-100 text-slate-400 border-slate-200 opacity-70 hover:opacity-100'
            }`}
            title="出発地（富山駅・富山高山すし空港・新高岡駅など）の表示切替"
          >
            <Navigation className="w-2.5 h-2.5" />
            <span>出発地</span>
            <span
              className={`text-[10px] px-1.5 rounded-full ${
                showOrigins
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {origins.length}
            </span>
          </button>

          {ALL_CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category];
            const isVisible = visibleCategories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggleCategory(category)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
                  isVisible
                    ? 'text-white shadow-sm'
                    : 'bg-slate-100 text-slate-400 border-slate-200 opacity-70 hover:opacity-100'
                }`}
                style={
                  isVisible
                    ? {
                        backgroundColor: meta.color,
                        borderColor: meta.color,
                      }
                    : undefined
                }
                title={`${meta.label}の表示切替`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                <span>{meta.shortLabel}</span>
                <span
                  className={`text-[10px] px-1.5 rounded-full ${
                    isVisible
                      ? 'bg-black/20 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {categoryCounts[category]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* OpenStreetMap (Leaflet) 地図バッジ */}
          <div className="bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow border border-slate-200/90 flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
            <Layers className="w-3.5 h-3.5 text-sky-600" />
            <span>OpenStreetMap (Leaflet)</span>
          </div>

          {locatingError && (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 text-[11px] px-2.5 py-1 rounded-lg shadow">
              {locatingError}
            </div>
          )}
          <button
            type="button"
            onClick={handleLocateCurrentPosition}
            className="bg-white/95 hover:bg-sky-50 text-slate-700 hover:text-sky-700 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow border border-slate-200/90 text-[11px] font-bold flex items-center gap-1 transition"
          >
            <LocateFixed className="w-3.5 h-3.5 text-sky-600" />
            <span>現在地</span>
          </button>
        </div>
      </div>

      {/* ④ サイト画面下の「全体ルート表示」コンパクトバー */}
      <div className="flex absolute bottom-2.5 right-2.5 z-[850] bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg shadow border border-slate-200/80 items-center gap-2 text-[11px] text-slate-700 max-w-[95vw]">
        {isPrevNextModeActive && selectedSpot && selectedRouteOrderIndex !== undefined ? (
          <>
            <span className="font-bold text-slate-800 inline-flex items-center gap-1">
              <GitCommitHorizontal className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>
                {toCircledNumber(selectedRouteOrderIndex + 1)} 前後ルート
              </span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-600">
              <span className="w-3 h-0.5 bg-slate-500 inline-block" />
              前:グレー
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-sky-700">
              <span className="w-3 h-0.5 bg-sky-600 inline-block" />
              次:青
            </span>
            <button
              type="button"
              onClick={() => {
                setFocusPrevNextOnly(false);
                onSelectSpot(null);
              }}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold transition"
            >
              全体表示
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 font-bold text-slate-800">
              <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>
                全体ルート表示 ({activeRoute.orderedSpots.length}スポット・
                {activeRoute.totalDistanceKm}km)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLocalFitBoundsCount((c) => c + 1)}
              className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold transition shrink-0"
            >
              全体を表示
            </button>
          </>
        )}
      </div>

      {/* Leaflet Map 本体 */}
      <MapContainer
        center={[36.7013, 137.14]}
        zoom={11}
        className={`w-full h-full z-10 ${
          mapPickMode !== 'none' ? 'cursor-crosshair' : ''
        }`}
        zoomControl={false}
      >
        <TileLayer
          attribution={OSM_TILE_CONFIG.attribution}
          url={OSM_TILE_CONFIG.url}
        />

        <MapInteractionController
          flyToTarget={effectiveFlyTo}
          fitBoundsCoords={routeFitBoundsCoords}
          fitBoundsTrigger={fitBoundsTrigger + localFitBoundsCount}
          mapPickMode={mapPickMode}
          onMapPickCoordinate={onMapPickCoordinate}
          onZoomChange={setCurrentZoom}
        />

        {/* 各移動区間(leg)ごとの最短経路ポリライン＋進行方向矢印 */}
        {renderedLegs.map((item) => {
          const isPrevGray = item.role === 'prev_leg_gray';
          const isNextBlue = item.role === 'next_leg_blue';
          const mainColor = isPrevGray ? '#475569' : '#0284c7';
          const haloColor = isPrevGray ? '#64748b' : '#0369a1';
          const badgeBgColor = isPrevGray ? '#475569' : '#0284c7';

          return (
            <React.Fragment key={`leg-render-${item.legIndex}-${item.role}`}>
              {/* ベース背景ハイライトライン */}
              <Polyline
                positions={item.positions}
                pathOptions={{
                  color: haloColor,
                  weight: isPrevGray || isNextBlue ? 8 : 6,
                  opacity: isPrevGray ? 0.26 : 0.22,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* メイン点線（前ルート＝グレー点線、次ルートおよび全体ルート＝青色アニメーション点線） */}
              <Polyline
                positions={item.positions}
                pathOptions={{
                  color: mainColor,
                  weight: isPrevGray || isNextBlue ? 4.5 : 3.5,
                  opacity: 0.92,
                  dashArray: '8, 7',
                  className: 'animated-route-line',
                }}
              />

              {/* 路線・道路上の進行方向矢印マーカー（➤） */}
              {item.arrowPoints.map((pt, aIdx) => (
                <Marker
                  key={`leg-arrow-${item.legIndex}-${aIdx}`}
                  position={[pt.lat, pt.lng]}
                  icon={createDirectionArrowDivIcon(
                    pt.angleDeg,
                    mainColor,
                    currentZoom
                  )}
                  interactive={false}
                  zIndexOffset={400}
                />
              ))}

              {/* 前後ルート表示モード時のみの区間ラベルバッジ */}
              {item.badgePoint && (
                <Marker
                  key={`leg-badge-${item.legIndex}`}
                  position={[item.badgePoint.lat, item.badgePoint.lng]}
                  icon={createLegStepBadgeDivIcon(
                    item.stepLabel,
                    item.badgePoint.angleDeg,
                    badgeBgColor
                  )}
                  zIndexOffset={520}
                  eventHandlers={{
                    click: () => {
                      if (item.leg.toSpot) {
                        onSelectSpot(item.leg.toSpot);
                      }
                    },
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* ② 出発地（富山駅・富山高山すし空港・新高岡駅など）のマーカー描画（showOriginsで表示/非表示） */}
        {showOrigins &&
          origins.map((origin) => {
            const isStart = activeRoute.origin.id === origin.id;
            const isEnd =
              activeRoute.destination &&
              activeRoute.destination.id === origin.id;
            const role: 'start' | 'end' | 'start_end' | 'inactive' =
              isStart && isEnd
                ? 'start_end'
                : isStart
                ? 'start'
                : isEnd
                ? 'end'
                : 'inactive';

            return (
              <Marker
                key={origin.id}
                position={[origin.lat, origin.lng]}
                icon={createOriginDivIcon(origin, role, currentZoom)}
                zIndexOffset={isStart || isEnd ? 650 : 120}
              >
                <Tooltip direction="top" offset={[0, -24]}>
                  <span className="text-xs font-bold">{origin.name}</span>
                </Tooltip>
                <Popup>
                  <div className="min-w-[200px] p-1">
                    <div className="text-[11px] font-bold text-sky-700 mb-0.5">
                      出発地・交通拠点 {origin.isCustom ? '（カスタム追加）' : ''}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mb-1">
                      {origin.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      緯度: {origin.lat.toFixed(6)} / 経度:{' '}
                      {origin.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* ① 各観光スポットの●アイコンマーカー描画（ルート順序番号＋5カテゴリ色、縮尺・近接連動サイズ） */}
        {filteredSpots.map((spot) => {
          const orderIndex = routeOrderMap.get(spot.id);
          const isSelected = selectedSpot?.id === spot.id;
          const isPinned = pinnedSpotIds.includes(spot.id);
          const meta = CATEGORY_META[spot.category];
          const proximity = nearestNeighborInfoMap.get(spot.id) ?? {
            distanceMeters: Infinity,
            ux: 0,
            uy: 0,
          };

          let focusRole: 'selected' | 'prev' | 'next' | 'dimmed' | 'normal' =
            'normal';
          if (isPrevNextModeActive && selectedRouteOrderIndex !== undefined) {
            if (orderIndex === selectedRouteOrderIndex) {
              focusRole = 'selected';
            } else if (orderIndex === selectedRouteOrderIndex - 1) {
              focusRole = 'prev';
            } else if (orderIndex === selectedRouteOrderIndex + 1) {
              focusRole = 'next';
            } else {
              focusRole = 'dimmed';
            }
          }

          const { icon, sizePx } = createSpotCircleDivIcon(
            spot,
            orderIndex,
            isSelected,
            isPinned,
            focusRole,
            currentZoom,
            proximity
          );

          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={icon}
              zIndexOffset={
                isSelected
                  ? 1000
                  : focusRole === 'prev' || focusRole === 'next'
                  ? 880
                  : orderIndex !== undefined
                  ? 750
                  : 300
              }
              eventHandlers={{
                click: () => {
                  onSelectSpot(spot);
                },
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -Math.round(sizePx / 2 + 4)]}
              >
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {orderIndex !== undefined && (
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-extrabold"
                      style={{ backgroundColor: meta.color }}
                    >
                      {orderIndex + 1}
                    </span>
                  )}
                  <span>{spot.name}</span>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    ({meta.shortLabel})
                  </span>
                </div>
              </Tooltip>

              <Popup>
                <div className="w-[260px] text-slate-800">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      推奨滞在 {spot.stayDurationMinutes}分
                    </span>
                  </div>

                  <div className="text-sm font-bold text-slate-900 leading-snug mb-1">
                    {orderIndex !== undefined && (
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold mr-1.5"
                        style={{ backgroundColor: meta.color }}
                      >
                        {orderIndex + 1}
                      </span>
                    )}
                    {spot.name}
                  </div>

                  {/* ルート内スポット選択時は前後ルートの説明を表示 */}
                  {orderIndex !== undefined && (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 mb-2 text-[11px] space-y-0.5">
                      <div className="text-slate-600 font-semibold">
                        ◀ 前（グレー）:{' '}
                        <span className="text-slate-900 font-bold">
                          {activeRoute.legs[orderIndex]?.fromName || '出発地'}
                        </span>
                      </div>
                      <div className="text-sky-700 font-semibold">
                        ▶ 次（青色）:{' '}
                        <span className="text-sky-900 font-bold">
                          {activeRoute.legs[orderIndex + 1]?.toName ||
                            '最終地点（終了）'}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                    {spot.description}
                  </p>

                  <div className="bg-sky-50/90 border border-sky-200 rounded-lg p-2 mb-2.5">
                    <div className="text-[10px] font-bold text-sky-800 mb-0.5">
                      🎓 {spot.researcherGroup}
                    </div>
                    <p className="text-[11px] text-slate-700 line-clamp-2 leading-relaxed">
                      {spot.studentComment}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenSpotDetail(spot)}
                      className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>詳細</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditSpot(spot)}
                      className="px-2 py-1.5 rounded-lg text-xs font-bold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center gap-1 transition"
                      title="このスポットの位置・詳細情報を編集"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>編集</span>
                    </button>
                    {orderIndex !== undefined ? (
                      <button
                        type="button"
                        onClick={() => onRemoveRouteSpot(orderIndex)}
                        className="px-2 py-1.5 rounded-lg text-xs font-bold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center gap-1 transition"
                        title="現在のルートからこのスポットを削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>外す</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddSpotToRoute(spot)}
                        className="px-2 py-1.5 rounded-lg text-xs font-bold border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 flex items-center gap-1 transition"
                        title="現在のルート末尾に追加"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>追加</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                    {orderIndex !== undefined && (
                      <button
                        type="button"
                        onClick={() => {
                          setFocusPrevNextOnly(false);
                          onSelectSpot(null);
                        }}
                        className="text-[11px] font-bold text-slate-600 hover:text-slate-900 underline"
                      >
                        全体ルート表示に戻す
                      </button>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-sky-600 hover:underline inline-flex items-center gap-1 ml-auto"
                    >
                      <span>Googleマップで開く</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ユーザーの現在地マーカー（取得時） */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={L.divIcon({
              className: 'custom-spot-marker',
              html: `<div style="width: 16px; height: 16px; border-radius: 9999px; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.28);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Popup>現在地</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
