/**
 * YÖK Akreditasyon Denetimi — 2 yılda bir (80 gün) kalite karnesi.
 *
 * Karne 6 kriterden 100 puan üretir; denetim sonucu:
 *  - ≥ 70 GEÇTİ: prestij ödülü
 *  - 45-69 KOŞULLU: küçük prestij kaybı, uyarı
 *  - < 45 KALDI: büyük prestij kaybı + tüm bölümlerde kontenjan kesintisi (×0.8)
 * Karne CANLI olarak Raporlar panelinde görünür — oyuncu denetime hazırlanabilir.
 */
import { Academic, GameState, Student } from '../core/types';
import { validRooms } from '../core/grid';
import { BALANCE } from '../data/balance';
import { gnoHesapla } from './agents';
import { dersYukuVerimi } from './schedule';
import { toplamKoleksiyon } from './library';
import { cazibePuani } from './campus';
import { addPrestij, notify } from './state';

/** İki yılda bir: 80. gün, 160. gün... (yıl = 40 gün) */
export const DENETIM_ARALIK = 80;

/** Denetim, 3. yıldan itibaren her 2 yılın başında yapılır (gün 81, 161, ...). */
export function sonrakiDenetimGunu(state: GameState): number {
  return 81 + Math.floor((state.gun - 1) / DENETIM_ARALIK) * DENETIM_ARALIK;
}

export interface DenetimKriter {
  ad: string;
  puan: number;
  max: number;
  detay: string;
}

/** Canlı karne — denetimde de, Raporlar panelinde de aynı hesap kullanılır. */
export function denetimKarnesi(state: GameState): DenetimKriter[] {
  const ogrenciler: Student[] = [];
  const hocalar: Academic[] = [];
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') ogrenciler.push(a);
    else if (a.kind === 'akademisyen') hocalar.push(a);
  }

  // 1) Öğrenci / öğretim üyesi oranı (25p) — YÖK ideali ≤ 20
  const oran = hocalar.length > 0 ? ogrenciler.length / hocalar.length : 99;
  const oranPuan = ogrenciler.length === 0 ? 15 : oran <= 20 ? 25 : oran <= 30 ? 14 : oran <= 45 ? 6 : 0;

  // 2) Eğitim kalitesi: ortalama GNO (25p)
  let gnoToplam = 0, gnoSayi = 0;
  for (const s of ogrenciler) {
    const g = gnoHesapla(s);
    if (g !== null) { gnoToplam += g; gnoSayi++; }
  }
  const ortGno = gnoSayi > 0 ? gnoToplam / gnoSayi : null;
  const gnoPuan = ortGno === null ? 13 : ortGno >= 2.4 ? 25 : ortGno >= 2.0 ? 16 : ortGno >= 1.6 ? 8 : 0;

  // 3) Ders yükü sağlığı (15p) — aşırı yüklü kadro kaliteyi düşürür
  let yukToplam = 0;
  for (const h of hocalar) yukToplam += dersYukuVerimi(state, h);
  const ortYuk = hocalar.length > 0 ? yukToplam / hocalar.length : 0;
  const yukPuan = hocalar.length === 0 ? 0 : ortYuk >= 0.85 ? 15 : ortYuk >= 0.7 ? 8 : 3;

  // 4) Kütüphane kaynakları (15p) — bölüm başına koleksiyon
  const koleksiyon = toplamKoleksiyon(state);
  const bolum = Math.max(1, state.departments.length);
  const kutPuan = koleksiyon >= bolum * 2 ? 15 : koleksiyon >= bolum ? 8 : koleksiyon > 0 ? 4 : 0;

  // 5) Kampüs düzeni (10p): geçersiz oda yok (5) + kimse aç kalmadı (5)
  const gecersiz = state.rooms.filter((r) => !r.valid).length;
  const duzenPuan = (gecersiz === 0 ? 5 : gecersiz <= 2 ? 2 : 0) + (state.dunAcKalan === 0 ? 5 : 0);

  // 6) Kampüs yaşamı (10p): cazibe puanı
  const cazibe = cazibePuani(state);
  const cazibePuan = cazibe >= 40 ? 10 : cazibe >= 20 ? 5 : 0;

  return [
    { ad: '👩‍🏫 Öğrenci/öğretim üyesi oranı', puan: oranPuan, max: 25, detay: hocalar.length === 0 ? 'hoca yok' : `${oran.toFixed(1)} öğrenci/hoca (ideal ≤ 20)` },
    { ad: '📖 Eğitim kalitesi (ort. GNO)', puan: gnoPuan, max: 25, detay: ortGno === null ? 'henüz veri yok' : `${ortGno.toFixed(2)} / 4.00 (hedef ≥ 2.40)` },
    { ad: '⚡ Ders yükü sağlığı', puan: yukPuan, max: 15, detay: `ortalama verim %${Math.round(ortYuk * 100)} (hedef ≥ %85 — asistan ata)` },
    { ad: '📚 Kütüphane kaynakları', puan: kutPuan, max: 15, detay: `${koleksiyon} koleksiyon / ${state.departments.length} bölüm (hedef ≥ 2×bölüm)` },
    { ad: '🏫 Kampüs düzeni', puan: duzenPuan, max: 10, detay: `${gecersiz} geçersiz oda · dün aç kalan: ${state.dunAcKalan}` },
    { ad: '✨ Kampüs yaşamı', puan: cazibePuan, max: 10, detay: `cazibe ${cazibe}/100 (hedef ≥ 40)` },
  ];
}

export function denetimPuani(state: GameState): number {
  return denetimKarnesi(state).reduce((t, k) => t + k.puan, 0);
}

/** Denetimi uygular — game.ts yıl dönümünde (2 yılda bir) çağırır. */
export function denetimUygula(state: GameState): void {
  const puan = denetimPuani(state);
  if (puan >= BALANCE.DENETIM_GECME) {
    addPrestij(state, BALANCE.DENETIM_ODUL_PRESTIJ);
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'GEÇTİ' };
    notify(state, `🏛️ YÖK AKREDİTASYON DENETİMİ: ${puan}/100 — GEÇTİN! Kalite belgesi yenilendi (+${BALANCE.DENETIM_ODUL_PRESTIJ} prestij).`, 'odul');
  } else if (puan >= BALANCE.DENETIM_KOSULLU) {
    addPrestij(state, -5);
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'KOŞULLU' };
    notify(state, `🏛️ YÖK DENETİMİ: ${puan}/100 — KOŞULLU geçtin (-5 prestij). Karneyi Raporlar'dan incele, ${DENETIM_ARALIK} gün sonra tekrar gelecekler!`, 'kotu');
  } else {
    addPrestij(state, -15);
    for (const d of state.departments) {
      d.kontenjan = Math.max(5, Math.round(d.kontenjan * 0.8));
    }
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'KALDI' };
    notify(state, `🏛️ YÖK DENETİMİ FELAKETİ: ${puan}/100 — KALDIN! Prestij -15 ve TÜM bölümlerde kontenjan %20 kesildi. Karneye bak, toparlan!`, 'kotu');
  }
}
