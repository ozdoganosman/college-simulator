import {
  GameState, MAP_W, MAP_H, Point, Room, WALL_DOOR, WALL_NONE, WALL_SOLID,
  inBounds, tileIndex,
} from './types';
import { ROOM_DEFS } from '../data/rooms';

/** Yürünebilir mi: duvar değilse (kapı yürünebilir). */
export function walkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  return state.wall[tileIndex(x, y)] !== WALL_SOLID;
}

/** Bir odanın kare merkez noktası (etiket/hedef seçimi için). */
export function roomCenter(room: Room): Point {
  let sx = 0, sy = 0;
  for (const t of room.tiles) {
    sx += t % MAP_W;
    sy += Math.floor(t / MAP_W);
  }
  const n = Math.max(1, room.tiles.length);
  return { x: Math.round(sx / n), y: Math.round(sy / n) };
}

/** Odanın yürünebilir rastgele olmayan ilk karesi (hedef olarak). */
export function roomEntryTile(state: GameState, room: Room): Point | null {
  for (const t of room.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (walkable(state, x, y)) return { x, y };
  }
  return null;
}

/**
 * Oda kapalı mı: oda karelerinden dışarı doğru duvar/kapı geçmeden
 * harita kenarına ya da odasız+zeminsiz (çim) kareye ulaşılabiliyorsa açık demektir.
 * Kapıdan geçiş sayılmaz (kapı sınır elemanıdır).
 */
export function isEnclosed(state: GameState, room: Room): boolean {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const queue: number[] = [];
  for (const t of room.tiles) {
    if (state.wall[t] === WALL_NONE) {
      queue.push(t);
      seen[t] = 1;
    }
  }
  while (queue.length > 0) {
    const t = queue.pop()!;
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    const komsular = [ [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1] ] as const;
    for (const [nx, ny] of komsular) {
      if (!inBounds(nx, ny)) return false; // harita kenarına taştı -> açık
      const nt = tileIndex(nx, ny);
      if (seen[nt]) continue;
      const w = state.wall[nt];
      if (w === WALL_SOLID || w === WALL_DOOR) continue; // sınır: geçme
      // duvar yok: iç mekân sayılması için zemin döşeli olmalı
      if (state.floor[nt] === null) return false; // çime taştı -> açık
      seen[nt] = 1;
      queue.push(nt);
    }
  }
  return true;
}

/** Tüm odaların geçerliliğini (boyut, kapalılık, eşya gereksinimleri) günceller. */
export function validateRooms(state: GameState): void {
  state.insaatSurumu = (state.insaatSurumu ?? 0) + 1; // render önbelleğini tazele
  for (const room of state.rooms) {
    const def = ROOM_DEFS[room.type];
    const missing: string[] = [];

    if (room.tiles.length < def.minBoyut) {
      missing.push(`En az ${def.minBoyut} kare olmalı (şu an ${room.tiles.length})`);
    }

    // zemin şartı: tüm kareler döşeli
    const zeminsiz = room.tiles.some((t) => state.floor[t] === null && state.wall[t] === WALL_NONE);
    if (zeminsiz) missing.push('Tüm kareler zeminli olmalı');

    if (def.kapali && !isEnclosed(state, room)) {
      missing.push('Duvarlarla çevrili olmalı (kapı unutma)');
    }

    for (const req of def.gereksinim) {
      const adet = state.objects.filter((o) => o.roomId === room.id && o.type === req.obj).length;
      if (adet < req.adet) {
        missing.push(`${req.adet} adet gerekli eşya eksik: ${req.obj} (${adet}/${req.adet})`);
      }
    }

    room.missing = missing;
    room.valid = missing.length === 0;
  }
}

/** Belirli türdeki geçerli odalar. */
export function validRooms(state: GameState, type: Room['type']): Room[] {
  return state.rooms.filter((r) => r.type === type && r.valid);
}

/** Kütüphane seviyesi: geçerli kütüphanelerdeki toplam kitaplık sayısına göre 0-3. */
export function libraryLevel(state: GameState): number {
  const kutuphaneler = validRooms(state, 'kutuphane');
  let kitaplik = 0;
  for (const k of kutuphaneler) {
    kitaplik += state.objects.filter((o) => o.roomId === k.id && o.type === 'kitaplik').length;
  }
  // eşikler balance'ta; döngüsel import olmasın diye burada sabit
  const esik = [0, 5, 12, 24];
  let seviye = 0;
  for (let i = 1; i < esik.length; i++) if (kitaplik >= esik[i]) seviye = i;
  return seviye;
}

/** Odadaki boş (rezerve edilmemiş) belirli türde eşya bul. */
export function freeObjectInRoom(state: GameState, roomId: number, type: string): number {
  for (const o of state.objects) {
    if (o.roomId === roomId && o.type === type && o.reservedBy === -1) return o.id;
  }
  return -1;
}
