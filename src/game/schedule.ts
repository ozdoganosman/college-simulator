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
import { Academic, DersSlot, GameState, Student } from '../core/types';
import { COURSES, courseDef, dersEtki } from '../data/courses';
import { DEPT_DEFS, deptDef } from '../data/departments';
import { notify } from './state';

/** Bir hocanın bir yılda verebileceği azami ders sayısı. */
export const DERS_LIMIT = 4;

/** Bir hocanın alabileceği azami asistan sayısı. */
export const ASISTAN_LIMIT = 2;

/**
 * Ders yükü verim tablosu — indeks: efektif ders sayısı (asistanlar düşülür).
 * Yük arttıkça hem ders kalitesi hem araştırma hızı GİDEREK hızlanan biçimde düşer.
 */
const YUK_VERIM = [1, 1, 0.88, 0.74, 0.58];

/** Verim çarpanı: ders sayısı - asistan (her asistan 1 dersin yükünü alır). */
export function yukVerimi(dersSayisi: number, asistan = 0): number {
  const n = Math.max(0, Math.min(dersSayisi - asistan, YUK_VERIM.length - 1));
  return YUK_VERIM[n];
}

/** academicId -> asistan (YL/doktora öğrenci) sayısı. */
export function asistanSayilari(state: GameState): Map<number, number> {
  const m = new Map<number, number>();
  for (const a of state.agents) {
    if (a.kind === 'ogrenci' && a.asistani !== -1) {
      m.set(a.asistani, (m.get(a.asistani) ?? 0) + 1);
    }
  }
  return m;
}

/** Hocanın asistanları. */
export function asistanlari(state: GameState, academicId: number): Student[] {
  return state.agents.filter(
    (a): a is Student => a.kind === 'ogrenci' && a.asistani === academicId,
  );
}

/** Hocanın güncel ders yükü verimi (0.58-1). */
export function dersYukuVerimi(state: GameState, a: Academic): number {
  return yukVerimi((a.verdigiDersler ?? []).length, asistanlari(state, a.id).length);
}

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

/** Hocaya ders ekle (kota ve tekrar kontrolü ile). */
export function hocaDersEkle(state: GameState, academicId: number, courseId: string): boolean {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen' || !courseId) return false;
  const liste = a.verdigiDersler ?? [];
  if (liste.length >= DERS_LIMIT || liste.includes(courseId)) return false;
  a.verdigiDersler = [...liste, courseId];
  rebuildDersProgrami(state);
  return true;
}

/** Hocadan ders çıkar. */
export function hocaDersCikar(state: GameState, academicId: number, courseId: string): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen') return;
  a.verdigiDersler = (a.verdigiDersler ?? []).filter((d) => d !== courseId);
  rebuildDersProgrami(state);
}

/**
 * Hoca için otomatik seçim: MEVCUT seçimleri korur, boş kotasını alan uyumu
 * yüksek ve henüz açılmamış derslerle doldurur.
 */
export function otoDersSec(state: GameState, academicId: number): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen') return;
  const mevcut = a.verdigiDersler ?? [];
  if (mevcut.length >= DERS_LIMIT) return;
  const digerAcik = new Set<string>();
  for (const h of akademisyenler(state)) {
    if (h.id === academicId) continue;
    for (const d of h.verdigiDersler ?? []) digerAcik.add(d);
  }
  const adaylar = COURSES
    .filter((c) => !mevcut.includes(c.id) && dersEtki(c.id, a.alan) >= 0.9)
    .map((c) => ({ id: c.id, puan: dersEtki(c.id, a.alan) + (digerAcik.has(c.id) ? 0 : 0.5) }))
    .sort((x, y) => y.puan - x.puan);
  a.verdigiDersler = [...mevcut, ...adaylar.slice(0, DERS_LIMIT - mevcut.length).map((x) => x.id)];
  rebuildDersProgrami(state);
}

/**
 * Bölümü hedefle: müfredatın açık olmayan derslerini, uygun (etki en yüksek)
 * ve kotası boş hocalara dağıtır. Atanamayan dersleri döndürür.
 */
export function bolumuHedefle(state: GameState, defId: string): string[] {
  const kalan: string[] = [];
  let degisti = false;
  for (const dersId of verilemeyenDersler(state, defId)) {
    let secilen: Academic | null = null;
    let enIyi = -1;
    for (const a of akademisyenler(state)) {
      const liste = a.verdigiDersler ?? [];
      if (liste.length >= DERS_LIMIT || liste.includes(dersId)) continue;
      const e = dersEtki(dersId, a.alan);
      if (e > enIyi) {
        enIyi = e;
        secilen = a;
      }
    }
    if (secilen) {
      secilen.verdigiDersler = [...(secilen.verdigiDersler ?? []), dersId];
      degisti = true;
    } else {
      kalan.push(dersId);
    }
  }
  if (degisti) rebuildDersProgrami(state);
  return kalan;
}

/**
 * Akıllı toplu seçim: tüm seçimleri sıfırlar ve BÖLÜM AÇMAYI hedefler —
 * tamamlaması kolay (az dersli, ucuz) bölümlerden başlayarak müfredatları
 * uygun hocalara dağıtır; artan kotayı kapsama/uyumla doldurur.
 * Açılabilir duruma gelen bölüm sayısını döndürür.
 */
export function akilliOtoSec(state: GameState): number {
  const hocalar = akademisyenler(state);
  for (const a of hocalar) a.verdigiDersler = [];

  const acik = new Set<string>();
  const acikDefIds = new Set(state.departments.map((d) => d.defId));

  const hedefler = DEPT_DEFS
    .filter((d) => !acikDefIds.has(d.id))
    .sort((a, b) => a.dersler.length - b.dersler.length || a.acilisMaliyeti - b.acilisMaliyeti);

  let tamamlanan = 0;
  for (const def of hedefler) {
    const yeni = def.dersler.filter((d) => !acik.has(d));
    // geçici atama dene: her yeni ders için etki>=0.9 ve kotası boş hoca
    const plan: [Academic, string][] = [];
    const geciciYuk = new Map<number, number>();
    let olur = true;
    for (const dersId of yeni) {
      let secilen: Academic | null = null;
      let enIyi = 0;
      for (const a of hocalar) {
        const dolu = (a.verdigiDersler ?? []).length + (geciciYuk.get(a.id) ?? 0);
        if (dolu >= DERS_LIMIT) continue;
        const e = dersEtki(dersId, a.alan);
        if (e >= 0.9 && e > enIyi) {
          enIyi = e;
          secilen = a;
        }
      }
      if (!secilen) {
        olur = false;
        break;
      }
      plan.push([secilen, dersId]);
      geciciYuk.set(secilen.id, (geciciYuk.get(secilen.id) ?? 0) + 1);
    }
    if (!olur) continue;
    for (const [a, dersId] of plan) {
      a.verdigiDersler = [...(a.verdigiDersler ?? []), dersId];
      acik.add(dersId);
    }
    for (const d of def.dersler) acik.add(d);
    tamamlanan++;
  }

  // artan kotaları kapsama + uyumla doldur
  for (const a of hocalar) {
    const mevcut = a.verdigiDersler ?? [];
    if (mevcut.length >= DERS_LIMIT) continue;
    const adaylar = COURSES
      .filter((c) => !mevcut.includes(c.id) && dersEtki(c.id, a.alan) >= 0.9)
      .map((c) => ({ id: c.id, puan: dersEtki(c.id, a.alan) + (acik.has(c.id) ? 0 : 0.5) }))
      .sort((x, y) => y.puan - x.puan);
    for (const aday of adaylar.slice(0, DERS_LIMIT - mevcut.length)) {
      a.verdigiDersler = [...(a.verdigiDersler ?? []), aday.id];
      acik.add(aday.id);
    }
  }

  rebuildDersProgrami(state);
  return tamamlanan;
}

/** Tüm hocalar için otomatik seçim (akıllı: bölümleri hedefler). */
export function tumunuOtoSec(state: GameState): void {
  akilliOtoSec(state);
}

/**
 * Hoca bölüm aidiyeti VERDİĞİ DERSLERDEN türetilir: müfredatı hocanın ders
 * seçimiyle en çok çakışan açık bölüm. Oyuncu ayrıca "bölüme atamaz" — ders
 * dağıtmak yeter. Eşitlikte mevcut bölüm korunur; hiç çakışma yoksa (ya da
 * hoca ders vermiyorsa) eski aidiyet durur, bölüm silindiyse -1 olur.
 */
export function hocaBolumleriniGuncelle(state: GameState): void {
  const acikBolumler = state.departments.map((d) => ({
    id: d.id,
    dersler: new Set(deptDef(d.defId).dersler),
  }));
  for (const a of akademisyenler(state)) {
    const liste = a.verdigiDersler ?? [];
    let enIyi = 0;
    let secilen = -1;
    for (const b of acikBolumler) {
      let n = 0;
      for (const dersId of liste) if (b.dersler.has(dersId)) n++;
      if (n > enIyi || (n === enIyi && n > 0 && b.id === a.deptId)) {
        enIyi = n;
        secilen = b.id;
      }
    }
    if (enIyi > 0) a.deptId = secilen;
    else if (a.deptId !== -1 && !state.departments.some((d) => d.id === a.deptId)) a.deptId = -1;
  }
}

/** Programı sıfırdan kurar — gün sonunda ve kadro/ders değişince çağrılır. */
export function rebuildDersProgrami(state: GameState): void {
  hocaBolumleriniGuncelle(state); // aidiyet derslerden türesin, sonra program kurulsun
  const slots: DersSlot[] = [];
  const gunlukBlok = new Map<number, number>(); // academicId -> bugün verdiği blok sayısı
  const blokMesgul = new Set<string>(); // "id:blok" — bir hoca aynı saatte İKİ sınıfa giremez
  const tumHocalar = akademisyenler(state);

  for (const dept of state.departments) {
    const dersler = deptDef(dept.defId).dersler;
    if (dersler.length === 0) continue;

    for (let blok = 0; blok < 4; blok++) {
      // müfredat gün + blok üzerinden döner: her gün farklı ders kombinasyonu
      const courseId = dersler[(state.gun + blok) % dersler.length];

      // dersi SEÇMİŞ hocalardan en uygunu (önce bölümün kendi hocası), günde en çok 2 blok;
      // kimse boşta değilse limit gevşer (yorgun hoca boş dersten iyidir — yük cezası zaten var)
      let secilen: Academic | null = null;
      for (const blokLimit of [2, 4]) {
        let enIyi = -1;
        for (const a of tumHocalar) {
          if (!(a.verdigiDersler ?? []).includes(courseId)) continue;
          if (blokMesgul.has(`${a.id}:${blok}`)) continue; // o saatte başka sınıfta
          if ((gunlukBlok.get(a.id) ?? 0) >= blokLimit) continue;
          const puan = dersEtki(courseId, a.alan) * (0.5 + a.egitim / 100)
            + (a.deptId === dept.id ? 0.6 : 0); // kendi bölümü öncelikli
          if (puan > enIyi) {
            enIyi = puan;
            secilen = a;
          }
        }
        if (secilen) break;
      }
      if (secilen) {
        gunlukBlok.set(secilen.id, (gunlukBlok.get(secilen.id) ?? 0) + 1);
        blokMesgul.add(`${secilen.id}:${blok}`);
      }

      slots.push({ deptId: dept.id, blok, courseId, academicId: secilen ? secilen.id : -1 });
    }
  }

  // KENDİNİ İYİLEŞTİRME: hocasız kalan slotlara acil atama. Sebep ne olursa
  // olsun (dersi seçen hoca istifa etti, seçenler o saatte dolu, ders kimsede
  // yok) o saatte MÜSAİT bir hoca varsa ders ona verilir — gerekiyorsa ders
  // yıllık seçimlerine eklenir. "Bölüm açık ama hoca yok" ancak kadro fiziken
  // yetmiyorsa kalır (danışman uyarır).
  for (const s of slots) {
    if (s.academicId !== -1) continue;
    let secilen: Academic | null = null;
    let enIyi = -1;
    for (const a of tumHocalar) {
      if (blokMesgul.has(`${a.id}:${s.blok}`)) continue;
      if ((gunlukBlok.get(a.id) ?? 0) >= 4) continue;
      const sahip = (a.verdigiDersler ?? []).includes(s.courseId);
      if (!sahip && (a.verdigiDersler ?? []).length >= DERS_LIMIT) continue; // yıllık kota dolu
      const puan = dersEtki(s.courseId, a.alan) * (0.5 + a.egitim / 100) + (sahip ? 0.5 : 0);
      if (puan > enIyi) {
        enIyi = puan;
        secilen = a;
      }
    }
    if (!secilen) continue;
    if (!(secilen.verdigiDersler ?? []).includes(s.courseId)) {
      secilen.verdigiDersler = [...(secilen.verdigiDersler ?? []), s.courseId];
      notify(state, `📚 Müfredat açığı kapatıldı: ${courseDef(s.courseId).kod} dersi ${secilen.ad}'ın yıllık programına eklendi.`, 'bilgi');
    }
    s.academicId = secilen.id;
    gunlukBlok.set(secilen.id, (gunlukBlok.get(secilen.id) ?? 0) + 1);
    blokMesgul.add(`${secilen.id}:${s.blok}`);
  }

  state.dersProgrami = slots;

  // Aidiyet güvencesi: müfredat çakışması olmayan ama bugünkü programda fiilen
  // ders veren bölümsüz hoca, ders verdiği bölüme bağlanır (araştırma/danışmanlık
  // katkısı boşa gitmesin).
  for (const s of slots) {
    if (s.academicId === -1) continue;
    const a = tumHocalar.find((h) => h.id === s.academicId);
    if (a && a.deptId === -1) a.deptId = s.deptId;
  }
}

/**
 * Bugünkü programda bir slota ELLE hoca atar (📅 panelden). Ders hocanın
 * yıllık seçiminde yoksa (kota izin veriyorsa) eklenir — kalıcı çözüm olur.
 */
export function slotaHocaAta(
  state: GameState, deptId: number, blok: number, academicId: number,
): boolean {
  const slot = (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.blok === blok);
  const a = state.agents.find(
    (x): x is Academic => x.id === academicId && x.kind === 'akademisyen',
  );
  if (!slot || !a) return false;
  const cakisma = (state.dersProgrami ?? []).some(
    (s) => s.blok === blok && s.academicId === academicId && s.deptId !== deptId,
  );
  if (cakisma) {
    notify(state, `${a.ad} aynı saatte başka bir sınıfta ders veriyor — önce oradan alın.`, 'kotu');
    return false;
  }
  if (!(a.verdigiDersler ?? []).includes(slot.courseId)) {
    if ((a.verdigiDersler ?? []).length >= DERS_LIMIT) {
      notify(state, `${a.ad}'ın yıllık ders kotası dolu (${DERS_LIMIT}) — önce bir dersini bırakın.`, 'kotu');
      return false;
    }
    a.verdigiDersler = [...(a.verdigiDersler ?? []), slot.courseId];
  }
  slot.academicId = a.id;
  hocaBolumleriniGuncelle(state);
  notify(state, `📅 ${courseDef(slot.courseId).kod} dersine ${a.ad} atandı.`, 'iyi');
  return true;
}

/** Bölümün belirli bloktaki dersi (panel ve simülasyon için). */
export function blokDersi(state: GameState, deptId: number, blok: number): DersSlot | undefined {
  return (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.blok === blok);
}

export { courseDef, dersEtki };
