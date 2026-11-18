// 観光スポットおよびルート最適化に関する型定義

export type SpotCategory = 'experience' | 'scenery' | 'food' | 'transport' | 'stay';

export type SpotArea =
  | '富山市エリア'
  | '呉西（高岡・氷見・射水）エリア'
  | '呉東（黒部・魚津・滑川）エリア'
  | '南砺・砺波エリア';

export type ResearcherGroup =
  | '富山湾クルーズ班'
  | '食・魚市場プロジェクト班'
  | '体験型観光班'
  | '交通・データ班'
  | '景色班';

export const RESEARCHER_GROUPS: ResearcherGroup[] = [
  '富山湾クルーズ班',
  '食・魚市場プロジェクト班',
  '体験型観光班',
  '交通・データ班',
  '景色班',
];

export function normalizeResearcherGroup(
  rawGroup?: string,
  category?: SpotCategory
): ResearcherGroup {
  if (rawGroup && (RESEARCHER_GROUPS as string[]).includes(rawGroup)) {
    return rawGroup as ResearcherGroup;
  }
  if (rawGroup) {
    if (rawGroup.includes('クルーズ') || rawGroup.includes('水上')) {
      return '富山湾クルーズ班';
    }
    if (rawGroup.includes('食') || rawGroup.includes('魚')) {
      return '食・魚市場プロジェクト班';
    }
    if (rawGroup.includes('体験') || rawGroup.includes('クラフト')) {
      return '体験型観光班';
    }
    if (rawGroup.includes('交通') || rawGroup.includes('モビリティ')) {
      return '交通・データ班';
    }
    if (rawGroup.includes('景色') || rawGroup.includes('空間') || rawGroup.includes('建築')) {
      return '景色班';
    }
  }
  switch (category) {
    case 'food':
      return '食・魚市場プロジェクト班';
    case 'experience':
      return '体験型観光班';
    case 'transport':
      return '交通・データ班';
    case 'scenery':
    case 'stay':
    default:
      return '景色班';
  }
}

export interface Spot {
  id: string;
  name: string;
  category: SpotCategory;
  lat: number;
  lng: number;
  area: SpotArea;
  stayDurationMinutes: number;
  description: string;
  studentComment: string;
  researcherGroup: string;
  imageUrl: string;
  imageUrls?: string[]; // 最大10枚までのスポット写真配列（スワイプ表示対応）
  priceRange: string;
  openingHours: string;
  officialUrl?: string;
}

export const MAX_SPOT_IMAGES = 10;

export const DEFAULT_SPOT_IMAGE_URL =
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=900&q=80';

/**
 * スポットに登録されている写真配列（最大10枚）を正規化して返す
 */
export function getSpotImages(
  spot: Pick<Spot, 'imageUrl' | 'imageUrls'>
): string[] {
  const list: string[] = [];
  if (Array.isArray(spot.imageUrls)) {
    for (const url of spot.imageUrls) {
      if (typeof url === 'string' && url.trim().length > 0) {
        list.push(url.trim());
      }
    }
  }
  if (list.length === 0 && spot.imageUrl && spot.imageUrl.trim().length > 0) {
    list.push(spot.imageUrl.trim());
  }
  if (list.length === 0) {
    list.push(DEFAULT_SPOT_IMAGE_URL);
  }
  return list.slice(0, MAX_SPOT_IMAGES);
}

/**
 * 学生フィールドワークコメントから「一文で伝える学生目線の魅力」を抽出・整形する
 */
export function getOneSentenceStudentAppeal(
  spot: Pick<Spot, 'id' | 'studentComment'>
): string {
  const raw = (spot.studentComment || '').trim();
  if (!raw) {
    return '富大生がフィールドワークで見つけた、街歩きと合わせて体感したい推しスポットです。';
  }
  // 最初の文（「。」または「！」で区切られた1文）が短すぎる場合は全体を1文にまとめる
  const firstMatch = raw.match(/^[^。！!]+[。！!]/);
  if (firstMatch && firstMatch[0].length >= 22) {
    return firstMatch[0];
  }
  // 2文構成の場合は読点でつないで一文として読みやすく整形
  const combined = raw
    .replace(/[！!]\s*/g, '、')
    .replace(/。\s*(?=.)/g, '、')
    .trim();
  return combined.endsWith('。') ? combined : `${combined}。`;
}

/**
 * スポットの priceRange 文字列から最小・最大予算(円)を推定し、ルート全体の予算目安文字列を算出する
 */
export function estimateRouteBudgetJa(orderedSpots: Spot[]): string {
  if (orderedSpots.length === 0) return '0円';
  let totalMin = 0;
  let totalMax = 0;

  for (const spot of orderedSpots) {
    const text = spot.priceRange || '';
    const matches = Array.from(text.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*円/g));
    const nums = matches
      .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0);

    if (nums.length === 0) {
      // 無料スポット
      continue;
    } else if (nums.length === 1) {
      const val = nums[0];
      if (text.includes('無料')) {
        totalMin += 0;
        totalMax += val;
      } else {
        totalMin += val;
        totalMax += val;
      }
    } else {
      const minVal = Math.min(...nums);
      const maxVal = Math.max(...nums);
      if (text.includes('無料')) {
        totalMin += 0;
        totalMax += maxVal;
      } else {
        totalMin += minVal;
        totalMax += maxVal;
      }
    }
  }

  if (totalMin === 0 && totalMax === 0) {
    return '無料（自由散策）';
  }
  if (totalMin === totalMax) {
    return `約 ${totalMin.toLocaleString()}円`;
  }
  return `約 ${totalMin.toLocaleString()}円〜${totalMax.toLocaleString()}円`;
}

export interface OriginPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area?: SpotArea;
  isCustom?: boolean;
}

export type TransportMode = 'public' | 'car' | 'bicycle' | 'walk';

export type DestinationType = 'return_to_origin' | 'another_origin' | 'end_at_last_spot';

export interface RouteCondition {
  originId: string;
  destinationType: DestinationType;
  destinationOriginId?: string;
  startTime?: string; // 15分刻みの観光スタート時刻（例: '09:00'）
  endTime?: string; // 15分刻みの観光終了予定時刻（例: '15:00'）
  availableMinutes: number;
  includeStay: boolean;
  transportMode: TransportMode;
  preferredCategories: SpotCategory[];
  pinnedSpotIds: string[];
  customStayDurations?: Record<string, number>; // スポットごとの滞在時間個別調整（spotId -> 分）
}

export interface RouteLeg {
  fromName: string;
  fromLat: number;
  fromLng: number;
  toSpot?: Spot;
  toName: string;
  toLat: number;
  toLng: number;
  distanceKm: number;
  travelMinutes: number;
  stayMinutes: number;
  arrivalTimeMinutes: number;
  departureTimeMinutes: number;
  googleMapsLegUrl: string;
  isOutsideOpeningHours?: boolean;
  openingHoursNote?: string;
}

export interface OptimizedRoute {
  origin: OriginPoint;
  destination?: OriginPoint;
  destinationType: DestinationType;
  orderedSpots: Spot[];
  legs: RouteLeg[];
  totalTravelMinutes: number;
  totalStayMinutes: number;
  totalMinutes: number;
  totalDistanceKm: number;
  googleMapsFullUrl: string;
  transportMode: TransportMode;
  includeStay: boolean;
  isOverBudget?: boolean;
  overBudgetMinutes?: number;
}

export interface CategoryMetaItem {
  id: SpotCategory;
  label: string;
  shortLabel: string;
  color: string;
  bgLight: string;
  textClass: string;
  borderClass: string;
  description: string;
}

export const CATEGORY_META: Record<SpotCategory, CategoryMetaItem> = {
  experience: {
    id: 'experience',
    label: '体験・クラフト',
    shortLabel: '体験',
    color: '#10b981', // エメラルドグリーン
    bgLight: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-300',
    description: 'ガラス造形・和漢薬調合・鋳物製作など富山の技を体感',
  },
  scenery: {
    id: 'scenery',
    label: '景色・都市空間',
    shortLabel: '景色',
    color: '#0284c7', // コバルトブルー
    bgLight: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-300',
    description: '立山連峰の眺望・環水公園・歴史的町並みと現代建築',
  },
  food: {
    id: 'food',
    label: '食・ガストロノミー',
    shortLabel: '食',
    color: '#f59e0b', // アンバーオレンジ
    bgLight: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-300',
    description: '富山湾の朝獲れ海鮮・ます寿し・リノベーションカフェ',
  },
  transport: {
    id: 'transport',
    label: '交通・モビリティ',
    shortLabel: '交通',
    color: '#8b5cf6', // パープル
    bgLight: 'bg-violet-50',
    textClass: 'text-violet-700',
    borderClass: 'border-violet-300',
    description: 'LRT路面電車・運河クルーズ・峡谷トロッコなど移動自体を楽しむ',
  },
  stay: {
    id: 'stay',
    label: '宿泊・リトリート',
    shortLabel: '宿泊',
    color: '#3730a3', // インディゴネイビー
    bgLight: 'bg-indigo-50',
    textClass: 'text-indigo-800',
    borderClass: 'border-indigo-300',
    description: '天然温泉・アートホテル・滞在型リトリート拠点',
  },
};

export const ALL_CATEGORIES: SpotCategory[] = [
  'experience',
  'scenery',
  'food',
  'transport',
  'stay',
];

export const SPOT_AREAS: SpotArea[] = [
  '富山市エリア',
  '呉西（高岡・氷見・射水）エリア',
  '呉東（黒部・魚津・滑川）エリア',
  '南砺・砺波エリア',
];
