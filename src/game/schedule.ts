/**
 * Ders programı: DERSLİKTEN kurulur, hoca sonradan atanır.
 *
 * AKIŞ: bölüm haritadan seçilen dersliklerle açılır (bkz. departments.ts) — açılışın
 * hoca ile hiçbir ilgisi yoktur. Her derslik kendi haftalık ızgarasını (5 gün × 4 blok
 * = 20 hücre) müfredattan otomatik doldurur: hücrenin DERSİ derslik + gün + blok'tan
 * gelir, hoca GEREKMEZ. Oyuncu (ya da 🪄 Akıllı Doldur) bir hocayı bir hücreye
 * SÜRÜKLEYİNCE academicId dolar — bir hocanın "verdiği dersler" listesi bundan SONRA,
 * programdaki fiili atamalarından türetilir (asla elle seçilmez).
 */
import { Academic, DersSlot, GUNLUK_BLOK, GameState, HAFTA_GUN, Student } from '../core/types';
import { courseDef, dersEtki } from '../data/courses';
import { deptDef } from '../data/departments';
import { notify } from './state';

/** Bir hocanın aynı anda verebileceği azami FARKLI ders sayısı (yük göstergesi). */
export const DERS_LIMIT = 4;

/** Bir hocanın günde ders verebileceği azami blok sayısı (2 saat × 2 = günde 4 saat ders). */
export const GUNLUK_BLOK_LIMIT = 2;

/** Bir hocanın alabileceği azami asistan sayısı. */
export const ASISTAN_LIMIT = 2;

/**
 * Ders yükü verim tablosu — indeks: farklı ders sayısı (asistanlar düşülür).
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

/**
 * Her hocanın "verdiği dersler" listesini PROGRAMDAKİ FİİLİ ATAMALARDAN türetir —
 * asla elle seçilmez, yalnız sonuçtan okunur. rebuildDersProgrami ve slotaHocaAta
 * sonunda çağrılır; bölüm aidiyeti de bu listeye bakarak belirlenir.
 */
function deriveVerdigiDersler(state: GameState): void {
  const dersler = new Map<number, Set<string>>();
  for (const s of state.dersProgrami ?? []) {
    if (s.academicId === -1) continue;
    const set = dersler.get(s.academicId);
    if (set) set.add(s.courseId);
    else dersler.set(s.academicId, new Set([s.courseId]));
  }
  for (const a of akademisyenler(state)) {
    a.verdigiDersler = [...(dersler.get(a.id) ?? [])];
  }
}

/**
 * Hoca bölüm aidiyeti PROGRAMDAKİ ATAMALARDAN türetilir: en çok ders verdiği açık
 * bölüm. Eşitlikte mevcut bölüm korunur; hiç dersi yoksa eski aidiyet durur, bölüm
 * silindiyse -1 olur.
 */
export function hocaBolumleriniGuncelle(state: GameState): void {
  const sayim = new Map<number, Map<number, number>>(); // academicId -> deptId -> hücre sayısı
  for (const s of state.dersProgrami ?? []) {
    if (s.academicId === -1) continue;
    let m = sayim.get(s.academicId);
    if (!m) { m = new Map(); sayim.set(s.academicId, m); }
    m.set(s.deptId, (m.get(s.deptId) ?? 0) + 1);
  }
  for (const a of akademisyenler(state)) {
    const m = sayim.get(a.id);
    if (!m || m.size === 0) {
      if (a.deptId !== -1 && !state.departments.some((d) => d.id === a.deptId)) a.deptId = -1;
      continue;
    }
    let enIyi = -1;
    let secilen = a.deptId;
    for (const [deptId, n] of m) {
      if (n > enIyi || (n === enIyi && deptId === a.deptId)) { enIyi = n; secilen = deptId; }
    }
    a.deptId = secilen;
  }
}

/**
 * Bölümde şu an EN AZ bir hücrede ders veren farklı hocalar — deptId aidiyetinden
 * (çoğunluk oyu, tek "ana bölüm" seçer) BAĞIMSIZ, doğrudan programdaki fiili
 * atamalardan. "Bu bölümün gerçekten kadrosu var mı?" (minAkademisyen şartı, kalite
 * puanı, YL/doktora yeterliliği) sorusunun doğru yanıtı budur — bir hoca burada ders
 * veriyor olsa bile ÇOĞUNLUK dersini başka bölümde veriyorsa deptId oraya işaret eder
 * ve bu bölüm hocasız görünür; halbuki program hücreleri dolu olabilir.
 */
export function bolumdeDersVerenHocalar(state: GameState, deptId: number): Academic[] {
  const ids = new Set<number>();
  for (const s of state.dersProgrami ?? []) {
    if (s.deptId === deptId && s.academicId !== -1) ids.add(s.academicId);
  }
  return state.agents.filter((a): a is Academic => a.kind === 'akademisyen' && ids.has(a.id));
}

/** Hoca aynı gün+blokta BAŞKA bir derslikte ders veriyor mu (çakışma)? Sürükle-bırak önizlemesi de kullanır. */
export function hocaCakisirMi(
  state: GameState, roomId: number, gun: number, blok: number, academicId: number,
): boolean {
  return (state.dersProgrami ?? []).some(
    (s) => s.gun === gun && s.blok === blok && s.academicId === academicId && s.roomId !== roomId,
  );
}

/**
 * Programı derslikten kurar: her açık bölümün her dersliği kendi haftalık
 * ızgarasını (5 gün × 4 blok) müfredattan otomatik doldurur — hoca GEREKMEZ.
 * Var olan hücrelerin (aynı derslik+gün+blok) hoca ataması, hoca hâlâ kadrodaysa
 * korunur; değilse boş kalır (otomatik yeniden atama YAPILMAZ — bkz. otomatikDoldur).
 * Derslik/bölüm/kadro değiştiğinde çağrılır.
 */
export function rebuildDersProgrami(state: GameState): void {
  const onceki = new Map<string, DersSlot>();
  for (const s of state.dersProgrami ?? []) {
    onceki.set(`${s.roomId}:${s.gun}:${s.blok}`, s);
  }

  const tumHocalar = akademisyenler(state);
  const slots: DersSlot[] = [];
  for (const dept of state.departments) {
    const dersler = deptDef(dept.defId).dersler;
    if (dersler.length === 0) continue;
    const odalar = state.rooms.filter(
      (r) => (r.type === 'derslik' || r.type === 'amfi') && r.valid && r.deptId === dept.id,
    );
    for (const oda of odalar) {
      for (let gun = 0; gun < HAFTA_GUN; gun++) {
        for (let blok = 0; blok < GUNLUK_BLOK; blok++) {
          const anahtar = `${oda.id}:${gun}:${blok}`;
          const courseId = dersler[(gun * GUNLUK_BLOK + blok) % dersler.length];
          const kor = onceki.get(anahtar);
          let academicId = -1;
          let kilit: boolean | undefined;
          if (kor && kor.courseId === courseId && kor.academicId !== -1) {
            const h = tumHocalar.find((x) => x.id === kor.academicId);
            if (h) { academicId = h.id; kilit = kor.kilit; }
          }
          slots.push({ deptId: dept.id, roomId: oda.id, gun, blok, courseId, academicId, kilit });
        }
      }
    }
  }

  state.dersProgrami = slots;
  deriveVerdigiDersler(state);
  hocaBolumleriniGuncelle(state);
}

/**
 * 🪄 Akıllı Doldur: yalnız BOŞ hücreleri (academicId === -1) en uygun MÜSAİT hocayla
 * doldurur — var olan (sürüklenerek ya da önceki dolduruşla gelen) atamalara
 * dokunmaz. Doldurduğu hücre sayısını döndürür.
 */
export function otomatikDoldur(state: GameState): number {
  const tumHocalar = akademisyenler(state);
  const mesgul = new Set<string>(); // "academicId:gun:blok"
  const gunlukBlok = new Map<string, number>(); // "academicId:gun" -> o gün verdiği blok sayısı
  const farkliDers = new Map<number, Set<string>>(); // academicId -> verdiği farklı dersler
  const gs = (id: number, gun: number): string => `${id}:${gun}`;
  for (const s of state.dersProgrami ?? []) {
    if (s.academicId === -1) continue;
    mesgul.add(`${s.academicId}:${s.gun}:${s.blok}`);
    gunlukBlok.set(gs(s.academicId, s.gun), (gunlukBlok.get(gs(s.academicId, s.gun)) ?? 0) + 1);
    const set = farkliDers.get(s.academicId);
    if (set) set.add(s.courseId); else farkliDers.set(s.academicId, new Set([s.courseId]));
  }

  let dolan = 0;
  for (const s of state.dersProgrami ?? []) {
    if (s.academicId !== -1) continue;
    let secilen: Academic | null = null;
    let enIyi = -1;
    for (const a of tumHocalar) {
      if (mesgul.has(`${a.id}:${s.gun}:${s.blok}`)) continue;
      if ((gunlukBlok.get(gs(a.id, s.gun)) ?? 0) >= GUNLUK_BLOK_LIMIT) continue;
      const zatenVeriyor = farkliDers.get(a.id)?.has(s.courseId) ?? false;
      if (!zatenVeriyor && (farkliDers.get(a.id)?.size ?? 0) >= DERS_LIMIT) continue;
      const puan = dersEtki(s.courseId, a.alan) * (0.5 + a.egitim / 100) + (a.deptId === s.deptId ? 0.6 : 0);
      if (puan > enIyi) { enIyi = puan; secilen = a; }
    }
    if (!secilen) continue;
    s.academicId = secilen.id;
    mesgul.add(`${secilen.id}:${s.gun}:${s.blok}`);
    gunlukBlok.set(gs(secilen.id, s.gun), (gunlukBlok.get(gs(secilen.id, s.gun)) ?? 0) + 1);
    const set = farkliDers.get(secilen.id);
    if (set) set.add(s.courseId); else farkliDers.set(secilen.id, new Set([s.courseId]));
    dolan++;
  }

  if (dolan > 0) {
    deriveVerdigiDersler(state);
    hocaBolumleriniGuncelle(state);
  }
  return dolan;
}

/**
 * Bir hücreye SÜRÜKLE-BIRAK (ya da tıkla) ile hoca atar (📅 panelden). Aynı gün+blokta
 * başka bir derslikte dersi varsa reddedilir. Bu dersi ilk kez veriyorsa ve zaten
 * DERS_LIMIT farklı ders veriyorsa da reddedilir (önce birini boşaltmalı).
 */
export function slotaHocaAta(
  state: GameState, roomId: number, gun: number, blok: number, academicId: number,
): boolean {
  const slot = (state.dersProgrami ?? []).find((s) => s.roomId === roomId && s.gun === gun && s.blok === blok);
  const a = state.agents.find(
    (x): x is Academic => x.id === academicId && x.kind === 'akademisyen',
  );
  if (!slot || !a) return false;
  if (hocaCakisirMi(state, roomId, gun, blok, academicId)) {
    notify(state, `${a.ad} aynı gün+blokta başka bir derslikte ders veriyor — önce oradan alın.`, 'kotu');
    return false;
  }
  const zatenVeriyor = (a.verdigiDersler ?? []).includes(slot.courseId);
  if (!zatenVeriyor && (a.verdigiDersler ?? []).length >= DERS_LIMIT) {
    notify(state, `${a.ad} zaten ${DERS_LIMIT} farklı ders veriyor — önce birini boşaltmalısın.`, 'kotu');
    return false;
  }
  slot.academicId = a.id;
  slot.kilit = true;
  deriveVerdigiDersler(state);
  hocaBolumleriniGuncelle(state);
  notify(state, `📅 ${courseDef(slot.courseId).kod} dersine ${a.ad} atandı.`, 'iyi');
  return true;
}

/** Bir hücreyi boşaltır (hocasını çıkarır) — 📅 panelden. */
export function slotuBosalt(state: GameState, roomId: number, gun: number, blok: number): void {
  const slot = (state.dersProgrami ?? []).find((s) => s.roomId === roomId && s.gun === gun && s.blok === blok);
  if (!slot || slot.academicId === -1) return;
  const ad = state.agents.find((a) => a.id === slot.academicId)?.ad ?? 'Hoca';
  slot.academicId = -1;
  slot.kilit = false;
  deriveVerdigiDersler(state);
  hocaBolumleriniGuncelle(state);
  notify(state, `📅 ${courseDef(slot.courseId).kod} hücresi boşaltıldı (${ad} artık bu dersi vermiyor).`, 'bilgi');
}

/** Bölümün (oda, gün, blok) hücresindeki ders (panel ve simülasyon için). */
export function dersHucresi(state: GameState, roomId: number, gun: number, blok: number): DersSlot | undefined {
  return (state.dersProgrami ?? []).find((s) => s.roomId === roomId && s.gun === gun && s.blok === blok);
}

export { courseDef, dersEtki };
