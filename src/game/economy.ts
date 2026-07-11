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
import { addPrestij, earn, notify } from './state';

/**
 * Öğrencinin günlük girişim geliri ₺ — nitelikleri geliştikçe büyür.
 * Pratik ve influencer en kazançlı; akademik alanlar da katkı verir.
 */
export function ogrenciGunlukKazanc(state: GameState, s: Student): number {
  const n = s.nitelik;
  let kazanc = n.pratik * 6 + n.influencer * 5 + (n.muhendis + n.artist + n.filozof) * 2;
  if (state.strategies.includes('teknokent')) kazanc *= 1.5;
  return Math.round(kazanc);
}

export function dailyEconomy(state: GameState): void {
  const tesvik = state.strategies.includes('tesvik');

  let maas = 0;
  for (const a of state.agents) {
    if (a.kind === 'akademisyen') maas += a.maas * (tesvik ? 1.10 : 1);
    else if (a.kind === 'asci' || a.kind === 'temizlikci') maas += a.maas;
    else if (a.kind === 'ogrenci' && a.asistani !== -1) maas += BALANCE.ASISTAN_MAAS;
  }
  maas = Math.round(maas);

  let doseliKare = 0;
  for (const f of state.floor) if (f !== null) doseliKare++;
  const bakim = doseliKare * BALANCE.BAKIM_GIDERI_TILE;

  const subvansiyon = state.strategies.includes('yemek_subvansiyon') ? 2000 : 0;

  // Girişim ekosistemi: nitelikli öğrenciler gelir üretir — okul kuluçka payı
  // alır, kalanı öğrencinin sermayesine eklenir (mezuniyette bağışa dönüşür).
  let okulPayi = 0;
  let toplamSermaye = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
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

  const toplam = maas + bakim + subvansiyon;
  if (toplam <= 0) return;

  state.para -= toplam; // borca girebilir — spend kullanma

  if (state.gun % 5 === 0) {
    notify(state, `Günlük gider: ${formatMoney(toplam)} (maaş ${formatMoney(maas)}, bakım ${formatMoney(bakim)})`, 'bilgi');
  }
  if (state.para < 0) {
    addPrestij(state, -1);
    notify(state, '💸 Bütçe açığı! Prestij düşüyor.', 'kotu');
  }
}
