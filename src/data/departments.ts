import type { DeptDef } from '../core/types';

export const DEPT_DEFS: DeptDef[] = [
  { id: 'bilgisayar', ad: 'Bilgisayar Mühendisliği', kisa: 'BM', renk: '#4e79a7', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 250000, tabanTalep: 90, arastirmaCarpani: 1.2, dersler: ['mat101', 'fiz101', 'blg102', 'blg231', 'blg354', 'ing101'] },
  { id: 'elektrik', ad: 'Elektrik-Elektronik Müh.', kisa: 'EEM', renk: '#f2be2b', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 230000, tabanTalep: 75, arastirmaCarpani: 1.15, dersler: ['mat101', 'fiz102', 'eem211', 'eem321', 'mat219', 'ing101'] },
  { id: 'makine', ad: 'Makine Mühendisliği', kisa: 'MAK', renk: '#8c8c8c', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 220000, tabanTalep: 70, arastirmaCarpani: 1.1, dersler: ['mat101', 'fiz101', 'mak205', 'mak301', 'mat219', 'tur101'] },
  { id: 'tip', ad: 'Tıp Fakültesi', kisa: 'TIP', renk: '#e15759', labGerekli: true, minDerslik: 4, minAkademisyen: 5, acilisMaliyeti: 800000, tabanTalep: 130, arastirmaCarpani: 1.4, dersler: ['biy101', 'kim101', 'tip101', 'tip205', 'tip310', 'ing101'] },
  { id: 'hukuk', ad: 'Hukuk Fakültesi', kisa: 'HUK', renk: '#7b3f00', labGerekli: false, minDerslik: 3, minAkademisyen: 4, acilisMaliyeti: 500000, tabanTalep: 110, arastirmaCarpani: 0.8, dersler: ['huk101', 'huk205', 'huk301', 'fel101', 'tar2201', 'tur101'] },
  { id: 'isletme', ad: 'İşletme', kisa: 'İŞL', renk: '#59a14f', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 150000, tabanTalep: 70, arastirmaCarpani: 0.8, dersler: ['isl201', 'ikt101', 'muh101', 'paz301', 'stat201', 'ing101'] },
  { id: 'psikoloji', ad: 'Psikoloji', kisa: 'PSİ', renk: '#af7aa1', labGerekli: false, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 200000, tabanTalep: 85, arastirmaCarpani: 1.0, dersler: ['psi101', 'psi240', 'stat201', 'biy101', 'fel101', 'ing101'] },
  { id: 'mimarlik', ad: 'Mimarlık', kisa: 'MİM', renk: '#76b7b2', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 300000, tabanTalep: 65, arastirmaCarpani: 0.9, dersler: ['mim111', 'mim231', 'san154', 'mat101', 'fiz101', 'tur101'] },
  { id: 'fizik', ad: 'Fizik', kisa: 'FİZ', renk: '#4c78a8', labGerekli: true, minDerslik: 2, minAkademisyen: 3, acilisMaliyeti: 200000, tabanTalep: 40, arastirmaCarpani: 1.5, dersler: ['fiz101', 'fiz102', 'fiz301', 'mat101', 'mat219', 'ing101'] },
  { id: 'matematik', ad: 'Matematik', kisa: 'MAT', renk: '#f28e2b', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 120000, tabanTalep: 35, arastirmaCarpani: 1.3, dersler: ['mat101', 'mat261', 'mat219', 'mat331', 'stat201', 'tur101'] },
  { id: 'tarih', ad: 'Tarih', kisa: 'TAR', renk: '#9d7660', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 100000, tabanTalep: 30, arastirmaCarpani: 0.9, dersler: ['tar101', 'tar2201', 'tar305', 'cog105', 'fel101', 'tur101'] },
  { id: 'iletisim', ad: 'İletişim', kisa: 'İLE', renk: '#d37295', labGerekli: false, minDerslik: 2, minAkademisyen: 2, acilisMaliyeti: 150000, tabanTalep: 60, arastirmaCarpani: 0.85, dersler: ['ile101', 'gzt205', 'ile310', 'edb201', 'san154', 'ing101'] },
];

export function deptDef(defId: string): DeptDef {
  const d = DEPT_DEFS.find((d) => d.id === defId);
  if (!d) throw new Error('Bilinmeyen bölüm: ' + defId);
  return d;
}
