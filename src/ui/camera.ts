import { MAP_H, MAP_W, Point, TILE } from '../core/types';

export interface Camera {
  /** dünya-px cinsinden sol üst köşe */
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(canvas: HTMLCanvasElement): Camera {
  const worldW = MAP_W * TILE;
  const worldH = MAP_H * TILE;
  return {
    x: worldW / 2 - canvas.width / 2,
    y: worldH / 2 - canvas.height / 2,
    zoom: 1,
  };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Point {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

export function screenToTile(cam: Camera, sx: number, sy: number): Point {
  const w = screenToWorld(cam, sx, sy);
  return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
}

export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): void {
  const before = screenToWorld(cam, sx, sy);
  cam.zoom = Math.min(3, Math.max(0.4, cam.zoom * factor));
  const after = screenToWorld(cam, sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}

export function clampCamera(cam: Camera, canvas: HTMLCanvasElement): void {
  const worldW = MAP_W * TILE;
  const worldH = MAP_H * TILE;
  const viewW = canvas.width / cam.zoom;
  const viewH = canvas.height / cam.zoom;
  const pad = 6 * TILE;
  // görünüm dünyadan büyükse ortala (min>max kilitlenmesin)
  if (viewW >= worldW + 2 * pad) cam.x = (worldW - viewW) / 2;
  else cam.x = Math.max(-pad, Math.min(worldW + pad - viewW, cam.x));
  if (viewH >= worldH + 2 * pad) cam.y = (worldH - viewH) / 2;
  else cam.y = Math.max(-pad, Math.min(worldH + pad - viewH, cam.y));
}
