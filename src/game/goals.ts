/**
 * Başarımlar — oyunun uzun vadeli hedef merdiveni.
 *
 * Her gün sonunda kontrol edilir; yeni tamamlanan başarım bildirim + ödülle
 * kutlanır ve state.basarimlar'a yazılır (bir kez kazanılır). Nihai hedef:
 * Türkiye Üniversite Sıralaması'nda 1 NUMARA olmak.
 */
import { GameState } from '../core/types';
import { formatMoney } from '../core/util';
import { oyuncuSirasi } from './rivals';
import { addPrestij, earn, notify } from './state';

export interface Basarim {
  id: string;
  ad: string;
  aciklama: string;
  /** ödül: prestij ve/veya para */
  prestij: number;
  para: number;
  kosul: (s: GameState) => boolean;
}

export const BASARIMLAR: Basarim[] = [
  {
    id: 'ilk_bolum', ad: 'Açılış Kurdelesi', aciklama: 'İlk bölümünü aç',
    prestij: 2, para: 0, kosul: (s) => s.departments.length >= 1,
  },
  {
    id: 'ilk_mezun', ad: 'İlk Diploma', aciklama: 'İlk öğrencini mezun et',
    prestij: 3, para: 25_000, kosul: (s) => s.toplamMezun >= 1,
  },
  {
    id: 'ilk_bulus', ad: 'Eureka!', aciklama: 'İlk çığır açan buluşu yap',
    prestij: 5, para: 0, kosul: (s) => s.publications.some((p) => p.cigirAcici),
  },
  {
    id: 'yuz_ogrenci', ad: 'Kalabalık Kampüs', aciklama: 'Aynı anda 100 öğrenciye ulaş',
    prestij: 5, para: 50_000,
    kosul: (s) => s.agents.filter((a) => a.kind === 'ogrenci').length >= 100,
  },
  {
    id: 'bes_bolum', ad: 'Çok Fakülteli', aciklama: '5 bölüm aç',
    prestij: 4, para: 0, kosul: (s) => s.departments.length >= 5,
  },
  {
    id: 'prestij_100', ad: 'Tanınan Üniversite', aciklama: '100 prestije ulaş',
    prestij: 0, para: 100_000, kosul: (s) => s.prestij >= 100,
  },
  {
    id: 'soyagaci', ad: 'Kendi Okulumuzun Çocuğu', aciklama: 'Kendi doktora mezununu kadroya kat',
    prestij: 4, para: 0,
    kosul: (s) => s.agents.some((a) => a.kind === 'akademisyen' && a.mezunumuz === true),
  },
  {
    id: 'zengin_ekosistem', ad: 'Girişim Vadisi', aciklama: 'Öğrenci sermayesi toplamı ₺1M olsun',
    prestij: 5, para: 0,
    kosul: (s) => s.agents.reduce((t, a) => t + (a.kind === 'ogrenci' ? a.sermaye : 0), 0) >= 1_000_000,
  },
  {
    id: 'yuz_mezun', ad: 'Mezun Ordusu', aciklama: 'Toplam 100 mezun ver',
    prestij: 8, para: 100_000, kosul: (s) => s.toplamMezun >= 100,
  },
  {
    id: 'top10', ad: 'İlk 10', aciklama: 'Türkiye sıralamasında ilk 10\'a gir',
    prestij: 5, para: 0, kosul: (s) => oyuncuSirasi(s) <= 10,
  },
  {
    id: 'top3', ad: 'Kürsü', aciklama: 'Türkiye sıralamasında ilk 3\'e gir',
    prestij: 10, para: 250_000, kosul: (s) => oyuncuSirasi(s) <= 3,
  },
  {
    id: 'bir_numara', ad: '👑 1 NUMARA', aciklama: 'Türkiye\'nin en iyi üniversitesi ol!',
    prestij: 25, para: 1_000_000, kosul: (s) => oyuncuSirasi(s) === 1,
  },
];

/** Gün sonunda çağrılır: yeni tamamlanan başarımları işler. */
export function kontrolBasarimlar(state: GameState): void {
  for (const b of BASARIMLAR) {
    if (state.basarimlar.includes(b.id)) continue;
    if (!b.kosul(state)) continue;
    state.basarimlar.push(b.id);
    if (b.prestij > 0) addPrestij(state, b.prestij);
    if (b.para > 0) earn(state, b.para);
    const odul = [
      b.prestij > 0 ? `+${b.prestij} prestij` : '',
      b.para > 0 ? formatMoney(b.para) : '',
    ].filter(Boolean).join(' · ');
    notify(state, `🏅 BAŞARIM: ${b.ad} — ${b.aciklama}!${odul ? ` (${odul})` : ''}`, 'odul');
  }
}
