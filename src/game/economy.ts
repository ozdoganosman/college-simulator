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

export function dailyEconomy(state: GameState): void {
  // TODO(workflow)
  void state;
}
