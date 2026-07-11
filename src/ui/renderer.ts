import {
  GameState, GATE, MAP_H, MAP_W, TILE, WALL_DOOR, WALL_NONE, WALL_SOLID, tileIndex,
} from '../core/types';
import { roomCenter } from '../core/grid';
import { AYARLAR } from '../core/settings';
import { formatMoney } from '../core/util';
import { FLOOR_DEFS, ROOM_DEFS, WALL_COST } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import { DEPT_DEFS, deptDef } from '../data/departments';
import { bushSprite, gateSprite, objectSprite, treeSprite } from './sprites';
import { canPlacePrefab, prefabCost, prefabDef, prefabOrigin } from '../game/prefab';
import type { Camera } from './camera';
import type { UIState } from './uistate';

// ---------------------------------------------------------------------------
// Statik zemin katmanı: çim/zemin dokuları, oda kaplamaları, duvarlar, gölgeler
// ve dekor tek bir offscreen canvas'a çizilir; yalnızca inşaat değişince yenilenir.
// ---------------------------------------------------------------------------

let groundCanvas: HTMLCanvasElement | null = null;
let groundVersion = -1;

/** Zemin katmanı önbelleğini geçersiz kıl (durum değişimi / ayar değişimi). */
export function invalidateGround(): void {
  groundVersion = -1;
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const FLOOR_STYLE: Record<string, { taban: string; detay: (c: CanvasRenderingContext2D, px: number, py: number) => void }> = {
  beton: {
    taban: '#b6b1a5',
    detay(c, px, py) {
      c.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 3; i++) {
        const r = hash2(px + i * 7, py + i * 13);
        c.fillRect(px + r * TILE * 0.8, py + hash2(px + i, py) * TILE * 0.8, 2, 2);
      }
    },
  },
  parke: {
    taban: '#c49a63',
    detay(c, px, py) {
      c.strokeStyle = 'rgba(90,55,20,0.25)';
      c.lineWidth = 1;
      const ty = Math.floor(py / TILE);
      c.beginPath();
      c.moveTo(px, py + TILE * 0.5);
      c.lineTo(px + TILE, py + TILE * 0.5);
      const kaydir = ty % 2 === 0 ? 0.5 : 0;
      c.moveTo(px + TILE * kaydir, py);
      c.lineTo(px + TILE * kaydir, py + TILE * 0.5);
      c.moveTo(px + TILE * (kaydir === 0 ? 0.5 : 0), py + TILE * 0.5);
      c.lineTo(px + TILE * (kaydir === 0 ? 0.5 : 0), py + TILE);
      c.stroke();
    },
  },
  karo: {
    taban: '#b9c6cb',
    detay(c, px, py) {
      c.strokeStyle = 'rgba(70,90,100,0.3)';
      c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if ((tx + ty) % 2 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(px, py, TILE, TILE);
      }
    },
  },
  yol: {
    taban: '#9b9b98',
    detay(c, px, py) {
      c.fillStyle = 'rgba(0,0,0,0.08)';
      const r = hash2(px, py);
      if (r > 0.6) c.fillRect(px + r * 10, py + r * 14, 3, 2);
      c.strokeStyle = 'rgba(60,60,60,0.25)';
      c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    },
  },
};

function drawGround(state: GameState): HTMLCanvasElement {
  if (!groundCanvas) {
    groundCanvas = document.createElement('canvas');
    groundCanvas.width = MAP_W * TILE;
    groundCanvas.height = MAP_H * TILE;
  }
  const c = groundCanvas.getContext('2d')!;

  // --- çim tabanı + doku ---
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const px = x * TILE, py = y * TILE;
      const t = tileIndex(x, y);
      const f = state.floor[t];
      if (f === null) {
        const r = hash2(x, y);
        c.fillStyle = r < 0.5 ? '#79a058' : r < 0.8 ? '#729a52' : '#7fa65e';
        c.fillRect(px, py, TILE, TILE);
        // çim püskülleri
        c.fillStyle = 'rgba(50,80,35,0.4)';
        if (r > 0.45) {
          const gx = px + r * TILE * 0.7 + 2;
          const gy = py + hash2(y, x) * TILE * 0.7 + 3;
          c.fillRect(gx, gy, 1.5, 3.5);
          c.fillRect(gx + 3, gy + 1, 1.5, 3);
        }
      } else {
        const stil = FLOOR_STYLE[f];
        c.fillStyle = stil.taban;
        c.fillRect(px, py, TILE, TILE);
        stil.detay(c, px, py);
      }
    }
  }

  // --- oda kaplamaları ---
  for (const room of state.rooms) {
    const def = ROOM_DEFS[room.type];
    c.fillStyle = hexA(def.renk, room.valid ? 0.2 : 0.1);
    for (const t of room.tiles) {
      c.fillRect((t % MAP_W) * TILE, Math.floor(t / MAP_W) * TILE, TILE, TILE);
    }
    if (!room.valid) {
      c.strokeStyle = 'rgba(200,50,40,0.55)';
      c.lineWidth = 1.5;
      for (const t of room.tiles) {
        const x = (t % MAP_W) * TILE, y = Math.floor(t / MAP_W) * TILE;
        c.beginPath();
        c.moveTo(x + 3, y + TILE - 3);
        c.lineTo(x + TILE - 3, y + 3);
        c.stroke();
      }
    }
  }

  // --- bina gölgeleri (duvarların güney-doğusuna) ---
  c.fillStyle = 'rgba(30,40,25,0.25)';
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const w = state.wall[tileIndex(x, y)];
      if (w !== WALL_SOLID && w !== WALL_DOOR) continue;
      // sağ ve alt komşuya kısa gölge
      if (x + 1 < MAP_W && state.wall[tileIndex(x + 1, y)] === WALL_NONE) {
        c.fillRect((x + 1) * TILE, y * TILE + 4, 5, TILE);
      }
      if (y + 1 < MAP_H && state.wall[tileIndex(x, y + 1)] === WALL_NONE) {
        c.fillRect(x * TILE + 4, (y + 1) * TILE, TILE, 5);
      }
    }
  }

  // --- duvarlar (sahte 3D: yüz + tepe) ---
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileIndex(x, y);
      const w = state.wall[t];
      const px = x * TILE, py = y * TILE;
      if (w === WALL_SOLID) {
        const ustDuvar = y > 0 && state.wall[tileIndex(x, y - 1)] === WALL_SOLID;
        // gövde
        c.fillStyle = '#4d453c';
        c.fillRect(px, py, TILE, TILE);
        // tepe kapağı
        c.fillStyle = '#6b6157';
        c.fillRect(px, py, TILE, ustDuvar ? TILE * 0.55 : TILE * 0.45);
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.fillRect(px, py, TILE, 2.5);
        // yüz dokusu (tuğla derzleri)
        c.strokeStyle = 'rgba(0,0,0,0.18)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px, py + TILE * 0.72);
        c.lineTo(px + TILE, py + TILE * 0.72);
        c.moveTo(px + TILE * 0.5, py + TILE * 0.55);
        c.lineTo(px + TILE * 0.5, py + TILE);
        c.stroke();
        // komşu ayrımı
        c.strokeStyle = 'rgba(0,0,0,0.12)';
        c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else if (w === WALL_DOOR) {
        // kapı: eşik + kanat
        const yatay = (x > 0 && state.wall[tileIndex(x - 1, y)] === WALL_SOLID)
          || (x + 1 < MAP_W && state.wall[tileIndex(x + 1, y)] === WALL_SOLID);
        c.fillStyle = '#8d8579';
        c.fillRect(px, py, TILE, TILE); // eşik taşı
        c.fillStyle = '#8a5a2b';
        if (yatay) {
          c.fillRect(px + 2, py + TILE * 0.28, TILE - 4, TILE * 0.44);
          c.fillStyle = '#a5713a';
          c.fillRect(px + 3.5, py + TILE * 0.33, TILE - 7, TILE * 0.34);
          c.fillStyle = '#3a2c1a';
          c.fillRect(px + TILE * 0.72, py + TILE * 0.46, 3, 3);
        } else {
          c.fillRect(px + TILE * 0.28, py + 2, TILE * 0.44, TILE - 4);
          c.fillStyle = '#a5713a';
          c.fillRect(px + TILE * 0.33, py + 3.5, TILE * 0.34, TILE - 7);
          c.fillStyle = '#3a2c1a';
          c.fillRect(px + TILE * 0.46, py + TILE * 0.72, 3, 3);
        }
      }
    }
  }

  // --- dekor: bina/oda olmayan çimlere ağaç ve çalılar ---
  if (AYARLAR.dekor) for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = tileIndex(x, y);
      if (state.floor[t] !== null || state.wall[t] !== WALL_NONE || state.roomAt[t] !== -1) continue;
      if (Math.abs(x - GATE.x) < 3 && Math.abs(y - GATE.y) < 3) continue;
      const r = hash2(x * 3 + 1, y * 5 + 2);
      if (r < 0.02) {
        c.drawImage(treeSprite(x + y), x * TILE - TILE * 0.25, y * TILE - TILE * 0.45, TILE * 1.5, TILE * 1.5);
      } else if (r < 0.035) {
        c.drawImage(bushSprite(), x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  // --- giriş kapısı ---
  c.drawImage(gateSprite(), (GATE.x - 0.5) * TILE, (GATE.y - 0.8) * TILE, TILE * 2, TILE * 2);

  return groundCanvas;
}

// ---------------------------------------------------------------------------
// Ajan çizimi: gölge + gövde + kafa; yürürken hafif salınım
// ---------------------------------------------------------------------------

const TEN = ['#e8b48c', '#d9986a', '#c07f52', '#f0c8a0'];
const SAC = ['#2b2118', '#4a3220', '#8a5a2b', '#1c1c22', '#6e4a1e', '#3d2c1c'];

function drawPerson(
  c: CanvasRenderingContext2D, px: number, py: number, renk: string,
  id: number, yuruyor: boolean, zaman: number, tip: 'ogrenci' | 'akademisyen' | 'asci' | 'temizlikci',
): void {
  const bob = yuruyor ? Math.sin(zaman / 90 + id) * 1.2 : 0;
  const r = TILE * 0.26;

  // gölge
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(px, py + r * 0.9, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
  c.fill();

  const gy = py + bob;

  // gövde
  c.fillStyle = renk;
  c.beginPath();
  c.ellipse(px, gy, r * 0.85, r, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1;
  c.stroke();

  // akademisyen yaka çizgisi / aşçı önlüğü
  if (tip === 'akademisyen') {
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(px - r * 0.4, gy - r * 0.5);
    c.lineTo(px, gy + r * 0.1);
    c.lineTo(px + r * 0.4, gy - r * 0.5);
    c.stroke();
  } else if (tip === 'asci') {
    c.fillStyle = '#e8e8e2';
    c.beginPath();
    c.ellipse(px, gy + r * 0.25, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
    c.fill();
  }

  // kafa
  c.fillStyle = TEN[id % TEN.length];
  c.beginPath();
  c.arc(px, gy - r * 0.75, r * 0.55, 0, Math.PI * 2);
  c.fill();

  // saç / şapka
  if (tip === 'asci') {
    c.fillStyle = '#f4f4ee';
    c.beginPath();
    c.arc(px, gy - r * 1.0, r * 0.42, Math.PI, 0);
    c.fill();
    c.fillRect(px - r * 0.42, gy - r * 1.05, r * 0.84, r * 0.22);
  } else if (tip === 'temizlikci') {
    c.fillStyle = '#3f6ea5';
    c.beginPath();
    c.arc(px, gy - r * 0.85, r * 0.5, Math.PI, 0);
    c.fill();
  } else {
    c.fillStyle = SAC[id % SAC.length];
    c.beginPath();
    c.arc(px, gy - r * 0.85, r * 0.52, Math.PI * 0.95, Math.PI * 0.05);
    c.fill();
  }
}

/** Gün ışığı tonu: gece koyu mavi, şafak/akşam turuncu, gündüz net. */
function dayLight(dakika: number): { renk: string; alpha: number } {
  const saat = dakika / 60;
  if (saat >= 21 || saat < 5) return { renk: '#0a1430', alpha: 0.5 };
  if (saat < 7) {
    const k = (saat - 5) / 2; // şafak: koyudan turuncuya, sonra açılır
    return { renk: k < 0.5 ? '#25203a' : '#c96a2a', alpha: 0.4 - k * 0.32 };
  }
  if (saat < 17) return { renk: '#000000', alpha: 0 };
  if (saat < 19) {
    const k = (saat - 17) / 2;
    return { renk: '#d98a3a', alpha: k * 0.18 };
  }
  const k = (saat - 19) / 2; // 19-21 alacakaranlık
  return { renk: '#16204a', alpha: 0.18 + k * 0.3 };
}

// ---------------------------------------------------------------------------

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  ui: UIState,
): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.fillStyle = '#1c2418';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';

  // görünür kare aralığı
  const x0 = Math.max(0, Math.floor(cam.x / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + canvas.width / cam.zoom) / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + canvas.height / cam.zoom) / TILE));

  // --- statik zemin katmanı ---
  if (groundVersion !== state.insaatSurumu || !groundCanvas) {
    drawGround(state);
    groundVersion = state.insaatSurumu;
  }
  ctx.drawImage(groundCanvas!, 0, 0);

  // --- kir (dinamik, yalnız görünür bölge) ---
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const kir = state.dirt[tileIndex(x, y)];
      if (kir > 15) {
        ctx.fillStyle = `rgba(62,45,20,${Math.min(0.4, kir / 240)})`;
        ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        if (kir > 45) {
          ctx.fillStyle = 'rgba(50,36,16,0.5)';
          const r = hash2(x, y);
          ctx.beginPath();
          ctx.arc(x * TILE + 6 + r * 10, y * TILE + 8 + r * 6, 2.2, 0, Math.PI * 2);
          ctx.arc(x * TILE + 14 - r * 6, y * TILE + 16, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // --- ızgara (yakınken, çok hafif) ---
  if (AYARLAR.izgara && cam.zoom >= 1.2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      ctx.moveTo(x * TILE, y0 * TILE);
      ctx.lineTo(x * TILE, (y1 + 1) * TILE);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      ctx.moveTo(x0 * TILE, y * TILE);
      ctx.lineTo((x1 + 1) * TILE, y * TILE);
    }
    ctx.stroke();
  }

  // --- eşya aracı: bu eşyanın konabileceği odaları yeşille vurgula ---
  if (ui.tool.kind === 'esya') {
    const izinli = OBJECT_DEFS[ui.tool.obj].odalar;
    if (izinli !== null) {
      const nabiz = 0.45 + 0.25 * Math.sin(performance.now() / 300);
      for (const room of state.rooms) {
        if (!izinli.includes(room.type)) continue;
        ctx.fillStyle = `rgba(90, 220, 130, ${0.12})`;
        ctx.strokeStyle = `rgba(90, 220, 130, ${nabiz})`;
        ctx.lineWidth = 2;
        for (const t of room.tiles) {
          const x = (t % MAP_W) * TILE, y = Math.floor(t / MAP_W) * TILE;
          ctx.fillRect(x, y, TILE, TILE);
        }
        // dış hat: oda merkezine yakın kaba çerçeve yerine kare kare üst çizgi yeterli
        for (const t of room.tiles) {
          const x = (t % MAP_W) * TILE, y = Math.floor(t / MAP_W) * TILE;
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        }
      }
    }
  }

  // --- seçili oda vurgusu ---
  if (ui.selectedRoomId !== -1) {
    const room = state.rooms.find((r) => r.id === ui.selectedRoomId);
    if (room) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      for (const t of room.tiles) {
        ctx.strokeRect((t % MAP_W) * TILE + 1, Math.floor(t / MAP_W) * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // --- eşyalar (sprite atlası) ---
  for (const o of state.objects) {
    if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
    ctx.drawImage(objectSprite(o.type), o.x * TILE, o.y * TILE, TILE, TILE);
  }

  // --- ajanlar ---
  const zaman = performance.now();
  for (const a of state.agents) {
    if (!a.onCampus) continue;
    if (a.x < x0 - 1 || a.x > x1 + 1 || a.y < y0 - 1 || a.y > y1 + 1) continue;
    const px = a.x * TILE + TILE / 2;
    const py = a.y * TILE + TILE / 2;
    let renk = '#dddddd';
    if (a.kind === 'ogrenci') {
      const dept = state.departments.find((d) => d.id === a.deptId);
      renk = dept ? deptDef(dept.defId).renk : '#9aa4b0';
    } else if (a.kind === 'akademisyen') renk = '#2c3444';
    else if (a.kind === 'asci') renk = '#c9cdd3';
    else renk = '#c9a227';
    drawPerson(ctx, px, py, renk, a.id, a.path.length > 0, zaman, a.kind);
  }

  // --- oda etiketleri ---
  if (cam.zoom >= 0.65) {
    const fs = Math.max(8.5, TILE * 0.38);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of state.rooms) {
      const cnt = roomCenter(room);
      if (cnt.x < x0 - 4 || cnt.x > x1 + 4 || cnt.y < y0 - 2 || cnt.y > y1 + 2) continue;
      const def = ROOM_DEFS[room.type];
      let etiket = def.ad;
      if ((room.type === 'derslik' || room.type === 'amfi' || room.type === 'laboratuvar') && room.deptId !== null) {
        const dept = state.departments.find((d) => d.id === room.deptId);
        if (dept) etiket += ` · ${DEPT_DEFS.find((dd) => dd.id === dept.defId)?.kisa ?? ''}`;
      }
      if (!room.valid) etiket += ' ⚠';
      const cx = cnt.x * TILE + TILE / 2;
      const cy = cnt.y * TILE + TILE * 0.3;
      const tw = ctx.measureText(etiket).width;
      ctx.fillStyle = 'rgba(12,16,22,0.62)';
      roundRectPath(ctx, cx - tw / 2 - 5, cy - fs * 0.72, tw + 10, fs * 1.44, 4);
      ctx.fill();
      ctx.fillStyle = room.valid ? '#f2f5fa' : '#ffb3a8';
      ctx.fillText(etiket, cx, cy);

      // geçersiz oda: ilk eksik gereksinimi etiketin altına yaz — oyuncu ne yapacağını görsün
      if (!room.valid && room.missing.length > 0 && cam.zoom >= 0.9) {
        const eksikFs = fs * 0.8;
        ctx.font = `500 ${eksikFs}px system-ui, sans-serif`;
        const metin = room.missing[0];
        const mw = ctx.measureText(metin).width;
        const my = cy + fs * 1.3;
        ctx.fillStyle = 'rgba(140,35,30,0.82)';
        roundRectPath(ctx, cx - mw / 2 - 5, my - eksikFs * 0.72, mw + 10, eksikFs * 1.5, 3);
        ctx.fill();
        ctx.fillStyle = '#ffe3df';
        ctx.fillText(metin, cx, my);
        ctx.font = `600 ${fs}px system-ui, sans-serif`;
      }
    }
  }

  // --- araç önizlemesi ---
  drawToolPreview(ctx, state, ui);

  // --- gün ışığı tonu (dünya uzayında, tüm harita) ---
  const isik = AYARLAR.isikDongusu ? dayLight(state.dakika) : { renk: '#000', alpha: 0 };
  if (isik.alpha > 0.01) {
    ctx.fillStyle = isik.renk;
    ctx.globalAlpha = isik.alpha;
    ctx.fillRect(cam.x, cam.y, canvas.width / cam.zoom, canvas.height / cam.zoom);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawToolPreview(ctx: CanvasRenderingContext2D, state: GameState, ui: UIState): void {
  const hover = ui.hoverTile;
  if (!hover) return;
  const t = ui.tool;

  // hazır bina hayaleti
  if (t.kind === 'hazir') {
    const def = prefabDef(t.prefab);
    const o = prefabOrigin(def, hover);
    const ok = canPlacePrefab(state, def, o.x, o.y);
    const px = o.x * TILE, py = o.y * TILE, pw = def.w * TILE, ph = def.h * TILE;

    // iç dolgu (oda rengi) + duvar çerçevesi
    ctx.fillStyle = ok ? hexA(ROOM_DEFS[def.room].renk, 0.4) : 'rgba(220,60,60,0.3)';
    ctx.fillRect(px + TILE, py + TILE, pw - 2 * TILE, ph - 2 * TILE);
    ctx.fillStyle = ok ? 'rgba(77,69,60,0.75)' : 'rgba(160,40,40,0.6)';
    ctx.fillRect(px, py, pw, TILE);
    ctx.fillRect(px, py + ph - TILE, pw, TILE);
    ctx.fillRect(px, py, TILE, ph);
    ctx.fillRect(px + pw - TILE, py, TILE, ph);
    // kapı işareti (alt orta)
    ctx.fillStyle = ok ? 'rgba(165,113,58,0.95)' : 'rgba(120,60,60,0.9)';
    const kapiX = Math.floor((o.x + o.x + def.w - 1) / 2) * TILE;
    ctx.fillRect(kapiX + 3, py + ph - TILE + 3, TILE - 6, TILE - 6);
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,110,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // etiket
    const fs = Math.max(10, TILE * 0.45);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const etiket = ok
      ? `${def.ad} · ${formatMoney(prefabCost(def))}`
      : `${def.ad} — alan uygun değil`;
    const tw = ctx.measureText(etiket).width;
    const ex = px + pw / 2, ey = py - fs;
    ctx.fillStyle = ok ? 'rgba(12,16,22,0.85)' : 'rgba(140,35,30,0.9)';
    roundRectPath(ctx, ex - tw / 2 - 6, ey - fs * 0.75, tw + 12, fs * 1.5, 4);
    ctx.fill();
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(etiket, ex, ey);
    return;
  }

  const rectTools = ['zemin', 'duvar', 'yikim', 'oda', 'oda_kaldir'];
  if (ui.dragStart && rectTools.includes(t.kind)) {
    const xa = Math.min(ui.dragStart.x, hover.x), xb = Math.max(ui.dragStart.x, hover.x);
    const ya = Math.min(ui.dragStart.y, hover.y), yb = Math.max(ui.dragStart.y, hover.y);
    ctx.fillStyle = t.kind === 'yikim' || t.kind === 'oda_kaldir'
      ? 'rgba(220,60,60,0.35)' : 'rgba(255,255,255,0.3)';
    if (t.kind === 'duvar') {
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          if (x === xa || x === xb || y === ya || y === yb) {
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
        }
      }
    } else {
      ctx.fillRect(xa * TILE, ya * TILE, (xb - xa + 1) * TILE, (yb - ya + 1) * TILE);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xa * TILE, ya * TILE, (xb - xa + 1) * TILE, (yb - ya + 1) * TILE);

    // canlı bilgi etiketi: maliyet / boyut — oyuncu bırakmadan önce görsün
    const genis = xb - xa + 1, yuksek = yb - ya + 1;
    const alan = genis * yuksek;
    let etiket = '';
    let uyari = false;
    if (t.kind === 'zemin') {
      const birim = FLOOR_DEFS.find((f) => f.id === t.floor)!.maliyet;
      etiket = `${alan} kare · ≈ ${formatMoney(alan * birim)}`;
    } else if (t.kind === 'duvar') {
      const cevre = alan - Math.max(0, genis - 2) * Math.max(0, yuksek - 2);
      etiket = `${cevre} duvar · ≈ ${formatMoney(cevre * WALL_COST)}`;
    } else if (t.kind === 'oda') {
      const min = ROOM_DEFS[t.room].minBoyut;
      uyari = alan < min;
      etiket = `${ROOM_DEFS[t.room].ad}: ${alan} kare ${uyari ? `(en az ${min} gerekli!)` : '✔'}`;
    } else if (t.kind === 'yikim') {
      etiket = `${alan} kare yıkılacak (%25 iade)`;
      uyari = true;
    } else if (t.kind === 'oda_kaldir') {
      etiket = 'Oda ataması kaldırılacak (inşaat kalır)';
    }
    if (etiket) {
      const fs = Math.max(10, TILE * 0.45);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(etiket).width;
      const ex = ((xa + xb + 1) / 2) * TILE;
      const ey = ya * TILE - fs;
      ctx.fillStyle = uyari ? 'rgba(140,35,30,0.9)' : 'rgba(12,16,22,0.85)';
      roundRectPath(ctx, ex - tw / 2 - 6, ey - fs * 0.75, tw + 12, fs * 1.5, 4);
      ctx.fill();
      ctx.fillStyle = '#f2f5fa';
      ctx.fillText(etiket, ex, ey);
    }
  } else if (t.kind !== 'sec') {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(hover.x * TILE, hover.y * TILE, TILE, TILE);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(hover.x * TILE + 0.5, hover.y * TILE + 0.5, TILE - 1, TILE - 1);
    if (t.kind === 'esya') {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(objectSprite(t.obj), hover.x * TILE, hover.y * TILE, TILE, TILE);
      ctx.globalAlpha = 1;
    }
  }
}

function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
