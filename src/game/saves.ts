/** Slotlu kayıt sistemi (otomatik kayıttan bağımsız 5 manuel slot). */
import { GameState, donemAdi, yil } from '../core/types';
import { eskiKayitUyumu } from './state';

export const SLOT_SAYISI = 5;

export interface SlotMeta {
  slot: number;
  bos: boolean;
  /** kayıt anı (gerçek zaman) */
  zaman?: number;
  gun?: number;
  yil?: number;
  donem?: string;
  para?: number;
  ogrenci?: number;
  prestij?: number;
}

interface SlotWrapper {
  zaman: number;
  state: GameState;
}

function anahtar(slot: number): string {
  return `universite-simulatoru-slot-${slot}`;
}

export function slotMeta(slot: number): SlotMeta {
  try {
    const raw = localStorage.getItem(anahtar(slot));
    if (!raw) return { slot, bos: true };
    const w = JSON.parse(raw) as SlotWrapper;
    const s = w.state;
    return {
      slot,
      bos: false,
      zaman: w.zaman,
      gun: s.gun,
      yil: yil(s.gun),
      donem: donemAdi(s.gun),
      para: Math.round(s.para),
      ogrenci: s.agents.filter((a) => a.kind === 'ogrenci').length,
      prestij: Math.round(s.prestij),
    };
  } catch {
    return { slot, bos: true };
  }
}

export function tumSlotlar(): SlotMeta[] {
  const liste: SlotMeta[] = [];
  for (let i = 1; i <= SLOT_SAYISI; i++) liste.push(slotMeta(i));
  return liste;
}

export function slotaKaydet(state: GameState, slot: number): boolean {
  try {
    const w: SlotWrapper = { zaman: Date.now(), state };
    localStorage.setItem(anahtar(slot), JSON.stringify(w));
    return true;
  } catch {
    return false;
  }
}

export function slottanYukle(slot: number): GameState | null {
  try {
    const raw = localStorage.getItem(anahtar(slot));
    if (!raw) return null;
    const w = JSON.parse(raw) as SlotWrapper;
    const s = w.state;
    if (typeof s.para !== 'number' || !Array.isArray(s.wall)) return null;
    if (typeof s.insaatSurumu !== 'number') s.insaatSurumu = 0;
    if (typeof s.tutorialAdim !== 'number') s.tutorialAdim = -1;
    if (typeof s.tutorialAcik !== 'boolean') s.tutorialAcik = false;
    if (s.yerlestirme === undefined) s.yerlestirme = null;
    if (typeof s.yksBekliyor !== 'boolean') s.yksBekliyor = true;
    eskiKayitUyumu(s);
    return s;
  } catch {
    return null;
  }
}

export function slotSil(slot: number): void {
  try {
    localStorage.removeItem(anahtar(slot));
  } catch { /* yoksay */ }
}
