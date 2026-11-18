import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_CATEGORIES,
  CATEGORY_META,
  DEFAULT_SPOT_IMAGE_URL,
  getSpotImages,
  MAX_SPOT_IMAGES,
  normalizeResearcherGroup,
  RESEARCHER_GROUPS,
  ResearcherGroup,
  SPOT_AREAS,
  Spot,
  SpotArea,
  SpotCategory,
} from '../types/tourism';
import { SpotImageCarousel } from './SpotImageCarousel';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileJson,
  ImagePlus,
  MapPin,
  Pencil,
  PlusCircle,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface DataManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  spots: Spot[];
  editingSpot: Spot | null;
  onSelectEditingSpot: (spot: Spot | null) => void;
  onAddSpot: (newSpot: Spot) => void;
  onUpdateSpot: (updatedSpot: Spot) => void;
  onDeleteSpot: (spotId: string) => void;
  onImportSpots: (importedSpots: Spot[]) => void;
  onResetDefaultData: () => void;
  pickedCoordinate: { lat: number; lng: number } | null;
  onStartPickSpotCoordinate: () => void;
}

// CSV行をダブルクォート考慮で分割するヘルパー
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const DEFAULT_IMAGE_URL = DEFAULT_SPOT_IMAGE_URL;

// 単一画像ファイルをDataURL（必要に応じてCanvas圧縮）へ変換する非同期ヘルパー
function readAndCompressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const allowedExt = /\.(jpe?g|png|webp|svg|heic|heif)$/i;
    if (!allowedExt.test(file.name) && !file.type.startsWith('image/')) {
      reject(
        new Error(
          '対応している画像形式（.jpg / .jpeg / .png / .webp / .svg / .heic / .heif）を選択してください。'
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error('画像データが空です。'));
        return;
      }

      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 960;
          let targetW = img.width;
          let targetH = img.height;
          if (targetW > maxDim || targetH > maxDim) {
            if (targetW >= targetH) {
              targetH = Math.round((targetH * maxDim) / targetW);
              targetW = maxDim;
            } else {
              targetW = Math.round((targetW * maxDim) / targetH);
              targetH = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(dataUrl);
          }
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        // HEIC/HEIF等もDataURLとして保持
        resolve(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const DataManagerModal: React.FC<DataManagerModalProps> = ({
  isOpen,
  onClose,
  spots,
  editingSpot,
  onSelectEditingSpot,
  onAddSpot,
  onUpdateSpot,
  onDeleteSpot,
  onImportSpots,
  onResetDefaultData,
  pickedCoordinate,
  onStartPickSpotCoordinate,
}) => {
  const [activeTab, setActiveTab] = useState<'add' | 'import_export'>('add');

  // スポット追加・編集フォームの状態
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SpotCategory>('experience');
  const [area, setArea] = useState<SpotArea>('富山市エリア');
  const [lat, setLat] = useState('36.7013');
  const [lng, setLng] = useState('137.2133');
  const [stayDurationMinutes, setStayDurationMinutes] = useState('60');
  const [description, setDescription] = useState('');
  const [studentComment, setStudentComment] = useState('');
  const [researcherGroup, setResearcherGroup] =
    useState<ResearcherGroup>('体験型観光班');
  const [priceRange, setPriceRange] = useState('1,000円〜2,000円');
  const [openingHours, setOpeningHours] = useState('9:00〜17:00');
  // 最大10枚までのスポット写真配列と現在表示中のインデックス
  const [imageUrls, setImageUrls] = useState<string[]>([DEFAULT_IMAGE_URL]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [officialUrl, setOfficialUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageAddInputRef = useRef<HTMLInputElement | null>(null);
  const imageReplaceInputRef = useRef<HTMLInputElement | null>(null);
  const loadedSpotIdRef = useRef<string | null>(null);

  // フォームを初期状態（新規追加用）にリセットするヘルパー
  const resetFormToNew = () => {
    loadedSpotIdRef.current = null;
    setName('');
    setCategory('experience');
    setArea('富山市エリア');
    setLat('36.7013');
    setLng('137.2133');
    setStayDurationMinutes('60');
    setDescription('');
    setStudentComment('');
    setResearcherGroup('体験型観光班');
    setPriceRange('1,000円〜2,000円');
    setOpeningHours('9:00〜17:00');
    setImageUrls([DEFAULT_IMAGE_URL]);
    setActiveImageIndex(0);
    setOfficialUrl('');
  };

  // editingSpot が切り替わった際にフォームへ既存データを反映
  useEffect(() => {
    if (editingSpot) {
      setActiveTab('add');
      if (loadedSpotIdRef.current !== editingSpot.id) {
        loadedSpotIdRef.current = editingSpot.id;
        setName(editingSpot.name);
        setCategory(editingSpot.category);
        setArea(editingSpot.area);
        setLat(String(editingSpot.lat));
        setLng(String(editingSpot.lng));
        setStayDurationMinutes(String(editingSpot.stayDurationMinutes));
        setDescription(editingSpot.description);
        setStudentComment(editingSpot.studentComment);
        setResearcherGroup(
          normalizeResearcherGroup(
            editingSpot.researcherGroup,
            editingSpot.category
          )
        );
        setPriceRange(editingSpot.priceRange);
        setOpeningHours(editingSpot.openingHours);
        setImageUrls(getSpotImages(editingSpot));
        setActiveImageIndex(0);
        setOfficialUrl(editingSpot.officialUrl || '');
        setStatusMessage(null);
      }
    } else if (loadedSpotIdRef.current !== null) {
      resetFormToNew();
    }
  }, [editingSpot]);

  // マップクリックで取得した座標をフォームへ反映（編集中の他フィールドは維持）
  useEffect(() => {
    if (pickedCoordinate) {
      setLat(String(pickedCoordinate.lat));
      setLng(String(pickedCoordinate.lng));
      setActiveTab('add');
      setStatusMessage(
        `マップから新しい座標（北緯 ${pickedCoordinate.lat}, 東経 ${pickedCoordinate.lng}）を取得しました。`
      );
    }
  }, [pickedCoordinate]);

  if (!isOpen) return null;

  // スポット写真（最大10枚まで）の追加または差し替えハンドラ
  const handleSpotImageFilesUpload = async (
    fileList: FileList | File[],
    mode: 'append' | 'replace_current'
  ) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (mode === 'replace_current') {
      try {
        const dataUrl = await readAndCompressImageFile(files[0]);
        setImageUrls((prev) => {
          const next = [...prev];
          const targetIdx = Math.min(activeImageIndex, Math.max(0, next.length - 1));
          next[targetIdx] = dataUrl;
          return next;
        });
        setStatusMessage(
          `${activeImageIndex + 1}枚目の写真を「${files[0].name}」に変更しました。`
        );
      } catch (err) {
        setStatusMessage(
          err instanceof Error
            ? err.message
            : '画像の読み込み中にエラーが発生しました。'
        );
      }
      return;
    }

    // append モード：最大10枚まで追加
    const remainingSlots = MAX_SPOT_IMAGES - imageUrls.length;
    if (remainingSlots <= 0) {
      setStatusMessage(
        `写真は最大${MAX_SPOT_IMAGES}枚まで登録できます。不要な写真を削除してから追加してください。`
      );
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    const loadedUrls: string[] = [];

    for (const file of filesToProcess) {
      try {
        const url = await readAndCompressImageFile(file);
        loadedUrls.push(url);
      } catch (err) {
        setStatusMessage(
          err instanceof Error
            ? err.message
            : '一部の画像の読み込みに失敗しました。'
        );
      }
    }

    if (loadedUrls.length > 0) {
      const nextTotal = Math.min(
        MAX_SPOT_IMAGES,
        imageUrls.length + loadedUrls.length
      );
      const jumpIndex = imageUrls.length;
      setImageUrls((prev) =>
        [...prev, ...loadedUrls].slice(0, MAX_SPOT_IMAGES)
      );
      setActiveImageIndex(jumpIndex);
      setStatusMessage(
        `写真を${loadedUrls.length}枚追加しました（計 ${nextTotal} / ${MAX_SPOT_IMAGES}枚）。左右スワイプで切り替えられます。`
      );
    }
  };

  // 現在表示中の写真を削除するハンドラ
  const handleRemoveImageAt = (removeIdx: number) => {
    if (imageUrls.length <= 1) {
      setStatusMessage('最低1枚の写真は残す必要があります（写真を差し替える場合は「表示中の写真を変更」を押してください）。');
      return;
    }
    setImageUrls((prev) => {
      const next = prev.filter((_, idx) => idx !== removeIdx);
      return next.length > 0 ? next : [DEFAULT_IMAGE_URL];
    });
    setActiveImageIndex((prevIdx) =>
      Math.max(0, Math.min(prevIdx, imageUrls.length - 2))
    );
    setStatusMessage(`${removeIdx + 1}枚目の写真を削除しました。`);
  };

  const handleSubmitSpotForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatusMessage('スポット名を入力してください。');
      return;
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedStay = parseInt(stayDurationMinutes, 10) || 60;

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setStatusMessage('緯度・経度には正しい数値を入力してください。');
      return;
    }

    const validImages =
      imageUrls.filter((u) => u && u.trim().length > 0).slice(0, MAX_SPOT_IMAGES);
    const finalImageUrls =
      validImages.length > 0 ? validImages : [DEFAULT_IMAGE_URL];

    if (editingSpot) {
      const updatedSpot: Spot = {
        ...editingSpot,
        name: name.trim(),
        category,
        area,
        lat: parsedLat,
        lng: parsedLng,
        stayDurationMinutes: Math.max(15, parsedStay),
        description:
          description.trim() ||
          `${name.trim()}（富山大学都市デザイン学部 調査スポット）`,
        studentComment:
          studentComment.trim() ||
          'フィールドワーク調査で発見した地域固有の魅力を持つスポットです。周辺の街並みとあわせて回遊するのがおすすめです。',
        researcherGroup: normalizeResearcherGroup(researcherGroup, category),
        priceRange: priceRange.trim() || '見学無料',
        openingHours: openingHours.trim() || '9:00〜17:00',
        imageUrl: finalImageUrls[0],
        imageUrls: finalImageUrls,
        officialUrl: officialUrl.trim() ? officialUrl.trim() : undefined,
      };

      onUpdateSpot(updatedSpot);
      setStatusMessage(
        `「${updatedSpot.name}」の位置情報・詳細・写真（${finalImageUrls.length}枚）を更新して保存しました！`
      );
      return;
    }

    const newSpot: Spot = {
      id: `spot-custom-${Date.now()}`,
      name: name.trim(),
      category,
      area,
      lat: parsedLat,
      lng: parsedLng,
      stayDurationMinutes: Math.max(15, parsedStay),
      description:
        description.trim() ||
        `${name.trim()}（富山大学都市デザイン学部 追加調査スポット）`,
      studentComment:
        studentComment.trim() ||
        'フィールドワーク調査で新たに発見した地域固有の魅力を持つスポットです。周辺の街並みとあわせて回遊するのがおすすめです。',
      researcherGroup: normalizeResearcherGroup(researcherGroup, category),
      priceRange: priceRange.trim() || '見学無料',
      openingHours: openingHours.trim() || '9:00〜17:00',
      imageUrl: finalImageUrls[0],
      imageUrls: finalImageUrls,
      officialUrl: officialUrl.trim() ? officialUrl.trim() : undefined,
    };

    onAddSpot(newSpot);
    setStatusMessage(`「${newSpot.name}」をスポット一覧に追加・保存しました！`);
    resetFormToNew();
  };

  // JSONエクスポート
  const handleExportJson = () => {
    const dataStr = JSON.stringify(spots, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `toyama_tourism_spots_${spots.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`全 ${spots.length} 件のスポットをJSON形式で出力しました。`);
  };

  // CSVエクスポート
  const handleExportCsv = () => {
    const headers = [
      'id',
      'name',
      'category',
      'area',
      'lat',
      'lng',
      'stayDurationMinutes',
      'description',
      'studentComment',
      'researcherGroup',
      'priceRange',
      'openingHours',
      'imageUrl',
      'officialUrl',
    ];
    const escapeCsv = (val: string | number | undefined) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = spots.map((s) =>
      [
        s.id,
        s.name,
        s.category,
        s.area,
        s.lat,
        s.lng,
        s.stayDurationMinutes,
        s.description,
        s.studentComment,
        s.researcherGroup,
        s.priceRange,
        s.openingHours,
        s.imageUrl,
        s.officialUrl || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `toyama_tourism_spots_${spots.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`全 ${spots.length} 件のスポットをCSV形式で出力しました。`);
  };

  // ファイルインポート処理（JSON / CSV両対応）
  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setStatusMessage('JSONファイルは配列形式である必要があります。');
          return;
        }
        const validSpots: Spot[] = parsed
          .filter((item) => item && item.name && item.lat && item.lng)
          .map((item, idx) => ({
            id: item.id || `spot-import-${Date.now()}-${idx}`,
            name: String(item.name),
            category: ALL_CATEGORIES.includes(item.category)
              ? item.category
              : 'scenery',
            area: SPOT_AREAS.includes(item.area) ? item.area : '富山市エリア',
            lat: Number(item.lat),
            lng: Number(item.lng),
            stayDurationMinutes: Number(item.stayDurationMinutes) || 60,
            description: String(item.description || ''),
            studentComment: String(
              item.studentComment || '学生調査データよりインポート'
            ),
            researcherGroup: normalizeResearcherGroup(
              item.researcherGroup,
              item.category
            ),
            priceRange: String(item.priceRange || '要確認'),
            openingHours: String(item.openingHours || '9:00〜17:00'),
            imageUrl: String(item.imageUrl || DEFAULT_IMAGE_URL),
            officialUrl: item.officialUrl ? String(item.officialUrl) : undefined,
          }));

        onImportSpots(validSpots);
        setStatusMessage(
          `JSONから ${validSpots.length} 件の調査スポットをインポート・統合しました！`
        );
      } else if (file.name.endsWith('.csv')) {
        const lines = text
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setStatusMessage('CSVに有効なデータ行が含まれていません。');
          return;
        }
        const headers = parseCsvLine(lines[0]);
        const imported: Spot[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const rowObj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cols[idx] ?? '';
          });

          if (!rowObj.name || !rowObj.lat || !rowObj.lng) continue;

          imported.push({
            id: rowObj.id || `spot-csv-${Date.now()}-${i}`,
            name: rowObj.name,
            category: ALL_CATEGORIES.includes(rowObj.category as SpotCategory)
              ? (rowObj.category as SpotCategory)
              : 'scenery',
            area: SPOT_AREAS.includes(rowObj.area as SpotArea)
              ? (rowObj.area as SpotArea)
              : '富山市エリア',
            lat: Number(rowObj.lat),
            lng: Number(rowObj.lng),
            stayDurationMinutes: Number(rowObj.stayDurationMinutes) || 60,
            description: rowObj.description || `${rowObj.name}の調査データ`,
            studentComment:
              rowObj.studentComment ||
              'フィールドワーク調査CSVより統合されたスポットです。',
            researcherGroup: normalizeResearcherGroup(
              rowObj.researcherGroup,
              rowObj.category as SpotCategory
            ),
            priceRange: rowObj.priceRange || '自由散策',
            openingHours: rowObj.openingHours || '9:00〜17:00',
            imageUrl: rowObj.imageUrl || DEFAULT_IMAGE_URL,
            officialUrl: rowObj.officialUrl || undefined,
          });
        }

        onImportSpots(imported);
        setStatusMessage(
          `CSVから ${imported.length} 件の調査スポットをインポート・統合しました！`
        );
      } else {
        setStatusMessage('.json または .csv ファイルを選択してください。');
      }
    } catch {
      setStatusMessage('ファイルの解析中にエラーが発生しました。');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                {editingSpot
                  ? `スポット情報の編集：${editingSpot.name}`
                  : 'スポット新規追加・編集 ＆ 調査データ統合管理'}
              </h2>
              <p className="text-[11px] text-sky-200/80">
                観光スポットの新規登録・既存スポットの位置や詳細の再編集、CSV/JSONでの入出力が可能です
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* タブ切替バー */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'add'
                ? 'bg-white text-sky-700 border-sky-600 shadow-sm'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            {editingSpot ? (
              <Pencil className="w-4 h-4 text-amber-600" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            <span>
              {editingSpot ? 'スポット情報を編集' : 'スポット追加・編集'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import_export')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'import_export'
                ? 'bg-white text-sky-700 border-sky-600 shadow-sm'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>CSV / JSON インポート＆エクスポート（調査データ統合）</span>
          </button>
        </div>

        {/* 通知メッセージ */}
        {statusMessage && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-emerald-700 hover:underline text-[11px]"
            >
              閉じる
            </button>
          </div>
        )}

        {/* タブ1：スポット追加・編集フォーム */}
        {activeTab === 'add' && (
          <form
            onSubmit={handleSubmitSpotForm}
            className="p-6 space-y-4 max-h-[72vh] overflow-y-auto text-xs sm:text-sm"
          >
            {/* 編集対象スポットの選択・切替バー */}
            <div
              className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                editingSpot
                  ? 'bg-amber-50/90 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {editingSpot
                    ? '現在編集中のスポット（別のスポットに切り替えることも可能です）'
                    : '新規登録 または 登録済みスポットを選択して再編集'}
                </label>
                <select
                  aria-label="編集するスポットを選択"
                  value={editingSpot?.id || '__NEW__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__NEW__') {
                      onSelectEditingSpot(null);
                      resetFormToNew();
                    } else {
                      const found = spots.find((s) => s.id === val) || null;
                      onSelectEditingSpot(found);
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                >
                  <option value="__NEW__">
                    ＋ 新しい観光スポットを追加登録する
                  </option>
                  {spots.map((s) => (
                    <option key={s.id} value={s.id}>
                      ✏️ {s.name}（{s.area} / {CATEGORY_META[s.category].shortLabel}）
                    </option>
                  ))}
                </select>
              </div>

              {editingSpot && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectEditingSpot(null);
                      resetFormToNew();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold transition"
                  >
                    新規追加へ切替
                  </button>
                  {spots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const deletedName = editingSpot.name;
                        onDeleteSpot(editingSpot.id);
                        resetFormToNew();
                        setStatusMessage(`「${deletedName}」を削除しました。`);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 transition"
                      title="このスポットを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>削除</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  スポット名称 *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例：岩瀬カナル会館・北前船回船問屋森家"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    カテゴリ *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SpotCategory)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    エリア区分 *
                  </label>
                  <select
                    value={area}
                    onChange={(e) => setArea(e.target.value as SpotArea)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-none bg-white"
                  >
                    {SPOT_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 緯度・経度 ＋ マップクリック取得ボタン */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  位置座標（緯度・経度）
                </span>
                <button
                  type="button"
                  onClick={onStartPickSpotCoordinate}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>
                    {editingSpot
                      ? 'マップをクリックして位置を再設定'
                      : 'マップをクリックして座標取得'}
                  </span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    北緯 (lat)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    東経 (lng)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    推奨滞在時間 (分)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="300"
                    step="5"
                    value={stayDurationMinutes}
                    onChange={(e) => setStayDurationMinutes(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                スポット概要説明
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="スポットの特徴や見どころを入力してください"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-sky-500 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-800 mb-1">
                富山大学 都市デザイン学部 フィールドワーク推しコメント
              </label>
              <textarea
                rows={2}
                value={studentComment}
                onChange={(e) => setStudentComment(e.target.value)}
                placeholder="都市空間・建築・モビリティ・地域文化の視点からの推しポイントを入力"
                className="w-full px-3 py-2 rounded-xl border border-sky-300 bg-sky-50/40 focus:border-sky-600 focus:outline-none text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  担当調査班（5班から選択） *
                </label>
                <select
                  aria-label="担当調査班"
                  value={researcherGroup}
                  onChange={(e) =>
                    setResearcherGroup(e.target.value as ResearcherGroup)
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 text-xs focus:border-sky-500 focus:outline-none"
                >
                  {RESEARCHER_GROUPS.map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  料金・予算目安
                </label>
                <input
                  type="text"
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  営業時間
                </label>
                <input
                  type="text"
                  value={openingHours}
                  onChange={(e) => setOpeningHours(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            {/* ② スポット写真管理（最大10枚まで追加可能・左右スワイプで次の写真/前の写真を切替表示） */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    スポット写真ギャラリー（最大{MAX_SPOT_IMAGES}枚まで追加可・左右スワイプで切替）
                  </label>
                  <p className="text-[11px] text-slate-500">
                    現在 {imageUrls.length} / {MAX_SPOT_IMAGES} 枚登録中（写真を左右にスワイプ・ドラッグすると前後の写真を見られます）
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => imageReplaceInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold inline-flex items-center gap-1 transition"
                    title="現在表示中の写真を別のファイルに差し替え"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                    <span>表示中の写真を変更</span>
                  </button>

                  <button
                    type="button"
                    disabled={imageUrls.length >= MAX_SPOT_IMAGES}
                    onClick={() => imageAddInputRef.current?.click()}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 shadow-sm transition ${
                      imageUrls.length >= MAX_SPOT_IMAGES
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-sky-600 hover:bg-sky-700 text-white'
                    }`}
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>
                      ＋ 写真を追加（あと{Math.max(0, MAX_SPOT_IMAGES - imageUrls.length)}枚）
                    </span>
                  </button>
                </div>
              </div>

              {/* 左右スワイプ対応のメインプレビューカルーセル */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleSpotImageFilesUpload(
                      e.dataTransfer.files,
                      imageUrls.length < MAX_SPOT_IMAGES ? 'append' : 'replace_current'
                    );
                  }
                }}
              >
                <SpotImageCarousel
                  images={imageUrls}
                  alt={name || 'スポット写真プレビュー'}
                  heightClass="h-44 sm:h-52"
                  activeIndex={activeImageIndex}
                  onIndexChange={setActiveImageIndex}
                  onRemoveImage={imageUrls.length > 1 ? handleRemoveImageAt : undefined}
                  showSwipeHint={true}
                />
              </div>

              {/* サムネイル一覧バー（1枚目〜最大10枚目＋追加スロット） */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {imageUrls.map((url, idx) => {
                  const isCurrent = idx === activeImageIndex;
                  return (
                    <div
                      key={`thumb-${idx}`}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 cursor-pointer border-2 transition ${
                        isCurrent
                          ? 'border-sky-600 ring-2 ring-sky-200 scale-105'
                          : 'border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={url}
                        alt={`写真 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_IMAGE_URL;
                        }}
                      />
                      <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-slate-900/80 text-white text-[9px] font-bold">
                        {idx + 1}
                      </span>
                    </div>
                  );
                })}

                {imageUrls.length < MAX_SPOT_IMAGES && (
                  <button
                    type="button"
                    onClick={() => imageAddInputRef.current?.click()}
                    className="w-14 h-14 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-100/60 text-sky-700 flex flex-col items-center justify-center shrink-0 transition"
                    title="写真ファイルを追加（複数選択可）"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span className="text-[9px] font-bold mt-0.5">追加</span>
                  </button>
                )}
              </div>

              <div className="text-[10px] text-slate-500">
                対応形式: .jpg / .jpeg / .png / .webp / .svg / .heic / .heif（複数ファイルの同時選択・ドラッグ＆ドロップにも対応）
              </div>

              {/* 写真追加用 input (multiple対応) */}
              <input
                ref={imageAddInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.svg,.heic,.heif,image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleSpotImageFilesUpload(e.target.files, 'append');
                    e.target.value = '';
                  }
                }}
              />

              {/* 表示中写真の差し替え用 input */}
              <input
                ref={imageReplaceInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.svg,.heic,.heif,image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleSpotImageFilesUpload(e.target.files, 'replace_current');
                    e.target.value = '';
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                公式サイトURL（任意）
              </label>
              <input
                type="url"
                value={officialUrl}
                onChange={(e) => setOfficialUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                閉じる
              </button>
              <button
                type="submit"
                className={`px-5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition ${
                  editingSpot
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {editingSpot ? (
                  <>
                    <Save className="w-4 h-4" />
                    <span>変更内容を上書き保存する</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>このスポットを登録・保存する</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* タブ2：CSV / JSON インポート＆エクスポート */}
        {activeTab === 'import_export' && (
          <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
            {/* ファイルドラッグ＆ドロップ領域 */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="border-2 border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-50 rounded-2xl p-6 text-center transition cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-sky-600 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-800 mb-1">
                フィールドワーク調査ファイル（.csv / .json）をドロップまたは選択
              </div>
              <p className="text-xs text-slate-500">
                既存のスポット一覧に新しいスポットを自動マージ（同一IDは上書き更新）します
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>

            {/* エクスポート＆初期化ボタン群 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700">
                現在の登録スポットデータ（全 {spots.length} 件）の出力・管理
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                >
                  <FileJson className="w-4 h-4 text-sky-400" />
                  <span>JSON形式でエクスポート</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                >
                  <Download className="w-4 h-4" />
                  <span>CSV形式でエクスポート</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onResetDefaultData();
                    setStatusMessage(
                      'スポットおよび起点データを初期状態（18スポット・3拠点）にリセットしました。'
                    );
                  }}
                  className="ml-auto px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>初期データにリセット</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
