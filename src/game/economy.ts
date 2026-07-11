/**
 * SPEC — Ekonomi: günlük giderler.
 *
 * dailyEconomy(state): gün sonunda çağrılır.
 *  - Maaşlar: tüm akademisyen + personel maas toplamı; 'tesvik' stratejisi varsa
 *    akademisyen maaşları x1.10. Para eksiye DÜŞEBİLİR (borç) — spend değil doğrudan düş.
 *  - Bakım: zemin döşeli kare sayısı * BALANCE.BAKIM_GIDERI_TILE.
 *  - 'yemek_subvansiyon' stratejisi: günlük ₺2.000.
 *  - Toplam gider > 0 ise tek notify(bilgi): 'Günlük gider: ₺... (maaş ₺..., bakım ₺...)'
 *    — spam olmasın diye sadece 5 günde bir bildir, ama parayı her gün düş.
 *  - Para < 0 olduysa notify(kotu) 'Bütçe açığı! Prestij düşüyor' + addPrestij(-1).
 */
import { GameState, Student } from '../core/types';
import { formatMoney } from '../core/util';
import { BALANCE } from '../data/balance';
import { strategyDef } from '../data/strategies';
import { mutevelliBonusu } from './alumni';
import { addPrestij, earn, notify } from './state';

/**
 * Öğrencinin günlük girişim geliri ₺ — nitelikleri geliştikçe büyür.
 * Pratik ve influencer en kazançlı; akademik alanlar da katkı verir.
 */
export function ogrenciGunlukKazanc(state: GameState, s: Student): number {
  const n = s.nitelik;
  let kazanc = n.pratik * 6 + n.influencer * 5 + (n.muhendis + n.artist + n.filozof) * 2;
  if (state.strategies.includes('teknokent')) kazanc *= 1.5;
  if (state.vizyon === 'girisim') kazanc *= 1.35;
  kazanc *= 1 + 0.05 * mutevelliBonusu(state, 'girisim'); // heyetteki girişimci mezunlar
  // azalan getiri: küçük kazançlarda ~doğrusal, tavana yumuşak yaklaşır —
  // nitelikler 100'e dayandığında öğrenci başına gelir enflasyonunu keser
  const tavan = BALANCE.GIRISIM_KAZANC_TAVAN;
  return Math.round(tavan * Math.tanh(kazanc / tavan));
}

/**
 * Bölümün geçerli yıllık kayıt ücreti ₺: bölüme özel ücret varsa o, yoksa okul
 * geneli. Okul ücretsizken (devlet modeli) bölüm ücreti de uygulanmaz.
 */
export function bolumUcreti(state: GameState, deptId: number): number {
  if (state.ucret <= 0) return 0;
  const dept = state.departments.find((d) => d.id === deptId);
  return dept && dept.ucret !== null ? dept.ucret : state.ucret;
}

/** Günlük kayıt ücreti geliri ₺ — bölüm ücreti üzerinden, burs oranı düşülür. */
export function gunlukUcretGeliri(state: GameState): number {
  if (state.ucret <= 0) return 0;
  let toplam = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    toplam += (bolumUcreti(state, a.deptId) / 40) * (1 - (a.burs ?? 100) / 100);
  }
  return toplam;
}

/** Adayların yıllık ödeme gücü ₺ — prestijli okula daha yüksek ücret ödenir. */
export function odemeGucu(state: GameState): number {
  return BALANCE.ODEME_GUCU_TABAN + state.prestij * BALANCE.ODEME_GUCU_PRESTIJ;
}

export function dailyEconomy(state: GameState): void {
  const tesvik = state.strategies.includes('tesvik');

  let maas = 0;
  for (const a of state.agents) {
    if (a.kind === 'akademisyen') maas += a.maas * (tesvik ? 1.10 : 1);
    else if (a.kind === 'asci' || a.kind === 'temizlikci' || a.kind === 'tamirci') maas += a.maas;
    else if (a.kind === 'ogrenci' && a.asistani !== -1) maas += BALANCE.ASISTAN_MAAS;
  }
  maas = Math.round(maas);

  let doseliKare = 0;
  for (const f of state.floor) if (f !== null) doseliKare++;
  const bakim = doseliKare * BALANCE.BAKIM_GIDERI_TILE;

  // aktif politikaların günlük bakım giderleri (yemek sübvansiyonu dahil)
  let politikaGideri = 0;
  for (const id of state.strategies) politikaGideri += strategyDef(id).gunlukGider;
  const mentorlukGider = state.mentorluk ? BALANCE.MENTORLUK_GIDER : 0;
  const malzeme = Math.round(state.gunlukUretim * BALANCE.YEMEK_MALZEME);
  state.gunlukUretim = 0;

  // Girişim ekosistemi: nitelikli öğrenciler gelir üretir — okul kuluçka payı
  // alır, kalanı öğrencinin sermayesine eklenir (mezuniyette bağışa dönüşür).
  let okulPayi = 0;
  let toplamSermaye = 0;
  let ogrenciSayisi = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    ogrenciSayisi++;
    const kazanc = ogrenciGunlukKazanc(state, a);
    if (kazanc > 0) {
      const pay = Math.round(kazanc * BALANCE.GIRISIM_OKUL_PAYI);
      a.sermaye += kazanc - pay;
      okulPayi += pay;
    }
    toplamSermaye += a.sermaye;
  }
  if (okulPayi > 0) {
    earn(state, okulPayi);
    if (state.gun % 5 === 0) {
      notify(state, `🚀 Girişim ekosistemi: okul payı ${formatMoney(okulPayi)} (öğrenci sermayesi ${formatMoney(toplamSermaye)})`, 'iyi');
    }
  }

  // Kayıt ücreti geliri: burssuz/yarı burslu öğrenciler öder (yıl = 40 gün)
  const ucretGelir = Math.round(gunlukUcretGeliri(state));
  if (ucretGelir > 0) earn(state, ucretGelir);

  // Aktif araştırma projelerinin günlük bütçesi
  let arastirmaButce = 0;
  for (const p of state.projects) arastirmaButce += p.gunlukButce ?? 0;

  // Kredi taksiti: borç bitene dek günlük kesinti
  let taksit = 0;
  if (state.krediBorcu > 0) {
    taksit = Math.min(state.krediBorcu, BALANCE.KREDI_TAKSIT);
    state.krediBorcu -= taksit;
    if (state.krediBorcu === 0) notify(state, '🏦 Kredi borcu kapandı!', 'iyi');
  }

  const toplam = maas + bakim + politikaGideri + mentorlukGider + malzeme + arastirmaButce + taksit;
  if (toplam <= 0) return;

  state.para -= toplam; // borca girebilir — spend kullanma

  if (state.gun % 5 === 0) {
    notify(state, `Günlük gider: ${formatMoney(toplam)} (maaş ${formatMoney(maas)}, bakım ${formatMoney(bakim)}${arastirmaButce > 0 ? `, araştırma ${formatMoney(arastirmaButce)}` : ''})`, 'bilgi');
  }
  if (state.para < 0) {
    addPrestij(state, -1);
    notify(state, '💸 Bütçe açığı! Prestij düşüyor.', 'kotu');
  }
}

/** Banka kredisi: tek kredi aynı anda; faizli geri ödeme günlük taksitle. */
export function krediCek(state: GameState, tutar: number): boolean {
  if (state.krediBorcu > 0) {
    notify(state, 'Zaten aktif bir kredin var — önce onu kapat.', 'kotu');
    return false;
  }
  earn(state, tutar);
  state.krediBorcu = Math.round(tutar * BALANCE.KREDI_FAIZ);
  notify(state, `🏦 ${formatMoney(tutar)} kredi çekildi — geri ödeme ${formatMoney(state.krediBorcu)} (günlük ${formatMoney(BALANCE.KREDI_TAKSIT)} taksit).`, 'bilgi');
  return true;
}
