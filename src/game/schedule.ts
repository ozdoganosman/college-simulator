/**
 * Ders seçimi ve ders programı.
 *
 * AKIŞ: Önce hocalara ders seçilir (hoca başına yılda en fazla DERS_LIMIT ders) —
 * üniversitenin "açık dersleri" bu seçimlerin birleşimidir. Bölümler ancak
 * müfredatlarındaki TÜM dersler açık derslerdeyse açılabilir: derslerden bölümlere.
 *
 * Günlük program: her bölüm için günün 4 bloğuna müfredattan ders yerleştirilir;
 * derse, o dersi SEÇMİŞ hocalar arasından en uygunu atanır (günde en çok 2 blok).
 */
import { Academic, DersSlot, GameState } from '../core/types';
import { COURSES, courseDef, dersEtki } from '../data/courses';
import { deptDef } from '../data/departments';

/** Bir hocanın bir yılda verebileceği azami ders sayısı. */
export const DERS_LIMIT = 4;

function akademisyenler(state: GameState): Academic[] {
  return state.agents.filter((a): a is Academic => a.kind === 'akademisyen');
}

/** Üniversitenin açık dersleri: hocaların seçtiği derslerin birleşimi. */
export function acikDersler(state: GameState): Set<string> {
  const set = new Set<string>();
  for (const a of akademisyenler(state)) {
    for (const d of a.verdigiDersler ?? []) set.add(d);
  }
  return set;
}

/** Ders açık mı (herhangi bir hoca seçmiş mi)? */
export function dersVerilebilir(state: GameState, courseId: string): boolean {
  for (const a of akademisyenler(state)) {
    if ((a.verdigiDersler ?? []).includes(courseId)) return true;
  }
  return false;
}

/** Bölümün açık derslerde OLMAYAN dersleri (bölüm açma şartı + panel). */
export function verilemeyenDersler(state: GameState, defId: string): string[] {
  const acik = acikDersler(state);
  return deptDef(defId).dersler.filter((d) => !acik.has(d));
}

/** Hocaya ders ata/çıkar. slot 0..DERS_LIMIT-1; courseId '' = boşalt. */
export function setHocaDersi(state: GameState, academicId: number, slot: number, courseId: string): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen' || slot < 0 || slot >= DERS_LIMIT) return;
  const liste = [...(a.verdigiDersler ?? [])];
  while (liste.length < DERS_LIMIT) liste.push('');
  // aynı ders iki slota seçilmesin
  if (courseId && liste.some((d, i) => d === courseId && i !== slot)) return;
  liste[slot] = courseId;
  a.verdigiDersler = liste.filter((d) => d !== '').slice(0, DERS_LIMIT);
  rebuildDersProgrami(state);
}

/**
 * Hoca için otomatik ders seçimi: alan uyumu yüksek VE henüz kimsenin
 * seçmediği dersleri önceler (kapsama maksimize edilir).
 */
export function otoDersSec(state: GameState, academicId: number): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen') return;
  const digerAcik = new Set<string>();
  for (const h of akademisyenler(state)) {
    if (h.id === academicId) continue;
    for (const d of h.verdigiDersler ?? []) digerAcik.add(d);
  }
  const puanli = COURSES
    .map((c) => ({
      id: c.id,
      puan: dersEtki(c.id, a.alan) + (digerAcik.has(c.id) ? 0 : 0.5),
    }))
    .filter((x) => dersEtki(x.id, a.alan) >= 0.9) // yalnız uygun alan
    .sort((x, y) => y.puan - x.puan);
  a.verdigiDersler = puanli.slice(0, DERS_LIMIT).map((x) => x.id);
  rebuildDersProgrami(state);
}

/** Tüm hocalar için otomatik ders seçimi (sıra: kapsama artacak şekilde). */
export function tumunuOtoSec(state: GameState): void {
  for (const a of akademisyenler(state)) otoDersSec(state, a.id);
}

/** Programı sıfırdan kurar — gün sonunda ve kadro/ders değişince çağrılır. */
export function rebuildDersProgrami(state: GameState): void {
  const slots: DersSlot[] = [];
  const gunlukBlok = new Map<number, number>(); // academicId -> bugün verdiği blok
  const tumHocalar = akademisyenler(state);

  for (const dept of state.departments) {
    const dersler = deptDef(dept.defId).dersler;
    if (dersler.length === 0) continue;

    for (let blok = 0; blok < 4; blok++) {
      // müfredat gün + blok üzerinden döner: her gün farklı ders kombinasyonu
      const courseId = dersler[(state.gun + blok) % dersler.length];

      // dersi SEÇMİŞ hocalardan en uygunu (önce bölümün kendi hocası), günde en çok 2 blok
      let secilen: Academic | null = null;
      let enIyi = -1;
      for (const a of tumHocalar) {
        if (!(a.verdigiDersler ?? []).includes(courseId)) continue;
        if ((gunlukBlok.get(a.id) ?? 0) >= 2) continue;
        const puan = dersEtki(courseId, a.alan) * (0.5 + a.egitim / 100)
          + (a.deptId === dept.id ? 0.6 : 0); // kendi bölümü öncelikli
        if (puan > enIyi) {
          enIyi = puan;
          secilen = a;
        }
      }
      if (secilen) gunlukBlok.set(secilen.id, (gunlukBlok.get(secilen.id) ?? 0) + 1);

      slots.push({ deptId: dept.id, blok, courseId, academicId: secilen ? secilen.id : -1 });
    }
  }
  state.dersProgrami = slots;
}

/** Bölümün belirli bloktaki dersi (panel ve simülasyon için). */
export function blokDersi(state: GameState, deptId: number, blok: number): DersSlot | undefined {
  return (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.blok === blok);
}

export { courseDef, dersEtki };
