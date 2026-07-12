/** Oyun ayarları — oyun durumundan bağımsız, tarayıcıda saklanır. */
export interface Ayarlar {
  otomatikKayit: boolean;   // gün sonunda otomatik kaydet
  isikDongusu: boolean;     // gündüz/gece ışık tonu
  izgara: boolean;          // yakınlaşınca ızgara çizgileri
  dekor: boolean;           // çimenlerde ağaç/çalı
  minimap: boolean;         // sağ altta minimap
  ses: number;              // ses efekti seviyesi (0-100)
}

const VARSAYILAN: Ayarlar = {
  otomatikKayit: true,
  isikDongusu: true,
  izgara: true,
  dekor: true,
  minimap: true,
  ses: 60,
};

const ANAHTAR = 'universite-simulatoru-ayarlar';

function yukle(): Ayarlar {
  try {
    const raw = localStorage.getItem(ANAHTAR);
    if (!raw) return { ...VARSAYILAN };
    return { ...VARSAYILAN, ...(JSON.parse(raw) as Partial<Ayarlar>) };
  } catch {
    return { ...VARSAYILAN };
  }
}

export const AYARLAR: Ayarlar = yukle();

export function ayarlariKaydet(): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(AYARLAR));
  } catch { /* yoksay */ }
}
