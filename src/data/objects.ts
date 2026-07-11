import type { ObjectTypeId, RoomType } from '../core/types';

export interface ObjectDef {
  id: ObjectTypeId;
  ad: string;
  maliyet: number;
  /** canvas'ta çizilecek emoji */
  glyph: string;
  /** hangi odalarda anlamlı (boş dizi = her yerde, dış mekân dahil) */
  odalar: RoomType[] | null; // null = her yer
}

export const OBJECT_DEFS: Record<ObjectTypeId, ObjectDef> = {
  sira: { id: 'sira', ad: 'Okul Sırası', maliyet: 600, glyph: '🪑', odalar: ['derslik', 'amfi'] },
  tahta: { id: 'tahta', ad: 'Yazı Tahtası', maliyet: 900, glyph: '📋', odalar: ['derslik', 'amfi'] },
  masa: { id: 'masa', ad: 'Masa', maliyet: 500, glyph: '🟫', odalar: ['yemekhane', 'kutuphane', 'kantin'] },
  sandalye: { id: 'sandalye', ad: 'Sandalye', maliyet: 200, glyph: '💺', odalar: ['yemekhane', 'kutuphane', 'kantin'] },
  yemek_bankosu: { id: 'yemek_bankosu', ad: 'Yemek Bankosu', maliyet: 4000, glyph: '🍲', odalar: ['yemekhane'] },
  kitaplik: { id: 'kitaplik', ad: 'Kitaplık', maliyet: 1200, glyph: '📚', odalar: ['kutuphane'] },
  lab_tezgahi: { id: 'lab_tezgahi', ad: 'Laboratuvar Tezgâhı', maliyet: 5000, glyph: '🧪', odalar: ['laboratuvar'] },
  calisma_masasi: { id: 'calisma_masasi', ad: 'Çalışma Masası', maliyet: 1500, glyph: '🖥️', odalar: ['ofis', 'rektorluk'] },
  klozet: { id: 'klozet', ad: 'Klozet', maliyet: 1500, glyph: '🚽', odalar: ['tuvalet'] },
  lavabo: { id: 'lavabo', ad: 'Lavabo', maliyet: 800, glyph: '🚰', odalar: ['tuvalet'] },
  otomat: { id: 'otomat', ad: 'Otomat', maliyet: 3500, glyph: '🥤', odalar: ['kantin'] },
  bank: { id: 'bank', ad: 'Bank', maliyet: 700, glyph: '🛋️', odalar: null },
  cop_kutusu: { id: 'cop_kutusu', ad: 'Çöp Kutusu', maliyet: 250, glyph: '🗑️', odalar: null },
  bilgisayar: { id: 'bilgisayar', ad: 'Bilgisayar', maliyet: 2500, glyph: '💻', odalar: ['kutuphane', 'laboratuvar', 'ofis'] },
  ranza: { id: 'ranza', ad: 'Ranza (2 kişilik)', maliyet: 2000, glyph: '🛏️', odalar: ['yurt'] },
  servis_duragi: { id: 'servis_duragi', ad: 'Servis Durağı', maliyet: 20000, glyph: '🚌', odalar: null },
  basket_potasi: { id: 'basket_potasi', ad: 'Basket Potası', maliyet: 6000, glyph: '🏀', odalar: null },
  satranc_masasi: { id: 'satranc_masasi', ad: 'Satranç Masası', maliyet: 2500, glyph: '♟️', odalar: null },
  muzik_sahnesi: { id: 'muzik_sahnesi', ad: 'Müzik Sahnesi', maliyet: 15000, glyph: '🎸', odalar: null },
  cicek_tarhi: { id: 'cicek_tarhi', ad: 'Çiçek Tarhı', maliyet: 900, glyph: '🌸', odalar: null },
  fidan: { id: 'fidan', ad: 'Fidan', maliyet: 600, glyph: '🌳', odalar: null },
  heykel: { id: 'heykel', ad: 'Heykel', maliyet: 14000, glyph: '🗿', odalar: null },
  sus_havuzu: { id: 'sus_havuzu', ad: 'Süs Havuzu', maliyet: 20000, glyph: '⛲', odalar: null },
};

export const OBJECT_LIST: ObjectDef[] = Object.values(OBJECT_DEFS);
