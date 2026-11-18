import { describe, it, expect } from 'vitest';
import {
  buildGoogleMapsDirectionUrl,
  buildRouteFromOrderedSpots,
  calculateHaversineDistanceKm,
  computeAvailableMinutesFromStartEnd,
  decodeRouteFromUrlSearch,
  encodeRouteToUrlSearch,
  estimateTravelMinutes,
  formatMinutesToClockTime,
  optimizeTourismRoute,
  parseTimeToMinutes,
} from './routeOptimizer';
import {
  buildPerLegPositions,
  computeSyncRouteGeometry,
  samplePointAlongPath,
} from './routeGeometry';
import { DEFAULT_ORIGINS, INITIAL_SPOTS } from '../data/initialSpots';
import { OriginPoint, RouteCondition } from '../types/tourism';

describe('routeOptimizer 観光ルート算出ロジックの単体テスト', () => {
  it('1. 観光可能時間（1時間＝60分、1時間半＝90分、240分、360分、2泊3日＝1440分）を指定した際、算出されたルートの合計時間が指定時間を超過しないこと', () => {
    const timeBudgets = [60, 90, 120, 240, 360, 480, 720, 1440];

    for (const budget of timeBudgets) {
      const condition: RouteCondition = {
        originId: 'origin-toyama-sta',
        destinationType: 'return_to_origin',
        availableMinutes: budget,
        includeStay: false,
        transportMode: 'public',
        preferredCategories: ['experience', 'scenery', 'food'],
        pinnedSpotIds: [],
      };

      const result = optimizeTourismRoute(
        INITIAL_SPOTS,
        DEFAULT_ORIGINS,
        condition
      );

      expect(result.totalMinutes).toBe(
        result.totalTravelMinutes + result.totalStayMinutes
      );
      expect(result.totalMinutes).toBeLessThanOrEqual(budget);
      expect(result.orderedSpots.length).toBeGreaterThan(0);
    }
  });

  it('2. 「宿泊あり（includeStay: true）」を選択した場合、ルート内に必ず「宿泊（stay）」カテゴリのスポット（御宿 野乃 富山など）が組み込まれること', () => {
    const condition: RouteCondition = {
      originId: 'origin-toyama-sta',
      destinationType: 'return_to_origin',
      availableMinutes: 360,
      includeStay: true,
      transportMode: 'public',
      preferredCategories: ['experience', 'food'],
      pinnedSpotIds: [],
    };

    const result = optimizeTourismRoute(
      INITIAL_SPOTS,
      DEFAULT_ORIGINS,
      condition
    );

    const staySpotsInRoute = result.orderedSpots.filter(
      (spot) => spot.category === 'stay'
    );
    expect(staySpotsInRoute.length).toBeGreaterThanOrEqual(1);
    expect(
      staySpotsInRoute.some((s) => s.id === 'spot-onyado-nono-toyama')
    ).toBe(true);
    expect(result.totalMinutes).toBeLessThanOrEqual(condition.availableMinutes);
  });

  it('3. 富山駅・富山高山すし空港・新高岡駅の3つのデフォルト起点、およびユーザーが追加したカスタム起点のそれぞれから正常にルートが算出されること', () => {
    const customOrigin: OriginPoint = {
      id: 'origin-custom-uni',
      name: '富山大学 五福キャンパス（カスタム起点）',
      lat: 36.6998,
      lng: 137.1878,
      area: '富山市エリア',
      isCustom: true,
    };

    const allTestOrigins = [...DEFAULT_ORIGINS, customOrigin];

    for (const origin of allTestOrigins) {
      const condition: RouteCondition = {
        originId: origin.id,
        destinationType: 'end_at_last_spot',
        availableMinutes: 240,
        includeStay: false,
        transportMode: 'car',
        preferredCategories: [],
        pinnedSpotIds: [],
      };

      const result = optimizeTourismRoute(
        INITIAL_SPOTS,
        allTestOrigins,
        condition
      );

      expect(result.origin.id).toBe(origin.id);
      expect(result.orderedSpots.length).toBeGreaterThan(0);
      expect(result.totalMinutes).toBeLessThanOrEqual(240);
      expect(result.googleMapsFullUrl).toContain(
        `origin=${origin.lat},${origin.lng}`
      );
    }
  });

  it('4. ピン留め（必須立寄）されたスポットが優先的にルートへ組み込まれ、GoogleマップナビURLが正しく生成されること', () => {
    const condition: RouteCondition = {
      originId: 'origin-shintakaoka-sta',
      destinationType: 'another_origin',
      destinationOriginId: 'origin-toyama-sta',
      availableMinutes: 360,
      includeStay: false,
      transportMode: 'car',
      preferredCategories: ['experience'],
      pinnedSpotIds: ['spot-nousaku', 'spot-toyama-glass-studio'],
    };

    const result = optimizeTourismRoute(
      INITIAL_SPOTS,
      DEFAULT_ORIGINS,
      condition
    );

    const visitedIds = result.orderedSpots.map((s) => s.id);
    expect(visitedIds).toContain('spot-nousaku');
    expect(visitedIds).toContain('spot-toyama-glass-studio');
    expect(result.totalMinutes).toBeLessThanOrEqual(360);
    expect(result.googleMapsFullUrl).toContain(
      'https://www.google.com/maps/dir/?api=1'
    );
  });

  it('5. Haversine距離計算および移動時間推定が妥当な数値を返すこと', () => {
    const dist = calculateHaversineDistanceKm(36.7013, 137.2133, 36.7088, 137.2104);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(3.0);

    const publicMin = estimateTravelMinutes(10, 'public');
    const carMin = estimateTravelMinutes(10, 'car');
    const bicycleMin = estimateTravelMinutes(10, 'bicycle');
    const walkMin = estimateTravelMinutes(10, 'walk');
    expect(publicMin).toBe(24); // 10km / 25km/h * 60 = 24分
    expect(carMin).toBe(15); // 10km / 40km/h * 60 = 15分
    expect(bicycleMin).toBe(40); // 10km / 15km/h * 60 = 40分
    expect(walkMin).toBe(120); // 10km / 5km/h * 60 = 120分
  });

  it('6. 鉄道・公共交通モードでは鉄道路線グラフに沿って、車・自転車・徒歩モードでは道路グラフに沿って曲線ジオメトリが生成されること', () => {
    const publicRoute = optimizeTourismRoute(INITIAL_SPOTS, DEFAULT_ORIGINS, {
      originId: 'origin-toyama-sta',
      destinationType: 'return_to_origin',
      availableMinutes: 360,
      includeStay: false,
      transportMode: 'public',
      preferredCategories: ['transport', 'scenery'],
      pinnedSpotIds: ['spot-amaharashi-coast'],
    });
    const publicGeo = computeSyncRouteGeometry(publicRoute);
    expect(publicGeo.segments.some((s) => s.mode === 'rail')).toBe(true);
    expect(publicGeo.allPositions.length).toBeGreaterThan(
      publicRoute.orderedSpots.length + 4
    );

    const carRoute = optimizeTourismRoute(INITIAL_SPOTS, DEFAULT_ORIGINS, {
      originId: 'origin-toyama-airport',
      destinationType: 'return_to_origin',
      availableMinutes: 360,
      includeStay: false,
      transportMode: 'car',
      preferredCategories: ['experience', 'food'],
      pinnedSpotIds: ['spot-nousaku'],
    });
    const carGeo = computeSyncRouteGeometry(carRoute);
    expect(carGeo.segments.every((s) => s.mode === 'road')).toBe(true);
    expect(carGeo.allPositions.length).toBeGreaterThan(
      carRoute.orderedSpots.length + 4
    );
  });

  it('7. ルート内スポットの順序入れ替え・削除時にbuildRouteFromOrderedSpotsで移動時間・距離が正しく再計算されること', () => {
    const condition: RouteCondition = {
      originId: 'origin-toyama-sta',
      destinationType: 'return_to_origin',
      availableMinutes: 360,
      includeStay: false,
      transportMode: 'public',
      preferredCategories: ['experience', 'scenery'],
      pinnedSpotIds: [],
    };
    const baseRoute = optimizeTourismRoute(
      INITIAL_SPOTS,
      DEFAULT_ORIGINS,
      condition
    );
    expect(baseRoute.orderedSpots.length).toBeGreaterThanOrEqual(2);

    // 1番目と2番目のスポット順序を入れ替え
    const swappedSpots = [...baseRoute.orderedSpots];
    const tmp = swappedSpots[0];
    swappedSpots[0] = swappedSpots[1];
    swappedSpots[1] = tmp;

    const swappedRoute = buildRouteFromOrderedSpots(
      swappedSpots,
      DEFAULT_ORIGINS,
      condition
    );
    expect(swappedRoute.orderedSpots[0].id).toBe(baseRoute.orderedSpots[1].id);
    expect(swappedRoute.orderedSpots[1].id).toBe(baseRoute.orderedSpots[0].id);

    // 先頭スポットを削除
    const reducedSpots = swappedSpots.slice(1);
    const reducedRoute = buildRouteFromOrderedSpots(
      reducedSpots,
      DEFAULT_ORIGINS,
      condition
    );
    expect(reducedRoute.orderedSpots.length).toBe(
      baseRoute.orderedSpots.length - 1
    );

    // 各移動区間(legIndex)ごとの座標列抽出と進行方向サンプル角度が正常に算出されること
    const geo = computeSyncRouteGeometry(swappedRoute);
    const perLeg = buildPerLegPositions(geo, swappedRoute.legs.length);
    expect(perLeg.length).toBe(swappedRoute.legs.length);
    for (const legPts of perLeg) {
      expect(legPts.length).toBeGreaterThanOrEqual(2);
      const midSample = samplePointAlongPath(legPts, 0.5);
      expect(midSample).not.toBeNull();
      expect(typeof midSample?.angleDeg).toBe('number');
    }
  });

  it('8. 15分刻みの観光スタート時刻・終了予定時刻から観光可能時間および時刻表記が正確に算出されルートに反映されること', () => {
    expect(parseTimeToMinutes('09:15')).toBe(555);
    expect(parseTimeToMinutes('14:45')).toBe(885);
    const available = computeAvailableMinutesFromStartEnd('09:15', '14:45');
    expect(available).toBe(330); // 5時間30分 = 330分
    expect(formatMinutesToClockTime(555 + 90)).toBe('10:45');

    const route = optimizeTourismRoute(INITIAL_SPOTS, DEFAULT_ORIGINS, {
      originId: 'origin-toyama-sta',
      destinationType: 'return_to_origin',
      startTime: '09:15',
      endTime: '14:45',
      availableMinutes: available,
      includeStay: false,
      transportMode: 'public',
      preferredCategories: ['experience', 'food', 'scenery'],
      pinnedSpotIds: [],
    });
    expect(route.totalMinutes).toBeLessThanOrEqual(330);
    expect(route.orderedSpots.length).toBeGreaterThan(0);
  });

  it('9. 個別滞在時間微調整(customStayDurations)・時間超過アラート(isOverBudget)・URL共有エンコード/デコード・Googleマップ複数経由地URLが正しく機能すること', () => {
    const condition: RouteCondition = {
      originId: 'origin-toyama-sta',
      destinationType: 'return_to_origin',
      startTime: '09:00',
      endTime: '11:00',
      availableMinutes: 120,
      includeStay: false,
      transportMode: 'public',
      preferredCategories: ['experience'],
      pinnedSpotIds: [],
      customStayDurations: {
        'spot-ikedaya-yasubei': 150, // 120分の上限に対して150分の滞在を指定
      },
    };

    const customRoute = buildRouteFromOrderedSpots(
      [INITIAL_SPOTS[1]], // 池田屋安兵衛商店
      DEFAULT_ORIGINS,
      condition
    );
    expect(customRoute.totalStayMinutes).toBe(150);
    expect(customRoute.isOverBudget).toBe(true);
    expect(customRoute.overBudgetMinutes).toBeGreaterThan(30);

    // 複数経由地あり＋公共交通(public)時のGoogleマップURLは仕様制限回避のためdrivingにフォールバックされること
    const multiWpUrl = buildGoogleMapsDirectionUrl(
      { lat: 36.7017, lng: 137.2132 },
      { lat: 36.7017, lng: 137.2132 },
      [{ lat: 36.6885, lng: 137.2176 }],
      'public'
    );
    expect(multiWpUrl).toContain('travelmode=driving');

    // 単一区間の2点間ナビURLではtransitが維持されること
    const singleLegUrl = buildGoogleMapsDirectionUrl(
      { lat: 36.7017, lng: 137.2132 },
      { lat: 36.6885, lng: 137.2176 },
      [],
      'public'
    );
    expect(singleLegUrl).toContain('travelmode=transit');

    // URL共有パラメータへのエンコード＆デコード往復検証
    const encoded = encodeRouteToUrlSearch(condition, [
      'spot-ikedaya-yasubei',
      'spot-kansui-park',
    ]);
    const decoded = decodeRouteFromUrlSearch(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.partialCondition.originId).toBe('origin-toyama-sta');
    expect(decoded?.partialCondition.startTime).toBe('09:00');
    expect(decoded?.partialCondition.customStayDurations?.['spot-ikedaya-yasubei']).toBe(
      150
    );
    expect(decoded?.customSpotIds).toEqual([
      'spot-ikedaya-yasubei',
      'spot-kansui-park',
    ]);
  });
});
