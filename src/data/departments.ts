import type { DeptDef } from '../core/types';

/**
 * Bölüm kataloğu: 20 lisans (8'er ders) + 12 önlisans (4'er ders).
 * Müfredatlar 80 derslik havuzun kombinasyonlarıdır — bölüm açmak için
 * dersleri verebilecek alanlarda akademisyen kadrosu gerekir.
 */
export const DEPT_DEFS: DeptDef[] = [
  // ===== LİSANS (8 ders) =====
  { id: 'bilgisayar', ad: 'Bilgisayar Mühendisliği', kisa: 'BM', renk: '#4e79a7', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 250000, tabanTalep: 90, arastirmaCarpani: 1.2, tur: 'lisans', dersler: ['mat101', 'fiz101', 'blg102', 'blg231', 'blg354', 'eem211', 'stat201', 'ing101'] },
  { id: 'elektrik', ad: 'Elektrik-Elektronik Müh.', kisa: 'EEM', renk: '#f2be2b', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 230000, tabanTalep: 75, arastirmaCarpani: 1.15, tur: 'lisans', dersler: ['mat101', 'fiz102', 'eem211', 'eem321', 'mat219', 'blg102', 'fiz101', 'ing101'] },
  { id: 'makine', ad: 'Makine Mühendisliği', kisa: 'MAK', renk: '#8c8c8c', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 220000, tabanTalep: 70, arastirmaCarpani: 1.1, tur: 'lisans', dersler: ['mat101', 'fiz101', 'mak205', 'mak301', 'mat219', 'ins210', 'kim101', 'tur101'] },
  { id: 'insaatmuh', ad: 'İnşaat Mühendisliği', kisa: 'İNŞ', renk: '#b0803c', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 240000, tabanTalep: 80, arastirmaCarpani: 1.05, tur: 'lisans', dersler: ['mat101', 'fiz101', 'ins210', 'mak301', 'mat219', 'kim101', 'stat201', 'ing101'] },
  { id: 'kimyamuh', ad: 'Kimya Mühendisliği', kisa: 'KMM', renk: '#6a9f58', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 230000, tabanTalep: 60, arastirmaCarpani: 1.2, tur: 'lisans', dersler: ['kim101', 'kim210', 'mat101', 'fiz102', 'mak205', 'biy101', 'stat201', 'ing101'] },
  { id: 'tip', ad: 'Tıp Fakültesi', kisa: 'TIP', renk: '#e15759', labGerekli: true, minDerslik: 4, minAkademisyen: 5, acilisMaliyeti: 800000, tabanTalep: 130, arastirmaCarpani: 1.4, tur: 'lisans', dersler: ['biy101', 'kim101', 'tip101', 'biy220', 'kim210', 'psi101', 'stat201', 'ing101'] },
  { id: 'molbiyo', ad: 'Moleküler Biyoloji ve Genetik', kisa: 'MBG', renk: '#59b0a5', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 260000, tabanTalep: 55, arastirmaCarpani: 1.35, tur: 'lisans', dersler: ['biy101', 'biy220', 'kim101', 'kim210', 'stat201', 'mat101', 'fiz101', 'ing101'] },
  { id: 'fizik', ad: 'Fizik', kisa: 'FİZ', renk: '#4c78a8', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 200000, tabanTalep: 40, arastirmaCarpani: 1.5, tur: 'lisans', dersler: ['fiz101', 'fiz102', 'fiz301', 'mat101', 'mat219', 'mat261', 'blg102', 'ing101'] },
  { id: 'matematik', ad: 'Matematik', kisa: 'MAT', renk: '#f28e2b', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 120000, tabanTalep: 35, arastirmaCarpani: 1.3, tur: 'lisans', dersler: ['mat101', 'mat261', 'mat219', 'stat201', 'fiz101', 'blg102', 'fel101', 'tur101'] },
  { id: 'mimarlik', ad: 'Mimarlık', kisa: 'MİM', renk: '#76b7b2', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 300000, tabanTalep: 65, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['mim111', 'icm220', 'san154', 'mat101', 'fiz101', 'ins210', 'res101', 'tur101'] },
  { id: 'grafik', ad: 'Grafik Tasarımı', kisa: 'GRT', renk: '#d37295', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 180000, tabanTalep: 60, arastirmaCarpani: 0.85, tur: 'lisans', dersler: ['gra121', 'res101', 'fot130', 'san154', 'mod150', 'icm220', 'ile101', 'ing101'] },
  { id: 'tde', ad: 'Türk Dili ve Edebiyatı', kisa: 'TDE', renk: '#c98a4b', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 110000, tabanTalep: 45, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['tur101', 'edb201', 'edb305', 'yaz240', 'dil210', 'mit205', 'tar101', 'fel101'] },
  { id: 'ingdil', ad: 'İngiliz Dili ve Edebiyatı', kisa: 'İDE', renk: '#a06cd5', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 130000, tabanTalep: 55, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['ing101', 'dil210', 'edb305', 'alm101', 'edb201', 'yaz240', 'sin201', 'tiy205'] },
  { id: 'rts', ad: 'Radyo, TV ve Sinema', kisa: 'RTS', renk: '#e26f99', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 170000, tabanTalep: 70, arastirmaCarpani: 0.85, tur: 'lisans', dersler: ['rtv110', 'sin201', 'fot130', 'gzt205', 'ile101', 'ile310', 'tiy205', 'muz101'] },
  { id: 'hukuk', ad: 'Hukuk Fakültesi', kisa: 'HUK', renk: '#7b3f00', labGerekli: false, minDerslik: 3, minAkademisyen: 4, acilisMaliyeti: 500000, tabanTalep: 110, arastirmaCarpani: 0.8, tur: 'lisans', dersler: ['huk101', 'huk205', 'huk301', 'fel101', 'tar2201', 'sbk101', 'uls201', 'tur101'] },
  { id: 'psikoloji', ad: 'Psikoloji', kisa: 'PSİ', renk: '#af7aa1', labGerekli: false, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 200000, tabanTalep: 85, arastirmaCarpani: 1.0, tur: 'lisans', dersler: ['psi101', 'psi240', 'stat201', 'biy101', 'fel101', 'ant210', 'egt201', 'ing101'] },
  { id: 'tarih', ad: 'Tarih', kisa: 'TAR', renk: '#9d7660', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 100000, tabanTalep: 30, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['tar101', 'tar2201', 'tar305', 'tar410', 'ark101', 'mit205', 'cog105', 'tur101'] },
  { id: 'uli', ad: 'Uluslararası İlişkiler', kisa: 'ULİ', renk: '#5c7fbf', labGerekli: false, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 220000, tabanTalep: 90, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['uls201', 'sbk101', 'ikt101', 'huk101', 'tar410', 'cog105', 'fel230', 'ing101'] },
  { id: 'isletme', ad: 'İşletme', kisa: 'İŞL', renk: '#59a14f', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 150000, tabanTalep: 70, arastirmaCarpani: 0.8, tur: 'lisans', dersler: ['isl201', 'ikt101', 'muh101', 'paz301', 'fin201', 'ins250', 'stat201', 'ing101'] },
  { id: 'iktisat', ad: 'İktisat', kisa: 'İKT', renk: '#3f8f6b', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 140000, tabanTalep: 65, arastirmaCarpani: 0.9, tur: 'lisans', dersler: ['ikt101', 'mly205', 'fin201', 'stat201', 'isl201', 'tic301', 'sbk101', 'ing101'] },
  // ===== ÖNLİSANS (4 ders, 2 yıllık) =====
  { id: 'blgprog', ad: 'Bilgisayar Programcılığı (Önlisans)', kisa: 'BP', renk: '#6f93c4', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 70000, tabanTalep: 65, arastirmaCarpani: 0.5, tur: 'onlisans', dersler: ['blg102', 'blg231', 'mat101', 'ing101'] },
  { id: 'elektek', ad: 'Elektrik Teknikerliği (Önlisans)', kisa: 'ET', renk: '#d9b23a', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 65000, tabanTalep: 50, arastirmaCarpani: 0.5, tur: 'onlisans', dersler: ['eem211', 'fiz102', 'mat101', 'isg220'] },
  { id: 'webtas', ad: 'Web Tasarımı (Önlisans)', kisa: 'WT', renk: '#8f7bd8', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 60000, tabanTalep: 55, arastirmaCarpani: 0.45, tur: 'onlisans', dersler: ['blg102', 'gra121', 'fot130', 'ile101'] },
  { id: 'muhver', ad: 'Muhasebe ve Vergi (Önlisans)', kisa: 'MV', renk: '#7fae52', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 55000, tabanTalep: 60, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['muh101', 'mly205', 'isl201', 'bro101'] },
  { id: 'ascilik', ad: 'Aşçılık (Önlisans)', kisa: 'AŞ', renk: '#e0793f', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 60000, tabanTalep: 70, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['gas110', 'tur210', 'isg220', 'hlk120'] },
  { id: 'turotel', ad: 'Turizm ve Otel İşletmeciliği (Önlisans)', kisa: 'TO', renk: '#4fa3b8', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 60000, tabanTalep: 65, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['tur210', 'isl201', 'ing101', 'hlk120'] },
  { id: 'paramedik', ad: 'İlk ve Acil Yardım (Önlisans)', kisa: 'AY', renk: '#d95757', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 80000, tabanTalep: 75, arastirmaCarpani: 0.5, tur: 'onlisans', dersler: ['sag140', 'biy101', 'tip101', 'psi101'] },
  { id: 'halkla', ad: 'Halkla İlişkiler (Önlisans)', kisa: 'Hİ', renk: '#cf7fb0', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 55000, tabanTalep: 50, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['hlk120', 'ile101', 'paz301', 'gzt205'] },
  { id: 'buro', ad: 'Büro Yönetimi (Önlisans)', kisa: 'BY', renk: '#9a9a6a', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 50000, tabanTalep: 40, arastirmaCarpani: 0.35, tur: 'onlisans', dersler: ['bro101', 'ins250', 'muh101', 'tur101'] },
  { id: 'emlak', ad: 'Emlak Yönetimi (Önlisans)', kisa: 'EY', renk: '#7d9b62', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 50000, tabanTalep: 45, arastirmaCarpani: 0.35, tur: 'onlisans', dersler: ['eml130', 'paz301', 'huk101', 'muh101'] },
  { id: 'sigorta', ad: 'Bankacılık ve Sigortacılık (Önlisans)', kisa: 'BS', renk: '#5f8f9e', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 55000, tabanTalep: 50, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['bnk210', 'sgt101', 'fin201', 'muh101'] },
  { id: 'isgprog', ad: 'İş Sağlığı ve Güvenliği (Önlisans)', kisa: 'İSG', renk: '#b8763f', labGerekli: false, minDerslik: 1, minAkademisyen: 1, acilisMaliyeti: 60000, tabanTalep: 55, arastirmaCarpani: 0.4, tur: 'onlisans', dersler: ['isg220', 'sag140', 'huk101', 'ins250'] },
];

export function deptDef(defId: string): DeptDef {
  const d = DEPT_DEFS.find((d) => d.id === defId);
  if (!d) throw new Error('Bilinmeyen bölüm: ' + defId);
  return d;
}
