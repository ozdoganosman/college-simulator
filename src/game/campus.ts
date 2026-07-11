/**
 * Kampüs cazibesi: barınma (yurt) + ulaştırma (servis) + faaliyet çeşitliliği.
 *
 * Cazibe puanı (0-100) YKS talebini artırır ve raporlarda/HUD'da izlenir.
 * - Yurt: ranza başına 2 öğrenci gece kampüste kalır (görünür gece yaşamı),
 *   derse erken ve tok gelir.
 * - Servis durağı: sabah kampüse geliş hızlanır (durak başına), talep artar.
 * - Faaliyet çeşitliliği: kantin, bank, basket, satranç, sahne... tür çeşitliliği
 *   ve adedi puan üretir; öğrenciler boş vakitte oralarda takılıp nitelik geliştirir.
 */
import { GameState } from '../core/types';
import { validRooms } from '../core/grid';

/** Geçerli yurtlardaki barınma kapasitesi (ranza × 2). */
export function yurtKapasitesi(state: GameState): number {
  const odalar = new Set(validRooms(state, 'yurt').map((r) => r.id));
  if (odalar.size === 0) return 0;
  let ranza = 0;
  for (const o of state.objects) {
    if (o.type === 'ranza' && odalar.has(o.roomId) && (o.yipranma ?? 0) < 100) ranza++;
  }
  return ranza * 2;
}

/** Ulaşım seviyesi: servis durağı sayısı (0-5 etkili). */
export function ulasimSeviyesi(state: GameState): number {
  let n = 0;
  for (const o of state.objects) if (o.type === 'servis_duragi') n++;
  return Math.min(5, n);
}

/**
 * Faaliyet çeşitliliği (0-100): kampüste kaç FARKLI sosyal imkân var (tür başına
 * 12 puan) + bolluk bonusu (tür başına adet, en çok 4 puan).
 */
export function faaliyetPuani(state: GameState): number {
  const sosyalTurler = ['bank', 'otomat', 'basket_potasi', 'satranc_masasi', 'muzik_sahnesi'] as const;
  const adet = new Map<string, number>();
  for (const o of state.objects) {
    if ((o.yipranma ?? 0) >= 100) continue; // bozuk eşya kampüs yaşamına katkı vermez
    if ((sosyalTurler as readonly string[]).includes(o.type)) {
      adet.set(o.type, (adet.get(o.type) ?? 0) + 1);
    }
  }
  let puan = 0;
  for (const tur of sosyalTurler) {
    const n = adet.get(tur) ?? 0;
    if (n > 0) puan += 12 + Math.min(4, n);
  }
  if (validRooms(state, 'kantin').length > 0) puan += 10;
  if (validRooms(state, 'yemekhane').length > 0) puan += 5;
  if (validRooms(state, 'kutuphane').length > 0) puan += 5;
  return Math.min(100, puan);
}

/**
 * Kampüs estetiği (0-100): dekor objeleri (çiçek tarhı, fidan, heykel, süs
 * havuzu) — tür çeşitliliği 15 puan + adet bonusu. Bozuk dekor sayılmaz.
 */
export function estetikPuani(state: GameState): number {
  const dekorTurler = ['cicek_tarhi', 'fidan', 'heykel', 'sus_havuzu'] as const;
  const adet = new Map<string, number>();
  for (const o of state.objects) {
    if ((o.yipranma ?? 0) >= 100) continue;
    if ((dekorTurler as readonly string[]).includes(o.type)) {
      adet.set(o.type, (adet.get(o.type) ?? 0) + 1);
    }
  }
  let puan = 0;
  for (const tur of dekorTurler) {
    const n = adet.get(tur) ?? 0;
    if (n > 0) puan += 15 + Math.min(10, n * 2);
  }
  return Math.min(100, puan);
}

/**
 * Kampüs cazibesi (0-100): faaliyet %40 + barınma %25 + estetik %20 + ulaşım %15.
 * Barınma puanı öğrenci sayısına göre doluluk hedefiyle ölçülür
 * (öğrenci yoksa kapasitenin kendisi küçük puan verir).
 */
export function cazibePuani(state: GameState): number {
  const faaliyet = faaliyetPuani(state);
  const kapasite = yurtKapasitesi(state);
  const ogrenci = state.agents.filter((a) => a.kind === 'ogrenci').length;
  const barinma = ogrenci > 0
    ? Math.min(100, (100 * kapasite) / Math.max(1, ogrenci * 0.5)) // yarısını barındır = tam puan
    : Math.min(100, kapasite * 3);
  const ulasim = ulasimSeviyesi(state) * 20;
  return Math.round(faaliyet * 0.4 + barinma * 0.25 + estetikPuani(state) * 0.2 + ulasim * 0.15);
}
