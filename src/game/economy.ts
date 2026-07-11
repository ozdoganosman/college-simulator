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
import { GameState } from '../core/types';
import { formatMoney } from '../core/util';
import { BALANCE } from '../data/balance';
import { addPrestij, notify } from './state';

export function dailyEconomy(state: GameState): void {
  const tesvik = state.strategies.includes('tesvik');

  let maas = 0;
  for (const a of state.agents) {
    if (a.kind === 'akademisyen') maas += a.maas * (tesvik ? 1.10 : 1);
    else if (a.kind === 'asci' || a.kind === 'temizlikci') maas += a.maas;
  }
  maas = Math.round(maas);

  let doseliKare = 0;
  for (const f of state.floor) if (f !== null) doseliKare++;
  const bakim = doseliKare * BALANCE.BAKIM_GIDERI_TILE;

  const subvansiyon = state.strategies.includes('yemek_subvansiyon') ? 2000 : 0;

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
