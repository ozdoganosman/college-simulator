import {
  GameState, GATE, MAP_H, MAP_W, TILE, WALL_DOOR, WALL_NONE, WALL_SOLID, mevsim, tileIndex,
} from '../core/types';
import { roomCenter } from '../core/grid';
import { AYARLAR } from '../core/settings';
import { formatMoney } from '../core/util';
import { FLOOR_DEFS, ROOM_DEFS, WALL_COST } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import { DEPT_DEFS, deptDef } from '../data/departments';
import { bushSprite, gateSprite, objectSprite, treeSprite } from './sprites';
import { canPlacePrefab, prefabCost, prefabDef, prefabKapi, prefabOrigin, prefabRect } from '../game/prefab';
import { canMoveGroup, canMoveRoom, roomOuterRect } from '../game/build';
import { resizeGecerli } from '../game/prefab';
import type { Camera } from './camera';
import type { UIState } from './uistate';

// ---------------------------------------------------------------------------
// Statik zemin katmanı: çim/zemin dokuları, oda kaplamaları, duvarlar, gölgeler
// ve dekor tek bir offscreen canvas'a çizilir; yalnızca inşaat değişince yenilenir.
// ---------------------------------------------------------------------------

let groundCanvas: HTMLCanvasElement | null = null;
let groundVersion = '';

/** Zemin katmanı önbelleğini geçersiz kıl (durum değişimi / ayar değişimi). */
export function invalidateGround(): void {
  groundVersion = '';
}

/** Mevsimlik çim paletleri: [koyu, orta, açık] — kışın kar örtüsü. */
const CIM_PALET: [string, string, string][] = [
  ['#9a9550', '#918c4b', '#a5a058'], // sonbahar: sararmış çim
  ['#ccd6d2', '#c4cec9', '#d6dfdb'], // kış: kar
  ['#79a058', '#729a52', '#7fa65e'], // ilkbahar: taze yeşil
  ['#699347', '#628c42', '#71a04e'], // yaz: koyu yeşil
];

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
  const m = mevsim(state.gun);
  const [cimKoyu, cimOrta, cimAcik] = CIM_PALET[m];

  // --- çim tabanı + doku (mevsime göre) ---
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const px = x * TILE, py = y * TILE;
      const t = tileIndex(x, y);
      const f = state.floor[t];
      if (f === null) {
        const r = hash2(x, y);
        c.fillStyle = r < 0.5 ? cimKoyu : r < 0.8 ? cimOrta : cimAcik;
        c.fillRect(px, py, TILE, TILE);
        if (m === 1) {
          // kar parıltısı
          if (r > 0.6) {
            c.fillStyle = 'rgba(255,255,255,0.8)';
            c.fillRect(px + r * TILE * 0.7, py + hash2(y, x) * TILE * 0.7, 2, 2);
          }
        } else {
          // çim püskülleri (sonbaharda kızıl, baharda çiçek benekli)
          c.fillStyle = m === 0 ? 'rgba(120,80,30,0.45)' : 'rgba(50,80,35,0.4)';
          if (r > 0.45) {
            const gx = px + r * TILE * 0.7 + 2;
            const gy = py + hash2(y, x) * TILE * 0.7 + 3;
            c.fillRect(gx, gy, 1.5, 3.5);
            c.fillRect(gx + 3, gy + 1, 1.5, 3);
          }
          if (m === 2 && r > 0.93) {
            c.fillStyle = hash2(x + 7, y) > 0.5 ? '#e8b4c8' : '#f0e08a';
            c.fillRect(px + TILE * 0.4, py + TILE * 0.4, 2.5, 2.5);
          }
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
        c.drawImage(treeSprite(x + y, m), x * TILE - TILE * 0.25, y * TILE - TILE * 0.45, TILE * 1.5, TILE * 1.5);
      } else if (r < 0.035) {
        c.drawImage(bushSprite(m), x * TILE, y * TILE, TILE, TILE);
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
  id: number, yuruyor: boolean, zaman: number,
  tip: 'ogrenci' | 'akademisyen' | 'asci' | 'temizlikci' | 'tamirci' | 'guvenlik',
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
  } else if (tip === 'tamirci') {
    // turuncu baret
    c.fillStyle = '#f0a030';
    c.beginPath();
    c.arc(px, gy - r * 0.9, r * 0.48, Math.PI, 0);
    c.fill();
    c.fillRect(px - r * 0.55, gy - r * 0.92, r * 1.1, r * 0.14);
  } else if (tip === 'guvenlik') {
    // lacivert kasket + siperlik
    c.fillStyle = '#2a3550';
    c.beginPath();
    c.arc(px, gy - r * 0.88, r * 0.5, Math.PI, 0);
    c.fill();
    c.fillStyle = '#1c2438';
    c.fillRect(px - r * 0.55, gy - r * 0.86, r * 1.3, r * 0.12);
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

  // --- statik zemin katmanı (inşaat DEĞİŞİNCE ya da mevsim dönünce tazelenir) ---
  const zeminAnahtar = `${state.insaatSurumu}:${mevsim(state.gun)}`;
  if (groundVersion !== zeminAnahtar || !groundCanvas) {
    drawGround(state);
    groundVersion = zeminAnahtar;
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

  // --- seçili kişi vurgusu (ayak halkası) ---
  if (ui.selectedAgentId !== -1) {
    const a = state.agents.find((x) => x.id === ui.selectedAgentId);
    if (a && a.onCampus) {
      const px = a.x * TILE + TILE / 2;
      const py = a.y * TILE + TILE / 2;
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py + TILE * 0.24, TILE * 0.4, TILE * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- eşyalar (sprite atlası) ---
  for (const o of state.objects) {
    if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
    ctx.drawImage(objectSprite(o.type), o.x * TILE, o.y * TILE, TILE, TILE);
    // BOZUK eşya: kırmızı ton + tamir işareti (tamirci onarana dek işlev görmez)
    if ((o.yipranma ?? 0) >= 100) {
      ctx.fillStyle = 'rgba(200,50,40,0.3)';
      ctx.fillRect(o.x * TILE + 1, o.y * TILE + 1, TILE - 2, TILE - 2);
      if (cam.zoom >= 0.55) {
        ctx.font = `${Math.round(TILE * 0.5)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔧', o.x * TILE + TILE * 0.68, o.y * TILE + TILE * 0.3);
      }
    }
  }

  // --- ajanlar ---
  const zaman = performance.now();
  const yildizSet = new Set(state.yildizlar ?? []);
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
    else if (a.kind === 'tamirci') renk = '#d97b3c';
    else if (a.kind === 'guvenlik') renk = '#38507a';
    else renk = '#c9a227';
    drawPerson(ctx, px, py, renk, a.id, a.path.length > 0, zaman, a.kind);

    if (a.kind !== 'ogrenci') continue;

    // ⭐ yıldız öğrenci işareti
    if (yildizSet.has(a.ad)) {
      ctx.font = `${Math.round(TILE * 0.45)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', px, py - TILE * 0.72 + Math.sin(zaman / 400 + a.id) * 1.5);
    }

    // 💭 düşünce balonu: sorun yaşayan öğrenci derdini söyler (yakın zoomda)
    if (cam.zoom >= 0.8) {
      const derdi = a.needs.aclik > 70 ? '🍽' : a.needs.tuvalet > 70 ? '🚻'
        : a.needs.enerji > 78 ? '😪' : a.mutluluk < 32 ? '☁️' : null;
      if (derdi) {
        const by = py - TILE * 0.75;
        ctx.fillStyle = 'rgba(245,247,250,0.92)';
        ctx.beginPath();
        ctx.arc(px + TILE * 0.34, by, TILE * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + TILE * 0.16, by + TILE * 0.26, TILE * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${Math.round(TILE * 0.36)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(derdi, px + TILE * 0.34, by + 1);
      }
    }
  }

  // --- 🔥 yangınlar: titreyen alev + şiddet halesi ---
  for (const y of state.yanginlar) {
    if (y.x < x0 - 2 || y.x > x1 + 2 || y.y < y0 - 2 || y.y > y1 + 2) continue;
    const cx = y.x * TILE + TILE / 2, cy = y.y * TILE + TILE / 2;
    const titre = 1 + Math.sin(zaman / 80 + y.x) * 0.12;
    const yaricap = TILE * (0.5 + (y.siddet / 100) * 0.6) * titre;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, yaricap);
    g.addColorStop(0, 'rgba(255,230,120,0.9)');
    g.addColorStop(0.5, 'rgba(240,110,30,0.75)');
    g.addColorStop(1, 'rgba(180,40,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, yaricap, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(TILE * 0.6 * titre)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔥', cx, cy);
  }

  // --- ısı haritası katmanı (yeşil iyi → kırmızı kötü) ---
  if (ui.katman !== 'yok') {
    if (ui.katman === 'kir') {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const kir = state.dirt[tileIndex(x, y)];
          if (kir > 3) {
            ctx.fillStyle = isiRenk(kir / 100, Math.min(0.55, 0.18 + kir / 160));
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
        }
      }
    } else if (ui.katman === 'yipranma') {
      for (const o of state.objects) {
        if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
        ctx.fillStyle = isiRenk((o.yipranma ?? 0) / 100, 0.55);
        ctx.fillRect(o.x * TILE + 1, o.y * TILE + 1, TILE - 2, TILE - 2);
      }
    } else {
      // mutluluk / açlık: öğrenci başına renkli halka
      for (const a of state.agents) {
        if (a.kind !== 'ogrenci' || !a.onCampus) continue;
        if (a.x < x0 - 1 || a.x > x1 + 1 || a.y < y0 - 1 || a.y > y1 + 1) continue;
        const oran = ui.katman === 'mutluluk' ? 1 - a.mutluluk / 100 : a.needs.aclik / 100;
        ctx.fillStyle = isiRenk(oran, 0.5);
        ctx.beginPath();
        ctx.arc(a.x * TILE + TILE / 2, a.y * TILE + TILE / 2, TILE * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
      let etiket = room.ozelAd ? `⭐ ${room.ozelAd}` : def.ad;
      if (!room.ozelAd
          && (room.type === 'derslik' || room.type === 'amfi' || room.type === 'laboratuvar') && room.deptId !== null) {
        const dept = state.departments.find((d) => d.id === room.deptId);
        if (dept) etiket += ` · ${DEPT_DEFS.find((dd) => dd.id === dept.defId)?.kisa ?? ''}`;
      }
      const santiye = (room.insaat ?? 0) > 0;
      if (santiye) {
        // 🏗️ şantiye: etiket ilerleme yüzdesi gösterir, eksik listesi gizlenir
        const toplam = room.insaatToplam ?? 1;
        etiket = `🏗️ ${etiket} · %${Math.min(99, Math.round(100 * (1 - (room.insaat ?? 0) / toplam)))}`;
      } else if (!room.valid) etiket += ' ⚠';
      const cx = cnt.x * TILE + TILE / 2;
      const cy = cnt.y * TILE + TILE * 0.3;
      const tw = ctx.measureText(etiket).width;
      ctx.fillStyle = santiye ? 'rgba(120,80,10,0.72)' : 'rgba(12,16,22,0.62)';
      roundRectPath(ctx, cx - tw / 2 - 5, cy - fs * 0.72, tw + 10, fs * 1.44, 4);
      ctx.fill();
      ctx.fillStyle = santiye ? '#ffd98a' : room.valid ? '#f2f5fa' : '#ffb3a8';
      ctx.fillText(etiket, cx, cy);

      // geçersiz oda: ilk eksik gereksinimi etiketin altına yaz — oyuncu ne yapacağını görsün
      if (!santiye && !room.valid && room.missing.length > 0 && cam.zoom >= 0.9) {
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

  // --- çoklu seçim vurgusu (Shift+tık ile seçilen binalar) ---
  if (ui.selectedRoomIds.length > 0) {
    for (const id of ui.selectedRoomIds) {
      const r = roomOuterRect(state, id);
      if (!r) continue;
      ctx.strokeStyle = 'rgba(90,180,250,0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(r.x0 * TILE, r.y0 * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(90,180,250,0.14)';
      ctx.fillRect(r.x0 * TILE, r.y0 * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
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

  // --- katman lejantı (ekran uzayı, sol alt) ---
  if (ui.katman !== 'yok') {
    const adlar: Record<string, string> = {
      mutluluk: '😊 Öğrenci Mutluluğu', aclik: '🍽️ Açlık', kir: '🧹 Kampüs Kiri', yipranma: '🔧 Eşya Eskimesi',
    };
    const lx = 12, ly = canvas.height - 152, lw = 190, lh = 46;
    ctx.fillStyle = 'rgba(12,16,22,0.85)';
    roundRectPath(ctx, lx, ly, lw, lh, 6);
    ctx.fill();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(adlar[ui.katman] ?? '', lx + 10, ly + 13);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = isiRenk(i / 23, 0.95);
      ctx.fillRect(lx + 10 + i * 6, ly + 26, 6, 8);
    }
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.fillStyle = '#aab4c6';
    ctx.fillText('iyi', lx + 10, ly + 40);
    ctx.textAlign = 'right';
    ctx.fillText('kötü', lx + 10 + 24 * 6, ly + 40);
  }
}

/** Isı rengi: 0 iyi (yeşil) → 1 kötü (kırmızı). */
function isiRenk(oran: number, alpha: number): string {
  const t = Math.max(0, Math.min(1, oran));
  return `hsla(${Math.round(120 * (1 - t))},85%,50%,${alpha})`;
}

/**
 * Minimap: tüm kampüsün kuşbakışı özeti (odalar renkli, ajanlar noktalar,
 * yangın kırmızı) + görünür alan çerçevesi. Sağ altta ayrı canvas'a çizilir.
 */
export function renderMinimap(
  mmCtx: CanvasRenderingContext2D, state: GameState, cam: Camera, anaCanvas: HTMLCanvasElement,
): void {
  const w = mmCtx.canvas.width, h = mmCtx.canvas.height;
  const sx = w / MAP_W, sy = h / MAP_H;
  mmCtx.clearRect(0, 0, w, h);
  // zemin: mevsimlik çim tonu
  mmCtx.fillStyle = CIM_PALET[mevsim(state.gun)][1];
  mmCtx.fillRect(0, 0, w, h);
  // yollar/zemin
  mmCtx.fillStyle = 'rgba(150,150,140,0.5)';
  for (let i = 0; i < state.floor.length; i++) {
    if (state.floor[i] === null) continue;
    mmCtx.fillRect((i % MAP_W) * sx, Math.floor(i / MAP_W) * sy, Math.ceil(sx), Math.ceil(sy));
  }
  // odalar: tür rengi
  for (const r of state.rooms) {
    mmCtx.fillStyle = hexA(ROOM_DEFS[r.type].renk, r.valid ? 0.85 : 0.45);
    for (const t of r.tiles) {
      mmCtx.fillRect((t % MAP_W) * sx, Math.floor(t / MAP_W) * sy, Math.ceil(sx), Math.ceil(sy));
    }
  }
  // ajanlar: küçük noktalar (öğrenci açık, personel sarı)
  for (const a of state.agents) {
    if (!a.onCampus) continue;
    mmCtx.fillStyle = a.kind === 'ogrenci' ? '#bcd3ff' : a.kind === 'akademisyen' ? '#e0e4ee' : '#e0c040';
    mmCtx.fillRect(a.x * sx - 0.5, a.y * sy - 0.5, 2, 2);
  }
  // yangınlar: kırmızı
  for (const y of state.yanginlar) {
    mmCtx.fillStyle = '#ff5020';
    mmCtx.fillRect(y.x * sx - 1, y.y * sy - 1, 3, 3);
  }
  // görünür alan çerçevesi
  const vx = cam.x / TILE * sx, vy = cam.y / TILE * sy;
  const vw = (anaCanvas.width / cam.zoom) / TILE * sx, vh = (anaCanvas.height / cam.zoom) / TILE * sy;
  mmCtx.strokeStyle = 'rgba(255,255,255,0.85)';
  mmCtx.lineWidth = 1.5;
  mmCtx.strokeRect(vx, vy, vw, vh);
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

  // hazır bina hayaleti — sürüklenirken seçilen boyutu gösterir
  if (t.kind === 'hazir') {
    const def = prefabDef(t.prefab);
    let gx: number, gy: number, gw: number, gh: number;
    if (ui.dragStart) {
      const r = prefabRect(def, ui.dragStart, hover);
      gx = r.x; gy = r.y; gw = r.w; gh = r.h;
    } else {
      const o = prefabOrigin(def, hover);
      gx = o.x; gy = o.y; gw = def.w; gh = def.h;
    }
    const yerOk = canPlacePrefab(state, def, gx, gy, gw, gh);
    const maliyet = prefabCost(def, gw, gh);
    const paraYeter = state.para >= maliyet;
    const ok = yerOk && paraYeter;
    const px = gx * TILE, py = gy * TILE, pw = gw * TILE, ph = gh * TILE;

    // renk: geçerli yeşil-oda, para yetmez amber, yer geçersiz kırmızı
    const dolguRenk = !yerOk ? 'rgba(220,60,60,0.28)'
      : !paraYeter ? 'rgba(230,170,50,0.30)' : hexA(ROOM_DEFS[def.room].renk, 0.42);
    const cerceveRenk = !yerOk ? 'rgba(160,40,40,0.7)'
      : !paraYeter ? 'rgba(190,140,40,0.8)' : 'rgba(77,69,60,0.8)';
    const kenarRenk = !yerOk ? 'rgba(255,120,110,0.95)'
      : !paraYeter ? 'rgba(255,210,120,0.95)' : 'rgba(255,255,255,0.95)';

    // iç döşeme ızgarası (yerleşecek eşya izlenimi) + duvar çerçevesi
    ctx.fillStyle = dolguRenk;
    ctx.fillRect(px + TILE, py + TILE, pw - 2 * TILE, ph - 2 * TILE);
    ctx.fillStyle = cerceveRenk;
    ctx.fillRect(px, py, pw, TILE);
    ctx.fillRect(px, py + ph - TILE, pw, TILE);
    ctx.fillRect(px, py, TILE, ph);
    ctx.fillRect(px + pw - TILE, py, TILE, ph);
    // ince iç ızgara çizgileri (hangi kareye oturacağı hissi)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let x = gx + 1; x < gx + gw - 1; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE, py + TILE); ctx.lineTo(x * TILE, py + ph - TILE); ctx.stroke();
    }
    for (let y = gy + 1; y < gy + gh - 1; y++) {
      ctx.beginPath(); ctx.moveTo(px + TILE, y * TILE); ctx.lineTo(px + pw - TILE, y * TILE); ctx.stroke();
    }
    // kapı işareti (yön: buildYon) — R ile döner
    const kapi = prefabKapi(gx, gy, gw, gh, ui.buildYon);
    ctx.fillStyle = ok ? 'rgba(165,113,58,0.98)' : 'rgba(150,90,70,0.9)';
    ctx.fillRect(kapi.x * TILE + 3, kapi.y * TILE + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${TILE * 0.5}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🚪', kapi.x * TILE + TILE / 2, kapi.y * TILE + TILE / 2);

    ctx.strokeStyle = kenarRenk;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px, py, pw, ph);

    // çapa köşe işareti (sürüklerken sabit kalan köşe)
    if (ui.dragStart) {
      ctx.fillStyle = 'rgba(90,180,250,0.95)';
      ctx.beginPath();
      ctx.arc(ui.dragStart.x * TILE + TILE / 2, ui.dragStart.y * TILE + TILE / 2, TILE * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    // ölçü çizgileri: üstte genişlik, solda yükseklik
    const olcuFs = Math.max(9, TILE * 0.4);
    ctx.font = `700 ${olcuFs}px system-ui, sans-serif`;
    ctx.fillStyle = kenarRenk;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`↔ ${gw}`, px + pw / 2, py - 3);
    ctx.save();
    ctx.translate(px - 4, py + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`↕ ${gh}`, 0, 0);
    ctx.restore();

    // etiket — ad + iç eşya özeti + maliyet + durum/ipucu
    const fs = Math.max(10, TILE * 0.42);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const durum = !yerOk ? '⛔ alan uygun değil'
      : !paraYeter ? `⚠ bütçe yetmez (${formatMoney(maliyet)})`
        : `${formatMoney(maliyet)}`;
    const ipucu = ui.dragStart ? ' · sağ tık/Esc: iptal' : ' · sürükle: boyut · R: döndür';
    const etiket = `${def.ad} ${gw}×${gh} · ${durum}${ipucu}`;
    const tw = ctx.measureText(etiket).width;
    const ex = px + pw / 2, ey = py - fs - olcuFs - 4;
    ctx.fillStyle = ok ? 'rgba(12,16,22,0.88)' : !paraYeter ? 'rgba(120,85,20,0.92)' : 'rgba(140,35,30,0.92)';
    roundRectPath(ctx, ex - tw / 2 - 7, ey - fs * 0.8, tw + 14, fs * 1.6, 5);
    ctx.fill();
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(etiket, ex, ey);
    return;
  }

  // yeniden boyutlandırma hayaleti — sol-üst çapa sabit, imleç sağ-alt köşe
  if (t.kind === 'boyutlandir') {
    const rect = roomOuterRect(state, t.roomId);
    if (rect) {
      const nw = Math.max(5, hover.x - rect.x0 + 1), nh = Math.max(5, hover.y - rect.y0 + 1);
      const ok = resizeGecerli(state, t.roomId, rect.x0, rect.y0, nw, nh);
      const px = rect.x0 * TILE, py = rect.y0 * TILE, pw = nw * TILE, ph = nh * TILE;
      const room = state.rooms.find((r) => r.id === t.roomId);
      ctx.fillStyle = ok ? hexA(room ? ROOM_DEFS[room.type].renk : '#888', 0.4) : 'rgba(220,60,60,0.28)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = ok ? 'rgba(90,200,250,0.95)' : 'rgba(255,120,110,0.95)';
      ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
      ctx.strokeRect(px, py, pw, ph);
      ctx.setLineDash([]);
      // çapa köşe (sol-üst sabit)
      ctx.fillStyle = 'rgba(90,180,250,0.95)';
      ctx.beginPath();
      ctx.arc(rect.x0 * TILE + TILE / 2, rect.y0 * TILE + TILE / 2, TILE * 0.28, 0, Math.PI * 2);
      ctx.fill();
      const fs = Math.max(10, TILE * 0.42);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const etiket = ok ? `📐 ${nw}×${nh} · tık: uygula · Esc: iptal` : '⛔ boyut uymuyor';
      const tw = ctx.measureText(etiket).width;
      ctx.fillStyle = ok ? 'rgba(12,16,22,0.88)' : 'rgba(140,35,30,0.92)';
      roundRectPath(ctx, px + pw / 2 - tw / 2 - 7, py - fs * 1.6, tw + 14, fs * 1.6, 5);
      ctx.fill();
      ctx.fillStyle = '#f2f5fa';
      ctx.fillText(etiket, px + pw / 2, py - fs * 0.8);
    }
    return;
  }

  // grup taşıma hayaleti — tüm seçili binaların izdüşümü imleçte
  if (t.kind === 'tasiGrup') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const rects: { x0: number; y0: number; x1: number; y1: number; renk: string }[] = [];
    for (const id of t.roomIds) {
      const r = roomOuterRect(state, id);
      if (!r) continue;
      const room = state.rooms.find((rr) => rr.id === id);
      rects.push({ ...r, renk: room ? ROOM_DEFS[room.type].renk : '#888' });
      x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
    }
    if (rects.length > 0) {
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const dx = (hover.x - Math.floor(cw / 2)) - x0, dy = (hover.y - Math.floor(ch / 2)) - y0;
      const ok = canMoveGroup(state, t.roomIds, dx, dy);
      for (const r of rects) {
        ctx.fillStyle = ok ? hexA(r.renk, 0.4) : 'rgba(220,60,60,0.28)';
        ctx.fillRect((r.x0 + dx) * TILE, (r.y0 + dy) * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
        ctx.strokeStyle = ok ? 'rgba(90,220,140,0.9)' : 'rgba(255,120,110,0.95)';
        ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect((r.x0 + dx) * TILE, (r.y0 + dy) * TILE, (r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
        ctx.setLineDash([]);
      }
      const fs = Math.max(10, TILE * 0.42);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const etiket = ok ? `📦 ${t.roomIds.length} bina · tık: taşı` : '⛔ buraya taşınamaz';
      const cx = (x0 + dx) * TILE + cw * TILE / 2, cy = (y0 + dy) * TILE - fs;
      const tw = ctx.measureText(etiket).width;
      ctx.fillStyle = ok ? 'rgba(12,16,22,0.88)' : 'rgba(140,35,30,0.92)';
      roundRectPath(ctx, cx - tw / 2 - 7, cy - fs * 0.8, tw + 14, fs * 1.6, 5);
      ctx.fill();
      ctx.fillStyle = '#f2f5fa';
      ctx.fillText(etiket, cx, cy);
    }
    return;
  }

  // bina taşıma hayaleti — binanın izdüşümünü imleçte gösterir
  if (t.kind === 'tasi') {
    const rect = roomOuterRect(state, t.roomId);
    if (rect) {
      const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
      const nx0 = hover.x - Math.floor(w / 2), ny0 = hover.y - Math.floor(h / 2);
      const ok = canMoveRoom(state, t.roomId, nx0, ny0).ok;
      const px = nx0 * TILE, py = ny0 * TILE, pw = w * TILE, ph = h * TILE;
      const room = state.rooms.find((r) => r.id === t.roomId);
      ctx.fillStyle = ok ? hexA(room ? ROOM_DEFS[room.type].renk : '#888', 0.42) : 'rgba(220,60,60,0.3)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = ok ? 'rgba(90,220,140,0.95)' : 'rgba(255,120,110,0.95)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(px, py, pw, ph);
      ctx.setLineDash([]);
      const fs = Math.max(10, TILE * 0.42);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const etiket = ok ? '📦 buraya taşı (tık) · Esc: iptal' : '⛔ buraya taşınamaz';
      const tw = ctx.measureText(etiket).width;
      ctx.fillStyle = ok ? 'rgba(12,16,22,0.88)' : 'rgba(140,35,30,0.92)';
      roundRectPath(ctx, px + pw / 2 - tw / 2 - 7, py - fs * 1.6, tw + 14, fs * 1.6, 5);
      ctx.fill();
      ctx.fillStyle = '#f2f5fa';
      ctx.fillText(etiket, px + pw / 2, py - fs * 0.8);
    }
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
