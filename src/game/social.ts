/**
 * Öğrenci sosyal ağı — arkadaşlıklar.
 *
 * Kişilikler zaten var; üstüne hafif bir arkadaşlık katmanı oturur. Arkadaşı
 * olmayan öğrenciler (öncelik: aynı bölüm + benzer kişilik) eşleşir. Arkadaşı
 * kampüste olan öğrenci daha mutludur; arkadaşı mezun olunca kısa süreli
 * moral kaybı yaşar. Kişi kartında "yakın arkadaş" görünür.
 */
import { GameState, Student } from '../core/types';
import { chance } from '../core/util';

function ogrenciler(state: GameState): Student[] {
  return state.agents.filter((a): a is Student => a.kind === 'ogrenci');
}

/** Gün sonu: yeni arkadaşlıklar kurulur, arkadaşlık morali işlenir. */
export function sosyalGunSonu(state: GameState): void {
  const hepsi = ogrenciler(state);
  const idVar = new Set(hepsi.map((s) => s.id));

  // kopan bağları temizle (arkadaşı mezun olmuş/ayrılmışsa) + moral etkisi
  for (const s of hepsi) {
    if ((s.arkadas ?? -1) !== -1 && !idVar.has(s.arkadas!)) {
      s.arkadas = -1;
      s.mutluluk = Math.max(0, s.mutluluk - 3); // arkadaşı gitti
    }
  }

  // arkadaşı olan çiftlere günlük moral bonusu (ikisi de okuyorsa)
  for (const s of hepsi) {
    if ((s.arkadas ?? -1) === -1) continue;
    const dost = hepsi.find((x) => x.id === s.arkadas);
    if (dost) {
      s.mutluluk = Math.min(100, s.mutluluk + 0.4);
      // sosyal kişilik arkadaşlıktan daha çok beslenir
      if (s.kisilik === 'sosyal') s.mutluluk = Math.min(100, s.mutluluk + 0.3);
    }
  }

  // yeni eşleşme: arkadaşsızları eşleştir (aynı bölüm + benzer kişilik öncelikli)
  const yalniz = hepsi.filter((s) => (s.arkadas ?? -1) === -1);
  for (const s of yalniz) {
    if ((s.arkadas ?? -1) !== -1) continue; // bu turda eşleşmiş olabilir
    if (!chance(state, 0.35)) continue; // her gün herkes eşleşmez
    let enIyi: Student | null = null;
    let enPuan = -1;
    for (const aday of yalniz) {
      if (aday.id === s.id || (aday.arkadas ?? -1) !== -1) continue;
      let puan = 1;
      if (aday.deptId === s.deptId) puan += 2;
      if (aday.kisilik === s.kisilik) puan += 2;
      if (puan > enPuan) { enPuan = puan; enIyi = aday; }
    }
    if (enIyi) {
      s.arkadas = enIyi.id;
      enIyi.arkadas = s.id;
    }
  }
}

/** Öğrencinin yakın arkadaşının adı (kart için); yoksa null. */
export function arkadasAdi(state: GameState, s: Student): string | null {
  if ((s.arkadas ?? -1) === -1) return null;
  const dost = state.agents.find((a) => a.id === s.arkadas && a.kind === 'ogrenci');
  return dost ? dost.ad : null;
}
