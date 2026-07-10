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
};

export const OBJECT_LIST: ObjectDef[] = Object.values(OBJECT_DEFS);
