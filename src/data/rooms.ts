import type { ObjectTypeId, RoomType } from '../core/types';

export interface RoomReq {
  obj: ObjectTypeId;
  adet: number;
}

export interface RoomDef {
  id: RoomType;
  ad: string;
  renk: string;       // yarı saydam kaplama rengi
  minBoyut: number;   // min kare sayısı
  gereksinim: RoomReq[];
  /** kapalı alan (duvarla çevrili) şartı */
  kapali: boolean;
  aciklama: string;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  derslik: {
    id: 'derslik', ad: 'Derslik', renk: '#4e79a7', minBoyut: 12, kapali: true,
    gereksinim: [ { obj: 'tahta', adet: 1 }, { obj: 'sira', adet: 4 } ],
    aciklama: 'Ders yapılan sınıf. Sıra sayısı öğrenci kapasitesini belirler.',
  },
  amfi: {
    id: 'amfi', ad: 'Amfi', renk: '#2f5787', minBoyut: 30, kapali: true,
    gereksinim: [ { obj: 'tahta', adet: 1 }, { obj: 'sira', adet: 12 } ],
    aciklama: 'Büyük ders salonu. Kalabalık bölümler için.',
  },
  yemekhane: {
    id: 'yemekhane', ad: 'Yemekhane', renk: '#f28e2b', minBoyut: 20, kapali: true,
    gereksinim: [ { obj: 'yemek_bankosu', adet: 1 }, { obj: 'sandalye', adet: 4 } ],
    aciklama: 'Öğrenciler burada yemek yer. Aşçı gerekir.',
  },
  kutuphane: {
    id: 'kutuphane', ad: 'Kütüphane', renk: '#76b7b2', minBoyut: 16, kapali: true,
    gereksinim: [ { obj: 'kitaplik', adet: 2 } ],
    aciklama: 'Araştırma hızını ve öğrenmeyi artırır. Kitaplık sayısı kütüphane seviyesini yükseltir.',
  },
  laboratuvar: {
    id: 'laboratuvar', ad: 'Laboratuvar', renk: '#af7aa1', minBoyut: 16, kapali: true,
    gereksinim: [ { obj: 'lab_tezgahi', adet: 2 } ],
    aciklama: 'Fen/mühendislik bölümleri ve araştırma projeleri için gerekli.',
  },
  ofis: {
    id: 'ofis', ad: 'Akademisyen Ofisi', renk: '#59a14f', minBoyut: 6, kapali: true,
    gereksinim: [ { obj: 'calisma_masasi', adet: 1 } ],
    aciklama: 'Akademisyenler ofiste araştırma yapar. Her ofis masası bir akademisyene yer açar.',
  },
  tuvalet: {
    id: 'tuvalet', ad: 'Tuvalet', renk: '#9c9ede', minBoyut: 4, kapali: true,
    gereksinim: [ { obj: 'klozet', adet: 1 }, { obj: 'lavabo', adet: 1 } ],
    aciklama: 'Temel ihtiyaç. Yetersizse mutluluk düşer.',
  },
  kantin: {
    id: 'kantin', ad: 'Kantin', renk: '#e15759', minBoyut: 9, kapali: true,
    gereksinim: [ { obj: 'otomat', adet: 1 }, { obj: 'sandalye', adet: 2 } ],
    aciklama: 'Öğrenciler boş vakitte dinlenir, eğlence ihtiyacını karşılar.',
  },
  rektorluk: {
    id: 'rektorluk', ad: 'Rektörlük', renk: '#bab0ac', minBoyut: 12, kapali: true,
    gereksinim: [ { obj: 'calisma_masasi', adet: 1 } ],
    aciklama: 'Üniversite yönetimi. Strateji geliştirmeyi açar.',
  },
};

export const ROOM_LIST: RoomDef[] = Object.values(ROOM_DEFS);

export const FLOOR_DEFS: { id: 'beton' | 'parke' | 'karo' | 'yol'; ad: string; maliyet: number; renk: string }[] = [
  { id: 'beton', ad: 'Beton Zemin', maliyet: 100, renk: '#b9b4a8' },
  { id: 'parke', ad: 'Parke', maliyet: 200, renk: '#c8a06a' },
  { id: 'karo', ad: 'Karo', maliyet: 150, renk: '#aebfc4' },
  { id: 'yol', ad: 'Yürüyüş Yolu', maliyet: 80, renk: '#8d8d8d' },
];

export const WALL_COST = 250;
export const DOOR_COST = 500;
/** yıkımda geri ödeme oranı */
export const REFUND = 0.25;
