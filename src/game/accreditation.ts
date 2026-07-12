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
  /** tıklanınca açılacak panel — kriteri düzeltmenin yolu */
  panel?: string;
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

  // 5) Kampüs düzeni (10p): geçersiz oda yok (5) + açlık ORTALAMASI (5) —
  // tek şanslı/şanssız günün karneyi belirlemesine son: dönem ortalaması esas
  const izleme = state.denetimIzleme ?? { ac: 0, cazibe: 0, gun: 0 };
  const ortAc = izleme.gun > 0 ? izleme.ac / izleme.gun : state.dunAcKalan;
  const gecersiz = state.rooms.filter((r) => !r.valid && (r.insaat ?? 0) <= 0).length;
  const duzenPuan = (gecersiz === 0 ? 5 : gecersiz <= 2 ? 2 : 0) + (ortAc < 0.5 ? 5 : ortAc < 3 ? 2 : 0);

  // 6) Kampüs yaşamı (10p): cazibe ORTALAMASI
  const cazibe = izleme.gun > 0 ? Math.round(izleme.cazibe / izleme.gun) : cazibePuani(state);
  const cazibePuan = cazibe >= 40 ? 10 : cazibe >= 20 ? 5 : 0;

  return [
    { ad: '👩‍🏫 Öğrenci/öğretim üyesi oranı', puan: oranPuan, max: 25, detay: hocalar.length === 0 ? 'hoca yok' : `${oran.toFixed(1)} öğrenci/hoca (ideal ≤ 20)`, panel: 'kadro' },
    { ad: '📖 Eğitim kalitesi (ort. GNO)', puan: gnoPuan, max: 25, detay: ortGno === null ? 'henüz veri yok' : `${ortGno.toFixed(2)} / 4.00 (hedef ≥ 2.40)`, panel: 'program' },
    { ad: '⚡ Ders yükü sağlığı', puan: yukPuan, max: 15, detay: `ortalama verim %${Math.round(ortYuk * 100)} (hedef ≥ %85 — asistan ata)`, panel: 'program' },
    { ad: '📚 Kütüphane kaynakları', puan: kutPuan, max: 15, detay: `${koleksiyon} koleksiyon / ${state.departments.length} bölüm (hedef ≥ 2×bölüm)`, panel: 'kutuphane' },
    { ad: '🏫 Kampüs düzeni', puan: duzenPuan, max: 10, detay: `${gecersiz} geçersiz oda · dün aç kalan: ${state.dunAcKalan}` },
    { ad: '✨ Kampüs yaşamı', puan: cazibePuan, max: 10, detay: `cazibe ${cazibe}/100 (hedef ≥ 40)` },
  ];
}

export function denetimPuani(state: GameState): number {
  return denetimKarnesi(state).reduce((t, k) => t + k.puan, 0);
}

/**
 * Denetimi uygular — game.ts yıl dönümünde (2 yılda bir) çağırır.
 * takip=true: KALDI sonrası 20 gün içinde gelen TAKİP denetimi.
 * Üst üste 2. KALDI'da YÖK en zayıf bölümü kapatmaya zorlar.
 */
export function denetimUygula(state: GameState, takip = false): void {
  const puan = denetimPuani(state);
  const on = takip ? '🏛️ YÖK TAKİP DENETİMİ' : '🏛️ YÖK AKREDİTASYON DENETİMİ';
  if (puan >= BALANCE.DENETIM_GECME) {
    addPrestij(state, BALANCE.DENETIM_ODUL_PRESTIJ);
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'GEÇTİ' };
    state.ustUsteKaldi = 0;
    state.takipDenetimGunu = null;
    notify(state, `${on}: ${puan}/100 — GEÇTİN! Kalite belgesi yenilendi (+${BALANCE.DENETIM_ODUL_PRESTIJ} prestij).`, 'odul');
  } else if (puan >= BALANCE.DENETIM_KOSULLU) {
    addPrestij(state, -5);
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'KOŞULLU' };
    state.ustUsteKaldi = 0;
    state.takipDenetimGunu = null;
    notify(state, `${on}: ${puan}/100 — KOŞULLU geçtin (-5 prestij). Karneyi Raporlar'dan incele, tekrar gelecekler!`, 'kotu');
  } else {
    state.ustUsteKaldi = (state.ustUsteKaldi ?? 0) + 1;
    state.sonDenetim = { gun: state.gun, puan, sonuc: 'KALDI' };
    if (state.ustUsteKaldi >= 2) {
      // ikinci kez KALDI: ağır yaptırım — en az öğrencili bölüm kapatılır
      addPrestij(state, -25);
      for (const d of state.departments) d.kontenjan = Math.max(5, Math.round(d.kontenjan * 0.7));
      const sayilar = new Map<number, number>();
      for (const a of state.agents) {
        if (a.kind === 'ogrenci') sayilar.set(a.deptId, (sayilar.get(a.deptId) ?? 0) + 1);
      }
      const kurban = [...state.departments].filter((d) => !d.kapaniyor)
        .sort((a, b) => (sayilar.get(a.id) ?? 0) - (sayilar.get(b.id) ?? 0))[0];
      if (kurban) {
        kurban.kapaniyor = true;
        notify(state, `${on}: ${puan}/100 — İKİNCİ KEZ KALDIN! YÖK insafsız: prestij -25, kontenjanlar %30 kesildi ve en zayıf bölümün (öğrenci alımı durduruldu) KAPATILIYOR.`, 'kotu');
      } else {
        notify(state, `${on}: ${puan}/100 — İKİNCİ KEZ KALDIN! Prestij -25, kontenjanlar %30 kesildi.`, 'kotu');
      }
      state.takipDenetimGunu = null;
      state.ustUsteKaldi = 0; // ceza kesildi, sayaç başa
    } else {
      addPrestij(state, -15);
      for (const d of state.departments) d.kontenjan = Math.max(5, Math.round(d.kontenjan * 0.8));
      state.takipDenetimGunu = state.gun + 20;
      notify(state, `${on} FELAKETİ: ${puan}/100 — KALDIN! Prestij -15, kontenjanlar %20 kesildi. 20 GÜN SONRA TAKİP DENETİMİ var — yine kalırsan bölüm kapatırlar!`, 'kotu');
    }
  }
  // yeni gözlem dönemi: ortalamalar sıfırdan birikmeye başlar
  state.denetimIzleme = { ac: 0, cazibe: 0, gun: 0 };
}
