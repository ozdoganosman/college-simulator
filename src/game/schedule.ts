/**
 * Ders programı: her bölüm için günün 4 bloğuna müfredattan ders yerleştirir ve
 * her derse EN UYGUN alandaki akademisyeni otomatik atar (hoca başına günde en
 * fazla 2 blok ders — kalan zaman araştırmaya kalır).
 */
import { Academic, DersSlot, GameState } from '../core/types';
import { courseDef, dersEtki } from '../data/courses';
import { deptDef } from '../data/departments';

/** Bir dersin üniversitede verilebilmesi: uygun alanda (etki >= 0.9) kadrolu hoca. */
export function dersVerilebilir(state: GameState, courseId: string): boolean {
  for (const a of state.agents) {
    if (a.kind === 'akademisyen' && dersEtki(courseId, a.alan) >= 0.9) return true;
  }
  return false;
}

/** Bölümün verilemeyen dersleri (bölüm açma şartı + panel gösterimi). */
export function verilemeyenDersler(state: GameState, defId: string): string[] {
  return deptDef(defId).dersler.filter((d) => !dersVerilebilir(state, d));
}

/** Programı sıfırdan kurar — gün sonunda ve kadro değişince çağrılır. */
export function rebuildDersProgrami(state: GameState): void {
  const slots: DersSlot[] = [];
  const gunlukBlok = new Map<number, number>(); // academicId -> bugün verdiği blok sayısı

  for (const dept of state.departments) {
    const dersler = deptDef(dept.defId).dersler;
    if (dersler.length === 0) continue;

    const kadro: Academic[] = [];
    for (const a of state.agents) {
      if (a.kind === 'akademisyen' && a.deptId === dept.id) kadro.push(a);
    }

    for (let blok = 0; blok < 4; blok++) {
      // müfredat gün + blok üzerinden döner: her gün farklı ders kombinasyonu
      const courseId = dersler[(state.gun + blok) % dersler.length];

      // en uygun hoca: etki * (eğitim becerisi ağırlığı), günde en çok 2 blok
      let secilen: Academic | null = null;
      let enIyi = -1;
      for (const a of kadro) {
        if ((gunlukBlok.get(a.id) ?? 0) >= 2) continue;
        const puan = dersEtki(courseId, a.alan) * (0.5 + a.egitim / 100);
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

/** Panel gösterimi: '0.95' -> '%95 uyum' gibi. */
export function etkiYuzde(courseId: string, alan: Academic['alan']): number {
  return Math.round(dersEtki(courseId, alan) / 1.25 * 100);
}

export { courseDef, dersEtki };
