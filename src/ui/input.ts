import { GameState, tileIndex, inBounds } from '../core/types';
import {
  buildDoor, buildFloor, buildWallRect, demolish, designateRoom, placeObject, unassignRoom,
} from '../game/build';
import { placePrefab, prefabDef, prefabOrigin, prefabRect, resizeRoom } from '../game/prefab';
import { moveGroup, moveRoom, roomOuterRect } from '../game/build';
import { notify } from '../game/state';
import { Camera, clampCamera, screenToTile, zoomAt } from './camera';
import { sesInsa } from './audio';
import { isCeremonyOpen } from './ceremony';
import type { UIState } from './uistate';

export function attachInput(
  canvas: HTMLCanvasElement,
  state: () => GameState,
  cam: Camera,
  ui: UIState,
): void {
  let panning = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
      // sağ/orta tık: aktif sürükleme varsa İPTAL et (pan başlatma)
      if (e.button === 2 && ui.dragStart) {
        ui.dragStart = null;
        return;
      }
      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    if (e.button === 0) {
      ui.dragStart = null; // yarım kalmış eski sürükleme kalıntısını temizle
      const tile = screenToTile(cam, e.offsetX, e.offsetY);
      const t = ui.tool;
      if (t.kind === 'kapi') {
        buildDoor(state(), tile.x, tile.y);
      } else if (t.kind === 'esya') {
        placeObject(state(), t.obj, tile.x, tile.y);
      } else if (t.kind === 'tasi') {
        // binayı imlecin gösterdiği yeni sol-üst köşeye taşı
        const st = state();
        const rect = roomOuterRect(st, t.roomId);
        if (rect) {
          const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
          const nx0 = tile.x - Math.floor(w / 2), ny0 = tile.y - Math.floor(h / 2);
          if (moveRoom(st, t.roomId, nx0, ny0)) {
            sesInsa();
            ui.tool = { kind: 'sec' };
            ui.selectedRoomId = t.roomId;
            document.dispatchEvent(new CustomEvent('tool-changed'));
          }
        }
      } else if (t.kind === 'tasiGrup') {
        // grubu imleçle (ortak sınır kutusu merkezi) taşı
        const st = state();
        const bbox = grupBbox(st, t.roomIds);
        if (bbox) {
          const cw = bbox.x1 - bbox.x0 + 1, ch = bbox.y1 - bbox.y0 + 1;
          const dx = (tile.x - Math.floor(cw / 2)) - bbox.x0;
          const dy = (tile.y - Math.floor(ch / 2)) - bbox.y0;
          if (moveGroup(st, t.roomIds, dx, dy)) {
            sesInsa();
            ui.tool = { kind: 'sec' };
            document.dispatchEvent(new CustomEvent('tool-changed'));
          }
        }
      } else if (t.kind === 'boyutlandir') {
        // imleç = yeni sağ-alt köşe; sol-üst çapada sabit → resizeRoom
        const st = state();
        const rect = roomOuterRect(st, t.roomId);
        if (rect) {
          const nw = Math.max(5, tile.x - rect.x0 + 1);
          const nh = Math.max(5, tile.y - rect.y0 + 1);
          if (resizeRoom(st, t.roomId, t.prefab, rect.x0, rect.y0, nw, nh)) {
            sesInsa();
            const yeni = st.rooms[st.rooms.length - 1];
            ui.tool = { kind: 'sec' };
            ui.selectedRoomId = yeni ? yeni.id : -1;
            document.dispatchEvent(new CustomEvent('tool-changed'));
          }
        }
      } else if (t.kind === 'bolumOdaSec') {
        // bölüm açma: haritada tıklanan boş derslik/amfi/laboratuvarı seçime ekle/çıkar
        const st = state();
        const rid = st.roomAt[tileIndex(tile.x, tile.y)];
        const room = rid !== -1 ? st.rooms.find((r) => r.id === rid) : undefined;
        if (!room) return;
        const i = t.roomIds.indexOf(room.id);
        if (i >= 0) {
          t.roomIds.splice(i, 1);
          document.dispatchEvent(new CustomEvent('tool-changed'));
          return;
        }
        const dogruTur = room.type === 'derslik' || room.type === 'amfi' || room.type === 'laboratuvar';
        if (!room.valid || !dogruTur) {
          notify(st, 'Yalnız geçerli (kullanıma hazır) derslik/amfi/laboratuvar seçilebilir.', 'kotu');
          return;
        }
        if (room.deptId !== null) {
          notify(st, 'Bu oda başka bir bölüme ait — önce ondan ayrılmalı.', 'kotu');
          return;
        }
        t.roomIds.push(room.id);
        document.dispatchEvent(new CustomEvent('tool-changed'));
      } else if (t.kind === 'sec') {
        // Shift+tık: binayı çoklu seçime ekle/çıkar
        if (e.shiftKey) {
          const rid = state().roomAt[tileIndex(tile.x, tile.y)];
          if (rid !== -1) {
            const i = ui.selectedRoomIds.indexOf(rid);
            if (i >= 0) ui.selectedRoomIds.splice(i, 1);
            else ui.selectedRoomIds.push(rid);
            ui.selectedRoomId = rid;
            ui.selectedAgentId = -1;
            document.dispatchEvent(new CustomEvent('room-selected'));
            return;
          }
        }
        ui.selectedRoomIds = [];
        selectAt(state(), ui, tile.x, tile.y);
      } else {
        ui.dragStart = tile; // hazır bina dahil: sürükleyerek boyutlandırılır
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (panning) {
      cam.x -= (e.clientX - lastX) / cam.zoom;
      cam.y -= (e.clientY - lastY) / cam.zoom;
      lastX = e.clientX;
      lastY = e.clientY;
      clampCamera(cam, canvas);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    ui.hoverTile = screenToTile(cam, e.offsetX, e.offsetY);
  });

  canvas.addEventListener('mouseleave', () => {
    ui.hoverTile = null;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 1 || e.button === 2) {
      panning = false;
      return;
    }
    if (e.button === 0 && ui.dragStart && ui.hoverTile) {
      const s = ui.dragStart;
      const h = ui.hoverTile;
      const t = ui.tool;
      const st = state();
      if (t.kind === 'zemin') buildFloor(st, s.x, s.y, h.x, h.y, t.floor);
      else if (t.kind === 'duvar') buildWallRect(st, s.x, s.y, h.x, h.y);
      else if (t.kind === 'yikim') {
        // geniş seçimde onay iste: koca alanı yanlışlıkla silmeyi önler
        const alan = (Math.abs(h.x - s.x) + 1) * (Math.abs(h.y - s.y) + 1);
        if (alan < 25 || confirm(`${alan} kareyi yıkmak istediğine emin misin? (eşyaların %25'i iade edilir)`)) {
          demolish(st, s.x, s.y, h.x, h.y);
        }
      }
      else if (t.kind === 'oda') designateRoom(st, t.room, s.x, s.y, h.x, h.y);
      else if (t.kind === 'oda_kaldir') unassignRoom(st, s.x, s.y, h.x, h.y);
      else if (t.kind === 'hazir') {
        // tek tık = varsayılan boyut (imleç merkezli); sürükleme = seçilen boyut
        const def = prefabDef(t.prefab);
        if (s.x === h.x && s.y === h.y) {
          const o = prefabOrigin(def, h);
          placePrefab(st, def, o.x, o.y, def.w, def.h, false, ui.buildYon);
        } else {
          const r = prefabRect(def, s, h);
          placePrefab(st, def, r.x, r.y, r.w, r.h, false, ui.buildYon);
        }
      }
      if (t.kind !== 'sec' && t.kind !== 'yikim') sesInsa();
      ui.dragStart = null;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(cam, e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    clampCamera(cam, canvas);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const hedef = e.target as HTMLElement | null;
    if (hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'TEXTAREA' || hedef.tagName === 'SELECT')) {
      return; // panel girdilerinde kısayol çalışmasın
    }
    if (isCeremonyOpen()) return; // tören ekranında kısayollar (özellikle Esc) devre dışı
    const st = state();
    if (e.key === 'Escape') {
      // önce yalnız aktif sürüklemeyi iptal et (araç elde kalsın)
      if (ui.dragStart) {
        ui.dragStart = null;
      } else if (ui.tool.kind !== 'sec' || ui.selectedRoomId !== -1 || ui.selectedAgentId !== -1
                 || ui.selectedRoomIds.length > 0) {
        ui.tool = { kind: 'sec' };
        ui.selectedRoomId = -1;
        ui.selectedAgentId = -1;
        ui.selectedRoomIds = [];
        document.dispatchEvent(new CustomEvent('tool-changed'));
      } else {
        document.dispatchEvent(new CustomEvent('toggle-menu'));
      }
    } else if ((e.key === 'r' || e.key === 'R') && ui.tool.kind === 'hazir') {
      // R: hazır binayı döndür (kapı yönü değişir) — alt çubuk ipucu tazelensin
      ui.buildYon = (ui.buildYon + 1) % 4;
      document.dispatchEvent(new CustomEvent('tool-changed'));
      e.preventDefault();
    } else if (e.key === ' ') {
      e.preventDefault();
      st.hiz = st.hiz === 0 ? 1 : 0;
    } else if (e.key === '1') st.hiz = 1;
    else if (e.key === '2') st.hiz = 2;
    else if (e.key === '3') st.hiz = 4;
    const pan = 24 / cam.zoom;
    if (e.key === 'ArrowLeft' || e.key === 'a') cam.x -= pan;
    if (e.key === 'ArrowRight' || e.key === 'd') cam.x += pan;
    if (e.key === 'ArrowUp' || e.key === 'w') cam.y -= pan;
    if (e.key === 'ArrowDown' || e.key === 's') cam.y += pan;
    clampCamera(cam, canvas);
  });
}

/** Bir grup binanın ortak sınır kutusu (dış). */
function grupBbox(
  state: GameState, roomIds: number[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of roomIds) {
    const r = roomOuterRect(state, id);
    if (!r) continue;
    x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function selectAt(state: GameState, ui: UIState, x: number, y: number): void {
  if (!inBounds(x, y)) return;
  // önce kişi: tıklanan kareye en yakın kampüsteki ajan (¾ kare içinde)
  let ajan = -1;
  let enYakin = 0.75;
  for (const a of state.agents) {
    if (!a.onCampus) continue;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < enYakin) {
      enYakin = d;
      ajan = a.id;
    }
  }
  ui.selectedAgentId = ajan;
  ui.selectedRoomId = ajan !== -1 ? -1 : state.roomAt[tileIndex(x, y)];
  document.dispatchEvent(new CustomEvent('room-selected'));
}
