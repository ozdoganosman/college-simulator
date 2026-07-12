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
import { Academic, DersSlot, GUNLUK_SEANS, GameState, HAFTA_GUN, Student } from '../core/types';
import { COURSES, courseDef, courseExists, dersEtki } from '../data/courses';
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

/**
 * Izgara hücresi: hocanın slotIndex'teki dersini yeni ders ile değiştirir.
 * yeniDers === '' → o hücreyi boşaltır. Zaten (başka hücrede) seçili ders eklenmez.
 */
export function hocaDersSlotAyarla(
  state: GameState, academicId: number, slotIndex: number, yeniDers: string,
): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen' || slotIndex < 0 || slotIndex >= DERS_LIMIT) return;
  const liste = [...(a.verdigiDersler ?? [])];
  const eski = liste[slotIndex];
  if (yeniDers === '') {
    if (eski === undefined) return;
    liste.splice(slotIndex, 1);
  } else {
    if (!courseExists(yeniDers) || (liste.includes(yeniDers) && eski !== yeniDers)) return;
    if (eski === undefined) {
      if (liste.length >= DERS_LIMIT) return;
      liste.push(yeniDers);
    } else {
      liste[slotIndex] = yeniDers;
    }
  }
  a.verdigiDersler = liste;
  rebuildDersProgrami(state);
}

/** Hocadan ders çıkar. */
export function hocaDersCikar(state: GameState, academicId: number, courseId: string): void {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen') return;
  a.verdigiDersler = (a.verdigiDersler ?? []).filter((d) => d !== courseId);
  rebuildDersProgrami(state);
}

/** Şu an açık olan tüm bölümlerin müfredat derslerinin birleşimi. */
export function acikBolumDersSeti(state: GameState): Set<string> {
  const set = new Set<string>();
  for (const d of state.departments) {
    for (const c of deptDef(d.defId).dersler) set.add(c);
  }
  return set;
}

/**
 * Hocanın kotasındaki, HİÇBİR açık bölümün müfredatına girmeyen (boşa giden,
 * bırakılması güvenli) ilk ders. Kotası dolu bir hocaya GEREKLİ bir ders açmak
 * için bu "yedek" ders takas edilebilir — açık bir bölümü asla hocasız bırakmaz.
 * koru: asla bırakılmayacak ders. acikSet: önceden hesaplanmış küme (döngü için).
 */
export function birakilabilirDers(
  state: GameState, a: Academic, koru?: string, acikSet?: Set<string>,
): string | null {
  const set = acikSet ?? acikBolumDersSeti(state);
  for (const d of a.verdigiDersler ?? []) {
    if (d === koru) continue;
    if (!set.has(d)) return d;
  }
  return null;
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
  const acikSet = acikBolumDersSeti(state);
  for (const dersId of verilemeyenDersler(state, defId)) {
    let secilen: Academic | null = null;
    let enIyi = -1;
    let takas: string | null = null; // seçilen hocanın bırakacağı yedek ders
    for (const a of akademisyenler(state)) {
      const liste = a.verdigiDersler ?? [];
      const dolu = liste.length >= DERS_LIMIT;
      // kota dolu: yalnız boşa giden (yedek) bir dersi takas edilebiliyorsa aday
      const yedek = dolu ? birakilabilirDers(state, a, dersId, acikSet) : null;
      if (dolu && yedek === null) continue;
      const e = dersEtki(dersId, a.alan);
      if (e > enIyi) {
        enIyi = e;
        secilen = a;
        takas = yedek;
      }
    }
    if (secilen) {
      if (takas !== null) {
        secilen.verdigiDersler = (secilen.verdigiDersler ?? []).filter((d) => d !== takas);
      }
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

  // ÖNCE zaten açık bölümlerin müfredatını garanti et — akıllı seçim onları asla
  // düşürüp "hoca yok" bırakmasın. (Artan kotayı dolduran filler dersler sonradan
  // gerektiğinde takas edilebilir; açık bölüm dersleri korunur.)
  for (const dept of state.departments) {
    for (const dersId of deptDef(dept.defId).dersler) {
      if (acik.has(dersId)) continue;
      let secilen: Academic | null = null;
      let enIyi = -Infinity;
      for (const a of hocalar) {
        if ((a.verdigiDersler ?? []).length >= DERS_LIMIT) continue;
        const e = dersEtki(dersId, a.alan);
        if (e > enIyi) {
          enIyi = e;
          secilen = a;
        }
      }
      if (secilen) {
        secilen.verdigiDersler = [...(secilen.verdigiDersler ?? []), dersId];
        acik.add(dersId);
      }
    }
  }

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

/**
 * Bölümün 4 saat slotuna SABİTLENECEK dersleri seçer: müfredat 4 dersse hepsi
 * (önlisans), daha uzunsa (lisans) kadronun en iyi verebildiği 4 ders. Bölüm
 * açılırken bir kez belirlenir; sonra sabit slotlardan okunarak korunur.
 */
export function bolumSabitDersler(state: GameState, defId: string): string[] {
  const dersler = deptDef(defId).dersler;
  if (dersler.length <= 4) return dersler.slice();
  const alanlar = akademisyenler(state).map((a) => a.alan);
  const puan = (cid: string): number => {
    let m = 0;
    for (const al of alanlar) { const e = dersEtki(cid, al); if (e > m) m = e; }
    return m;
  };
  return [...dersler].sort((a, b) => puan(b) - puan(a)).slice(0, 4);
}

/**
 * Programı kurar. YERLEŞİK: sabit/kilitli hücreler korunur (ders+hoca+saat bölüm
 * silinene dek değişmez); yalnız yeni bölümler ve hocası ayrılmış hücreler atanır.
 * Gün sonunda ve kadro/ders değişince çağrılır.
 */
export function rebuildDersProgrami(state: GameState): void {
  hocaBolumleriniGuncelle(state); // aidiyet derslerden türesin, sonra program kurulsun
  const slots: DersSlot[] = [];
  const seansMesgul = new Set<string>(); // "id:gun:seans" — hoca aynı gün+seansta iki sınıfa giremez
  const gunlukSeans = new Map<string, number>(); // "id:gun" -> o gün verdiği seans sayısı
  const tumHocalar = akademisyenler(state);
  const gs = (id: number, gun: number): string => `${id}:${gun}`;

  // YERLEŞİK: (deptId:gun:seans) hücreleri KORUNUR. Sabit (bölüm açılınca kurulan) ve
  // 📌 elle kilitli hücrelerin ders+hoca+gün+seansı değişmez — yalnız hocası kadrodan
  // ayrılmış / dersi bırakmış hücreler yeniden atanır. Korunanları PEŞİNEN rezerve et.
  const onceki = new Map<string, DersSlot>();
  const korunan = new Map<string, DersSlot>();
  for (const s of state.dersProgrami ?? []) {
    if (typeof s.gun !== 'number' || typeof s.seans !== 'number') continue; // eski format → atla
    if (!state.departments.some((d) => d.id === s.deptId)) continue;
    onceki.set(`${s.deptId}:${s.gun}:${s.seans}`, s);
    if (!(s.sabit || s.kilit) || s.academicId === -1) continue;
    const h = tumHocalar.find((x) => x.id === s.academicId);
    if (!h || !(h.verdigiDersler ?? []).includes(s.courseId)) continue; // hoca yok / dersi bıraktı
    const mesgulKey = `${s.academicId}:${s.gun}:${s.seans}`;
    if (seansMesgul.has(mesgulKey)) continue; // aynı hoca+gün+seans iki kez rezerve edilemez
    korunan.set(`${s.deptId}:${s.gun}:${s.seans}`, s);
    seansMesgul.add(mesgulKey);
    gunlukSeans.set(gs(s.academicId, s.gun), (gunlukSeans.get(gs(s.academicId, s.gun)) ?? 0) + 1);
  }

  for (const dept of state.departments) {
    const dersler = deptDef(dept.defId).dersler;
    if (dersler.length === 0) continue;

    for (let gun = 0; gun < HAFTA_GUN; gun++) {
      for (let seans = 0; seans < GUNLUK_SEANS; seans++) {
        const anahtar = `${dept.id}:${gun}:${seans}`;
        // korunan hücre: ders + hoca aynen kalır (rezervasyon yukarıda yapıldı)
        const kor = korunan.get(anahtar);
        if (kor) { slots.push({ ...kor, sabit: true }); continue; }

        // ders SABİT: önceki sabit hücrenin dersini koru, yoksa haftalık indeksten ata —
        // müfredat 10 hücreye yayılır (önlisans 4 ders 2-3× tekrarlar, lisans 8 dersin hepsi işlenir)
        const prev = onceki.get(anahtar);
        const idx = gun * GUNLUK_SEANS + seans; // 0-9
        const courseId = (prev && prev.sabit) ? prev.courseId : dersler[idx % dersler.length];

        // dersi SEÇMİŞ en uygun müsait hoca (önce bölümün kendi hocası); günde 1, gerekirse 2 seans
        let secilen: Academic | null = null;
        for (const gunLimit of [1, 2]) {
          let enIyi = -1;
          for (const a of tumHocalar) {
            if (!(a.verdigiDersler ?? []).includes(courseId)) continue;
            if (seansMesgul.has(`${a.id}:${gun}:${seans}`)) continue; // o gün+seans başka sınıfta
            if ((gunlukSeans.get(gs(a.id, gun)) ?? 0) >= gunLimit) continue;
            const puan = dersEtki(courseId, a.alan) * (0.5 + a.egitim / 100)
              + (a.deptId === dept.id ? 0.6 : 0); // kendi bölümü öncelikli
            if (puan > enIyi) { enIyi = puan; secilen = a; }
          }
          if (secilen) break;
        }
        if (secilen) {
          gunlukSeans.set(gs(secilen.id, gun), (gunlukSeans.get(gs(secilen.id, gun)) ?? 0) + 1);
          seansMesgul.add(`${secilen.id}:${gun}:${seans}`);
        }
        slots.push({ deptId: dept.id, gun, seans, courseId, academicId: secilen ? secilen.id : -1, sabit: true });
      }
    }
  }

  // KENDİNİ İYİLEŞTİRME: hocasız kalan hücrelere acil atama (takasla). "Bölüm açık
  // ama hoca yok" ancak kadro fiziken yetmiyorsa kalır (danışman uyarır).
  const acikSet = acikBolumDersSeti(state);
  for (const s of slots) {
    if (s.academicId !== -1) continue;
    let secilen: Academic | null = null;
    let enIyi = -1;
    for (const a of tumHocalar) {
      if (seansMesgul.has(`${a.id}:${s.gun}:${s.seans}`)) continue;
      if ((gunlukSeans.get(gs(a.id, s.gun)) ?? 0) >= GUNLUK_SEANS) continue;
      const sahip = (a.verdigiDersler ?? []).includes(s.courseId);
      if (!sahip && (a.verdigiDersler ?? []).length >= DERS_LIMIT
          && birakilabilirDers(state, a, s.courseId, acikSet) === null) continue;
      const puan = dersEtki(s.courseId, a.alan) * (0.5 + a.egitim / 100) + (sahip ? 0.5 : 0);
      if (puan > enIyi) { enIyi = puan; secilen = a; }
    }
    if (!secilen) continue;
    if (!(secilen.verdigiDersler ?? []).includes(s.courseId)) {
      if ((secilen.verdigiDersler ?? []).length >= DERS_LIMIT) {
        const birak = birakilabilirDers(state, secilen, s.courseId, acikSet);
        if (birak !== null) secilen.verdigiDersler = (secilen.verdigiDersler ?? []).filter((d) => d !== birak);
      }
      secilen.verdigiDersler = [...(secilen.verdigiDersler ?? []), s.courseId];
      notify(state, `📚 Müfredat açığı kapatıldı: ${courseDef(s.courseId).kod} dersi ${secilen.ad}'ın yıllık programına eklendi.`, 'bilgi');
    }
    s.academicId = secilen.id;
    gunlukSeans.set(gs(secilen.id, s.gun), (gunlukSeans.get(gs(secilen.id, s.gun)) ?? 0) + 1);
    seansMesgul.add(`${secilen.id}:${s.gun}:${s.seans}`);
  }

  state.dersProgrami = slots;

  // Aidiyet güvencesi: programda fiilen ders veren bölümsüz hoca o bölüme bağlanır.
  for (const s of slots) {
    if (s.academicId === -1) continue;
    const a = tumHocalar.find((h) => h.id === s.academicId);
    if (a && a.deptId === -1) a.deptId = s.deptId;
  }
}

/** Hoca aynı gün+seansta BAŞKA bir bölümde ders veriyor mu (çakışma)? Sürükle-bırak önizlemesi de kullanır. */
export function hocaCakisirMi(
  state: GameState, deptId: number, gun: number, seans: number, academicId: number,
): boolean {
  return (state.dersProgrami ?? []).some(
    (s) => s.gun === gun && s.seans === seans && s.academicId === academicId && s.deptId !== deptId,
  );
}

/**
 * Bugünkü programda bir slota ELLE hoca atar (📅 panelden, tıkla ya da sürükle-bırak).
 * Ders hocanın yıllık seçiminde yoksa (kota izin veriyorsa) eklenir — kalıcı çözüm olur.
 */
export function slotaHocaAta(
  state: GameState, deptId: number, gun: number, seans: number, academicId: number,
): boolean {
  const slot = (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.gun === gun && s.seans === seans);
  const a = state.agents.find(
    (x): x is Academic => x.id === academicId && x.kind === 'akademisyen',
  );
  if (!slot || !a) return false;
  const cakisma = hocaCakisirMi(state, deptId, gun, seans, academicId);
  if (cakisma) {
    notify(state, `${a.ad} aynı gün+seansta başka bir sınıfta ders veriyor — önce oradan alın.`, 'kotu');
    return false;
  }
  if (!(a.verdigiDersler ?? []).includes(slot.courseId)) {
    if ((a.verdigiDersler ?? []).length >= DERS_LIMIT) {
      // kota dolu: boşa giden (hiçbir açık bölüme bağlı olmayan) bir dersi varsa
      // onu bırakıp yer aç — açık bir bölümü asla hocasız bırakma
      const birak = birakilabilirDers(state, a, slot.courseId);
      if (birak === null) {
        notify(state, `${a.ad}'ın dört dersi de açık bölümlere bağlı — kotası boş ya da yedek dersi olan bir hoca seç, yeni hoca al ya da bir bölümü kapat.`, 'kotu');
        return false;
      }
      a.verdigiDersler = (a.verdigiDersler ?? []).filter((d) => d !== birak);
      notify(state, `♻️ ${a.ad}: boşa giden ${courseDef(birak).kod} bırakıldı, yerine ${courseDef(slot.courseId).kod} eklendi.`, 'bilgi');
    }
    a.verdigiDersler = [...(a.verdigiDersler ?? []), slot.courseId];
  }
  slot.academicId = a.id;
  slot.kilit = true; // 📌 elle atama kilitlenir: gece yeniden kurulumda değişmez
  hocaBolumleriniGuncelle(state);
  notify(state, `📅 ${courseDef(slot.courseId).kod} dersine ${a.ad} atandı ve 📌 kilitlendi (kilidi panelden açabilirsin).`, 'iyi');
  return true;
}

/** 📌 Hücre kilidini açar — program yeniden serbest kurulur. */
export function slotKilidiAc(state: GameState, deptId: number, gun: number, seans: number): void {
  const slot = (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.gun === gun && s.seans === seans);
  if (!slot) return;
  slot.kilit = false;
  notify(state, `📌 ${courseDef(slot.courseId).kod} hücre kilidi açıldı — program en uygun hocayı yeniden seçecek.`, 'bilgi');
}

/** Bölümün (gün, seans) hücresindeki ders (panel ve simülasyon için). */
export function dersHucresi(state: GameState, deptId: number, gun: number, seans: number): DersSlot | undefined {
  return (state.dersProgrami ?? []).find((s) => s.deptId === deptId && s.gun === gun && s.seans === seans);
}

export { courseDef, dersEtki };
