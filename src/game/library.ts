/**
 * Kütüphane kitap koleksiyonları.
 *
 * Her alan (🔬🎨📜💼) için ayrı koleksiyon seviyesi (0-KITAP_MAX) satın alınır.
 * Kütüphanede çalışan öğrencinin hızını bölümünün alanındaki koleksiyon belirler:
 * kitap yoksa yavaş (TABAN), koleksiyon büyüdükçe hızlanır (seviye × BONUS).
 * Koleksiyonlar rafa sığmalıdır: her seviye RAF_PER_SEVIYE kitaplık ister —
 * daha çok koleksiyon için daha büyük kütüphane kur.
 */
import { ALAN_META, Alan, GameState } from '../core/types';
import { formatMoney } from '../core/util';
import { validRooms } from '../core/grid';
import { BALANCE } from '../data/balance';
import { notify, spend } from './state';

export const KITAP_MAX = 4;
export const RAF_PER_SEVIYE = 3;

/** Geçerli kütüphanelerdeki toplam kitaplık (raf) sayısı. */
export function kitaplikSayisi(state: GameState): number {
  const odalar = new Set(validRooms(state, 'kutuphane').map((r) => r.id));
  let n = 0;
  for (const o of state.objects) {
    if (o.type === 'kitaplik' && odalar.has(o.roomId)) n++;
  }
  return n;
}

/** Raf kapasitesi: kaç koleksiyon seviyesi barındırılabilir. */
export function koleksiyonKapasitesi(state: GameState): number {
  return Math.floor(kitaplikSayisi(state) / RAF_PER_SEVIYE);
}

/** Satın alınmış toplam koleksiyon seviyesi. */
export function toplamKoleksiyon(state: GameState): number {
  let n = 0;
  for (const alan of Object.keys(state.kitapKoleksiyon) as Alan[]) {
    n += state.kitapKoleksiyon[alan];
  }
  return n;
}

/** Kütüphane çalışma hızı çarpanı — alanın kitap koleksiyonuna göre. */
export function kitapCarpani(state: GameState, alan: Alan): number {
  return BALANCE.KUTUPHANE_CALISMA_TABAN
    + BALANCE.KITAP_CALISMA_BONUS * (state.kitapKoleksiyon[alan] ?? 0);
}

/** Alan koleksiyonunu bir seviye yükseltir (raf + bütçe kontrolüyle). */
export function kitapAl(state: GameState, alan: Alan): boolean {
  const seviye = state.kitapKoleksiyon[alan] ?? 0;
  if (seviye >= KITAP_MAX) return false;
  if (toplamKoleksiyon(state) + 1 > koleksiyonKapasitesi(state)) {
    notify(state, `Raf yetersiz — her koleksiyon seviyesi ${RAF_PER_SEVIYE} kitaplık ister. Kütüphaneye kitaplık ekle.`, 'kotu');
    return false;
  }
  const maliyet = BALANCE.KITAP_MALIYET[seviye];
  if (!spend(state, maliyet, `${ALAN_META[alan].ad} kitap koleksiyonu`)) return false;
  state.kitapKoleksiyon[alan] = seviye + 1;
  notify(
    state,
    `📚 ${ALAN_META[alan].emoji} ${ALAN_META[alan].ad} koleksiyonu seviye ${seviye + 1} oldu (${formatMoney(maliyet)}) — bu alanda kütüphane çalışması %${Math.round(kitapCarpani(state, alan) * 100)} hıza çıktı.`,
    'iyi',
  );
  return true;
}
