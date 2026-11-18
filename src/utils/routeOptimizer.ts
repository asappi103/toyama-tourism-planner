import {
  DestinationType,
  OptimizedRoute,
  OriginPoint,
  RouteCondition,
  RouteLeg,
  Spot,
  SpotCategory,
  TransportMode,
} from '../types/tourism';
import { DEFAULT_ORIGINS } from '../data/initialSpots';

const EARTH_RADIUS_KM = 6371;
const ROAD_DETOUR_FACTOR = 1.3;

/**
 * 2点間の緯度経度からHaversine球面距離に道路迂回係数(1.3)を乗じた実効移動距離(km)を算出する
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) {
    return 0;
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistanceKm = EARTH_RADIUS_KM * c;
  const roadDistanceKm = straightDistanceKm * ROAD_DETOUR_FACTOR;

  return Math.round(roadDistanceKm * 100) / 100;
}

/**
 * 距離(km)と移動手段から推定移動時間(分)を算出する
 * public: 25 km/h, car: 40 km/h, bicycle: 15 km/h, walk: 5 km/h
 */
export function estimateTravelMinutes(
  distanceKm: number,
  transportMode: TransportMode
): number {
  if (distanceKm <= 0) {
    return 0;
  }
  const speedMap: Record<TransportMode, number> = {
    public: 25,
    car: 40,
    bicycle: 15,
    walk: 5,
  };
  const speedKmPerHour = speedMap[transportMode] ?? 25;
  const rawMinutes = (distanceKm / speedKmPerHour) * 60;
  return Math.max(1, Math.round(rawMinutes));
}

/**
 * Googleマップの経路案内URL（単一区間または全行程Waypoints付き）を生成する
 * ※Googleマップの仕様上、複数経由地(waypoints.length > 0)がある場合は travelmode=transit が非対応のため、
 *   全行程一括URLでは複数経由地対応の driving（近距離徒歩圏は walking）へ自動フォールバックし、
 *   各区間の2点間ナビURLでは transit をそのまま維持する（BE-4対応）。
 */
export function buildGoogleMapsDirectionUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }> = [],
  transportMode: TransportMode = 'public'
): string {
  const travelModeMap: Record<TransportMode, string> = {
    public: 'transit',
    car: 'driving',
    bicycle: 'bicycling',
    walk: 'walking',
  };

  let travelmode = travelModeMap[transportMode] ?? 'transit';
  if (waypoints.length > 0 && transportMode === 'public') {
    travelmode = 'driving';
  }

  const originParam = `${origin.lat},${origin.lng}`;
  const destParam = `${destination.lat},${destination.lng}`;

  let url = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}`;
  if (waypoints.length > 0) {
    const waypointStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join('|');
    url += `&waypoints=${waypointStr}`;
  }
  url += `&travelmode=${travelmode}`;

  return url;
}

/**
 * 'HH:MM' 形式の時刻文字列を 0:00 からの経過分数(0〜1439)に変換する
 */
export function parseTimeToMinutes(
  timeStr?: string,
  fallbackMinutes = 540
): number {
  if (!timeStr) return fallbackMinutes;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallbackMinutes;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes;
  return h * 60 + m;
}

/**
 * 0:00 からの経過分数を 'HH:MM'（24時間超の場合は '翌日 HH:MM' 等）に変換する
 */
export function formatMinutesToClockTime(clockMinutes: number): string {
  const normalized = Math.max(0, Math.round(clockMinutes));
  const dayOffset = Math.floor(normalized / 1440);
  const inDay = normalized % 1440;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  if (dayOffset === 0) return `${hh}:${mm}`;
  if (dayOffset === 1) return `翌日 ${hh}:${mm}`;
  return `${dayOffset + 1}日目 ${hh}:${mm}`;
}

/**
 * 観光スタート時刻と終了予定時刻から観光可能時間(分)を算出する（FE-3対応）
 */
export function computeAvailableMinutesFromStartEnd(
  startTime: string,
  endTime: string,
  multiDayTier?: number
): number {
  const startMin = parseTimeToMinutes(startTime, 540);
  const endMin = parseTimeToMinutes(endTime, 900);
  let diff = endMin - startMin;
  if (diff <= 0) {
    diff += 1440;
  }
  if (multiDayTier && multiDayTier >= 720) {
    return multiDayTier;
  }
  return Math.max(30, diff);
}

/**
 * スポットの営業時間文字列（例: '9:00〜17:00', '11:00〜15:00'）から営業開始・終了分を抽出する（BE-2対応）
 */
export function parseSpotOpeningWindow(
  openingHours: string
): { openMin: number; closeMin: number } | null {
  if (
    !openingHours ||
    openingHours.includes('終日') ||
    openingHours.includes('チェックイン')
  ) {
    return null;
  }
  const match = openingHours.match(
    /(\d{1,2}):(\d{2})\s*[〜~\-]\s*(\d{1,2}):(\d{2})/
  );
  if (!match) return null;
  const openMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const closeMin = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
  return { openMin, closeMin };
}

/**
 * 指定された到着時刻(0〜1439)と滞在時間がスポットの営業時間内かどうかを判定する（BE-2対応）
 */
export function isSpotVisitWithinOpeningHours(
  spot: Spot,
  arrivalClockInDay: number,
  stayMinutes: number
): boolean {
  if (spot.category === 'stay') return true;
  const win = parseSpotOpeningWindow(spot.openingHours);
  if (!win) return true;
  const departureClockInDay = arrivalClockInDay + stayMinutes;
  return (
    arrivalClockInDay >= win.openMin - 15 &&
    departureClockInDay <= win.closeMin + 20
  );
}

/**
 * スポットの実効滞在時間（カスタム微調整があれば優先）を取得する（FE-2対応）
 */
export function getEffectiveStayMinutes(
  spot: Spot,
  condition: RouteCondition
): number {
  const custom = condition.customStayDurations?.[spot.id];
  if (typeof custom === 'number' && custom >= 15) {
    return custom;
  }
  return spot.stayDurationMinutes;
}

/**
 * 2-opt法によりルート内のジグザグ交差を解消して移動効率を改善する（BE-1対応）
 */
function applyTwoOptOptimization(
  spotsList: Spot[],
  startPoint: { lat: number; lng: number },
  endPoint: { lat: number; lng: number } | undefined,
  transportMode: TransportMode
): Spot[] {
  if (spotsList.length < 3) {
    return spotsList;
  }

  const route = [...spotsList];

  const calcTotalTravel = (candidateOrder: Spot[]): number => {
    let total = 0;
    let prevLat = startPoint.lat;
    let prevLng = startPoint.lng;
    for (const s of candidateOrder) {
      const d = calculateHaversineDistanceKm(prevLat, prevLng, s.lat, s.lng);
      total += estimateTravelMinutes(d, transportMode);
      prevLat = s.lat;
      prevLng = s.lng;
    }
    if (endPoint) {
      const d = calculateHaversineDistanceKm(
        prevLat,
        prevLng,
        endPoint.lat,
        endPoint.lng
      );
      total += estimateTravelMinutes(d, transportMode);
    }
    return total;
  };

  let improved = true;
  let iterations = 0;

  while (improved && iterations < 20) {
    improved = false;
    iterations++;
    const currentBestTravel = calcTotalTravel(route);

    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        // 宿泊スポット(stay)の位置は固定して日中の回遊順序のみ交差解消
        const segment = route.slice(i, j + 1);
        if (segment.some((s) => s.category === 'stay')) continue;

        const candidate = [
          ...route.slice(0, i),
          ...segment.reverse(),
          ...route.slice(j + 1),
        ];

        if (calcTotalTravel(candidate) + 1 < currentBestTravel) {
          route.splice(0, route.length, ...candidate);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return route;
}

/**
 * 観光条件（起点・終点・観光可能時間・スタート/終了時刻・宿泊有無・移動手段・優先カテゴリ・ピン留め）に基づき
 * 時間枠厳守かつ宿泊必須組込ルールを満たす最適観光ルートを算出する
 */
export function optimizeTourismRoute(
  spots: Spot[],
  origins: OriginPoint[],
  condition: RouteCondition
): OptimizedRoute {
  const allOrigins = origins.length > 0 ? origins : DEFAULT_ORIGINS;
  const origin =
    allOrigins.find((o) => o.id === condition.originId) || allOrigins[0];

  // 最終帰着・終着拠点の決定
  let finalDestinationOrigin: OriginPoint | undefined;
  if (condition.destinationType === 'return_to_origin') {
    finalDestinationOrigin = origin;
  } else if (condition.destinationType === 'another_origin') {
    finalDestinationOrigin =
      allOrigins.find((o) => o.id === condition.destinationOriginId) || origin;
  }

  const availableMinutes = Math.max(30, condition.availableMinutes);
  const startClockMinutes = parseTimeToMinutes(condition.startTime, 540);
  const pinnedSet = new Set(condition.pinnedSpotIds);
  const preferredSet = new Set(condition.preferredCategories);

  // カスタム滞在時間を適用したスポット一覧を作成
  const effectiveSpots: Spot[] = spots.map((s) => ({
    ...s,
    stayDurationMinutes: getEffectiveStayMinutes(s, condition),
  }));

  // 1. 宿泊あり(includeStay: true)の場合、宿泊スポットを1件事前予約確保する
  let reservedStaySpot: Spot | undefined;
  if (condition.includeStay) {
    const stayCandidates = effectiveSpots.filter((s) => s.category === 'stay');

    const feasibleStaySpots = stayCandidates.filter((staySpot) => {
      const distFromOrigin = calculateHaversineDistanceKm(
        origin.lat,
        origin.lng,
        staySpot.lat,
        staySpot.lng
      );
      const travelFromOrigin = estimateTravelMinutes(
        distFromOrigin,
        condition.transportMode
      );

      let travelToDest = 0;
      if (finalDestinationOrigin) {
        const distToDest = calculateHaversineDistanceKm(
          staySpot.lat,
          staySpot.lng,
          finalDestinationOrigin.lat,
          finalDestinationOrigin.lng
        );
        travelToDest = estimateTravelMinutes(
          distToDest,
          condition.transportMode
        );
      }

      return (
        travelFromOrigin + staySpot.stayDurationMinutes + travelToDest <=
        availableMinutes
      );
    });

    if (feasibleStaySpots.length > 0) {
      feasibleStaySpots.sort((a, b) => {
        const aPinned = pinnedSet.has(a.id) ? 1 : 0;
        const bPinned = pinnedSet.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;

        const aDist = calculateHaversineDistanceKm(
          origin.lat,
          origin.lng,
          a.lat,
          a.lng
        );
        const bDist = calculateHaversineDistanceKm(
          origin.lat,
          origin.lng,
          b.lat,
          b.lng
        );
        return aDist - bDist;
      });
      reservedStaySpot = feasibleStaySpots[0];
    }
  }

  // 2. 日中回遊スポットの候補プール作成
  const daytimePool = effectiveSpots.filter((s) => {
    if (reservedStaySpot && s.id === reservedStaySpot.id) {
      return false;
    }
    if (s.category === 'stay' && !pinnedSet.has(s.id)) {
      return false;
    }
    return true;
  });

  const selectedDaytimeSpots: Spot[] = [];
  const visitedIds = new Set<string>();
  const visitedCategories = new Set<string>();

  let currentLat = origin.lat;
  let currentLng = origin.lng;
  let elapsedMinutes = 0;

  // 現在の位置・経過時間から、候補スポットに立ち寄った後に予約宿＋最終帰着地まで時間内に戻れるか判定する関数
  const canFitSpotWithinBudget = (candidate: Spot): boolean => {
    const distToCandidate = calculateHaversineDistanceKm(
      currentLat,
      currentLng,
      candidate.lat,
      candidate.lng
    );
    const travelToCandidate = estimateTravelMinutes(
      distToCandidate,
      condition.transportMode
    );
    const timeAfterCandidate =
      elapsedMinutes + travelToCandidate + candidate.stayDurationMinutes;

    if (reservedStaySpot) {
      const distCandidateToStay = calculateHaversineDistanceKm(
        candidate.lat,
        candidate.lng,
        reservedStaySpot.lat,
        reservedStaySpot.lng
      );
      const travelCandidateToStay = estimateTravelMinutes(
        distCandidateToStay,
        condition.transportMode
      );

      let travelStayToDest = 0;
      if (finalDestinationOrigin) {
        const distStayToDest = calculateHaversineDistanceKm(
          reservedStaySpot.lat,
          reservedStaySpot.lng,
          finalDestinationOrigin.lat,
          finalDestinationOrigin.lng
        );
        travelStayToDest = estimateTravelMinutes(
          distStayToDest,
          condition.transportMode
        );
      }

      const totalProjected =
        timeAfterCandidate +
        travelCandidateToStay +
        reservedStaySpot.stayDurationMinutes +
        travelStayToDest;

      return totalProjected <= availableMinutes;
    }

    let travelCandidateToDest = 0;
    if (finalDestinationOrigin) {
      const distToDest = calculateHaversineDistanceKm(
        candidate.lat,
        candidate.lng,
        finalDestinationOrigin.lat,
        finalDestinationOrigin.lng
      );
      travelCandidateToDest = estimateTravelMinutes(
        distToDest,
        condition.transportMode
      );
    }

    return timeAfterCandidate + travelCandidateToDest <= availableMinutes;
  };

  // 3. Greedy Nearest-Neighbor + 営業時間フィルタ（BE-2）+ カテゴリバランス・食事タイミング評価
  while (true) {
    const allBudgetFeasible = daytimePool.filter(
      (s) => !visitedIds.has(s.id) && canFitSpotWithinBudget(s)
    );

    if (allBudgetFeasible.length === 0) {
      break;
    }

    // BE-2: 営業時間内に訪問可能なスポット（またはピン留めスポット）を最優先で抽出
    const openFeasible = allBudgetFeasible.filter((candidate) => {
      if (pinnedSet.has(candidate.id)) return true;
      const distKm = calculateHaversineDistanceKm(
        currentLat,
        currentLng,
        candidate.lat,
        candidate.lng
      );
      const travelMin = estimateTravelMinutes(distKm, condition.transportMode);
      const arrivalClockInDay =
        (startClockMinutes + elapsedMinutes + travelMin) % 1440;
      return isSpotVisitWithinOpeningHours(
        candidate,
        arrivalClockInDay,
        candidate.stayDurationMinutes
      );
    });

    const feasibleCandidates =
      openFeasible.length > 0 ? openFeasible : allBudgetFeasible;

    const previousCategory =
      selectedDaytimeSpots.length > 0
        ? selectedDaytimeSpots[selectedDaytimeSpots.length - 1].category
        : undefined;

    let bestCandidate = feasibleCandidates[0];
    let bestScore = -Infinity;

    for (const candidate of feasibleCandidates) {
      const distKm = calculateHaversineDistanceKm(
        currentLat,
        currentLng,
        candidate.lat,
        candidate.lng
      );
      const travelMin = estimateTravelMinutes(distKm, condition.transportMode);

      let score = 100;

      // (a) ピン留め最優先ボーナス
      if (pinnedSet.has(candidate.id)) {
        score += 10000;
      }

      // (b) 距離・移動時間効率ペナルティ
      score -= travelMin * 2.2;

      // (c) ユーザー優先カテゴリボーナス
      if (preferredSet.has(candidate.category)) {
        score += 45;
      }

      // (d) カテゴリ多様性ボーナス＆連続同一カテゴリ抑制
      if (!visitedCategories.has(candidate.category)) {
        score += 35;
      }
      if (previousCategory && candidate.category === previousCategory) {
        score -= 30;
      }

      // (e) 観光スタート時刻を考慮した実時刻ベースの食事タイミング＆営業時間評価
      const arrivalElapsed = elapsedMinutes + travelMin;
      const arrivalClockInDay = (startClockMinutes + arrivalElapsed) % 1440;

      const isLunchTime = arrivalClockInDay >= 690 && arrivalClockInDay <= 840;
      const isDinnerTime =
        arrivalClockInDay >= 1050 && arrivalClockInDay <= 1230;

      if (candidate.category === 'food') {
        if ((isLunchTime || isDinnerTime) && !visitedCategories.has('food')) {
          score += 75;
        } else if (
          !visitedCategories.has('food') &&
          arrivalElapsed >= 60 &&
          arrivalElapsed <= 240
        ) {
          score += 45;
        } else if (!isLunchTime && !isDinnerTime && visitedCategories.has('food')) {
          score -= 25;
        }
      }

      if (
        isSpotVisitWithinOpeningHours(
          candidate,
          arrivalClockInDay,
          candidate.stayDurationMinutes
        )
      ) {
        score += 35;
      } else {
        score -= 80;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    const distToBest = calculateHaversineDistanceKm(
      currentLat,
      currentLng,
      bestCandidate.lat,
      bestCandidate.lng
    );
    const travelToBest = estimateTravelMinutes(
      distToBest,
      condition.transportMode
    );

    elapsedMinutes += travelToBest + bestCandidate.stayDurationMinutes;
    currentLat = bestCandidate.lat;
    currentLng = bestCandidate.lng;

    selectedDaytimeSpots.push(bestCandidate);
    visitedIds.add(bestCandidate.id);
    visitedCategories.add(bestCandidate.category);
  }

  // 3.5 短時間プラン（1時間＝60分、1時間半＝90分など）で標準滞在時間では1件も収まらない場合、
  // 最低15分の短縮滞在で立ち寄れる最寄りスポットを1件自動調整して組み込む
  if (selectedDaytimeSpots.length === 0 && !reservedStaySpot) {
    let bestShortSpot: Spot | null = null;
    let bestShortStay = 0;
    let bestShortScore = -Infinity;

    for (const candidate of daytimePool) {
      const distTo = calculateHaversineDistanceKm(
        origin.lat,
        origin.lng,
        candidate.lat,
        candidate.lng
      );
      const travelTo = estimateTravelMinutes(distTo, condition.transportMode);

      let travelBack = 0;
      if (finalDestinationOrigin) {
        const distBack = calculateHaversineDistanceKm(
          candidate.lat,
          candidate.lng,
          finalDestinationOrigin.lat,
          finalDestinationOrigin.lng
        );
        travelBack = estimateTravelMinutes(distBack, condition.transportMode);
      }

      const maxPossibleStay = availableMinutes - travelTo - travelBack;
      if (maxPossibleStay >= 15) {
        const score =
          (pinnedSet.has(candidate.id) ? 10000 : 0) +
          (preferredSet.has(candidate.category) ? 45 : 0) -
          travelTo * 3;
        if (score > bestShortScore) {
          bestShortScore = score;
          bestShortSpot = candidate;
          bestShortStay = Math.min(
            candidate.stayDurationMinutes,
            maxPossibleStay
          );
        }
      }
    }

    if (bestShortSpot && bestShortStay >= 15) {
      selectedDaytimeSpots.push({
        ...bestShortSpot,
        stayDurationMinutes: bestShortStay,
      });
    }
  }

  // 4. BE-1: 2-opt法による経路交差（ジグザグ走行）解消と、宿泊スポットの現実的な配置
  const deCrossedDaytime = applyTwoOptOptimization(
    selectedDaytimeSpots,
    origin,
    reservedStaySpot || finalDestinationOrigin,
    condition.transportMode
  );

  let orderedSpots: Spot[] = [...deCrossedDaytime];
  if (reservedStaySpot) {
    // 1泊2日(720分)・2泊3日(1440分)で複数スポットがある場合は、1日目の終盤（中盤〜後半）に宿泊拠点を配置し、
    // 翌日以降に宿泊拠点から残りのスポットを巡る構成を試行（時間枠内に収まる場合のみ）
    if (availableMinutes >= 720 && deCrossedDaytime.length >= 4) {
      const splitIndex = Math.max(2, Math.floor(deCrossedDaytime.length * 0.6));
      const midStayOrder = [
        ...deCrossedDaytime.slice(0, splitIndex),
        reservedStaySpot,
        ...deCrossedDaytime.slice(splitIndex),
      ];
      const midRouteCandidate = buildRouteFromOrderedSpots(
        midStayOrder,
        origins,
        condition
      );
      if (midRouteCandidate.totalMinutes <= availableMinutes) {
        return midRouteCandidate;
      }
    }
    orderedSpots.push(reservedStaySpot);
  }

  // 2-optの順序変更で万が一availableMinutesを超えた場合は元の順序にフォールバック
  const built = buildRouteFromOrderedSpots(orderedSpots, origins, condition);
  if (built.totalMinutes <= availableMinutes) {
    return built;
  }

  const fallbackSpots = [...selectedDaytimeSpots];
  if (reservedStaySpot) fallbackSpots.push(reservedStaySpot);
  return buildRouteFromOrderedSpots(fallbackSpots, origins, condition);
}

/**
 * 指定された訪問順序のスポット配列(orderedSpots)から、各移動区間(legs)・合計所要時間・総移動距離・
 * 営業時間外判定(BE-2)・制限時間超過判定(FE-4)・GoogleマップURLを構築する
 */
export function buildRouteFromOrderedSpots(
  orderedSpots: Spot[],
  origins: OriginPoint[],
  condition: RouteCondition
): OptimizedRoute {
  const allOrigins = origins.length > 0 ? origins : DEFAULT_ORIGINS;
  const origin =
    allOrigins.find((o) => o.id === condition.originId) || allOrigins[0];

  let finalDestinationOrigin: OriginPoint | undefined;
  if (condition.destinationType === 'return_to_origin') {
    finalDestinationOrigin = origin;
  } else if (condition.destinationType === 'another_origin') {
    finalDestinationOrigin =
      allOrigins.find((o) => o.id === condition.destinationOriginId) || origin;
  }

  const startClockMinutes = parseTimeToMinutes(condition.startTime, 540);

  const legs: RouteLeg[] = [];
  let totalTravelMinutes = 0;
  let totalStayMinutes = 0;
  let totalDistanceKm = 0;
  let timelineCursor = 0;

  let prevName = origin.name;
  let prevLat = origin.lat;
  let prevLng = origin.lng;

  const effectiveOrderedSpots: Spot[] = orderedSpots.map((spot) => ({
    ...spot,
    stayDurationMinutes: getEffectiveStayMinutes(spot, condition),
  }));

  for (const spot of effectiveOrderedSpots) {
    const distanceKm = calculateHaversineDistanceKm(
      prevLat,
      prevLng,
      spot.lat,
      spot.lng
    );
    const travelMinutes = estimateTravelMinutes(
      distanceKm,
      condition.transportMode
    );
    const stayMinutes = spot.stayDurationMinutes;
    const arrivalTimeMinutes = timelineCursor + travelMinutes;
    const departureTimeMinutes = arrivalTimeMinutes + stayMinutes;

    const arrivalClockInDay = (startClockMinutes + arrivalTimeMinutes) % 1440;
    const withinHours = isSpotVisitWithinOpeningHours(
      spot,
      arrivalClockInDay,
      stayMinutes
    );

    legs.push({
      fromName: prevName,
      fromLat: prevLat,
      fromLng: prevLng,
      toSpot: spot,
      toName: spot.name,
      toLat: spot.lat,
      toLng: spot.lng,
      distanceKm,
      travelMinutes,
      stayMinutes,
      arrivalTimeMinutes,
      departureTimeMinutes,
      googleMapsLegUrl: buildGoogleMapsDirectionUrl(
        { lat: prevLat, lng: prevLng },
        { lat: spot.lat, lng: spot.lng },
        [],
        condition.transportMode
      ),
      isOutsideOpeningHours: !withinHours,
      openingHoursNote: !withinHours
        ? `営業時間外の可能性あり（営業: ${spot.openingHours}）`
        : undefined,
    });

    totalTravelMinutes += travelMinutes;
    totalStayMinutes += stayMinutes;
    totalDistanceKm = Math.round((totalDistanceKm + distanceKm) * 100) / 100;
    timelineCursor = departureTimeMinutes;

    prevName = spot.name;
    prevLat = spot.lat;
    prevLng = spot.lng;
  }

  // 最終帰着・別拠点への移動区間（必要な場合）
  if (finalDestinationOrigin && effectiveOrderedSpots.length > 0) {
    const distanceKm = calculateHaversineDistanceKm(
      prevLat,
      prevLng,
      finalDestinationOrigin.lat,
      finalDestinationOrigin.lng
    );
    const travelMinutes = estimateTravelMinutes(
      distanceKm,
      condition.transportMode
    );
    const arrivalTimeMinutes = timelineCursor + travelMinutes;

    legs.push({
      fromName: prevName,
      fromLat: prevLat,
      fromLng: prevLng,
      toSpot: undefined,
      toName: finalDestinationOrigin.name,
      toLat: finalDestinationOrigin.lat,
      toLng: finalDestinationOrigin.lng,
      distanceKm,
      travelMinutes,
      stayMinutes: 0,
      arrivalTimeMinutes,
      departureTimeMinutes: arrivalTimeMinutes,
      googleMapsLegUrl: buildGoogleMapsDirectionUrl(
        { lat: prevLat, lng: prevLng },
        { lat: finalDestinationOrigin.lat, lng: finalDestinationOrigin.lng },
        [],
        condition.transportMode
      ),
    });

    totalTravelMinutes += travelMinutes;
    totalDistanceKm = Math.round((totalDistanceKm + distanceKm) * 100) / 100;
    timelineCursor = arrivalTimeMinutes;
  }

  const totalMinutes = totalTravelMinutes + totalStayMinutes;
  const overBudgetMinutes = Math.max(
    0,
    totalMinutes - condition.availableMinutes
  );
  const isOverBudget = overBudgetMinutes > 0;

  // 全行程GoogleマップナビURLの生成
  let googleMapsFullUrl = '';
  if (effectiveOrderedSpots.length === 0) {
    const dest = finalDestinationOrigin || origin;
    googleMapsFullUrl = buildGoogleMapsDirectionUrl(
      { lat: origin.lat, lng: origin.lng },
      { lat: dest.lat, lng: dest.lng },
      [],
      condition.transportMode
    );
  } else if (finalDestinationOrigin) {
    const waypoints = effectiveOrderedSpots.map((s) => ({
      lat: s.lat,
      lng: s.lng,
    }));
    googleMapsFullUrl = buildGoogleMapsDirectionUrl(
      { lat: origin.lat, lng: origin.lng },
      { lat: finalDestinationOrigin.lat, lng: finalDestinationOrigin.lng },
      waypoints,
      condition.transportMode
    );
  } else {
    const lastSpot = effectiveOrderedSpots[effectiveOrderedSpots.length - 1];
    const waypoints = effectiveOrderedSpots
      .slice(0, -1)
      .map((s) => ({ lat: s.lat, lng: s.lng }));
    googleMapsFullUrl = buildGoogleMapsDirectionUrl(
      { lat: origin.lat, lng: origin.lng },
      { lat: lastSpot.lat, lng: lastSpot.lng },
      waypoints,
      condition.transportMode
    );
  }

  return {
    origin,
    destination: finalDestinationOrigin,
    destinationType: condition.destinationType,
    orderedSpots: effectiveOrderedSpots,
    legs,
    totalTravelMinutes,
    totalStayMinutes,
    totalMinutes,
    totalDistanceKm,
    googleMapsFullUrl,
    transportMode: condition.transportMode,
    includeStay: condition.includeStay,
    isOverBudget,
    overBudgetMinutes,
  };
}

/**
 * BE-5: 現在のルート条件と訪問スポット順序をURLクエリパラメータ文字列にシリアライズする
 */
export function encodeRouteToUrlSearch(
  condition: RouteCondition,
  orderedSpotIds: string[]
): string {
  const params = new URLSearchParams();
  params.set('origin', condition.originId);
  params.set('destType', condition.destinationType);
  if (condition.destinationOriginId) {
    params.set('destId', condition.destinationOriginId);
  }
  if (condition.startTime) params.set('start', condition.startTime);
  if (condition.endTime) params.set('end', condition.endTime);
  params.set('mins', String(condition.availableMinutes));
  params.set('stay', condition.includeStay ? '1' : '0');
  params.set('mode', condition.transportMode);
  if (condition.preferredCategories.length > 0) {
    params.set('cats', condition.preferredCategories.join(','));
  }
  if (orderedSpotIds.length > 0) {
    params.set('spots', orderedSpotIds.join(','));
  }
  if (
    condition.customStayDurations &&
    Object.keys(condition.customStayDurations).length > 0
  ) {
    const pairs = Object.entries(condition.customStayDurations).map(
      ([id, min]) => `${id}:${min}`
    );
    params.set('stays', pairs.join(','));
  }
  return `?${params.toString()}`;
}

/**
 * BE-5: URLクエリパラメータからルート条件と訪問スポット順序を復元する
 */
export function decodeRouteFromUrlSearch(search: string): {
  partialCondition: Partial<RouteCondition>;
  customSpotIds: string[] | null;
} | null {
  if (!search || !search.includes('=')) return null;
  const params = new URLSearchParams(search);
  if (!params.has('origin') && !params.has('spots')) return null;

  const partialCondition: Partial<RouteCondition> = {};
  const originId = params.get('origin');
  if (originId) partialCondition.originId = originId;

  const destType = params.get('destType') as DestinationType | null;
  if (
    destType &&
    ['return_to_origin', 'another_origin', 'end_at_last_spot'].includes(destType)
  ) {
    partialCondition.destinationType = destType;
  }

  const destId = params.get('destId');
  if (destId) partialCondition.destinationOriginId = destId;

  const start = params.get('start');
  if (start) partialCondition.startTime = start;

  const end = params.get('end');
  if (end) partialCondition.endTime = end;

  const mins = Number(params.get('mins'));
  if (!Number.isNaN(mins) && mins >= 30) {
    partialCondition.availableMinutes = mins;
  }

  const stay = params.get('stay');
  if (stay === '1' || stay === '0') {
    partialCondition.includeStay = stay === '1';
  }

  const mode = params.get('mode') as TransportMode | null;
  if (mode && ['public', 'car', 'bicycle', 'walk'].includes(mode)) {
    partialCondition.transportMode = mode;
  }

  const cats = params.get('cats');
  if (cats) {
    partialCondition.preferredCategories = cats.split(',') as SpotCategory[];
  }

  const staysStr = params.get('stays');
  if (staysStr) {
    const map: Record<string, number> = {};
    for (const part of staysStr.split(',')) {
      const [id, val] = part.split(':');
      const num = Number(val);
      if (id && !Number.isNaN(num) && num >= 15) {
        map[id] = num;
      }
    }
    partialCondition.customStayDurations = map;
  }

  const spotsStr = params.get('spots');
  const customSpotIds = spotsStr
    ? spotsStr.split(',').filter((s) => s.trim().length > 0)
    : null;

  return { partialCondition, customSpotIds };
}
