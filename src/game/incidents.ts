/**
 * Harita üstü krizler — yangın ve salgın.
 *
 * YANGIN: aşırı yıpranmış bir eşya tutuşabilir; alev şiddetlenip komşu eşyalara
 * sıçrar, altındaki kareyi kavurur (kir + eşya hasarı) ve çevredekilerin
 * mutluluğunu düşürür. Yakında güvenlik/tamirci varsa VEYA yangın dolabı
 * bulunuyorsa hızla söner. Tamamen sönmezse büyür.
 *
 * SALGIN: dönemsel bulaşıcı hastalık; birkaç gün öğrenci enerjisini ve
 * mutluluğunu düşürür. Revir (varsa geçerli tuvalet/yemekhane fazlası değil,
 * doğrudan güvenlik personeli/temizlik) etkiyi azaltır.
 */
import { GameState, MAP_W, MAP_H, PlacedObject, Yangin, tileIndex } from '../core/types';
import { chance, randInt } from '../core/util';
import { BALANCE } from '../data/balance';
import { notify } from './state';

function komsuMesafe(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Gün sonu: uygun eşya varken düşük şansla yeni yangın çıkabilir. */
export function yanginTetikle(state: GameState): void {
  // zaten yangın varsa yenisini başlatma (kaosu sınırla)
  if (state.yanginlar.length > 0) return;
  const adaylar = state.objects.filter(
    (o) => (o.yipranma ?? 0) >= BALANCE.YANGIN_TUTUSMA_YIPRANMA
      && o.type !== 'jenerator' && o.type !== 'su_deposu',
  );
  if (adaylar.length === 0) return;
  if (!chance(state, BALANCE.YANGIN_GUNLUK_SANS)) return;
  const o = adaylar[randInt(state, 0, adaylar.length - 1)];
  state.yanginlar.push({ x: o.x, y: o.y, siddet: 30 });
  notify(state, `🔥 YANGIN! Yıpranmış bir eşya tutuştu (${Math.round(o.x)},${Math.round(o.y)}). Güvenlik/tamirci yakında değilse yayılır — yangın dolabı hayat kurtarır!`, 'kotu');
}

/**
 * Simülasyon adımında yangınları işler (dtMin dakika). Söndürme gücü: yakındaki
 * güvenlik/tamirci + yangın dolabı. Söndürme < büyüme ise şiddet artar ve sıçrar.
 */
export function yanginlariGuncelle(state: GameState, dtMin: number): void {
  if (state.yanginlar.length === 0) return;
  const kalan: Yangin[] = [];

  for (const y of state.yanginlar) {
    // söndürme gücü: 4 kare içindeki personel + yangın dolabı
    let sondurme = 0.4; // pasif (kendiliğinden zayıflama)
    for (const a of state.agents) {
      if (!a.onCampus) continue;
      if ((a.kind === 'guvenlik' || a.kind === 'tamirci') && komsuMesafe(a, y) <= 4) sondurme += 2.2;
    }
    for (const o of state.objects) {
      if (o.type === 'yangin_dolabi' && (o.yipranma ?? 0) < 100 && komsuMesafe(o, y) <= 6) sondurme += 1.6;
    }
    // büyüme: yakıt (yakındaki sağlam yanıcı eşya) varsa güçlenir
    let yakit = 0;
    for (const o of state.objects) {
      if (o.type === 'jenerator' || o.type === 'su_deposu' || o.type === 'yangin_dolabi') continue;
      if (komsuMesafe(o, y) <= 2) yakit += 0.5;
    }
    const buyume = 0.5 + Math.min(2, yakit);
    y.siddet += (buyume - sondurme) * dtMin * 0.5;

    // alev altındaki kareyi kavur + yakın eşyaları hasarla
    const idx = tileIndex(Math.round(y.x), Math.round(y.y));
    if (idx >= 0 && idx < state.dirt.length) state.dirt[idx] = Math.min(100, state.dirt[idx] + 0.6 * dtMin);
    for (const o of state.objects) {
      if (komsuMesafe(o, y) <= 1 && o.type !== 'jenerator' && o.type !== 'su_deposu') {
        o.yipranma = Math.min(130, (o.yipranma ?? 0) + 0.4 * dtMin);
      }
    }
    // yakındaki öğrencilerin morali düşer + panik (dağıl)
    for (const a of state.agents) {
      if (a.kind === 'ogrenci' && a.onCampus && komsuMesafe(a, y) <= 3) {
        a.mutluluk = Math.max(0, a.mutluluk - 0.3 * dtMin);
      }
    }

    if (y.siddet <= 0) {
      // söndü
      continue;
    }
    // sıçrama: şiddet yüksekken yakındaki sağlam eşyaya yeni yangın atla
    if (y.siddet > 70 && state.yanginlar.length + kalan.length < 5) {
      for (const o of state.objects) {
        if (komsuMesafe(o, y) <= 2 && komsuMesafe(o, y) >= 1
            && (o.yipranma ?? 0) < 100 && o.type !== 'jenerator' && o.type !== 'su_deposu'
            && !kalan.some((k) => k.x === o.x && k.y === o.y)) {
          kalan.push({ x: o.x, y: o.y, siddet: 25 });
          y.siddet = 55; // ana yangın biraz zayıflar (sıçradı)
          break;
        }
      }
    }
    y.siddet = Math.min(100, y.siddet);
    kalan.push(y);
  }

  const oncekiSayi = state.yanginlar.length;
  state.yanginlar = kalan;
  if (kalan.length === 0 && oncekiSayi > 0) {
    notify(state, '🧯 Yangın söndürüldü — kampüs güvende. Bozulan eşyaları tamir ettir.', 'iyi');
  }
}

/** Gün sonu: salgın ilerler / dönemsel yeni salgın çıkabilir. */
export function salginGunSonu(state: GameState): void {
  if (state.salgin) {
    state.salgin.kalanGun -= 1;
    // güvenlik/temizlik personeli salgını hafifletir (hijyen)
    const hijyen = state.agents.filter((a) => a.kind === 'temizlikci' || a.kind === 'guvenlik').length;
    const dus = Math.max(1, state.salgin.siddet - Math.min(2, hijyen * 0.5));
    for (const a of state.agents) {
      if (a.kind === 'ogrenci') {
        a.mutluluk = Math.max(0, a.mutluluk - dus);
        a.needs.enerji = Math.min(100, a.needs.enerji + dus * 2);
      }
    }
    if (state.salgin.kalanGun <= 0) {
      notify(state, `🩹 ${state.salgin.ad} salgını sona erdi — kampüs iyileşiyor.`, 'iyi');
      state.salgin = null;
    }
    return;
  }
  // yeni salgın: kalabalık kampüste seyrek (yılda ~1)
  const ogrenci = state.agents.filter((a) => a.kind === 'ogrenci').length;
  if (ogrenci < 30) return;
  if (!chance(state, 0.012)) return;
  const adlar = ['Grip', 'Soğuk Algınlığı', 'Boğaz Enfeksiyonu', 'Mevsimsel Viroz'];
  const ad = adlar[randInt(state, 0, adlar.length - 1)];
  state.salgin = { ad, kalanGun: randInt(state, 3, 6), siddet: randInt(state, 2, 4) };
  notify(state, `🤒 ${ad} SALGINI! Kampüste hastalık yayılıyor — birkaç gün enerji ve moral düşecek. Temizlikçi/güvenlik hijyeni artırır.`, 'kotu');
}
