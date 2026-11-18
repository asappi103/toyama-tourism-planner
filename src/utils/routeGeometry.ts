import { OptimizedRoute, TransportMode } from '../types/tourism';

export interface RouteSegmentGeometry {
  legIndex: number;
  mode: 'rail' | 'road';
  positions: [number, number][];
}

export interface RouteGeometryResult {
  allPositions: [number, number][];
  segments: RouteSegmentGeometry[];
}

interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  kind: 'rail' | 'road';
}

interface GraphEdge {
  from: string;
  to: string;
  waypoints?: [number, number][]; // 中間曲線座標（from -> to の順）
}

// 2点間の簡易球面距離(km)
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================================
// 1. 富山県内 専用軌道・鉄道路線グラフ（OpenStreetMap 上の実際の鉄道路線座標に準拠）
// ※道路上を走る路面電車（富山市内電車など）は要件③に基づき道路上の最短経路としてルーティング
// ============================================================================
const RAIL_NODES: GraphNode[] = [
  // 富山駅（JR・あいの風・新幹線・地鉄・富山港線の結節点）
  { id: 'r_toyama_sta', lat: 36.701729, lng: 137.213227, kind: 'rail' },

  // 富山港線（ポートラム専用軌道区間：奥田中学校前〜下奥井〜越中中島〜東岩瀬〜岩瀬浜）
  { id: 'r_okuda_jhs', lat: 36.70865, lng: 137.21895, kind: 'rail' },
  { id: 'r_shimookui', lat: 36.71285, lng: 137.22155, kind: 'rail' },
  { id: 'r_awajima', lat: 36.71765, lng: 137.22295, kind: 'rail' },
  { id: 'r_nakajima', lat: 36.72195, lng: 137.22415, kind: 'rail' },
  { id: 'r_jogawara', lat: 36.72945, lng: 137.22635, kind: 'rail' },
  { id: 'r_hasumachi', lat: 36.74235, lng: 137.23015, kind: 'rail' },
  { id: 'r_higashiiwase', lat: 36.75245, lng: 137.23415, kind: 'rail' },
  { id: 'r_iwasehama', lat: 36.761472, lng: 137.233944, kind: 'rail' },

  // あいの風とやま鉄道・北陸新幹線（富山〜呉羽〜小杉〜越中大門〜高岡・新高岡）
  { id: 'r_kureha', lat: 36.71922, lng: 137.15725, kind: 'rail' },
  { id: 'r_kosugi', lat: 36.71652, lng: 137.09852, kind: 'rail' },
  { id: 'r_daimon', lat: 36.72025, lng: 137.05105, kind: 'rail' },
  { id: 'r_takaoka', lat: 36.741444, lng: 137.015306, kind: 'rail' },
  { id: 'r_shintakaoka', lat: 36.726976, lng: 137.011852, kind: 'rail' },

  // JR城端線（高岡〜新高岡〜二塚〜戸出〜砺波〜福野〜城端）
  { id: 'r_futatsuka', lat: 36.7118, lng: 137.0072, kind: 'rail' },
  { id: 'r_toide', lat: 36.6805, lng: 136.992, kind: 'rail' },
  { id: 'r_tonami', lat: 36.6462, lng: 136.9628, kind: 'rail' },
  { id: 'r_fukuno', lat: 36.5935, lng: 136.9355, kind: 'rail' },
  { id: 'r_johana', lat: 36.5218, lng: 136.9022, kind: 'rail' },

  // JR氷見線（高岡〜越中中川〜能町〜伏木〜越中国分〜雨晴〜島尾〜氷見）
  { id: 'r_nakagawa', lat: 36.7478, lng: 137.0242, kind: 'rail' },
  { id: 'r_nomachi', lat: 36.7685, lng: 137.0365, kind: 'rail' },
  { id: 'r_fushiki', lat: 36.7915, lng: 137.0558, kind: 'rail' },
  { id: 'r_kokubu', lat: 36.8035, lng: 137.0502, kind: 'rail' },
  { id: 'r_amaharashi', lat: 36.814889, lng: 137.041583, kind: 'rail' },
  { id: 'r_shimao', lat: 36.8338, lng: 137.0132, kind: 'rail' },
  { id: 'r_himi', lat: 36.8542, lng: 136.9952, kind: 'rail' },

  // 万葉線（高岡駅〜米島口〜中伏木〜六渡寺〜新町口(内川)〜海王丸）
  { id: 'r_yonejimaguchi', lat: 36.7745, lng: 137.0422, kind: 'rail' },
  { id: 'r_nakafushiki', lat: 36.7905, lng: 137.0592, kind: 'rail' },
  { id: 'r_rokudoji', lat: 36.7862, lng: 137.0655, kind: 'rail' },
  { id: 'r_shinmachiguchi', lat: 36.7798, lng: 137.0842, kind: 'rail' },
  { id: 'r_kaiomaru', lat: 36.7748, lng: 137.1075, kind: 'rail' },

  // 富山地方鉄道本線・黒部峡谷鉄道（電鉄富山〜寺田〜上市〜滑川〜魚津〜黒部〜新黒部〜宇奈月温泉）
  { id: 'r_terada', lat: 36.6952, lng: 137.3105, kind: 'rail' },
  { id: 'r_kamiichi', lat: 36.7025, lng: 137.3565, kind: 'rail' },
  { id: 'r_namerikawa', lat: 36.7652, lng: 137.3412, kind: 'rail' },
  { id: 'r_uozu', lat: 36.8265, lng: 137.4052, kind: 'rail' },
  { id: 'r_kurobe', lat: 36.8715, lng: 137.4488, kind: 'rail' },
  { id: 'r_shinkurobe', lat: 36.8732, lng: 137.4815, kind: 'rail' },
  { id: 'r_unazuki', lat: 36.814966, lng: 137.586053, kind: 'rail' },
];

const RAIL_EDGES: GraphEdge[] = [
  // 富山港線（富山駅北〜永楽町〜奥田中学校前〜岩瀬浜：OSM軌道曲線）
  {
    from: 'r_toyama_sta',
    to: 'r_okuda_jhs',
    waypoints: [
      [36.70235, 137.21338],
      [36.70265, 137.21395],
      [36.70455, 137.21435],
      [36.70625, 137.21472],
      [36.70775, 137.21505],
      [36.70795, 137.21625],
      [36.70815, 137.21765],
    ],
  },
  { from: 'r_okuda_jhs', to: 'r_shimookui' },
  { from: 'r_shimookui', to: 'r_awajima' },
  { from: 'r_awajima', to: 'r_nakajima' },
  { from: 'r_nakajima', to: 'r_jogawara' },
  {
    from: 'r_jogawara',
    to: 'r_hasumachi',
    waypoints: [[36.73685, 137.22855]],
  },
  {
    from: 'r_hasumachi',
    to: 'r_higashiiwase',
    waypoints: [[36.74695, 137.23205]],
  },
  {
    from: 'r_higashiiwase',
    to: 'r_iwasehama',
    waypoints: [[36.75745, 137.23455]],
  },

  // あいの風とやま鉄道（富山〜呉羽〜小杉〜越中大門〜高岡：OSM実線路曲線）
  {
    from: 'r_toyama_sta',
    to: 'r_kureha',
    waypoints: [
      [36.7016, 137.2065],
      [36.7032, 137.1982],
      [36.7078, 137.1885],
      [36.7138, 137.1775],
      [36.7178, 137.1675],
    ],
  },
  {
    from: 'r_kureha',
    to: 'r_kosugi',
    waypoints: [
      [36.7195, 137.1455],
      [36.7182, 137.1315],
      [36.7168, 137.1155],
    ],
  },
  {
    from: 'r_kosugi',
    to: 'r_daimon',
    waypoints: [
      [36.7166, 137.0825],
      [36.7182, 137.0655],
    ],
  },
  {
    from: 'r_daimon',
    to: 'r_takaoka',
    waypoints: [
      [36.7255, 137.0415],
      [36.7325, 137.0305],
      [36.7385, 137.0212],
    ],
  },

  // 北陸新幹線（富山〜新高岡〜黒部宇奈月温泉：OSM実線路曲線）
  {
    from: 'r_toyama_sta',
    to: 'r_shintakaoka',
    waypoints: [
      [36.7022, 137.1965],
      [36.7048, 137.1725],
      [36.7068, 137.1425],
      [36.7098, 137.1085],
      [36.7155, 137.0685],
      [36.7222, 137.0335],
    ],
  },
  {
    from: 'r_toyama_sta',
    to: 'r_shinkurobe',
    waypoints: [
      [36.7045, 137.2455],
      [36.7155, 137.2955],
      [36.7425, 137.3425],
      [36.7785, 137.3815],
      [36.8225, 137.4285],
    ],
  },

  // JR城端線（高岡〜新高岡〜砺波〜城端）
  {
    from: 'r_takaoka',
    to: 'r_shintakaoka',
    waypoints: [[36.7355, 137.0125]],
  },
  { from: 'r_shintakaoka', to: 'r_futatsuka' },
  { from: 'r_futatsuka', to: 'r_toide' },
  { from: 'r_toide', to: 'r_tonami' },
  { from: 'r_tonami', to: 'r_fukuno' },
  { from: 'r_fukuno', to: 'r_johana' },

  // JR氷見線（高岡〜伏木〜雨晴〜氷見）
  { from: 'r_takaoka', to: 'r_nakagawa' },
  { from: 'r_nakagawa', to: 'r_nomachi' },
  { from: 'r_nomachi', to: 'r_fushiki' },
  { from: 'r_fushiki', to: 'r_kokubu' },
  {
    from: 'r_kokubu',
    to: 'r_amaharashi',
    waypoints: [
      [36.809, 137.0468],
      [36.8125, 137.0435],
    ],
  },
  {
    from: 'r_amaharashi',
    to: 'r_shimao',
    waypoints: [
      [36.8205, 137.031],
      [36.824, 137.0245],
    ],
  },
  {
    from: 'r_shimao',
    to: 'r_himi',
    waypoints: [[36.8445, 137.0028]],
  },

  // 万葉線（高岡〜米島口〜中伏木〜六渡寺〜新町口〜海王丸）
  {
    from: 'r_takaoka',
    to: 'r_yonejimaguchi',
    waypoints: [
      [36.7442, 137.0136],
      [36.7505, 137.0128],
      [36.7555, 137.0172],
      [36.7648, 137.0322],
    ],
  },
  {
    from: 'r_yonejimaguchi',
    to: 'r_nakafushiki',
    waypoints: [[36.7848, 137.0518]],
  },
  { from: 'r_fushiki', to: 'r_nakafushiki' },
  { from: 'r_nakafushiki', to: 'r_rokudoji' },
  {
    from: 'r_rokudoji',
    to: 'r_shinmachiguchi',
    waypoints: [
      [36.7845, 137.0715],
      [36.7812, 137.0772],
    ],
  },
  {
    from: 'r_shinmachiguchi',
    to: 'r_kaiomaru',
    waypoints: [
      [36.7765, 137.0885],
      [36.7762, 137.0985],
    ],
  },

  // 富山地方鉄道本線（電鉄富山〜寺田〜上市〜滑川〜魚津〜黒部〜新黒部〜宇奈月温泉）
  {
    from: 'r_toyama_sta',
    to: 'r_terada',
    waypoints: [
      [36.7005, 137.229],
      [36.7042, 137.2535],
      [36.6985, 137.2845],
    ],
  },
  { from: 'r_terada', to: 'r_kamiichi' },
  { from: 'r_kamiichi', to: 'r_namerikawa' },
  { from: 'r_namerikawa', to: 'r_uozu' },
  { from: 'r_uozu', to: 'r_kurobe' },
  { from: 'r_kurobe', to: 'r_shinkurobe' },
  {
    from: 'r_shinkurobe',
    to: 'r_unazuki',
    waypoints: [
      [36.8625, 137.515],
      [36.854, 137.552],
      [36.835, 137.568],
    ],
  },
];

// ============================================================================
// 2. 富山県内 道路＆併用軌道（路面電車通り）ネットワークグラフ（OpenStreetMap 交差点完全準拠）
// ============================================================================
const ROAD_NODES: GraphNode[] = [
  // 富山駅・環水公園・ブールバール周辺
  { id: 'd_toyama_sta', lat: 36.70155, lng: 137.21325, kind: 'road' },
  { id: 'd_toyama_sta_north', lat: 36.70225, lng: 137.21318, kind: 'road' },
  { id: 'd_boulevard_mid', lat: 36.7052, lng: 137.21275, kind: 'road' },
  { id: 'd_jiyukan_jct', lat: 36.70735, lng: 137.21245, kind: 'road' },
  { id: 'd_kansui_entry', lat: 36.7085, lng: 137.21255, kind: 'road' },
  { id: 'd_kansui_park', lat: 36.709444, lng: 137.212683, kind: 'road' },
  { id: 'd_suijo_line', lat: 36.709616, lng: 137.211479, kind: 'road' },

  // 富山駅南口広場・駅前通り
  { id: 'd_sta_south_plaza', lat: 36.70052, lng: 137.21335, kind: 'road' },
  { id: 'd_sushitama_front', lat: 36.7005, lng: 137.214372, kind: 'road' },
  { id: 'd_sushitama', lat: 36.700867, lng: 137.214372, kind: 'road' },
  { id: 'd_esta_front', lat: 36.70048, lng: 137.21485, kind: 'road' },
  { id: 'd_chitetsu_corner', lat: 36.70012, lng: 137.21575, kind: 'road' },

  // すずかけ通り（路面電車本線：地鉄ビル前〜電気ビル前〜桜橋〜荒町〜中町〜西町）
  { id: 'd_denki_bldg', lat: 36.69875, lng: 137.21622, kind: 'road' },
  { id: 'd_sakurabashi', lat: 36.69672, lng: 137.21655, kind: 'road' },
  { id: 'd_aramachi', lat: 36.69348, lng: 137.21708, kind: 'road' },
  { id: 'd_nakamachi', lat: 36.6905, lng: 137.21668, kind: 'road' },
  { id: 'd_nishicho_jct', lat: 36.68912, lng: 137.21642, kind: 'road' },

  // 城址大通り（路面電車支線・環状線：富山駅前西〜新富町〜県庁前〜丸の内〜国際会議場前）
  { id: 'd_sta_west_jct', lat: 36.70022, lng: 137.21252, kind: 'road' },
  { id: 'd_shintomicho', lat: 36.69895, lng: 137.21218, kind: 'road' },
  { id: 'd_kenchomae', lat: 36.6961, lng: 137.21125, kind: 'road' },
  { id: 'd_marunouchi_jct', lat: 36.69322, lng: 137.2103, kind: 'road' },
  { id: 'd_joshi_north_e', lat: 36.69335, lng: 137.2142, kind: 'road' },
  { id: 'd_kokusai', lat: 36.69135, lng: 137.21025, kind: 'road' },
  { id: 'd_heiwa_west_jct', lat: 36.68978, lng: 137.21022, kind: 'road' },

  // 平和通り（路面電車環状線・まちなか東西軸：大手モール/野乃〜グランドプラザ〜ガラス美術館〜西町〜池田屋安兵衛商店）
  { id: 'd_otemall_nono', lat: 36.689685, lng: 137.211989, kind: 'road' },
  { id: 'd_grandplaza', lat: 36.68928, lng: 137.21415, kind: 'road' },
  { id: 'd_kirari_front', lat: 36.68915, lng: 137.21515, kind: 'road' },
  { id: 'd_kirari', lat: 36.688412, lng: 137.215089, kind: 'road' },
  { id: 'd_ikedaya_front', lat: 36.68915, lng: 137.217695, kind: 'road' },
  { id: 'd_ikedaya', lat: 36.688541, lng: 137.217695, kind: 'road' },

  // 岩瀬エリア（県道30号〜GARE GARE）
  { id: 'd_okuda_road', lat: 36.7082, lng: 137.2165, kind: 'road' },
  { id: 'd_nakajima_road', lat: 36.722, lng: 137.222, kind: 'road' },
  { id: 'd_higashiiwase_road', lat: 36.752, lng: 137.231, kind: 'road' },
  { id: 'd_gare_gare', lat: 36.760452, lng: 137.233785, kind: 'road' },

  // 神通川橋梁・五福・呉羽・古沢（富山ガラス工房）
  { id: 'd_yasunoya', lat: 36.69225, lng: 137.2012, kind: 'road' },
  { id: 'd_toyama_ohashi_w', lat: 36.6935, lng: 137.1925, kind: 'road' },
  { id: 'd_gofuku', lat: 36.6975, lng: 137.1855, kind: 'road' },
  { id: 'd_kureha_honmachi', lat: 36.7155, lng: 137.162, kind: 'road' },
  { id: 'd_chayamachi', lat: 36.705, lng: 137.156, kind: 'road' },
  { id: 'd_glass_studio', lat: 36.695361, lng: 137.146333, kind: 'road' },
  { id: 'd_arisawa_bridge_e', lat: 36.678, lng: 137.196, kind: 'road' },
  { id: 'd_arisawa_bridge_w', lat: 36.6805, lng: 137.184, kind: 'road' },

  // 国道41号・富山空港・八日町（だいせん丸）・神通峡（雅樂倶）
  { id: 'd_jonan_r41', lat: 36.68, lng: 137.2145, kind: 'road' },
  { id: 'd_kakeo', lat: 36.6685, lng: 137.2105, kind: 'road' },
  { id: 'd_daisenmaru', lat: 36.646812, lng: 137.204174, kind: 'road' },
  { id: 'd_airport_jct', lat: 36.6465, lng: 137.1965, kind: 'road' },
  { id: 'd_toyama_airport', lat: 36.643421, lng: 137.189353, kind: 'road' },
  { id: 'd_fuchu_bridge', lat: 36.658, lng: 137.168, kind: 'road' },
  { id: 'd_osawano', lat: 36.605, lng: 137.21, kind: 'road' },
  { id: 'd_garaku', lat: 36.560528, lng: 137.203889, kind: 'road' },

  // 小杉・射水・内川・高岡・新高岡・能作
  { id: 'd_ikeda', lat: 36.701, lng: 137.118, kind: 'road' },
  { id: 'd_kosugi_ic', lat: 36.7055, lng: 137.092, kind: 'road' },
  { id: 'd_kosugi_sta', lat: 36.7165, lng: 137.0985, kind: 'road' },
  { id: 'd_daimon_south', lat: 36.712, lng: 137.052, kind: 'road' },
  { id: 'd_shogawa_bridge', lat: 36.7235, lng: 137.031, kind: 'road' },
  { id: 'd_shintakaoka', lat: 36.726976, lng: 137.011852, kind: 'road' },
  { id: 'd_zuiryuji', lat: 36.735593, lng: 137.010439, kind: 'road' },
  { id: 'd_takaoka_sta', lat: 36.741444, lng: 137.015306, kind: 'road' },
  { id: 'd_office_park', lat: 36.68, lng: 137.001, kind: 'road' },
  { id: 'd_nousaku', lat: 36.668497, lng: 136.997417, kind: 'road' },
  { id: 'd_imizu_city', lat: 36.742, lng: 137.091, kind: 'road' },
  { id: 'd_uchikawa', lat: 36.781032, lng: 137.087699, kind: 'road' },

  // 伏木・雨晴・氷見
  { id: 'd_fushiki_bridge', lat: 36.7885, lng: 137.062, kind: 'road' },
  { id: 'd_kokubu_coast', lat: 36.8035, lng: 137.0502, kind: 'road' },
  { id: 'd_amaharashi', lat: 36.814889, lng: 137.041583, kind: 'road' },
  { id: 'd_shimao_coast', lat: 36.834, lng: 137.0135, kind: 'road' },
  { id: 'd_himi_center', lat: 36.8545, lng: 136.995, kind: 'road' },
  { id: 'd_r160_takaoka_n', lat: 36.768, lng: 137.011, kind: 'road' },
  { id: 'd_r160_himi_s', lat: 36.825, lng: 136.998, kind: 'road' },

  // 砺波・南砺・五箇山（相倉合掌造り集落）
  { id: 'd_toide_jct', lat: 36.665, lng: 136.992, kind: 'road' },
  { id: 'd_tonami_ic', lat: 36.638, lng: 136.958, kind: 'road' },
  { id: 'd_fukuno_jct', lat: 36.5935, lng: 136.9355, kind: 'road' },
  { id: 'd_johana_jct', lat: 36.5218, lng: 136.9022, kind: 'road' },
  { id: 'd_gokayama_tunnel', lat: 36.465, lng: 136.915, kind: 'road' },
  { id: 'd_ainokura', lat: 36.425869, lng: 136.936853, kind: 'road' },

  // 呉東（滑川・魚津・黒部・宇奈月温泉）
  { id: 'd_r8_mizuhashi', lat: 36.745, lng: 137.302, kind: 'road' },
  { id: 'd_r8_namerikawa', lat: 36.768, lng: 137.352, kind: 'road' },
  { id: 'd_r8_uozu', lat: 36.825, lng: 137.412, kind: 'road' },
  { id: 'd_r8_kurobe', lat: 36.872, lng: 137.458, kind: 'road' },
  { id: 'd_kurobe_ic', lat: 36.873, lng: 137.482, kind: 'road' },
  { id: 'd_aimoto_bridge', lat: 36.8535, lng: 137.5525, kind: 'road' },
  { id: 'd_unazuki', lat: 36.814966, lng: 137.586053, kind: 'road' },
];

const ROAD_EDGES: GraphEdge[] = [
  // 富山駅北口〜ブールバール〜環水公園〜富岩水上ライン（直線大通り）
  { from: 'd_toyama_sta', to: 'd_toyama_sta_north' },
  { from: 'd_toyama_sta_north', to: 'd_boulevard_mid' },
  { from: 'd_boulevard_mid', to: 'd_jiyukan_jct' },
  { from: 'd_jiyukan_jct', to: 'd_kansui_entry' },
  { from: 'd_kansui_entry', to: 'd_kansui_park' },
  { from: 'd_kansui_park', to: 'd_suijo_line' },
  { from: 'd_kansui_entry', to: 'd_suijo_line' },

  // 富山駅南口〜駅前通り（西・東）
  { from: 'd_toyama_sta', to: 'd_sta_south_plaza' },
  { from: 'd_sta_south_plaza', to: 'd_sta_west_jct' },
  { from: 'd_sta_south_plaza', to: 'd_sushitama_front' },
  { from: 'd_sushitama_front', to: 'd_sushitama' },
  { from: 'd_sushitama_front', to: 'd_esta_front' },
  {
    from: 'd_esta_front',
    to: 'd_chitetsu_corner',
    waypoints: [[36.70035, 137.21545]],
  },

  // すずかけ通り（路面電車本線：地鉄ビル前〜電気ビル前〜桜橋〜荒町〜中町〜西町）
  {
    from: 'd_chitetsu_corner',
    to: 'd_denki_bldg',
    waypoints: [[36.69975, 137.21608]],
  },
  { from: 'd_denki_bldg', to: 'd_sakurabashi' },
  { from: 'd_sakurabashi', to: 'd_aramachi' },
  { from: 'd_aramachi', to: 'd_nakamachi' },
  { from: 'd_nakamachi', to: 'd_nishicho_jct' },

  // 城址大通り（路面電車支線・環状線：富山駅前西〜新富町〜県庁前〜丸の内〜国際会議場前〜平和通り西角）
  { from: 'd_sta_west_jct', to: 'd_shintomicho' },
  { from: 'd_shintomicho', to: 'd_kenchomae' },
  { from: 'd_kenchomae', to: 'd_marunouchi_jct' },
  { from: 'd_marunouchi_jct', to: 'd_kokusai' },
  { from: 'd_kokusai', to: 'd_heiwa_west_jct' },

  // 県庁前通り＆城址公園北通り（東西連絡道路）
  { from: 'd_kenchomae', to: 'd_sakurabashi' },
  { from: 'd_marunouchi_jct', to: 'd_joshi_north_e' },
  { from: 'd_joshi_north_e', to: 'd_aramachi' },

  // 平和通り（大手モール/野乃〜グランドプラザ〜TOYAMAキラリ/ガラス美術館〜西町〜池田屋安兵衛商店）
  { from: 'd_heiwa_west_jct', to: 'd_otemall_nono' },
  { from: 'd_otemall_nono', to: 'd_grandplaza' },
  { from: 'd_grandplaza', to: 'd_kirari_front' },
  { from: 'd_kirari_front', to: 'd_kirari' },
  { from: 'd_kirari_front', to: 'd_nishicho_jct' },
  { from: 'd_nishicho_jct', to: 'd_ikedaya_front' },
  { from: 'd_ikedaya_front', to: 'd_ikedaya' },

  // 岩瀬方面（県道30号：環水公園東〜中島〜東岩瀬〜GARE GARE）
  { from: 'd_toyama_sta_north', to: 'd_okuda_road' },
  { from: 'd_jiyukan_jct', to: 'd_okuda_road' },
  { from: 'd_okuda_road', to: 'd_nakajima_road' },
  {
    from: 'd_nakajima_road',
    to: 'd_higashiiwase_road',
    waypoints: [[36.738, 137.226]],
  },
  { from: 'd_higashiiwase_road', to: 'd_gare_gare' },

  // 富山大橋・五福・呉羽・富山ガラス工房・有沢橋
  { from: 'd_marunouchi_jct', to: 'd_yasunoya' },
  { from: 'd_yasunoya', to: 'd_toyama_ohashi_w' },
  { from: 'd_toyama_ohashi_w', to: 'd_gofuku' },
  {
    from: 'd_gofuku',
    to: 'd_kureha_honmachi',
    waypoints: [[36.7085, 137.175]],
  },
  { from: 'd_kureha_honmachi', to: 'd_chayamachi' },
  {
    from: 'd_chayamachi',
    to: 'd_glass_studio',
    waypoints: [[36.6995, 137.149]],
  },
  { from: 'd_gofuku', to: 'd_chayamachi' },
  { from: 'd_heiwa_west_jct', to: 'd_arisawa_bridge_e' },
  { from: 'd_arisawa_bridge_e', to: 'd_arisawa_bridge_w' },
  {
    from: 'd_arisawa_bridge_w',
    to: 'd_glass_studio',
    waypoints: [[36.691, 137.158]],
  },

  // 国道41号（城南〜掛尾〜だいせん丸〜富山空港〜大沢野〜雅樂倶）
  { from: 'd_kirari_front', to: 'd_jonan_r41' },
  { from: 'd_otemall_nono', to: 'd_jonan_r41' },
  { from: 'd_jonan_r41', to: 'd_kakeo' },
  { from: 'd_arisawa_bridge_e', to: 'd_kakeo' },
  { from: 'd_kakeo', to: 'd_daisenmaru' },
  { from: 'd_daisenmaru', to: 'd_airport_jct' },
  { from: 'd_kakeo', to: 'd_airport_jct' },
  { from: 'd_airport_jct', to: 'd_toyama_airport' },
  { from: 'd_toyama_airport', to: 'd_fuchu_bridge' },
  {
    from: 'd_fuchu_bridge',
    to: 'd_glass_studio',
    waypoints: [[36.681, 137.156]],
  },
  { from: 'd_fuchu_bridge', to: 'd_arisawa_bridge_w' },
  { from: 'd_daisenmaru', to: 'd_osawano' },
  { from: 'd_airport_jct', to: 'd_osawano' },
  {
    from: 'd_osawano',
    to: 'd_garaku',
    waypoints: [[36.578, 137.206]],
  },

  // 県道62号・小杉・高岡・新高岡・能作
  { from: 'd_glass_studio', to: 'd_ikeda' },
  { from: 'd_ikeda', to: 'd_kosugi_ic' },
  { from: 'd_kosugi_ic', to: 'd_kosugi_sta' },
  { from: 'd_kosugi_sta', to: 'd_daimon_south' },
  { from: 'd_kosugi_ic', to: 'd_daimon_south' },
  { from: 'd_daimon_south', to: 'd_shogawa_bridge' },
  { from: 'd_shogawa_bridge', to: 'd_shintakaoka' },
  { from: 'd_shintakaoka', to: 'd_zuiryuji' },
  { from: 'd_zuiryuji', to: 'd_takaoka_sta' },
  {
    from: 'd_shintakaoka',
    to: 'd_office_park',
    waypoints: [[36.705, 137.005]],
  },
  { from: 'd_office_park', to: 'd_nousaku' },
  { from: 'd_kosugi_ic', to: 'd_nousaku' },

  // 射水・内川・雨晴・氷見
  { from: 'd_kosugi_sta', to: 'd_imizu_city' },
  { from: 'd_imizu_city', to: 'd_uchikawa' },
  { from: 'd_uchikawa', to: 'd_fushiki_bridge' },
  {
    from: 'd_takaoka_sta',
    to: 'd_fushiki_bridge',
    waypoints: [
      [36.7555, 137.0172],
      [36.7745, 137.0422],
    ],
  },
  { from: 'd_fushiki_bridge', to: 'd_kokubu_coast' },
  {
    from: 'd_kokubu_coast',
    to: 'd_amaharashi',
    waypoints: [[36.8125, 137.0435]],
  },
  {
    from: 'd_amaharashi',
    to: 'd_shimao_coast',
    waypoints: [[36.824, 137.0245]],
  },
  {
    from: 'd_shimao_coast',
    to: 'd_himi_center',
    waypoints: [[36.8445, 137.0028]],
  },
  { from: 'd_takaoka_sta', to: 'd_r160_takaoka_n' },
  { from: 'd_r160_takaoka_n', to: 'd_r160_himi_s' },
  { from: 'd_r160_himi_s', to: 'd_himi_center' },

  // 砺波・五箇山
  { from: 'd_nousaku', to: 'd_toide_jct' },
  { from: 'd_shintakaoka', to: 'd_toide_jct' },
  { from: 'd_toide_jct', to: 'd_tonami_ic' },
  { from: 'd_tonami_ic', to: 'd_fukuno_jct' },
  { from: 'd_fukuno_jct', to: 'd_johana_jct' },
  { from: 'd_johana_jct', to: 'd_gokayama_tunnel' },
  {
    from: 'd_gokayama_tunnel',
    to: 'd_ainokura',
    waypoints: [[36.438, 136.931]],
  },

  // 呉東（滑川・魚津・黒部・宇奈月）
  { from: 'd_nakajima_road', to: 'd_r8_mizuhashi' },
  { from: 'd_r8_mizuhashi', to: 'd_r8_namerikawa' },
  { from: 'd_r8_namerikawa', to: 'd_r8_uozu' },
  { from: 'd_r8_uozu', to: 'd_r8_kurobe' },
  { from: 'd_r8_kurobe', to: 'd_kurobe_ic' },
  { from: 'd_kurobe_ic', to: 'd_aimoto_bridge' },
  {
    from: 'd_aimoto_bridge',
    to: 'd_unazuki',
    waypoints: [[36.835, 137.568]],
  },
];

// ============================================================================
// 3. ダイクストラ最短経路探索エンジン（路線または道路グラフ上の座標列を算出）
// ============================================================================
function findGraphPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startNodeId: string,
  endNodeId: string
): [number, number][] {
  if (startNodeId === endNodeId) {
    const n = nodes.find((x) => x.id === startNodeId);
    return n ? [[n.lat, n.lng]] : [];
  }

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const adj = new Map<
    string,
    Array<{ to: string; weight: number; points: [number, number][] }>
  >();

  for (const n of nodes) adj.set(n.id, []);

  for (const e of edges) {
    const u = nodeMap.get(e.from);
    const v = nodeMap.get(e.to);
    if (!u || !v) continue;

    const forwardWps = e.waypoints || [];
    const reverseWps = [...forwardWps].reverse();

    const allPts: [number, number][] = [
      [u.lat, u.lng],
      ...forwardWps,
      [v.lat, v.lng],
    ];
    let w = 0;
    for (let i = 0; i < allPts.length - 1; i++) {
      w += distKm(allPts[i][0], allPts[i][1], allPts[i + 1][0], allPts[i + 1][1]);
    }

    adj.get(u.id)?.push({
      to: v.id,
      weight: w,
      points: [...forwardWps, [v.lat, v.lng]],
    });
    adj.get(v.id)?.push({
      to: u.id,
      weight: w,
      points: [...reverseWps, [u.lat, u.lng]],
    });
  }

  const dist = new Map<string, number>();
  const prev = new Map<
    string,
    { from: string; points: [number, number][] } | null
  >();
  const visited = new Set<string>();

  for (const n of nodes) {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
  }
  dist.set(startNodeId, 0);

  while (visited.size < nodes.length) {
    let uId: string | null = null;
    let bestD = Infinity;
    for (const [id, d] of dist.entries()) {
      if (!visited.has(id) && d < bestD) {
        bestD = d;
        uId = id;
      }
    }
    if (!uId || uId === endNodeId) break;
    visited.add(uId);

    const neighbors = adj.get(uId) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const alt = bestD + edge.weight;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, { from: uId, points: edge.points });
      }
    }
  }

  const startNode = nodeMap.get(startNodeId);
  if (!startNode || (dist.get(endNodeId) ?? Infinity) === Infinity) {
    const endNode = nodeMap.get(endNodeId);
    return startNode && endNode
      ? [
          [startNode.lat, startNode.lng],
          [endNode.lat, endNode.lng],
        ]
      : [];
  }

  const chain: [number, number][][] = [];
  let curr: string | null = endNodeId;
  while (curr && curr !== startNodeId) {
    const step = prev.get(curr);
    if (!step) break;
    chain.push(step.points);
    curr = step.from;
  }
  chain.reverse();

  const result: [number, number][] = [[startNode.lat, startNode.lng]];
  for (const pts of chain) {
    for (const pt of pts) {
      result.push(pt);
    }
  }
  return result;
}

function findNearestNode(
  nodes: GraphNode[],
  lat: number,
  lng: number
): { node: GraphNode; distanceKm: number } {
  let best = nodes[0];
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = distKm(lat, lng, n.lat, n.lng);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return { node: best, distanceKm: bestDist };
}

// 道路グラフに沿って2点間の座標列を算出
export function computeRoadGraphPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): [number, number][] {
  const directDist = distKm(fromLat, fromLng, toLat, toLng);
  if (directDist < 0.08) {
    return [
      [fromLat, fromLng],
      [toLat, toLng],
    ];
  }

  const startNearest = findNearestNode(ROAD_NODES, fromLat, fromLng);
  const endNearest = findNearestNode(ROAD_NODES, toLat, toLng);

  const graphPts = findGraphPath(
    ROAD_NODES,
    ROAD_EDGES,
    startNearest.node.id,
    endNearest.node.id
  );

  const result: [number, number][] = [[fromLat, fromLng]];
  for (const pt of graphPts) {
    const last = result[result.length - 1];
    if (distKm(last[0], last[1], pt[0], pt[1]) > 0.015) {
      result.push(pt);
    }
  }
  const last = result[result.length - 1];
  if (distKm(last[0], last[1], toLat, toLng) > 0.015) {
    result.push([toLat, toLng]);
  }
  return result;
}

// ============================================================================
// 4. ルート全体に対する同期ジオメトリ算出
// - 道路上を走る路面電車（富山市内電車など）および車・自転車・徒歩は道路上の最短経路を採用
// - 専用軌道の鉄道路線（あいの風・新幹線・JR氷見線/城端線・富山港線専用区間・地鉄本線）は鉄道路線上を描画
// ============================================================================
export function computeSyncRouteGeometry(
  activeRoute: OptimizedRoute
): RouteGeometryResult {
  const segments: RouteSegmentGeometry[] = [];
  const allPositions: [number, number][] = [];

  const appendPositions = (pts: [number, number][]) => {
    for (const pt of pts) {
      if (
        allPositions.length === 0 ||
        distKm(
          allPositions[allPositions.length - 1][0],
          allPositions[allPositions.length - 1][1],
          pt[0],
          pt[1]
        ) > 0.004
      ) {
        allPositions.push(pt);
      }
    }
  };

  activeRoute.legs.forEach((leg, legIndex) => {
    const fromLat = leg.fromLat;
    const fromLng = leg.fromLng;
    const toLat = leg.toLat;
    const toLng = leg.toLng;
    const directKm = distKm(fromLat, fromLng, toLat, toLng);

    if (activeRoute.transportMode === 'public' && directKm >= 2.5) {
      // 専用軌道の鉄道駅（RAIL_NODES）を検索
      const startStation = findNearestNode(RAIL_NODES, fromLat, fromLng);
      const endStation = findNearestNode(RAIL_NODES, toLat, toLng);

      const railPts =
        startStation.node.id !== endStation.node.id
          ? findGraphPath(
              RAIL_NODES,
              RAIL_EDGES,
              startStation.node.id,
              endStation.node.id
            )
          : [];
      let railTrackKm = 0;
      for (let i = 0; i < railPts.length - 1; i++) {
        railTrackKm += distKm(
          railPts[i][0],
          railPts[i][1],
          railPts[i + 1][0],
          railPts[i + 1][1]
        );
      }

      const roadPts = computeRoadGraphPath(fromLat, fromLng, toLat, toLng);
      let roadTrackKm = 0;
      for (let i = 0; i < roadPts.length - 1; i++) {
        roadTrackKm += distKm(
          roadPts[i][0],
          roadPts[i][1],
          roadPts[i + 1][0],
          roadPts[i + 1][1]
        );
      }

      const totalRailRouteKm =
        startStation.distanceKm + railTrackKm + endStation.distanceKm;

      // 専用軌道の鉄道駅が近く、鉄道利用が妥当な都市間・郊外区間のみ専用軌道ポリラインを使用
      const canUseDedicatedRail =
        railPts.length >= 2 &&
        startStation.distanceKm <= 2.2 &&
        endStation.distanceKm <= 2.2 &&
        startStation.distanceKm + endStation.distanceKm <= directKm * 0.65 &&
        totalRailRouteKm <= roadTrackKm * 1.25;

      if (canUseDedicatedRail) {
        // (a) 出発スポット → 乗車駅の道路最短アクセス区間
        if (startStation.distanceKm > 0.04) {
          const accessPts = computeRoadGraphPath(
            fromLat,
            fromLng,
            startStation.node.lat,
            startStation.node.lng
          );
          segments.push({ legIndex, mode: 'road', positions: accessPts });
          appendPositions(accessPts);
        }

        // (b) 乗車駅 → 降車駅の専用鉄道路線区間
        const fullRailPts: [number, number][] =
          startStation.distanceKm <= 0.04
            ? [[fromLat, fromLng], ...railPts]
            : railPts;
        const finalRailPts: [number, number][] =
          endStation.distanceKm <= 0.04
            ? [...fullRailPts, [toLat, toLng]]
            : fullRailPts;

        segments.push({ legIndex, mode: 'rail', positions: finalRailPts });
        appendPositions(finalRailPts);

        // (c) 降車駅 → 到着スポットの道路最短アクセス区間
        if (endStation.distanceKm > 0.04) {
          const egressPts = computeRoadGraphPath(
            endStation.node.lat,
            endStation.node.lng,
            toLat,
            toLng
          );
          segments.push({ legIndex, mode: 'road', positions: egressPts });
          appendPositions(egressPts);
        }
        return;
      }
    }

    // 富山市内電車などの併用軌道（道路上の路面電車）・バス・車・自転車・徒歩は道路上の最短経路を描画
    const roadPts = computeRoadGraphPath(fromLat, fromLng, toLat, toLng);
    segments.push({ legIndex, mode: 'road', positions: roadPts });
    appendPositions(roadPts);
  });

  if (allPositions.length === 0) {
    allPositions.push([activeRoute.origin.lat, activeRoute.origin.lng]);
  }

  return { allPositions, segments };
}

// ============================================================================
// 5. OpenStreetMap 実道路ルーティングエンジン（routing.openstreetmap.de + OSRM）
// ============================================================================
const osrmGeometryCache = new Map<string, [number, number][]>();

function getOsmRoutedMode(
  mode: TransportMode,
  distanceKm: number
): 'foot' | 'bike' | 'car' {
  if (mode === 'walk') return 'foot';
  if (mode === 'bicycle') return 'bike';
  // 公共交通モードでのまちなか移動・併用軌道（路面電車通り）・駅アクセス（3.0km以下）は
  // 一方通行の遠回りを避け道路上の最短経路を通る foot プロファイルを使用
  if (mode === 'public' && distanceKm <= 3.0) return 'foot';
  return 'car';
}

async function fetchOsrmRoadPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: TransportMode
): Promise<[number, number][] | null> {
  const segDistKm = distKm(fromLat, fromLng, toLat, toLng);
  if (segDistKm < 0.04) {
    return [
      [fromLat, fromLng],
      [toLat, toLng],
    ];
  }

  const osmMode = getOsmRoutedMode(mode, segDistKm);
  const key = `${osmMode}:${fromLat.toFixed(5)},${fromLng.toFixed(5)}->${toLat.toFixed(5)},${toLng.toFixed(5)}`;
  const cached = osrmGeometryCache.get(key);
  if (cached) return cached;

  // 1. OpenStreetMap 公式ルーティングサーバー (routed-foot / routed-bike / routed-car) を優先試行
  // 2. フォールバックとして router.project-osrm.org を試行
  const candidateUrls = [
    `https://routing.openstreetmap.de/routed-${osmMode}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&continue_straight=false`,
    `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&continue_straight=false`,
  ];

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = await res.json();
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const latLngs: [number, number][] = coords.map(
          (c: [number, number]) => [c[1], c[0]] as [number, number]
        );
        // 始点と終点をスポット座標に滑らかに接続
        osrmGeometryCache.set(key, latLngs);
        return latLngs;
      }
    } catch {
      // 次の候補サーバーまたは内蔵OSM道路グラフへフォールバック
    }
  }

  return null;
}

export async function enhanceRouteGeometryWithOsrm(
  activeRoute: OptimizedRoute,
  baseResult: RouteGeometryResult
): Promise<RouteGeometryResult> {
  const enhancedSegments = await Promise.all(
    baseResult.segments.map(async (seg) => {
      if (seg.mode === 'rail' || seg.positions.length < 2) {
        return seg;
      }
      const startPt = seg.positions[0];
      const endPt = seg.positions[seg.positions.length - 1];
      const osrmPts = await fetchOsrmRoadPath(
        startPt[0],
        startPt[1],
        endPt[0],
        endPt[1],
        activeRoute.transportMode
      );
      if (osrmPts && osrmPts.length >= 2) {
        return {
          ...seg,
          positions: osrmPts,
        };
      }
      return seg;
    })
  );

  const allPositions: [number, number][] = [];
  for (const seg of enhancedSegments) {
    for (const pt of seg.positions) {
      if (
        allPositions.length === 0 ||
        distKm(
          allPositions[allPositions.length - 1][0],
          allPositions[allPositions.length - 1][1],
          pt[0],
          pt[1]
        ) > 0.002
      ) {
        allPositions.push(pt);
      }
    }
  }

  return {
    allPositions,
    segments: enhancedSegments,
  };
}

// ============================================================================
// 6. 区間(legIndex)ごとの座標列抽出 ＆ 進行方向矢印・順序バッジ位置の算出ヘルパー
// ============================================================================
export interface DirectionalSamplePoint {
  lat: number;
  lng: number;
  angleDeg: number;
}

export function buildPerLegPositions(
  geometry: RouteGeometryResult,
  legCount: number
): [number, number][][] {
  const perLeg: [number, number][][] = Array.from(
    { length: legCount },
    () => []
  );

  for (const seg of geometry.segments) {
    if (seg.legIndex < 0 || seg.legIndex >= legCount) continue;
    const target = perLeg[seg.legIndex];
    for (const pt of seg.positions) {
      if (
        target.length === 0 ||
        distKm(
          target[target.length - 1][0],
          target[target.length - 1][1],
          pt[0],
          pt[1]
        ) > 0.002
      ) {
        target.push(pt);
      }
    }
  }

  return perLeg;
}

/**
 * ポリライン上の指定割合(0.0〜1.0)の位置座標と進行方向角度(CSS rotate角度: 東=0, 北=-90, 南=90)を算出
 */
export function samplePointAlongPath(
  positions: [number, number][],
  fraction: number
): DirectionalSamplePoint | null {
  if (positions.length < 2) return null;

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    const d = distKm(
      positions[i][0],
      positions[i][1],
      positions[i + 1][0],
      positions[i + 1][1]
    );
    segLengths.push(d);
    totalLen += d;
  }

  if (totalLen <= 0.001) {
    const p0 = positions[0];
    const p1 = positions[positions.length - 1];
    return {
      lat: (p0[0] + p1[0]) / 2,
      lng: (p0[1] + p1[1]) / 2,
      angleDeg: 0,
    };
  }

  const targetDist = Math.max(0, Math.min(1, fraction)) * totalLen;
  let accum = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accum + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = segLen > 0 ? (targetDist - accum) / segLen : 0.5;
      const pA = positions[i];
      const pB = positions[i + 1];
      const lat = pA[0] + (pB[0] - pA[0]) * localT;
      const lng = pA[1] + (pB[1] - pA[1]) * localT;

      const cosLat = Math.cos(((pA[0] + pB[0]) * 0.5 * Math.PI) / 180);
      const dx = (pB[1] - pA[1]) * cosLat;
      const dy = -(pB[0] - pA[0]);
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      return { lat, lng, angleDeg };
    }
    accum += segLen;
  }

  return null;
}
