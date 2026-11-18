import { OriginPoint, Spot } from '../types/tourism';

// デフォルトの出発・到着拠点（3拠点：Google Maps 正確座標）
export const DEFAULT_ORIGINS: OriginPoint[] = [
  {
    id: 'origin-toyama-sta',
    name: '富山駅',
    lat: 36.701729,
    lng: 137.213227,
    area: '富山市エリア',
    isCustom: false,
  },
  {
    id: 'origin-toyama-airport',
    name: '富山高山すし空港（富山きときと空港）',
    lat: 36.643421,
    lng: 137.189353,
    area: '富山市エリア',
    isCustom: false,
  },
  {
    id: 'origin-shintakaoka-sta',
    name: '新高岡駅',
    lat: 36.726976,
    lng: 137.011852,
    area: '呉西（高岡・氷見・射水）エリア',
    isCustom: false,
  },
];

// 富山大学 都市デザイン学部 フィールドワーク調査による初期スポットデータ（全18件：Google Maps 正確座標）
export const INITIAL_SPOTS: Spot[] = [
  // ==========================================
  // 必須指定スポット（6件）
  // ==========================================
  {
    id: 'spot-toyama-glass-studio',
    name: '富山ガラス工房',
    category: 'experience',
    lat: 36.695361,
    lng: 137.146333,
    area: '富山市エリア',
    stayDurationMinutes: 90,
    description:
      '富山市古沢152にある「ガラスの街とやま」を象徴する創作・体験拠点。吹きガラスやペーパーウェイト制作など、専門クリエイターのサポートのもと本格的なガラス造形を体験できます。',
    studentComment:
      '呉羽丘陵の豊かな緑に囲まれたキャンパス型配置が魅力！工房とショップ・カフェが回廊でつながり、制作の熱気と静謐な作品鑑賞のコントラストが都市デザイン的にも秀逸です。',
    researcherGroup: '体験型観光班',
    imageUrl:
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=80',
    priceRange: '体験 3,300円〜5,500円（見学無料）',
    openingHours: '9:00〜17:00',
    officialUrl: 'https://toyama-garasukobo.jp/',
  },
  {
    id: 'spot-ikedaya-yasubei',
    name: '池田屋安兵衛商店',
    category: 'experience',
    lat: 36.688541,
    lng: 137.217695,
    area: '富山市エリア',
    stayDurationMinutes: 45,
    description:
      '富山市堤町通り1-3-5にある江戸時代から続く富山の売薬文化を今に伝える老舗薬種商。昔ながらの木製丸薬製造機を使った「反魂丹（はんごんたん）」の丸薬づくり体験が人気です。',
    studentComment:
      '中心市街地・西町エリアにあり、路面電車でのアクセスが抜群。吹き抜けの町家空間に響く薬研や丸薬づくりの音・和漢薬の香りが、五感に訴える歴史空間を形成しています。',
    researcherGroup: '体験型観光班',
    imageUrl:
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80',
    priceRange: '体験無料・和漢薬購入 500円〜2,500円',
    openingHours: '9:00〜18:00',
    officialUrl: 'https://www.hangontan.co.jp/',
  },
  {
    id: 'spot-gare-gare',
    name: 'kitchen&cafe GARE GARE',
    category: 'food',
    lat: 36.760452,
    lng: 137.233785,
    area: '富山市エリア',
    stayDurationMinutes: 60,
    description:
      '富山市岩瀬天神町3（岩瀬カナル会館・岩瀬浜駅すぐそば）にある人気ガレージカフェ＆キッチン。白えび漁師のオーナーが手掛ける新鮮な白えびバーガーや海鮮ランチ、スイーツをスーパーカーが並ぶ空間で楽しめます。',
    studentComment:
      '富山港線（ポートラム）岩瀬浜駅から徒歩2分・富岩水上ラインの下船場からもすぐの好立地！歴史ある港町・岩瀬エリアの回遊やウォーターフロント散策時のランチ拠点に最適です。',
    researcherGroup: '食・魚市場プロジェクト班',
    imageUrl:
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80',
    priceRange: '1,200円〜2,200円',
    openingHours: '11:00〜17:00（ランチ 11:00〜14:30）',
  },
  {
    id: 'spot-onyado-nono-toyama',
    name: '天然温泉 剱の湯 御宿 野乃 富山',
    category: 'stay',
    lat: 36.689685,
    lng: 137.211989,
    area: '富山市エリア',
    stayDurationMinutes: 120,
    description:
      '富山市総曲輪3-9-2（大手モール電停前）に位置する全館畳敷きの和風プレミアムホテル。地下1,200mから湧き出る天然温泉大浴場と、富山湾の海鮮盛り放題の朝食が圧倒的な支持を集めています。',
    studentComment:
      'まちなかウォーカブル推進エリアの核となる宿泊拠点。総曲輪通りやガラス美術館から徒歩圏内という都市構造上の要衝にあり、ナイトタイムエコノミーと温泉滞在を両立できます。',
    researcherGroup: '体験型観光班',
    imageUrl:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    priceRange: '1泊 11,000円〜22,000円',
    openingHours: 'チェックイン 15:00〜 / チェックアウト 11:00',
    officialUrl: 'https://dormy-hotels.com/dormyinn/hotels/nono_toyama/',
  },
  {
    id: 'spot-nousaku',
    name: '能作 本社工場（NOUSAKU）',
    category: 'experience',
    lat: 36.668497,
    lng: 136.997417,
    area: '呉西（高岡・氷見・射水）エリア',
    stayDurationMinutes: 90,
    description:
      '高岡市オフィスパーク8-1にある、高岡銅器400年の鋳造技術を継承する「能作」の産業観光フラッグシップ。職人の生業を間近に見る工場見学、生砂を使った錫（すず）の鋳物製作体験、錫の器で味わうカフェを併設。',
    studentComment:
      '工場建築を「開かれたミュージアム」へと昇華させた産業観光のロールモデル。約2,400個の木型が並ぶエントランス壁面は圧巻で、新高岡駅や高岡ICからの広域周遊の目玉スポットです。',
    researcherGroup: '体験型観光班',
    imageUrl:
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80',
    priceRange: '工場見学無料 / 鋳物体験 2,500円〜4,500円',
    openingHours: '10:00〜18:00',
    officialUrl: 'https://www.nousaku.co.jp/',
  },
  {
    id: 'spot-daisenmaru',
    name: '朝獲れ海鮮定食 だいせん丸',
    category: 'food',
    lat: 36.646812,
    lng: 137.204174,
    area: '富山市エリア',
    stayDurationMinutes: 60,
    description:
      '富山市八日町3（富山きときと空港近く）にある元漁師の店主が営む鮮魚・海鮮食事処。その日の朝に富山湾で水揚げされた極上の地魚を使った刺身定食や海鮮丼、浜汁を堪能できます。',
    studentComment:
      '「天然のいけす」富山湾の朝獲れ鮮魚をストレートに体感できる名店！富山きときと空港から車で約5分・国道41号からのアクセスも良く、空港発着ルートにおけるランチの要所です。',
    researcherGroup: '食・魚市場プロジェクト班',
    imageUrl:
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=900&q=80',
    priceRange: '1,800円〜3,500円',
    openingHours: '11:00〜14:30 / 17:00〜21:00',
  },

  // ==========================================
  // 補完スポット（12件：5カテゴリ網羅・フィールドワーク調査知見）
  // ==========================================
  {
    id: 'spot-kansui-park',
    name: '富岩運河環水公園',
    category: 'scenery',
    lat: 36.709444,
    lng: 137.212683,
    area: '富山市エリア',
    stayDurationMinutes: 60,
    description:
      '富山市湊入船町1（富山駅北口から徒歩9分）、旧舟だまりを再生した親水都市公園。シンボル「天門橋」の展望塔からは、水面越しに雄大な立山連峰を一望でき、世界一美しいと称されるカフェも立地。',
    studentComment:
      '富山市のコンパクトシティ政策とウォーターフロント再生の最高傑作。芝生広場の勾配設計が視線を水辺と立山連峰へ誘導しており、時間帯によって全く異なる都市景観を見せます。',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80',
    priceRange: '入園無料（天門橋展望塔も無料）',
    openingHours: '終日開放（ライトアップ 日没〜22:00）',
    officialUrl: 'https://www.kansui-park.jp/',
  },
  {
    id: 'spot-toyama-glass-art-museum',
    name: '富山市ガラス美術館（TOYAMAキラリ）',
    category: 'scenery',
    lat: 36.688412,
    lng: 137.215089,
    area: '富山市エリア',
    stayDurationMinutes: 75,
    description:
      '富山市西町5-1、建築家・隈研吾氏が設計を手掛けた複合施設「TOYAMAキラリ」内の美術館。立山連峰を彷彿とさせる御影石・ガラス・アルミの外観と、県産杉ルーバーが彩る吹き抜け空間は圧巻。',
    studentComment:
      '市立図書館と美術館を斜めの吹き抜けボイドで一体化した空間構成は必見！光を反射する杉材ルーバーと現代ガラスアート（チフーリ作品）の共鳴は都市建築の教科書です。',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
    priceRange: '常設展 200円（企画展は別途）',
    openingHours: '9:30〜18:00（金・土は20:00まで）',
    officialUrl: 'https://toyama-glass-art-museum.jp/',
  },
  {
    id: 'spot-toyama-lrt-tram',
    name: '富山地方鉄道 市内電車（セントラム・ポートラム）',
    category: 'transport',
    lat: 36.701389,
    lng: 137.213278,
    area: '富山市エリア',
    stayDurationMinutes: 35,
    description:
      '富山駅高架下（富山駅停留場）へ直接乗り入れ、南北の路線が一体化した次世代型路面電車（LRT）。大きな窓から富山の街並みや立山連峰を眺めながら、段差のない低床車両で快適に回遊できます。',
    studentComment:
      '世界が注目する「コンパクトシティ富山」の背骨！新幹線改札から徒歩1分で路面電車ホームに直結するトランジットモール空間は、公共交通指向型開発（TOD）の理想形です。',
    researcherGroup: '交通・データ班',
    imageUrl:
      'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=80',
    priceRange: '1乗車 240円（1日ふりーきっぷ等あり）',
    openingHours: '6:00〜23:00',
    officialUrl: 'https://www.chitetsu.co.jp/',
  },
  {
    id: 'spot-fugan-suijo-line',
    name: '富岩水上ライン（環水公園〜中島閘門〜岩瀬）',
    category: 'transport',
    lat: 36.709616,
    lng: 137.211479,
    area: '富山市エリア',
    stayDurationMinutes: 60,
    description:
      '富岩運河環水公園乗船場から北前船の港町・岩瀬までを結ぶ運河クルーズ。国指定重要文化財「中島閘門」では、水位差2.5mを船に乗ったまま昇降する「水のエレベーター」を体験できます。',
    studentComment:
      '往路は運河クルーズ、復路はポートラム（LRT）を使う「水陸モビリティ周遊」が都市デザイン学部イチ推しの黄金ルート！土木遺産・中島閘門の操作室見学も知的好奇心を刺激します。',
    researcherGroup: '富山湾クルーズ班',
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    priceRange: '片道 1,700円（復路路面電車乗車券付 1,900円）',
    openingHours: '9:30〜16:30（季節運航・便指定）',
    officialUrl: 'https://fugan-suijo-line.jp/',
  },
  {
    id: 'spot-amaharashi-coast',
    name: '雨晴海岸（道の駅 雨晴）',
    category: 'scenery',
    lat: 36.814889,
    lng: 137.041583,
    area: '呉西（高岡・氷見・射水）エリア',
    stayDurationMinutes: 45,
    description:
      '高岡市太田24-74、海越しに標高3,000m級の立山連峰を望む、世界でも極めて珍しい絶景海岸。源義経がにわか雨の晴れるのを待ったという「義経岩」と女岩、そして海岸線を走るJR氷見線が絵になります。',
    studentComment:
      '白い船をイメージした「道の駅 雨晴」の2階・3階展望デッキは、道路横断をせずに安全に海岸景観を俯瞰できる優れたランドスケープ設計。氷見線の列車通過時刻に合わせた訪問がおすすめ！',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=900&q=80',
    priceRange: '見学無料（カフェ・物販併設）',
    openingHours: '9:00〜19:00（展望デッキは24時間開放）',
    officialUrl: 'https://michinoeki-amaharashi.jp/',
  },
  {
    id: 'spot-uchikawa-area',
    name: '内川エリア（日本のベニス・新湊）',
    category: 'scenery',
    lat: 36.781032,
    lng: 137.087699,
    area: '呉西（高岡・氷見・射水）エリア',
    stayDurationMinutes: 60,
    description:
      '射水市立町1-26（川の駅 新湊周辺）、富山新港から海王丸パーク付近まで東西約3.4kmにわたって流れる運河。両岸に漁船が連なり、個性豊かな12の橋（ステンドグラス橋や屋根付き歩行者専用橋・東橋など）が架かる水辺の原風景。',
    studentComment:
      '「日本のベニス」と呼ばれる生活水路空間！古民家を改修したカフェやゲストハウスが点在し、観光地化されすぎない「漁師町の日常とリノベーションの共生」を歩いて観察できます。',
    researcherGroup: '富山湾クルーズ班',
    imageUrl:
      'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=900&q=80',
    priceRange: '散策無料（遊覧船・カフェは別途）',
    openingHours: '終日散策可能',
  },
  {
    id: 'spot-manyosen-tram',
    name: '万葉線（高岡駅〜越ノ潟 路面電車）',
    category: 'transport',
    lat: 36.741444,
    lng: 137.015306,
    area: '呉西（高岡・氷見・射水）エリア',
    stayDurationMinutes: 45,
    description:
      '高岡駅1階停留場（高岡市下関町6-1）から射水市の新湊・越ノ潟までを結ぶ赤い低床路面電車「アイトラム」やドラえもんトラム。庄川鉄橋を渡るダイナミックな区間と、内川エリアへ直結するレトロな駅舎が魅力。',
    studentComment:
      '高岡の城下町と新湊の港町を1本の鉄軌道で結ぶ地域モビリティの要。終点の越ノ潟からは無料の県営渡船にシームレスに乗り継げる「鉄道×航路」の交通結節点も都市計画の隠れた見どころ！',
    researcherGroup: '交通・データ班',
    imageUrl:
      'https://images.unsplash.com/photo-1515165562839-978bbcf18277?auto=format&fit=crop&w=900&q=80',
    priceRange: '運賃 200円〜400円',
    openingHours: '6:00〜23:00（15分間隔運行）',
    officialUrl: 'https://www.manyosen.co.jp/',
  },
  {
    id: 'spot-zuiryuji-temple',
    name: '国宝 高岡山瑞龍寺',
    category: 'scenery',
    lat: 36.735593,
    lng: 137.010439,
    area: '呉西（高岡・氷見・射水）エリア',
    stayDurationMinutes: 60,
    description:
      '高岡市関本町35、加賀藩二代藩主・前田利長公の菩提を弔うため建立された禅宗寺院。総門・山門・仏殿・法堂が一直線に並び、左右対称の回廊で結ばれた伽藍配置は近世禅宗建築の極致として国宝に指定。',
    studentComment:
      '八丁道（約800mの松並木参道）から山門へと至る都市軸のパースペクティブが圧倒的！鉛瓦葺きの仏殿屋根と白砂の幾何学美は、現代のランドスケープデザインにも通じる緊張感があります。',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=900&q=80',
    priceRange: '拝観料 500円',
    openingHours: '9:00〜16:30',
    officialUrl: 'https://www.zuiryuji.jp/',
  },
  {
    id: 'spot-sushitama-toyama',
    name: '廻る富山湾 すし玉 富山駅店',
    category: 'food',
    lat: 36.700867,
    lng: 137.214372,
    area: '富山市エリア',
    stayDurationMinutes: 50,
    description:
      '富山市明輪町1-220（富山駅構内「きときと市場とやマルシェ」内）にある大人気回転寿司。富山湾の宝石・白えび、紅ズワイガニ、ホタルイカ、寒ブリなど、朝獲れの地魚を職人握りでスピーディーに楽しめます。',
    studentComment:
      '列車や路面電車の待ち時間・出発直前でも「富山湾の旬」を確実に味わえる駅ナカ拠点。平日のランチタイムでも賑わいますが、回転が速いため短時間の観光タイムラインにも組み込みやすいです。',
    researcherGroup: '食・魚市場プロジェクト班',
    imageUrl:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    priceRange: '2,000円〜4,000円',
    openingHours: '11:00〜21:00',
    officialUrl: 'https://www.sushitama.com/',
  },
  {
    id: 'spot-kurobe-gorge-railway',
    name: '黒部峡谷鉄道 トロッコ電車（宇奈月駅）',
    category: 'transport',
    lat: 36.814966,
    lng: 137.586053,
    area: '呉東（黒部・魚津・滑川）エリア',
    stayDurationMinutes: 90,
    description:
      '黒部市黒部峡谷口11、日本一深いV字峡谷・黒部峡谷を走る小さなオレンジ色のトロッコ電車。宇奈月温泉街の玄関口からエメラルドグリーンの黒部川と朱塗りの新山彦橋を渡り、大自然と電源開発の軌跡を体感。',
    studentComment:
      '黒部川電源開発のために敷設された産業インフラが、日本屈指の山岳観光モビリティへ転換した好例。宇奈月駅周辺の足湯広場や黒部川電気記念館との回遊性も高く設計されています。',
    researcherGroup: '交通・データ班',
    imageUrl:
      'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80',
    priceRange: '乗車券 1,980円〜（区間による）',
    openingHours: '8:00〜17:00（4月下旬〜11月末運行）',
    officialUrl: 'https://www.kurotetu.co.jp/',
  },
  {
    id: 'spot-gokayama-ainokura',
    name: '五箇山 相倉合掌造り集落',
    category: 'scenery',
    lat: 36.425869,
    lng: 136.936853,
    area: '南砺・砺波エリア',
    stayDurationMinutes: 75,
    description:
      '南砺市相倉611、ユネスコ世界文化遺産に登録されている急勾配の茅葺き屋根「合掌造り」集落。豪雪地帯の厳しい自然と共生する伝統的集落景観と、石垣・水路・雪持林（ゆきもちりん）が当時のまま残ります。',
    studentComment:
      '建築単体だけでなく、雪崩から集落を守る背後の保安林や水路網までを含めた「環境共生型集落デザイン」の極致。集落を見下ろす展望スポットからの屋根の並びは息を呑む美しさです。',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80',
    priceRange: '保存協力金（駐車料）500円〜',
    openingHours: '8:30〜17:00',
    officialUrl: 'https://www.gokayama-info.jp/',
  },
  {
    id: 'spot-river-retreat-garaku',
    name: 'リバーリトリート雅樂倶',
    category: 'stay',
    lat: 36.560528,
    lng: 137.203889,
    area: '富山市エリア',
    stayDurationMinutes: 120,
    description:
      '富山市春日56-2、神通峡のほとりに佇むスモールラグジュアリー＆アートホテル。建築家・内藤廣氏が設計した新館や、館内随所に配された約300点の現代アート、春日温泉の湯、極上のフレンチが融合。',
    studentComment:
      'ダム湖（神通川）の静かな水面と建築の水平ラインが溶け合うランドスケープが秀逸。富山きときと空港から国道41号経由で車で約15分と近く、建築・アート好きにはたまらない滞在型デスティネーションです。',
    researcherGroup: '景色班',
    imageUrl:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80',
    priceRange: '1泊 38,000円〜 / カフェ・ミュージアム利用可',
    openingHours: 'チェックイン 15:00〜 / チェックアウト 11:00',
    officialUrl: 'https://www.garaku.co.jp/',
  },
];
