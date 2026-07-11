import { GameState, tileIndex, inBounds } from '../core/types';
import {
  buildDoor, buildFloor, buildWallRect, demolish, designateRoom, placeObject, unassignRoom,
} from '../game/build';
import { placePrefab, prefabDef, prefabOrigin } from '../game/prefab';
import { Camera, clampCamera, screenToTile, zoomAt } from './camera';
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
      } else if (t.kind === 'hazir') {
        const def = prefabDef(t.prefab);
        const o = prefabOrigin(def, tile);
        placePrefab(state(), def, o.x, o.y);
      } else if (t.kind === 'sec') {
        selectAt(state(), ui, tile.x, tile.y);
      } else {
        ui.dragStart = tile;
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
      else if (t.kind === 'yikim') demolish(st, s.x, s.y, h.x, h.y);
      else if (t.kind === 'oda') designateRoom(st, t.room, s.x, s.y, h.x, h.y);
      else if (t.kind === 'oda_kaldir') unassignRoom(st, s.x, s.y, h.x, h.y);
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
      const arac = ui.tool.kind !== 'sec' || ui.dragStart !== null
        || ui.selectedRoomId !== -1 || ui.selectedAgentId !== -1;
      if (arac) {
        ui.tool = { kind: 'sec' };
        ui.dragStart = null;
        ui.selectedRoomId = -1;
        ui.selectedAgentId = -1;
        document.dispatchEvent(new CustomEvent('tool-changed'));
      } else {
        document.dispatchEvent(new CustomEvent('toggle-menu'));
      }
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
