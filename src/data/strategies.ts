import type { StrategyDef, Vizyon } from '../core/types';

/**
 * Strateji geliştirme ağacı. Rektörlük odası (geçerli) olmadan satın alınamaz.
 * Etkiler ilgili sistemlerde state.strategies.includes(id) ile okunur.
 */
export const STRATEGY_DEFS: StrategyDef[] = [
  {
    id: 'tanitim', ad: 'Tanıtım Kampanyası',
    aciklama: 'Üniversitenin tercih edilme oranı +%25.',
    maliyet: 100000, gunlukGider: 2500, prestijGereksinimi: 0, onkosul: [],
  },
  {
    id: 'tubitak', ad: 'TÜBİTAK İş Birliği',
    aciklama: 'Araştırma projeleri %25 daha hızlı ilerler.',
    maliyet: 150000, gunlukGider: 2000, prestijGereksinimi: 120, onkosul: [],
  },
  {
    id: 'tesvik', ad: 'Akademik Teşvik Programı',
    aciklama: 'Makale yayın olasılığı +%20, maaş gideri +%10.',
    maliyet: 120000, gunlukGider: 0, prestijGereksinimi: 130, onkosul: [],
  },
  {
    id: 'erasmus', ad: 'Erasmus+ Anlaşmaları',
    aciklama: 'Uluslararası yayın olasılığı +%30. En az 1 uluslararası yayın gerekir.',
    maliyet: 200000, gunlukGider: 1800, prestijGereksinimi: 150, onkosul: ['tanitim'],
  },
  {
    id: 'yemek_subvansiyon', ad: 'Yemekhane Sübvansiyonu',
    aciklama: 'Öğrenci mutluluğu her gün +2. Günlük ₺2.000 gider.',
    maliyet: 50000, gunlukGider: 2000, prestijGereksinimi: 0, onkosul: [],
  },
  {
    id: 'teknokent', ad: 'Teknokent',
    aciklama: 'Buluş/patent gelirleri 2 katına çıkar. En az 2 geçerli laboratuvar gerekir.',
    maliyet: 400000, gunlukGider: 3500, prestijGereksinimi: 200, onkosul: ['tubitak'],
  },
  {
    id: 'uluslararasi_ofis', ad: 'Uluslararası Öğrenci Ofisi',
    aciklama: 'Talep +%15, prestij kazanımı +%10.',
    maliyet: 250000, gunlukGider: 2000, prestijGereksinimi: 250, onkosul: ['erasmus'],
  },
  {
    id: 'arastirma_universitesi', ad: 'Araştırma Üniversitesi Statüsü',
    aciklama: 'Araştırma hızı +%30, dönemlik devlet ödeneği +%25.',
    maliyet: 600000, gunlukGider: 4000, prestijGereksinimi: 400, onkosul: ['teknokent', 'tesvik'],
  },
];

export function strategyDef(id: string): StrategyDef {
  const s = STRATEGY_DEFS.find((s) => s.id === id);
  if (!s) throw new Error('Bilinmeyen strateji: ' + id);
  return s;
}

/** Üniversite vizyonları — birbirini dışlar; seçim kalıcı yön verir. */
export const VIZYONLAR: {
  id: Vizyon; ad: string; etki: string; artilar: string; eksiler: string;
}[] = [
  {
    id: 'arastirma', ad: '🔬 Araştırma Üniversitesi',
    etki: 'Araştırma hızı ×1.25 · Öğrenme ×0.92',
    artilar: 'Projeler, makaleler ve buluşlar hızlanır',
    eksiler: 'Ders odağı azalır: öğrenciler biraz yavaş öğrenir',
  },
  {
    id: 'egitim', ad: '🎓 Eğitim Üniversitesi',
    etki: 'Öğrenme ×1.18 · Araştırma ×0.88',
    artilar: 'Öğrenciler hızlı öğrenir, GNO yükselir, erken mezun verir',
    eksiler: 'Araştırma üretimi yavaşlar',
  },
  {
    id: 'girisim', ad: '🚀 Girişim Üniversitesi',
    etki: 'Öğrenci girişim geliri ×1.35 · Öğrenme ×0.95 · Araştırma ×0.95',
    artilar: 'Ekosistem geliri ve mezun sermayesi patlar',
    eksiler: 'Akademik taraf hafif yavaşlar',
  },
];

export const VIZYON_MALIYET = 100_000;
export const VIZYON_DEGISIM_MALIYET = 250_000;
