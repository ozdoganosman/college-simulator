import {
  GameState, MAP_H, MAP_W, Notice, NoticeKind,
} from '../core/types';
import { BALANCE } from '../data/balance';
import { DEPT_DEFS } from '../data/departments';
import { courseExists } from '../data/courses';
import { tumunuOtoSec } from './schedule';

export function createInitialState(): GameState {
  const size = MAP_W * MAP_H;
  return {
    para: BALANCE.BASLANGIC_PARA,
    prestij: BALANCE.BASLANGIC_PRESTIJ,
    gun: 1,
    dakika: 7 * 60, // 07:00'de başla
    hiz: 1,
    rngSeed: 1907,

    floor: new Array(size).fill(null),
    wall: new Array(size).fill(0),
    roomAt: new Array(size).fill(-1),
    dirt: new Array(size).fill(0),

    rooms: [],
    objects: [],
    agents: [],
    departments: [],
    projects: [],
    publications: [],
    awards: [],
    notices: [],

    kpssPool: [],
    transferPool: [],
    strategies: [],

    nextId: 1,
    insaatSurumu: 0,
    tutorialAdim: 0,
    tutorialAcik: true,
    yerlestirme: null,
    yksBekliyor: true,
    dersProgrami: [],
    toplamMezun: 0,
    toplamBirakan: 0,
  };
}

export function notify(state: GameState, metin: string, kind: NoticeKind = 'bilgi'): void {
  const n: Notice = { gun: state.gun, dakika: state.dakika, metin, kind };
  state.notices.push(n);
  if (state.notices.length > 120) state.notices.splice(0, state.notices.length - 120);
}

/** Para harca; yetmiyorsa false döner ve hiçbir şey değişmez. */
export function spend(state: GameState, tutar: number, neden?: string): boolean {
  if (state.para < tutar) {
    if (neden) notify(state, `Yetersiz bütçe: ${neden}`, 'kotu');
    return false;
  }
  state.para -= tutar;
  return true;
}

export function earn(state: GameState, tutar: number): void {
  state.para += tutar;
}

export function addPrestij(state: GameState, miktar: number): void {
  let m = miktar;
  if (m > 0 && state.strategies.includes('uluslararasi_ofis')) m *= 1.1;
  state.prestij = Math.max(0, Math.min(1000, state.prestij + m));
}

const SAVE_KEY = 'universite-simulatoru-save';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* depolama dolu olabilir — sessiz geç */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (typeof s.para !== 'number' || !Array.isArray(s.wall)) return null;
    if (typeof s.insaatSurumu !== 'number') s.insaatSurumu = 0; // eski kayıt uyumu
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

/** Eski kayıtlara sonradan eklenen alanları tamamlar. */
export function eskiKayitUyumu(s: GameState): void {
  if (!Array.isArray(s.dersProgrami)) s.dersProgrami = [];
  // katalogdan kalkan bölüm/dersler kayıttan da temizlenir
  const bolumVar = new Set(DEPT_DEFS.map((d) => d.id));
  const silinen = new Set(s.departments.filter((d) => !bolumVar.has(d.defId)).map((d) => d.id));
  if (silinen.size > 0) {
    s.departments = s.departments.filter((d) => !silinen.has(d.id));
    s.agents = s.agents.filter((a) => !(a.kind === 'ogrenci' && silinen.has(a.deptId)));
    for (const a of s.agents) {
      if (a.kind === 'akademisyen' && silinen.has(a.deptId)) a.deptId = -1;
    }
    for (const r of s.rooms) if (r.deptId !== null && silinen.has(r.deptId)) r.deptId = null;
    s.projects = s.projects.filter((p) => !silinen.has(p.deptId));
  }
  s.dersProgrami = s.dersProgrami.filter((p) => courseExists(p.courseId) && !silinen.has(p.deptId));
  const alanlar = ['muhendis', 'artist', 'filozof', 'pratik'] as const;
  let dersSecimiEksik = false;
  for (const a of s.agents) {
    if (a.kind === 'akademisyen') {
      if (!(a as { alan?: string }).alan) a.alan = alanlar[a.id % alanlar.length];
      if (!Array.isArray(a.verdigiDersler)) {
        a.verdigiDersler = [];
        dersSecimiEksik = true;
      }
    } else if (a.kind === 'ogrenci') {
      if (typeof a.egilim !== 'number') a.egilim = 70 + ((a.id * 37) % 61); // 70-130
      if (typeof a.kaliteToplam !== 'number') a.kaliteToplam = 0;
      if (typeof a.dersDakika !== 'number') a.dersDakika = 0;
      if (typeof a.asistani !== 'number') a.asistani = -1;
    }
  }
  if (dersSecimiEksik) tumunuOtoSec(s); // eski kayıt: dersleri otomatik seç
  for (const c of [...s.kpssPool, ...s.transferPool]) {
    if (!(c as { alan?: string }).alan) c.alan = alanlar[c.id % alanlar.length];
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* yoksay */ }
}
