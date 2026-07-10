import type { StrategyDef } from '../core/types';

/**
 * Strateji geliştirme ağacı. Rektörlük odası (geçerli) olmadan satın alınamaz.
 * Etkiler ilgili sistemlerde state.strategies.includes(id) ile okunur.
 */
export const STRATEGY_DEFS: StrategyDef[] = [
  {
    id: 'tanitim', ad: 'Tanıtım Kampanyası',
    aciklama: 'Üniversitenin tercih edilme oranı +%25.',
    maliyet: 100000, prestijGereksinimi: 0, onkosul: [],
  },
  {
    id: 'tubitak', ad: 'TÜBİTAK İş Birliği',
    aciklama: 'Araştırma projeleri %25 daha hızlı ilerler.',
    maliyet: 150000, prestijGereksinimi: 120, onkosul: [],
  },
  {
    id: 'tesvik', ad: 'Akademik Teşvik Programı',
    aciklama: 'Makale yayın olasılığı +%20, maaş gideri +%10.',
    maliyet: 120000, prestijGereksinimi: 130, onkosul: [],
  },
  {
    id: 'erasmus', ad: 'Erasmus+ Anlaşmaları',
    aciklama: 'Uluslararası yayın olasılığı +%30. En az 1 uluslararası yayın gerekir.',
    maliyet: 200000, prestijGereksinimi: 150, onkosul: ['tanitim'],
  },
  {
    id: 'yemek_subvansiyon', ad: 'Yemekhane Sübvansiyonu',
    aciklama: 'Öğrenci mutluluğu her gün +2. Günlük ₺2.000 gider.',
    maliyet: 50000, prestijGereksinimi: 0, onkosul: [],
  },
  {
    id: 'teknokent', ad: 'Teknokent',
    aciklama: 'Buluş/patent gelirleri 2 katına çıkar. En az 2 geçerli laboratuvar gerekir.',
    maliyet: 400000, prestijGereksinimi: 200, onkosul: ['tubitak'],
  },
  {
    id: 'uluslararasi_ofis', ad: 'Uluslararası Öğrenci Ofisi',
    aciklama: 'Talep +%15, prestij kazanımı +%10.',
    maliyet: 250000, prestijGereksinimi: 250, onkosul: ['erasmus'],
  },
  {
    id: 'arastirma_universitesi', ad: 'Araştırma Üniversitesi Statüsü',
    aciklama: 'Araştırma hızı +%30, dönemlik devlet ödeneği +%25.',
    maliyet: 600000, prestijGereksinimi: 400, onkosul: ['teknokent', 'tesvik'],
  },
];

export function strategyDef(id: string): StrategyDef {
  const s = STRATEGY_DEFS.find((s) => s.id === id);
  if (!s) throw new Error('Bilinmeyen strateji: ' + id);
  return s;
}
