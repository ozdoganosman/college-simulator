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
import { ROOM_DEFS, WALL_COST, DOOR_COST, FLOOR_DEFS } from '../data/rooms';
import { notify } from './state';
import { buildDoor, buildFloor, buildWallRect, designateRoom, placeObject } from './build';

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

export function prefabDef(id: string): PrefabDef {
  const p = PREFABS.find((p) => p.id === id);
  if (!p) throw new Error('Bilinmeyen prefab: ' + id);
  return p;
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
        if (by === 0 && bx === ortaBx) koy('tahta', x, y);
        else if (by >= 2 && by % 2 === 0) koy('sira', x, y);
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

/** İmleç merkezli sol üst köşe. */
export function prefabOrigin(def: PrefabDef, hover: Point): Point {
  return { x: hover.x - Math.floor(def.w / 2), y: hover.y - Math.floor(def.h / 2) };
}

/**
 * Sürükleme dikdörtgeninden prefab yerleşimi: iki köşe noktasından
 * min/max sınırlarına oturtulmuş {x, y, w, h} üretir (kapı payı için min 5).
 * İç alan oda minBoyut'unun altındaysa da en az o kadar büyütülür.
 */
export function prefabRect(def: PrefabDef, a: Point, b: Point): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  let w = Math.abs(a.x - b.x) + 1;
  let h = Math.abs(a.y - b.y) + 1;
  w = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_W, w));
  h = Math.max(PREFAB_MIN, Math.min(PREFAB_MAX_H, h));
  // iç alan (duvarlar hariç) oda minimumunu karşılasın — genişliği önce büyüt
  const minAlan = ROOM_DEFS[def.room].minBoyut;
  let emniyet = 0;
  while ((w - 2) * (h - 2) < minAlan && emniyet++ < 40) {
    if (w <= h && w < PREFAB_MAX_W) w++;
    else if (h < PREFAB_MAX_H) h++;
    else break;
  }
  return { x, y, w, h };
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
  buildDoor(state, Math.floor((x0 + x1) / 2), y1);
  designateRoom(state, def.room, x0 + 1, y0 + 1, x1 - 1, y1 - 1);

  const plan = furnishPlan(def.room, icTiles(x0, y0, w, h), new Set());
  for (const p of plan) placeObject(state, p.type, p.x, p.y);

  validateRooms(state);
  notify(state, `🏗️ ${def.ad} kuruldu (${ROOM_DEFS[def.room].ad}, ${w}×${h}).`, 'iyi');
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
