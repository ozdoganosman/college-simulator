/**
 * Ders kataloğu — İTÜ/ODTÜ programlarından karma, alan başına TAM 20 ders (toplam 80).
 * Her dersin birincil (1.25x) ve varsa ikincil (0.95x) alanı vardır; diğer
 * alanlardan bir hoca bu dersi ancak 0.55x verimle verebilir.
 */
import type { Alan } from '../core/types';

export interface CourseDef {
  id: string;
  kod: string;
  ad: string;
  birincil: Alan;
  ikincil?: Alan;
}

export const COURSES: CourseDef[] = [
  // ===== 🔬 MÜHENDİS (20) =====
  { id: 'mat101', kod: 'MAT 101', ad: 'Matematik I', birincil: 'muhendis' },
  { id: 'mat219', kod: 'MAT 219', ad: 'Diferansiyel Denklemler', birincil: 'muhendis' },
  { id: 'mat261', kod: 'MAT 261', ad: 'Lineer Cebir', birincil: 'muhendis' },
  { id: 'fiz101', kod: 'FIZ 101', ad: 'Fizik I', birincil: 'muhendis' },
  { id: 'fiz102', kod: 'FIZ 102', ad: 'Fizik II', birincil: 'muhendis' },
  { id: 'fiz301', kod: 'FIZ 301', ad: 'Kuantum Mekaniği', birincil: 'muhendis' },
  { id: 'kim101', kod: 'KIM 101', ad: 'Genel Kimya', birincil: 'muhendis' },
  { id: 'kim210', kod: 'KIM 210', ad: 'Organik Kimya', birincil: 'muhendis' },
  { id: 'biy101', kod: 'BIY 101', ad: 'Genel Biyoloji', birincil: 'muhendis' },
  { id: 'biy220', kod: 'BIY 220', ad: 'Genetik', birincil: 'muhendis' },
  { id: 'stat201', kod: 'STAT 201', ad: 'İstatistik', birincil: 'muhendis', ikincil: 'pratik' },
  { id: 'blg102', kod: 'BLG 102', ad: 'Bilgisayar Programlama', birincil: 'muhendis' },
  { id: 'blg231', kod: 'BLG 231', ad: 'Veri Yapıları', birincil: 'muhendis' },
  { id: 'blg354', kod: 'BLG 354', ad: 'Yapay Öğrenme', birincil: 'muhendis' },
  { id: 'eem211', kod: 'EEM 211', ad: 'Devre Teorisi', birincil: 'muhendis' },
  { id: 'eem321', kod: 'EEM 321', ad: 'Elektronik', birincil: 'muhendis' },
  { id: 'mak205', kod: 'MAK 205', ad: 'Termodinamik', birincil: 'muhendis' },
  { id: 'mak301', kod: 'MAK 301', ad: 'Makine Elemanları', birincil: 'muhendis' },
  { id: 'ins210', kod: 'INS 210', ad: 'Statik ve Mukavemet', birincil: 'muhendis' },
  { id: 'tip101', kod: 'TIP 101', ad: 'Anatomi', birincil: 'muhendis' },
  // ===== 🎨 ARTIST (20) =====
  { id: 'ing101', kod: 'ING 101', ad: 'Akademik İngilizce', birincil: 'artist' },
  { id: 'alm101', kod: 'ALM 101', ad: 'Almanca', birincil: 'artist' },
  { id: 'tur101', kod: 'TUR 101', ad: 'Türk Dili', birincil: 'artist', ikincil: 'filozof' },
  { id: 'edb201', kod: 'EDB 201', ad: 'Modern Türk Edebiyatı', birincil: 'artist' },
  { id: 'edb305', kod: 'EDB 305', ad: 'Karşılaştırmalı Edebiyat', birincil: 'artist', ikincil: 'filozof' },
  { id: 'dil210', kod: 'DIL 210', ad: 'Dilbilim', birincil: 'artist', ikincil: 'filozof' },
  { id: 'yaz240', kod: 'YAZ 240', ad: 'Yaratıcı Yazarlık', birincil: 'artist' },
  { id: 'san154', kod: 'SAN 154', ad: 'Sanat Tarihi', birincil: 'artist', ikincil: 'filozof' },
  { id: 'res101', kod: 'RES 101', ad: 'Resim Atölyesi', birincil: 'artist' },
  { id: 'gra121', kod: 'GRA 121', ad: 'Grafik Tasarım İlkeleri', birincil: 'artist' },
  { id: 'fot130', kod: 'FOT 130', ad: 'Fotoğrafçılık', birincil: 'artist' },
  { id: 'muz101', kod: 'MUZ 101', ad: 'Müzik Teorisi', birincil: 'artist' },
  { id: 'tiy205', kod: 'TIY 205', ad: 'Tiyatro ve Drama', birincil: 'artist' },
  { id: 'sin201', kod: 'SIN 201', ad: 'Sinema Tarihi', birincil: 'artist', ikincil: 'filozof' },
  { id: 'rtv110', kod: 'RTV 110', ad: 'Radyo-TV Yapımı', birincil: 'artist' },
  { id: 'icm220', kod: 'ICM 220', ad: 'İç Mimari Tasarım', birincil: 'artist', ikincil: 'muhendis' },
  { id: 'mod150', kod: 'MOD 150', ad: 'Moda Tasarımı', birincil: 'artist' },
  { id: 'mim111', kod: 'MIM 111', ad: 'Mimari Tasarım Stüdyosu', birincil: 'artist', ikincil: 'muhendis' },
  { id: 'ile101', kod: 'ILE 101', ad: 'İletişime Giriş', birincil: 'artist', ikincil: 'pratik' },
  { id: 'gzt205', kod: 'GZT 205', ad: 'Haber Yazımı', birincil: 'artist' },
  // ===== 📜 FİLOZOF (20) =====
  { id: 'fel101', kod: 'FEL 101', ad: 'Felsefeye Giriş', birincil: 'filozof' },
  { id: 'fel230', kod: 'FEL 230', ad: 'Etik', birincil: 'filozof' },
  { id: 'tar101', kod: 'TAR 101', ad: 'Uygarlık Tarihi', birincil: 'filozof' },
  { id: 'tar2201', kod: 'TAR 2201', ad: 'Atatürk İlkeleri ve İnkılap Tarihi', birincil: 'filozof' },
  { id: 'tar305', kod: 'TAR 305', ad: 'Osmanlı Tarihi', birincil: 'filozof' },
  { id: 'tar410', kod: 'TAR 410', ad: 'Cumhuriyet Tarihi', birincil: 'filozof' },
  { id: 'ark101', kod: 'ARK 101', ad: 'Arkeolojiye Giriş', birincil: 'filozof' },
  { id: 'ant210', kod: 'ANT 210', ad: 'Antropoloji', birincil: 'filozof' },
  { id: 'mit205', kod: 'MIT 205', ad: 'Mitoloji', birincil: 'filozof', ikincil: 'artist' },
  { id: 'cog105', kod: 'COG 105', ad: 'Beşeri Coğrafya', birincil: 'filozof' },
  { id: 'sos101', kod: 'SOS 101', ad: 'Sosyolojiye Giriş', birincil: 'filozof' },
  { id: 'psi101', kod: 'PSI 101', ad: 'Psikolojiye Giriş', birincil: 'filozof', ikincil: 'muhendis' },
  { id: 'psi240', kod: 'PSI 240', ad: 'Gelişim Psikolojisi', birincil: 'filozof' },
  { id: 'egt201', kod: 'EGT 201', ad: 'Eğitim Bilimleri', birincil: 'filozof' },
  { id: 'sbk101', kod: 'SBK 101', ad: 'Siyaset Bilimi', birincil: 'filozof' },
  { id: 'uls201', kod: 'ULS 201', ad: 'Uluslararası İlişkiler', birincil: 'filozof', ikincil: 'pratik' },
  { id: 'huk101', kod: 'HUK 101', ad: 'Hukuk Başlangıcı', birincil: 'filozof', ikincil: 'pratik' },
  { id: 'huk205', kod: 'HUK 205', ad: 'Anayasa Hukuku', birincil: 'filozof', ikincil: 'pratik' },
  { id: 'huk301', kod: 'HUK 301', ad: 'Ceza Hukuku', birincil: 'filozof' },
  { id: 'ile310', kod: 'ILE 310', ad: 'Medya Kuramları', birincil: 'filozof', ikincil: 'artist' },
  // ===== 💼 PRATİK (20) =====
  { id: 'isl201', kod: 'ISL 201', ad: 'İşletme Yönetimi', birincil: 'pratik' },
  { id: 'ikt101', kod: 'IKT 101', ad: 'İktisada Giriş', birincil: 'pratik', ikincil: 'filozof' },
  { id: 'muh101', kod: 'MUH 101', ad: 'Genel Muhasebe', birincil: 'pratik' },
  { id: 'paz301', kod: 'PAZ 301', ad: 'Pazarlama İlkeleri', birincil: 'pratik', ikincil: 'artist' },
  { id: 'fin201', kod: 'FIN 201', ad: 'Finansal Yönetim', birincil: 'pratik' },
  { id: 'bnk210', kod: 'BNK 210', ad: 'Bankacılık', birincil: 'pratik' },
  { id: 'sgt101', kod: 'SGT 101', ad: 'Sigortacılık', birincil: 'pratik' },
  { id: 'mly205', kod: 'MLY 205', ad: 'Maliye', birincil: 'pratik', ikincil: 'filozof' },
  { id: 'tic301', kod: 'TIC 301', ad: 'Uluslararası Ticaret', birincil: 'pratik' },
  { id: 'gir310', kod: 'GIR 310', ad: 'Girişimcilik', birincil: 'pratik' },
  { id: 'ins250', kod: 'INS 250', ad: 'İnsan Kaynakları Yönetimi', birincil: 'pratik' },
  { id: 'loj201', kod: 'LOJ 201', ad: 'Lojistik Yönetimi', birincil: 'pratik' },
  { id: 'tur210', kod: 'TUR 210', ad: 'Turizm İşletmeciliği', birincil: 'pratik' },
  { id: 'gas110', kod: 'GAS 110', ad: 'Gastronomi ve Mutfak Sanatları', birincil: 'pratik', ikincil: 'artist' },
  { id: 'hlk120', kod: 'HLK 120', ad: 'Halkla İlişkiler', birincil: 'pratik', ikincil: 'artist' },
  { id: 'bro101', kod: 'BRO 101', ad: 'Büro Yönetimi', birincil: 'pratik' },
  { id: 'eml130', kod: 'EML 130', ad: 'Emlak Yönetimi', birincil: 'pratik' },
  { id: 'per260', kod: 'PER 260', ad: 'Perakende Yönetimi', birincil: 'pratik' },
  { id: 'sag140', kod: 'SAG 140', ad: 'İlk Yardım ve Acil Bakım', birincil: 'pratik', ikincil: 'muhendis' },
  { id: 'isg220', kod: 'ISG 220', ad: 'İş Sağlığı ve Güvenliği', birincil: 'pratik' },
];

const INDEX = new Map(COURSES.map((c) => [c.id, c]));

const BILINMEYEN: CourseDef = { id: '?', kod: '???', ad: 'Bilinmeyen Ders', birincil: 'muhendis' };

export function courseDef(id: string): CourseDef {
  return INDEX.get(id) ?? BILINMEYEN; // eski kayıt uyumu: bilinmeyen ders çökertmesin
}

export function courseExists(id: string): boolean {
  return INDEX.has(id);
}

/** Alanın bu dersteki verim çarpanı: birincil 1.25, ikincil 0.95, diğer 0.55. */
export function dersEtki(courseId: string, alan: Alan): number {
  const c = INDEX.get(courseId);
  if (!c) return 1;
  if (c.birincil === alan) return 1.25;
  if (c.ikincil === alan) return 0.95;
  return 0.55;
}
