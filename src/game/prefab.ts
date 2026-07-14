/**
 * Hazır binalar ve otomatik eşya döşeme.
 * - Prefab: tek tıkla zemin + duvar + kapı + oda ataması + boyuta göre eşya.
 * - autoFurnishRoom: mevcut bir odayı türüne uygun desenle döşer — oda ne kadar
 *   büyükse o kadar çok eşya (sıra -> kontenjan, kitaplık -> kütüphane seviyesi...).
 */
import {
  GameState, MAP_W, ObjectTypeId, Point, Room, RoomType, GATE,
  WALL_NONE, inBounds, tileIndex,
} from '../core/types';
import { validateRooms } from '../core/grid';
import { OBJECT_DEFS } from '../data/objects';
import { BALANCE } from '../data/balance';
import { ROOM_DEFS, WALL_COST, DOOR_COST, FLOOR_DEFS } from '../data/rooms';
import { formatMoney } from '../core/util';
import { notify, earn } from './state';
import {
  buildDoor, buildFloor, buildWallRect, clearRect, designateRoom, placeObject, roomOuterRect,
} from './build';

export interface PrefabDef {
  id: string;
  ad: string;
  room: RoomType;
  /** varsayılan dış boyut (duvarlar dahil) — sürükleyerek büyütülüp küçültülebilir */
  w: number;
  h: number;
}

/** Sürüklemeyle seçilebilen dış boyut sınırları (duvarlar dahil). */
export const PREFAB_MIN = 5;
export const PREFAB_MAX_W = 24;
export const PREFAB_MAX_H = 18;

export const PREFABS: PrefabDef[] = [
  { id: 'p_derslik', ad: 'Derslik Binası', room: 'derslik', w: 8, h: 7 },
  { id: 'p_amfi', ad: 'Amfi', room: 'amfi', w: 12, h: 9 },
  { id: 'p_ofis', ad: 'Ofis Bloğu', room: 'ofis', w: 7, h: 6 },
  { id: 'p_lab', ad: 'Laboratuvar', room: 'laboratuvar', w: 8, h: 7 },
  { id: 'p_kutuphane', ad: 'Kütüphane', room: 'kutuphane', w: 9, h: 8 },
  { id: 'p_yemekhane', ad: 'Yemekhane', room: 'yemekhane', w: 10, h: 8 },
  { id: 'p_kantin', ad: 'Kantin', room: 'kantin', w: 6, h: 6 },
  { id: 'p_tuvalet', ad: 'Tuvalet', room: 'tuvalet', w: 5, h: 5 },
  { id: 'p_rektorluk', ad: 'Rektörlük', room: 'rektorluk', w: 6, h: 6 },
  { id: 'p_yurt', ad: 'Öğrenci Yurdu', room: 'yurt', w: 10, h: 8 },
];

// --- Özel şablonlar (localStorage) ------------------------------------------------

const SABLON_ANAHTAR = 'universite-simulatoru-sablonlar';
let ozelSablonlar: PrefabDef[] = sablonlariYukle();

function sablonlariYukle(): PrefabDef[] {
  try {
    const raw = localStorage.getItem(SABLON_ANAHTAR);
    if (!raw) return [];
    const liste = JSON.parse(raw) as PrefabDef[];
    return Array.isArray(liste) ? liste.filter((s) => s && s.room && s.w && s.h) : [];
  } catch { return []; }
}

function sablonlariKaydet(): void {
  try { localStorage.setItem(SABLON_ANAHTAR, JSON.stringify(ozelSablonlar)); } catch { /* dolu */ }
}

/** Kayıtlı özel şablonlar (Hazır Bina listesine eklenir). */
export function sablonlar(): PrefabDef[] {
  return ozelSablonlar;
}

/** Bir binayı özel şablon olarak kaydeder (tür + boyut). */
export function sablonKaydet(room: RoomType, w: number, h: number, ad: string): PrefabDef {
  let sayac = 1;
  let id = 't_' + room + '_' + w + 'x' + h;
  while (ozelSablonlar.some((s) => s.id === id)) id = 't_' + room + '_' + w + 'x' + h + '_' + (++sayac);
  const def: PrefabDef = { id, ad, room, w, h };
  ozelSablonlar.push(def);
  sablonlariKaydet();
  return def;
}

/** Özel şablonu siler. */
export function sablonSil(id: string): void {
  ozelSablonlar = ozelSablonlar.filter((s) => s.id !== id);
  sablonlariKaydet();
}

export function prefabDef(id: string): PrefabDef {
  const p = PREFABS.find((p) => p.id === id) ?? ozelSablonlar.find((p) => p.id === id);
  // bilinmeyen id (ör. silinmiş şablon) → türe göre ilk yerleşik ya da derslik
  return p ?? PREFABS[0];
}

// --- Döşeme desenleri ----------------------------------------------------------

interface PlanItem {
  type: ObjectTypeId;
  x: number;
  y: number;
}

/**
 * Verilen kare kümesi için oda türüne uygun eşya planı üretir.
 * occupied: eşya/duvar bulunan kareler (üzerine plan yazılmaz).
 * Desenler sınır kutusuna göredir; oda büyüdükçe eşya sayısı artar.
 */
export function furnishPlan(room: RoomType, tiles: number[], occupied: Set<number>): PlanItem[] {
  if (tiles.length === 0) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const set = new Set(tiles);
  for (const t of tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const ortaBx = Math.floor(w / 2);

  const plan: PlanItem[] = [];
  const koy = (type: ObjectTypeId, x: number, y: number) => {
    const t = tileIndex(x, y);
    if (!set.has(t) || occupied.has(t)) return;
    occupied.add(t);
    plan.push({ type, x, y });
  };

  for (const t of tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    const bx = x - minX, by = y - minY;

    switch (room) {
      case 'derslik':
      case 'amfi':
        // tahta üst-orta; sıralar 2. satırdan itibaren HER satıra, orta koridor
        // (ortaBx) boş bırakılır — daha yoğun oturma = daha çok kontenjan
        if (by === 0 && bx === ortaBx) koy('tahta', x, y);
        else if (by >= 2 && bx !== ortaBx) koy('sira', x, y);
        break;
      case 'ofis':
      case 'rektorluk':
        if (bx % 2 === 0 && by % 2 === 0) koy('calisma_masasi', x, y);
        break;
      case 'kutuphane':
        if (by % 2 === 0 && bx !== ortaBx) koy('kitaplik', x, y);
        else if (by % 2 === 1 && bx === ortaBx) koy('sandalye', x, y);
        else if (by % 2 === 1 && bx === ortaBx - 1) koy('masa', x, y);
        break;
      case 'laboratuvar':
        if (by % 2 === 1 && bx === w - 1) koy('bilgisayar', x, y);
        else if (by % 2 === 1 && bx % 2 === 0) koy('lab_tezgahi', x, y);
        break;
      case 'yemekhane':
        if (by === 0 && bx % 4 === 1) koy('yemek_bankosu', x, y);
        else if (by >= 2 && bx % 4 === 2 && by % 4 === 2) koy('masa', x, y);
        else if (by >= 2 && (bx + by) % 2 === 0) koy('sandalye', x, y);
        break;
      case 'kantin':
        if (by === 0 && bx % 3 === 1) koy('otomat', x, y);
        else if (by >= 2 && bx % 2 === 0 && by % 2 === 0) koy('sandalye', x, y);
        break;
      case 'tuvalet':
        if (by === 0 && bx % 2 === 0) koy('klozet', x, y);
        else if (by === h - 1 && by !== 0 && bx % 2 === 0) koy('lavabo', x, y);
        break;
      case 'yurt':
        if (by % 2 === 0 && bx % 2 === 0) koy('ranza', x, y);
        break;
      default:
        break;
    }
  }
  return plan;
}

function planMaliyet(plan: PlanItem[]): number {
  let toplam = 0;
  for (const p of plan) toplam += OBJECT_DEFS[p.type].maliyet;
  return toplam;
}

// --- Prefab yerleştirme ----------------------------------------------------------

function icTiles(x0: number, y0: number, w: number, h: number): number[] {
  const tiles: number[] = [];
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    for (let x = x0 + 1; x < x0 + w - 1; x++) tiles.push(tileIndex(x, y));
  }
  return tiles;
}

/**
 * İmleç sol üst köşe kabul edilir — prefabRect'in sürükleme başlamadan (a === b)
 * ürettiği köşeyle birebir aynı çapa. Önceden imleci merkezleyordu; bu da fare
 * basılır basılmaz (ui.dragStart set edilir edilmez) önizlemenin merkezden
 * köşeye zıplamasına yol açıyordu — artık ikisi de hep sol üstten tutuyor.
 */
export function prefabOrigin(def: PrefabDef, hover: Point): Point {
  return { x: hover.x, y: hover.y };
}

/**
 * Sürükleme dikdörtgeninden prefab yerleşimi. Köşe `a` (sürükleme başlangıcı)
 * SABİT çapa olarak tutulur; dikdörtgen `b`'ye (imleç) doğru büyür. Min/max ve
 * oda min-alan büyütmesi de HEP `a`'dan uzağa (sürükleme yönüne) uygulanır —
 * kutu asla çapanın gerisine kaymaz, büyüme öngörülebilir olur.
 */
export function prefabRect(def: PrefabDef, a: Point, b: Point): { x: number; y: number; w: number; h: number } {
  const dirX = b.x >= a.x ? 1 : -1;
  const dirY = b.y >= a.y ? 1 : -1;
  let w = Math.abs(b.x - a.x) + 1;
  let h = Math.abs(b.y - a.y) + 1;
  w = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_W, w));
  h = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_H, h));
  // iç alan (duvarlar hariç) oda minimumunu karşılasın — kısa kenarı büyüt
  const minAlan = ROOM_DEFS[def.room].minBoyut;
  let emniyet = 0;
  while ((w - 2) * (h - 2) < minAlan && emniyet++ < 40) {
    if (w <= h && w < PREFAB_MAX_W) w++;
    else if (h < PREFAB_MAX_H) h++;
    else break;
  }
  // çapa `a`'yı köşe kabul et: kutu sürükleme yönünde uzar
  const x = dirX > 0 ? a.x : a.x - (w - 1);
  const y = dirY > 0 ? a.y : a.y - (h - 1);
  return { x, y, w, h };
}

/** Kapı konumu — yön: 0 alt · 1 sağ · 2 üst · 3 sol. */
export function prefabKapi(x0: number, y0: number, w: number, h: number, yon: number): Point {
  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  const mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
  switch (((yon % 4) + 4) % 4) {
    case 1: return { x: x1, y: my };
    case 2: return { x: mx, y: y0 };
    case 3: return { x: x0, y: my };
    default: return { x: mx, y: y1 };
  }
}

const ZEMIN_MALIYET = FLOOR_DEFS.find((f) => f.id === 'beton')!.maliyet;

/** Toplam maliyet: zemin + duvar + kapı + eşya planı (boyuta göre). */
export function prefabCost(def: PrefabDef, w = def.w, h = def.h): number {
  const alan = w * h;
  const cevre = alan - Math.max(0, w - 2) * Math.max(0, h - 2);
  const plan = furnishPlan(def.room, icTiles(0, 0, w, h), new Set());
  return alan * ZEMIN_MALIYET + (cevre - 1) * WALL_COST + DOOR_COST + planMaliyet(plan);
}

/** Prefabın kaç ana eşya içerdiği (buton etiketi için): ör. '12 sıra'. */
export function prefabOzet(def: PrefabDef, w = def.w, h = def.h): string {
  const plan = furnishPlan(def.room, icTiles(0, 0, w, h), new Set());
  const sayim = new Map<ObjectTypeId, number>();
  for (const p of plan) sayim.set(p.type, (sayim.get(p.type) ?? 0) + 1);
  return [...sayim.entries()]
    .map(([tip, adet]) => `${adet} ${OBJECT_DEFS[tip].ad.toLowerCase()}`)
    .join(', ');
}

export function canPlacePrefab(
  state: GameState, def: PrefabDef, x0: number, y0: number, w = def.w, h = def.h,
): boolean {
  if (!inBounds(x0, y0) || !inBounds(x0 + w - 1, y0 + h - 1)) return false;

  // giriş kapısının önünü kapatma
  if (GATE.x >= x0 - 1 && GATE.x <= x0 + w && GATE.y >= y0 - 1 && GATE.y <= y0 + h) return false;

  const dolu = new Set<number>();
  for (const o of state.objects) dolu.add(tileIndex(o.x, o.y));

  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = tileIndex(x, y);
      if (state.wall[t] !== WALL_NONE) return false;
      if (state.roomAt[t] !== -1) return false;
      if (dolu.has(t)) return false;
    }
  }
  return true;
}

export function placePrefab(
  state: GameState, def: PrefabDef, x0: number, y0: number, w = def.w, h = def.h,
  aninda = false, yon = 0,
): boolean {
  if (!canPlacePrefab(state, def, x0, y0, w, h)) {
    notify(state, 'Buraya yerleştirilemez: alan dolu ya da harita dışında.', 'kotu');
    return false;
  }
  const toplam = prefabCost(def, w, h);
  if (state.para < toplam) {
    notify(state, `Yetersiz bütçe: ${def.ad} için ${Math.round(toplam).toLocaleString('tr-TR')} ₺ gerekli.`, 'kotu');
    return false;
  }

  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  buildFloor(state, x0, y0, x1, y1, 'beton');
  buildWallRect(state, x0, y0, x1, y1);
  const kapi = prefabKapi(x0, y0, w, h, yon);
  buildDoor(state, kapi.x, kapi.y);
  designateRoom(state, def.room, x0 + 1, y0 + 1, x1 - 1, y1 - 1);

  const plan = furnishPlan(def.room, icTiles(x0, y0, w, h), new Set());
  for (const p of plan) placeObject(state, p.type, p.x, p.y);

  // ŞANTİYE: hazır bina anında bitmez — boyutuyla orantılı inşaat süresi işler,
  // ustalar (tamirciler) başında çalışırsa hızlanır. Oda bitene dek kullanılamaz.
  if (!aninda) {
    const yeniOda = state.rooms[state.rooms.length - 1];
    if (yeniOda) {
      const sure = Math.round(w * h * BALANCE.INSAAT_DK_KARE);
      yeniOda.insaat = sure;
      yeniOda.insaatToplam = sure;
    }
  }

  validateRooms(state);
  notify(state, aninda
    ? `🏗️ ${def.ad} kuruldu (${ROOM_DEFS[def.room].ad}, ${w}×${h}).`
    : `🏗️ ${def.ad} şantiyesi kuruldu (${w}×${h}) — ustalar çalışıyor, bina yaklaşık ${Math.round((w * h * BALANCE.INSAAT_DK_KARE) / 60)} saatte hazır.`, 'iyi');
  return true;
}

/**
 * Var olan binayı yeniden boyutlandırır: kimliği (bölüm ataması, özel ad)
 * korunur; eski malzeme tam iade edilip yeni boyut kurulur — net maliyet
 * yalnızca FARK olur (küçültünce para geri gelir). Hedef, eski izdüşüm dışında
 * boş olmalı. prefabId, binanın türüne uygun prefab (maliyet + döşeme için).
 */
/** Yeniden boyutlandırma geçerli mi (hedef eski izdüşüm dışında boş olmalı)? */
export function resizeGecerli(
  state: GameState, roomId: number, nx0: number, ny0: number, nw: number, nh: number,
): boolean {
  const oldRect = roomOuterRect(state, roomId);
  if (!oldRect) return false;
  const eski = new Set<number>();
  for (let y = oldRect.y0; y <= oldRect.y1; y++) {
    for (let x = oldRect.x0; x <= oldRect.x1; x++) eski.add(tileIndex(x, y));
  }
  for (let y = ny0; y < ny0 + nh; y++) {
    for (let x = nx0; x < nx0 + nw; x++) {
      if (!inBounds(x, y)) return false;
      if (x === GATE.x && y === GATE.y) return false;
      const t = tileIndex(x, y);
      if (eski.has(t)) continue;
      if (state.floor[t] !== null || state.wall[t] !== WALL_NONE || state.roomAt[t] !== -1
          || state.objects.some((o) => o.x === x && o.y === y)) return false;
    }
  }
  return true;
}

export function resizeRoom(
  state: GameState, roomId: number, prefabId: string, nx0: number, ny0: number, nw: number, nh: number,
): boolean {
  const room = state.rooms.find((r) => r.id === roomId);
  const oldRect = roomOuterRect(state, roomId);
  if (!room || !oldRect) return false;
  const def = prefabDef(prefabId);
  nw = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_W, nw));
  nh = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_H, nh));
  const oldW = oldRect.x1 - oldRect.x0 + 1, oldH = oldRect.y1 - oldRect.y0 + 1;

  if (!resizeGecerli(state, roomId, nx0, ny0, nw, nh)) {
    notify(state, 'Yeni boyut komşu binaya/girişe çakışıyor ya da harita dışına taşar.', 'kotu');
    return false;
  }

  const oldCost = prefabCost(def, oldW, oldH);
  const newCost = prefabCost(def, nw, nh);
  // fark maliyet: büyütünce fark ödenir (bütçe yetmezse iptal)
  if (newCost - oldCost > state.para) {
    notify(state, `Yetersiz bütçe: büyütmek için ${formatMoney(newCost - oldCost)} gerekir.`, 'kotu');
    return false;
  }
  const deptId = room.deptId, ozelAd = room.ozelAd;
  earn(state, oldCost); // eski malzeme tam iade
  clearRect(state, oldRect.x0, oldRect.y0, oldRect.x1, oldRect.y1); // odayı ve inşaatı sil (iadesiz)
  const ok = placePrefab(state, def, nx0, ny0, nw, nh, true); // yeni boyut, anında, newCost düşer
  if (!ok) return false;
  const yeni = state.rooms[state.rooms.length - 1];
  yeni.deptId = deptId;
  yeni.ozelAd = ozelAd;
  validateRooms(state);
  notify(state, `📐 ${ROOM_DEFS[def.room].ad}${ozelAd ? ` "${ozelAd}"` : ''} yeniden boyutlandırıldı (${oldW}×${oldH} → ${nw}×${nh}, net ${formatMoney(newCost - oldCost)}).`, 'iyi');
  return true;
}

// --- Mevcut odayı otomatik döşe ---------------------------------------------------

/** Odaya eklenecek eşya planı (var olanların üstüne yazmaz). */
export function roomFurnishPlan(state: GameState, room: Room): PlanItem[] {
  const occupied = new Set<number>();
  for (const o of state.objects) occupied.add(tileIndex(o.x, o.y));
  for (const t of room.tiles) if (state.wall[t] !== WALL_NONE) occupied.add(t);
  return furnishPlan(room.type, room.tiles, occupied);
}

export function autoFurnishCost(state: GameState, room: Room): number {
  return planMaliyet(roomFurnishPlan(state, room));
}

export function autoFurnishRoom(state: GameState, roomId: number): boolean {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const plan = roomFurnishPlan(state, room);
  if (plan.length === 0) {
    notify(state, 'Bu oda zaten döşeli görünüyor.', 'bilgi');
    return false;
  }
  const toplam = planMaliyet(plan);
  if (state.para < toplam) {
    notify(state, `Yetersiz bütçe: döşeme için ${Math.round(toplam).toLocaleString('tr-TR')} ₺ gerekli.`, 'kotu');
    return false;
  }
  for (const p of plan) placeObject(state, p.type, p.x, p.y);
  validateRooms(state);
  notify(state, `🪄 ${ROOM_DEFS[room.type].ad} otomatik döşendi (${plan.length} eşya).`, 'iyi');
  return true;
}
