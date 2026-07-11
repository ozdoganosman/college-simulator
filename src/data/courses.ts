/**
 * Ders kataloğu — İTÜ/ODTÜ ders programlarından karma, kalabalık bir müfredat.
 * Her dersin birincil (1.25x) ve varsa ikincil (0.95x) alanı vardır; diğer
 * alanlardan bir hoca bu dersi ancak 0.55x verimle verebilir.
 */
import type { Alan } from '../core/types';

export interface CourseDef {
  id: string;
  kod: string;      // 'MAT 101'
  ad: string;       // 'Matematik I'
  birincil: Alan;
  ikincil?: Alan;
}

export const COURSES: CourseDef[] = [
  // --- Matematik / Fen (Mühendis) ---
  { id: 'mat101', kod: 'MAT 101', ad: 'Matematik I', birincil: 'muhendis' },
  { id: 'mat219', kod: 'MAT 219', ad: 'Diferansiyel Denklemler', birincil: 'muhendis' },
  { id: 'mat261', kod: 'MAT 261', ad: 'Lineer Cebir', birincil: 'muhendis' },
  { id: 'mat331', kod: 'MAT 331', ad: 'Reel Analiz', birincil: 'muhendis' },
  { id: 'fiz101', kod: 'FIZ 101', ad: 'Fizik I', birincil: 'muhendis' },
  { id: 'fiz102', kod: 'FIZ 102', ad: 'Fizik II', birincil: 'muhendis' },
  { id: 'fiz301', kod: 'FIZ 301', ad: 'Kuantum Mekaniği', birincil: 'muhendis' },
  { id: 'kim101', kod: 'KIM 101', ad: 'Genel Kimya', birincil: 'muhendis' },
  { id: 'biy101', kod: 'BIY 101', ad: 'Genel Biyoloji', birincil: 'muhendis' },
  { id: 'stat201', kod: 'STAT 201', ad: 'İstatistik', birincil: 'muhendis', ikincil: 'pratik' },
  // --- Mühendislik ---
  { id: 'blg102', kod: 'BLG 102', ad: 'Bilgisayar Programlama', birincil: 'muhendis' },
  { id: 'blg231', kod: 'BLG 231', ad: 'Veri Yapıları', birincil: 'muhendis' },
  { id: 'blg354', kod: 'BLG 354', ad: 'Yapay Öğrenme', birincil: 'muhendis' },
  { id: 'eem211', kod: 'EEM 211', ad: 'Devre Teorisi', birincil: 'muhendis' },
  { id: 'eem321', kod: 'EEM 321', ad: 'Elektronik', birincil: 'muhendis' },
  { id: 'mak205', kod: 'MAK 205', ad: 'Termodinamik', birincil: 'muhendis' },
  { id: 'mak301', kod: 'MAK 301', ad: 'Makine Elemanları', birincil: 'muhendis' },
  // --- Tıp / Sağlık ---
  { id: 'tip101', kod: 'TIP 101', ad: 'Anatomi', birincil: 'muhendis' },
  { id: 'tip205', kod: 'TIP 205', ad: 'Fizyoloji', birincil: 'muhendis' },
  { id: 'tip310', kod: 'TIP 310', ad: 'Farmakoloji', birincil: 'muhendis' },
  // --- Dil / Sanat / Edebiyat (Artist) ---
  { id: 'ing101', kod: 'ING 101', ad: 'Akademik İngilizce', birincil: 'artist' },
  { id: 'tur101', kod: 'TUR 101', ad: 'Türk Dili', birincil: 'artist', ikincil: 'filozof' },
  { id: 'edb201', kod: 'EDB 201', ad: 'Modern Türk Edebiyatı', birincil: 'artist' },
  { id: 'san154', kod: 'SAN 154', ad: 'Sanat Tarihi', birincil: 'artist', ikincil: 'filozof' },
  { id: 'mim111', kod: 'MIM 111', ad: 'Mimari Tasarım Stüdyosu', birincil: 'artist', ikincil: 'muhendis' },
  { id: 'mim231', kod: 'MIM 231', ad: 'Yapı Bilgisi', birincil: 'muhendis', ikincil: 'artist' },
  { id: 'ile101', kod: 'ILE 101', ad: 'İletişime Giriş', birincil: 'artist', ikincil: 'pratik' },
  { id: 'gzt205', kod: 'GZT 205', ad: 'Haber Yazımı', birincil: 'artist' },
  { id: 'ile310', kod: 'ILE 310', ad: 'Medya Kuramları', birincil: 'filozof', ikincil: 'artist' },
  // --- Tarih / Sosyal / Felsefe (Filozof) ---
  { id: 'fel101', kod: 'FEL 101', ad: 'Felsefeye Giriş', birincil: 'filozof' },
  { id: 'tar101', kod: 'TAR 101', ad: 'Uygarlık Tarihi', birincil: 'filozof' },
  { id: 'tar2201', kod: 'TAR 2201', ad: 'Atatürk İlkeleri ve İnkılap Tarihi', birincil: 'filozof' },
  { id: 'tar305', kod: 'TAR 305', ad: 'Osmanlı Tarihi', birincil: 'filozof' },
  { id: 'cog105', kod: 'COG 105', ad: 'Beşeri Coğrafya', birincil: 'filozof' },
  { id: 'sos101', kod: 'SOS 101', ad: 'Sosyolojiye Giriş', birincil: 'filozof' },
  { id: 'psi101', kod: 'PSI 101', ad: 'Psikolojiye Giriş', birincil: 'filozof', ikincil: 'muhendis' },
  { id: 'psi240', kod: 'PSI 240', ad: 'Gelişim Psikolojisi', birincil: 'filozof' },
  { id: 'huk101', kod: 'HUK 101', ad: 'Hukuk Başlangıcı', birincil: 'filozof', ikincil: 'pratik' },
  { id: 'huk205', kod: 'HUK 205', ad: 'Anayasa Hukuku', birincil: 'filozof', ikincil: 'pratik' },
  { id: 'huk301', kod: 'HUK 301', ad: 'Ceza Hukuku', birincil: 'filozof' },
  // --- İşletme / İktisat / Meslek (Pratik) ---
  { id: 'isl201', kod: 'ISL 201', ad: 'İşletme Yönetimi', birincil: 'pratik' },
  { id: 'ikt101', kod: 'IKT 101', ad: 'İktisada Giriş', birincil: 'pratik', ikincil: 'filozof' },
  { id: 'muh101', kod: 'MUH 101', ad: 'Genel Muhasebe', birincil: 'pratik' },
  { id: 'paz301', kod: 'PAZ 301', ad: 'Pazarlama İlkeleri', birincil: 'pratik', ikincil: 'artist' },
];

const INDEX = new Map(COURSES.map((c) => [c.id, c]));

export function courseDef(id: string): CourseDef {
  const c = INDEX.get(id);
  if (!c) throw new Error('Bilinmeyen ders: ' + id);
  return c;
}

/** Alanın bu dersteki verim çarpanı: birincil 1.25, ikincil 0.95, diğer 0.55. */
export function dersEtki(courseId: string, alan: Alan): number {
  const c = courseDef(courseId);
  if (c.birincil === alan) return 1.25;
  if (c.ikincil === alan) return 0.95;
  return 0.55;
}
