import {
  FloorId, GameState, GATE, MAP_W, PlacedObject, Room, RoomType,
  WALL_DOOR, WALL_NONE, WALL_SOLID, inBounds, tileIndex,
} from '../core/types';
import { validateRooms } from '../core/grid';
import { DOOR_COST, FLOOR_DEFS, REFUND, ROOM_DEFS, WALL_COST } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import { newId } from '../core/util';
import { notify, spend, earn } from './state';

function floorCost(id: FloorId): number {
  return FLOOR_DEFS.find((f) => f.id === id)!.maliyet;
}

/** Dikdörtgen alana zemin döşe. */
export function buildFloor(state: GameState, x0: number, y0: number, x1: number, y1: number, id: FloorId): void {
  const tiles: number[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      if (state.floor[t] === id) continue;
      tiles.push(t);
    }
  }
  const maliyet = tiles.length * floorCost(id);
  if (!spend(state, maliyet, 'zemin döşeme')) return;
  for (const t of tiles) state.floor[t] = id;
  validateRooms(state);
}

/** Dikdörtgenin çevresine duvar ör (içi boş). Tek sıra için düz çizgi de olur. */
export function buildWallRect(state: GameState, x0: number, y0: number, x1: number, y1: number): void {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const tiles: number[] = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const kenar = x === xa || x === xb || y === ya || y === yb;
      if (!kenar || !inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      if (state.wall[t] !== WALL_NONE) continue; // mevcut duvar/kapının üstüne yazma
      if (state.objects.some((o) => tileIndex(o.x, o.y) === t)) continue; // eşyanın üstüne duvar olmaz
      tiles.push(t);
    }
  }
  if (!spend(state, tiles.length * WALL_COST, 'duvar')) return;
  for (const t of tiles) state.wall[t] = WALL_SOLID;
  validateRooms(state);
}

/** Tek kareye kapı (mevcut duvarın yerine ya da boş kareye duvar+kapı). */
export function buildDoor(state: GameState, x: number, y: number): void {
  if (!inBounds(x, y)) return;
  const t = tileIndex(x, y);
  if (state.wall[t] === WALL_DOOR) return;
  if (!spend(state, DOOR_COST, 'kapı')) return;
  state.wall[t] = WALL_DOOR;
  validateRooms(state);
}

/** Yıkım: eşya > kapı/duvar > oda ataması > zemin sırasıyla kaldırır, %25 iade. */
export function demolish(state: GameState, x0: number, y0: number, x1: number, y1: number): void {
  let iade = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      // eşyalar
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const o = state.objects[i];
        if (o.x === x && o.y === y) {
          iade += OBJECT_DEFS[o.type].maliyet * REFUND;
          releaseObjectUsers(state, o.id);
          state.objects.splice(i, 1);
        }
      }
      if (state.wall[t] === WALL_SOLID) iade += WALL_COST * REFUND;
      if (state.wall[t] === WALL_DOOR) iade += DOOR_COST * REFUND;
      state.wall[t] = WALL_NONE;
      if (state.floor[t] !== null) {
        iade += floorCost(state.floor[t]!) * REFUND;
        state.floor[t] = null;
      }
      // oda ataması kaldır
      const rid = state.roomAt[t];
      if (rid !== -1) {
        const room = state.rooms.find((r) => r.id === rid);
        if (room) room.tiles = room.tiles.filter((tt) => tt !== t);
        state.roomAt[t] = -1;
      }
    }
  }
  // boş kalan odaları sil
  state.rooms = state.rooms.filter((r) => r.tiles.length > 0);
  earn(state, iade);
  validateRooms(state);
}

/** Eşyayı kullanan ajanları serbest bırak (yıkım/iptal için). */
function releaseObjectUsers(state: GameState, objectId: number): void {
  for (const a of state.agents) {
    if (a.usingObject === objectId) {
      a.usingObject = -1;
      a.activity = 'bosta';
      a.activityUntil = -1;
    }
  }
}

/** Eşya yerleştir. Oda kuralı: def.odalar null değilse o oda türünde olmalı. */
export function placeObject(state: GameState, type: PlacedObject['type'], x: number, y: number): void {
  if (!inBounds(x, y)) return;
  const t = tileIndex(x, y);
  if (state.wall[t] !== WALL_NONE) { notify(state, 'Duvarın üstüne eşya konulamaz', 'kotu'); return; }
  if (state.objects.some((o) => o.x === x && o.y === y)) { notify(state, 'Bu karede zaten eşya var', 'kotu'); return; }

  const def = OBJECT_DEFS[type];
  const rid = state.roomAt[t];
  if (def.odalar !== null) {
    const room = state.rooms.find((r) => r.id === rid);
    if (!room || !def.odalar.includes(room.type)) {
      const odaAdlari = def.odalar.map((o) => ROOM_DEFS[o].ad).join(', ');
      notify(state, `${def.ad} yalnızca şu odalara konulabilir: ${odaAdlari}`, 'kotu');
      return;
    }
  }
  if (!spend(state, def.maliyet, def.ad)) return;
  state.objects.push({ id: newId(state), type, x, y, roomId: rid, reservedBy: -1, yipranma: 0 });
  validateRooms(state);
}

/**
 * Dikdörtgen alanı oda olarak işaretle. Sürüklenen alan aynı türde mevcut bir
 * odayla kesişiyor ya da ona bitişikse yeni kareler o odaya EKLENİR (genişletme);
 * yoksa yeni oda oluşturulur. Farklı türdeki odaların karelerine yazılamaz.
 */
export function designateRoom(state: GameState, type: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  const tiles: number[] = [];
  let hedef: Room | undefined; // genişletilecek aynı türde oda
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      const rid = state.roomAt[t];
      if (rid !== -1) {
        if (!hedef) {
          const r = state.rooms.find((r) => r.id === rid);
          if (r && r.type === type) hedef = r; // kesişim -> bu odayı büyüt
        }
        continue; // mevcut oda karesinin üstüne yazma
      }
      if (state.wall[t] === WALL_SOLID) continue;
      tiles.push(t);
    }
  }
  if (tiles.length === 0) return;

  // kesişim yoksa bitişiklik ara: yeni karelerden birine komşu aynı türde oda
  if (!hedef) {
    dis: for (const t of tiles) {
      const x = t % MAP_W, y = Math.floor(t / MAP_W);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (!inBounds(nx, ny)) continue;
        const rid = state.roomAt[tileIndex(nx, ny)];
        if (rid === -1) continue;
        const r = state.rooms.find((r) => r.id === rid);
        if (r && r.type === type) { hedef = r; break dis; }
      }
    }
  }

  let room: Room;
  if (hedef) {
    hedef.tiles.push(...tiles);
    room = hedef;
    notify(state, `${ROOM_DEFS[type].ad} genişletildi (+${tiles.length} kare)`, 'bilgi');
  } else {
    room = { id: newId(state), type, tiles, valid: false, missing: [], deptId: null, ozelAd: null };
    state.rooms.push(room);
    notify(state, `${ROOM_DEFS[type].ad} bölgesi atandı`, 'bilgi');
  }
  for (const t of tiles) state.roomAt[t] = room.id;
  // içerideki eşyaların oda kaydını güncelle
  const tileSet = new Set(tiles);
  for (const o of state.objects) {
    if (tileSet.has(tileIndex(o.x, o.y))) o.roomId = room.id;
  }
  validateRooms(state);
}

/** Odayı tamamen kaldırır — inşaat ve eşyalar yerinde kalır. */
export function deleteRoom(state: GameState, roomId: number): void {
  const idx = state.rooms.findIndex((r) => r.id === roomId);
  if (idx < 0) return;
  const room = state.rooms[idx];
  for (const t of room.tiles) state.roomAt[t] = -1;
  for (const o of state.objects) {
    if (o.roomId === roomId) o.roomId = -1;
  }
  state.rooms.splice(idx, 1);
  validateRooms(state);
  notify(state, `${ROOM_DEFS[room.type].ad} oda ataması silindi (inşaat ve eşyalar yerinde).`, 'bilgi');
}

// --- Bina taşıma / kopyalama / tek tık yıkım ---------------------------------

/** Odanın DUVARLAR DAHİL dış dikdörtgeni (iç kareler ±1). null = boş oda. */
export function roomOuterRect(
  state: GameState, roomId: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || room.tiles.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of room.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { x0: minX - 1, y0: minY - 1, x1: maxX + 1, y1: maxY + 1 };
}

/** Binayı yeni sol-üst köşeye (nx0,ny0) taşıyabilir miyiz? */
export function canMoveRoom(
  state: GameState, roomId: number, nx0: number, ny0: number,
): { ok: boolean; neden: string } {
  const rect = roomOuterRect(state, roomId);
  if (!rect) return { ok: false, neden: 'oda bulunamadı' };
  const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
  const dx = nx0 - rect.x0, dy = ny0 - rect.y0;
  // kaynak dikdörtgen: yalnız bu binaya ait olmalı (başka oda karesi içermemeli)
  const kaynak = new Set<number>();
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      kaynak.add(t);
      const rid = state.roomAt[t];
      if (rid !== -1 && rid !== roomId) return { ok: false, neden: 'başka odayla iç içe — taşınamaz' };
    }
  }
  // hedef dikdörtgen: kaynağa ait olmayan her kare TAMAMEN boş olmalı
  for (let y = ny0; y < ny0 + h; y++) {
    for (let x = nx0; x < nx0 + w; x++) {
      if (!inBounds(x, y)) return { ok: false, neden: 'harita dışına taşar' };
      if (x === GATE.x && y === GATE.y) return { ok: false, neden: 'girişin üstüne taşınamaz' };
      const t = tileIndex(x, y);
      if (kaynak.has(t)) continue; // kendi üstünde kayma
      if (state.floor[t] !== null || state.wall[t] !== WALL_NONE || state.roomAt[t] !== -1) {
        return { ok: false, neden: 'hedef alan dolu' };
      }
      if (state.objects.some((o) => o.x === x && o.y === y)) return { ok: false, neden: 'hedef alan dolu (eşya)' };
    }
  }
  return { ok: dx !== 0 || dy !== 0, neden: dx === 0 && dy === 0 ? 'aynı yer' : '' };
}

/** Binayı taşı — zemin/duvar/kapı/eşya/oda ataması hep birlikte kayar. */
export function moveRoom(state: GameState, roomId: number, nx0: number, ny0: number): boolean {
  const kontrol = canMoveRoom(state, roomId, nx0, ny0);
  if (!kontrol.ok) {
    if (kontrol.neden && kontrol.neden !== 'aynı yer') notify(state, `Taşınamadı: ${kontrol.neden}.`, 'kotu');
    return false;
  }
  const room = state.rooms.find((r) => r.id === roomId)!;
  const rect = roomOuterRect(state, roomId)!;
  const dx = nx0 - rect.x0, dy = ny0 - rect.y0;

  // kaynak karelerini fotoğrafla (zemin + duvar), sonra temizle
  const kar: { t: number; floor: FloorId | null; wall: number }[] = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const t = tileIndex(x, y);
      kar.push({ t, floor: state.floor[t], wall: state.wall[t] });
      state.floor[t] = null;
      state.wall[t] = WALL_NONE;
      state.roomAt[t] = -1;
    }
  }
  // hedefe yaz
  for (const s of kar) {
    const x = (s.t % MAP_W) + dx, y = Math.floor(s.t / MAP_W) + dy;
    const nt = tileIndex(x, y);
    state.floor[nt] = s.floor;
    state.wall[nt] = s.wall;
  }
  // oda karelerini kaydır + roomAt yeniden yaz
  room.tiles = room.tiles.map((t) => tileIndex((t % MAP_W) + dx, Math.floor(t / MAP_W) + dy));
  for (const t of room.tiles) state.roomAt[t] = roomId;
  // eşyaları kaydır (kaynak dikdörtgen içindeki her eşya) + kullanıcıları serbest bırak
  const x1 = rect.x1, y1 = rect.y1;
  for (const o of state.objects) {
    if (o.x >= rect.x0 && o.x <= x1 && o.y >= rect.y0 && o.y <= y1) {
      releaseObjectUsers(state, o.id);
      o.x += dx; o.y += dy;
      o.reservedBy = -1;
    }
  }
  state.insaatSurumu = (state.insaatSurumu ?? 0) + 1;
  validateRooms(state);
  notify(state, `📦 ${ROOM_DEFS[room.type].ad}${room.ozelAd ? ` "${room.ozelAd}"` : ''} taşındı.`, 'iyi');
  return true;
}

/** Binayı tek işlemle tümüyle yık (duvarlar+zemin+eşya+oda), %25 iade. */
export function demolishRoom(state: GameState, roomId: number): void {
  const rect = roomOuterRect(state, roomId);
  if (!rect) return;
  demolish(state, rect.x0, rect.y0, rect.x1, rect.y1);
}

/** Oda atamasını kaldır (inşaat kalır). */
export function unassignRoom(state: GameState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      const rid = state.roomAt[t];
      if (rid === -1) continue;
      const room = state.rooms.find((r) => r.id === rid);
      if (room) room.tiles = room.tiles.filter((tt) => tt !== t);
      state.roomAt[t] = -1;
      for (const o of state.objects) if (o.x === x && o.y === y) o.roomId = -1;
    }
  }
  state.rooms = state.rooms.filter((r) => r.tiles.length > 0);
  validateRooms(state);
}
