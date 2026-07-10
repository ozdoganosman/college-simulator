import {
  FloorId, GameState, PlacedObject, Room, RoomType,
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
      if (state.wall[t] === WALL_SOLID) continue;
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
  state.objects.push({ id: newId(state), type, x, y, roomId: rid, reservedBy: -1 });
  validateRooms(state);
}

/** Dikdörtgen alanı oda olarak işaretle. Mevcut oda karelerinin üstüne yazılamaz. */
export function designateRoom(state: GameState, type: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  const tiles: number[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!inBounds(x, y)) continue;
      const t = tileIndex(x, y);
      if (state.roomAt[t] !== -1) continue;   // başka odanın karesi
      if (state.wall[t] === WALL_SOLID) continue;
      tiles.push(t);
    }
  }
  if (tiles.length === 0) return;
  const room: Room = { id: newId(state), type, tiles, valid: false, missing: [], deptId: null };
  state.rooms.push(room);
  for (const t of tiles) state.roomAt[t] = room.id;
  // içerideki eşyaların oda kaydını güncelle
  for (const o of state.objects) {
    const t = tileIndex(o.x, o.y);
    if (tiles.includes(t)) o.roomId = room.id;
  }
  validateRooms(state);
  notify(state, `${ROOM_DEFS[type].ad} bölgesi atandı`, 'bilgi');
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
