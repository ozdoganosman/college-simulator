import {
  GameState, GATE, MAP_H, MAP_W, TILE, WALL_DOOR, WALL_SOLID, tileIndex,
} from '../core/types';
import { roomCenter } from '../core/grid';
import { FLOOR_DEFS, ROOM_DEFS } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import { DEPT_DEFS, deptDef } from '../data/departments';
import type { Camera } from './camera';
import type { UIState } from './uistate';

const GRASS = '#7aa15c';
const GRASS_DARK = '#719753';
const WALL_COLOR = '#3d3a36';
const DOOR_COLOR = '#a5682a';

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  ui: UIState,
): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // görünür kare aralığı
  const x0 = Math.max(0, Math.floor(cam.x / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + canvas.width / cam.zoom) / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + canvas.height / cam.zoom) / TILE));

  // zemin + çim
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = tileIndex(x, y);
      const f = state.floor[t];
      if (f === null) {
        ctx.fillStyle = (x + y) % 2 === 0 ? GRASS : GRASS_DARK;
      } else {
        ctx.fillStyle = FLOOR_DEFS.find((d) => d.id === f)!.renk;
      }
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

      // kir
      const kir = state.dirt[t];
      if (kir > 15) {
        ctx.fillStyle = `rgba(70,50,20,${Math.min(0.45, kir / 200)})`;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  // oda kaplamaları
  for (const room of state.rooms) {
    const def = ROOM_DEFS[room.type];
    ctx.fillStyle = hexA(def.renk, room.valid ? 0.28 : 0.15);
    for (const t of room.tiles) {
      const x = t % MAP_W, y = Math.floor(t / MAP_W);
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    if (!room.valid) {
      // geçersiz oda: kırmızı çapraz taramalı köşe işareti
      ctx.strokeStyle = 'rgba(200,40,40,0.8)';
      ctx.lineWidth = 1.5;
      for (const t of room.tiles) {
        const x = t % MAP_W, y = Math.floor(t / MAP_W);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        ctx.beginPath();
        ctx.moveTo(x * TILE + 2, y * TILE + TILE - 2);
        ctx.lineTo(x * TILE + TILE - 2, y * TILE + 2);
        ctx.stroke();
      }
    }
  }

  // seçili oda vurgusu
  if (ui.selectedRoomId !== -1) {
    const room = state.rooms.find((r) => r.id === ui.selectedRoomId);
    if (room) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      for (const t of room.tiles) {
        const x = t % MAP_W, y = Math.floor(t / MAP_W);
        ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // ızgara (yakınken)
  if (cam.zoom >= 0.8) {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
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

  // duvarlar + kapılar
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w = state.wall[tileIndex(x, y)];
      if (w === WALL_SOLID) {
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x * TILE, y * TILE, TILE, 3);
      } else if (w === WALL_DOOR) {
        ctx.fillStyle = DOOR_COLOR;
        ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x * TILE + TILE * 0.62, y * TILE + TILE * 0.42, 3, 3);
      }
    }
  }

  // giriş kapısı işareti
  ctx.font = `${TILE * 0.8}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚏', GATE.x * TILE + TILE / 2, GATE.y * TILE + TILE / 2);

  // eşyalar
  ctx.font = `${TILE * 0.72}px sans-serif`;
  for (const o of state.objects) {
    if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
    ctx.fillText(OBJECT_DEFS[o.type].glyph, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2);
  }

  // ajanlar
  for (const a of state.agents) {
    if (!a.onCampus) continue;
    const px = a.x * TILE + TILE / 2;
    const py = a.y * TILE + TILE / 2;
    let renk = '#eeeeee';
    let yaricap = TILE * 0.28;
    if (a.kind === 'ogrenci') {
      const dept = state.departments.find((d) => d.id === (a as { deptId: number }).deptId);
      renk = dept ? deptDef(dept.defId).renk : '#dddddd';
    } else if (a.kind === 'akademisyen') {
      renk = '#1f2430';
      yaricap = TILE * 0.32;
    } else if (a.kind === 'asci') {
      renk = '#f5f5f0';
    } else {
      renk = '#c9a227'; // temizlikçi
    }
    ctx.beginPath();
    ctx.arc(px, py, yaricap, 0, Math.PI * 2);
    ctx.fillStyle = renk;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = a.kind === 'akademisyen' ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();
  }

  // oda etiketleri
  if (cam.zoom >= 0.7) {
    ctx.font = `600 ${Math.max(9, TILE * 0.42)}px system-ui, sans-serif`;
    for (const room of state.rooms) {
      const c = roomCenter(room);
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const def = ROOM_DEFS[room.type];
      let etiket = def.ad;
      if ((room.type === 'derslik' || room.type === 'amfi' || room.type === 'laboratuvar') && room.deptId !== null) {
        const dept = state.departments.find((d) => d.id === room.deptId);
        if (dept) etiket += ` · ${DEPT_DEFS.find((dd) => dd.id === dept.defId)?.kisa ?? ''}`;
      }
      if (!room.valid) etiket += ' ⚠';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = ctx.measureText(etiket).width;
      ctx.fillRect(c.x * TILE + TILE / 2 - tw / 2 - 4, c.y * TILE - 2, tw + 8, TILE * 0.62);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(etiket, c.x * TILE + TILE / 2, c.y * TILE + TILE * 0.28);
    }
  }

  // araç önizlemesi
  drawToolPreview(ctx, state, ui);

  ctx.restore();
}

function drawToolPreview(ctx: CanvasRenderingContext2D, state: GameState, ui: UIState): void {
  const hover = ui.hoverTile;
  if (!hover) return;
  const t = ui.tool;

  const rectTools = ['zemin', 'duvar', 'yikim', 'oda', 'oda_kaldir'];
  if (ui.dragStart && rectTools.includes(t.kind)) {
    const xa = Math.min(ui.dragStart.x, hover.x), xb = Math.max(ui.dragStart.x, hover.x);
    const ya = Math.min(ui.dragStart.y, hover.y), yb = Math.max(ui.dragStart.y, hover.y);
    ctx.fillStyle = t.kind === 'yikim' || t.kind === 'oda_kaldir'
      ? 'rgba(220,60,60,0.35)' : 'rgba(255,255,255,0.3)';
    if (t.kind === 'duvar') {
      // sadece çerçeve
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
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xa * TILE, ya * TILE, (xb - xa + 1) * TILE, (yb - ya + 1) * TILE);
  } else if (t.kind !== 'sec') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(hover.x * TILE, hover.y * TILE, TILE, TILE);
    if (t.kind === 'esya') {
      ctx.globalAlpha = 0.65;
      ctx.font = `${TILE * 0.72}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(OBJECT_DEFS[t.obj].glyph, hover.x * TILE + TILE / 2, hover.y * TILE + TILE / 2);
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
