/**
 * Makro ekonomi ve prestij kampanyaları.
 *
 * MAKRO: yıl dönümünde ülke ekonomisi değişebilir — enflasyon giderleri
 * şişirir, teşvik paketi gelirleri artırır, kriz her ikisini vurur. Durum
 * birkaç yıl sürer ve dailyEconomy'de gider/gelir çarpanı olarak uygulanır.
 *
 * PRESTİJ KAMPANYALARI: 1 numara olduktan sonra prestij "atıl" kalmasın —
 * prestij harcayarak somut avantaj alınır (talep, moral, rakip zayıflatma).
 * Geç oyun için prestij gideri (sink).
 */
import { GameState, MakroDurum } from '../core/types';
import { chance, randInt } from '../core/util';
import { addPrestij, notify, talepCarp } from './state';

const MAKRO_OLAYLAR: Omit<MakroDurum, 'kalanYil'>[] = [
  { ad: 'Yüksek Enflasyon', emoji: '📈', giderCarpan: 1.25, gelirCarpan: 1.08 },
  { ad: 'Ekonomik Durgunluk', emoji: '📉', giderCarpan: 1.1, gelirCarpan: 0.85 },
  { ad: 'Devlet Teşvik Paketi', emoji: '🎁', giderCarpan: 0.95, gelirCarpan: 1.2 },
  { ad: 'Bütçe Kesintisi', emoji: '✂️', giderCarpan: 1.0, gelirCarpan: 0.8 },
  { ad: 'Ekonomik Canlanma', emoji: '🚀', giderCarpan: 1.0, gelirCarpan: 1.15 },
];

/** Yıl dönümünde çağrılır: mevcut durum sayar, yenisi başlayabilir. */
export function makroGunGuncelle(state: GameState): void {
  if (state.makro) {
    state.makro.kalanYil -= 1;
    if (state.makro.kalanYil <= 0) {
      notify(state, `${state.makro.emoji} "${state.makro.ad}" dönemi sona erdi — ekonomi normale döndü.`, 'bilgi');
      state.makro = null;
    }
    return;
  }
  // yeni makro olay: her yıl ~%35 şans
  if (!chance(state, 0.35)) return;
  const secilen = MAKRO_OLAYLAR[randInt(state, 0, MAKRO_OLAYLAR.length - 1)];
  const kalanYil = randInt(state, 2, 3);
  state.makro = { ...secilen, kalanYil };
  const giderYuzde = Math.round((secilen.giderCarpan - 1) * 100);
  const gelirYuzde = Math.round((secilen.gelirCarpan - 1) * 100);
  notify(state,
    `${secilen.emoji} MAKRO EKONOMİ: "${secilen.ad}" başladı (${kalanYil} yıl) — giderler ${giderYuzde >= 0 ? '+' : ''}%${giderYuzde}, gelirler ${gelirYuzde >= 0 ? '+' : ''}%${gelirYuzde}.`,
    secilen.gelirCarpan < 1 || secilen.giderCarpan > 1.1 ? 'kotu' : 'iyi');
}

export function makroGiderCarpan(state: GameState): number {
  return state.makro?.giderCarpan ?? 1;
}

export function makroGelirCarpan(state: GameState): number {
  return state.makro?.gelirCarpan ?? 1;
}

// --- Prestij kampanyaları -----------------------------------------------------

export interface PrestijKampanya {
  id: string;
  ad: string;
  emoji: string;
  prestijMaliyet: number;
  bekleme: number; // gün cinsinden yeniden kullanım süresi
  aciklama: string;
  uygula: (s: GameState) => string;
}

export const PRESTIJ_KAMPANYALARI: PrestijKampanya[] = [
  {
    id: 'ulusal-reklam',
    ad: 'Ulusal Reklam Kampanyası',
    emoji: '📣',
    prestijMaliyet: 40,
    bekleme: 40,
    aciklama: 'Prestijini tanıtıma çevir: bir sonraki YKS talebi ×1.3',
    uygula: (s) => { talepCarp(s, 1.3); return 'Ülke çapında reklam kuşatması — bir sonraki YKS talebi ×1.3!'; },
  },
  {
    id: 'onur-toreni',
    ad: 'Büyük Onur Töreni',
    emoji: '🏅',
    prestijMaliyet: 25,
    bekleme: 30,
    aciklama: 'Kadroyu onurlandır: tüm akademisyen morali +15',
    uygula: (s) => {
      for (const a of s.agents) if (a.kind === 'akademisyen') a.memnuniyet = Math.min(100, a.memnuniyet + 15);
      return 'Görkemli onur töreni — kadro gururlandı, moral +15!';
    },
  },
  {
    id: 'sanayi-isbirligi',
    ad: 'Sanayi İşbirliği Zirvesi',
    emoji: '🤝',
    prestijMaliyet: 50,
    bekleme: 50,
    aciklama: 'İtibarını nakde çevir: ₺600.000 sponsorluk geliri',
    uygula: (s) => { s.para += 600000; return 'Holdingler sıraya girdi — ₺600.000 sponsorluk kasada!'; },
  },
  {
    id: 'yildiz-transfer',
    ad: 'Yıldız Akademisyen Avı',
    emoji: '🌟',
    prestijMaliyet: 35,
    bekleme: 60,
    aciklama: 'Cazibeni kullan: en güçlü rakibin prestiji -15 (transferle zayıflar)',
    uygula: (s) => {
      const hedef = [...s.rakipler].sort((a, b) => b.prestij - a.prestij)[0];
      if (hedef) { hedef.prestij = Math.max(30, hedef.prestij - 15); return `${hedef.ad}'den yıldız hocalar bize aktı — rakip prestiji -15!`; }
      return 'Rakip bulunamadı.';
    },
  },
];

export function prestijKampanyaDef(id: string): PrestijKampanya | undefined {
  return PRESTIJ_KAMPANYALARI.find((k) => k.id === id);
}

/** Kampanyanın şu an kullanılabilir olup olmadığı (prestij + bekleme). */
export function kampanyaDurum(state: GameState, k: PrestijKampanya): { ok: boolean; neden: string } {
  if (state.prestij < k.prestijMaliyet) {
    return { ok: false, neden: `${k.prestijMaliyet} prestij gerekli (şu an ${Math.round(state.prestij)})` };
  }
  const son = state.prestijKampanya[k.id];
  if (son !== undefined && state.gun - son < k.bekleme) {
    return { ok: false, neden: `${k.bekleme - (state.gun - son)} gün sonra tekrar kullanılabilir` };
  }
  return { ok: true, neden: '' };
}

export function prestijKampanyaKullan(state: GameState, id: string): boolean {
  const k = prestijKampanyaDef(id);
  if (!k) return false;
  const durum = kampanyaDurum(state, k);
  if (!durum.ok) { notify(state, `${k.ad}: ${durum.neden}.`, 'kotu'); return false; }
  addPrestij(state, -k.prestijMaliyet);
  state.prestijKampanya[k.id] = state.gun;
  const sonuc = k.uygula(state);
  notify(state, `${k.emoji} ${k.ad}: ${sonuc}`, 'odul');
  return true;
}
