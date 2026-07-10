import type { GameState } from './types';

/** Deterministik RNG (mulberry32) — state.rngSeed üzerinden ilerler. */
export function rand(state: GameState): number {
  let t = (state.rngSeed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: GameState, min: number, max: number): number {
  return min + Math.floor(rand(state) * (max - min + 1));
}

export function randRange(state: GameState, min: number, max: number): number {
  return min + rand(state) * (max - min);
}

export function pick<T>(state: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(state) * arr.length)];
}

export function chance(state: GameState, p: number): boolean {
  return rand(state) < p;
}

export function newId(state: GameState): number {
  return state.nextId++;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function formatMoney(v: number): string {
  return '₺' + Math.round(v).toLocaleString('tr-TR');
}

export function formatClock(dakika: number): string {
  const h = Math.floor(dakika / 60) % 24;
  const m = Math.floor(dakika % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
