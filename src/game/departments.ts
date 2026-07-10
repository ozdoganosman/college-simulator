/**
 * SPEC — Bölümler: açılış, kontenjan, talep/yerleştirme, mezuniyet, prestij, YL/doktora.
 *
 * canOpenDepartment(state, defId): { ok, eksik: string[] }
 *  - Zaten açıksa eksik=['Bölüm zaten açık'].
 *  - Gerekli: def.minDerslik adet geçerli ve BÖLÜMSÜZ (deptId===null) derslik/amfi;
 *    def.labGerekli ise >=1 geçerli laboratuvar (lablar bölümler arası ortak sayılır ama
 *    en az 1 olmalı); para >= acilisMaliyeti. Eksikler Türkçe metinlerle listelenir.
 *  - minAkademisyen açılış şartı DEĞİL (sonradan atanır) ama eksikse yerleştirmede talep 0.
 *
 * openDepartment(state, defId): boolean — spend, Department kaydı (kontenjan=40,
 *   ylKontenjan=8, doktoraKontenjan=4, ylAcik/doktoraAcik=false), notify(iyi),
 *   assignClassrooms çağır, addPrestij(+5).
 *
 * setQuota(state, deptId, kontenjan): 0-300 clamp. setYlQuota/setDoktoraQuota: 0-40.
 *
 * toggleGradProgram(state, deptId, 'yl'|'doktora'): YL için bölümde >=1 docent/prof,
 *   doktora için >=1 prof VE ylAcik gerekli. Açılınca notify(iyi).
 *
 * assignClassrooms(state): geçerli derslik/amfileri bölümlere dağıtır (room.deptId yaz).
 *  - Önce mevcut atamaları koru; bölümsüz geçerli odaları öğrenci sayısı / sıra kapasitesi
 *    oranı en kötü bölüme ver. Bölüm kapanmaz ama oda yıkılırsa deptId null'a döner
 *    (geçersiz odaların deptId'sini null yap). Lablar da (varsa) bölümlere aynı mantıkla.
 *
 * seatCapacity(state, deptId): bölüme atanmış geçerli dersliklerdeki 'sira' sayısı.
 *
 * semesterStart(state): dönem başı (game.ts çağırır).
 *  - Her bölüm: akademisyen sayısı < minAkademisyen ise talep=0, notify(kotu).
 *    Yoksa talep = tabanTalep * (prestij/100)^0.7 * strateji çarpanları
 *    ('tanitim' x1.25, 'uluslararasi_ofis' x1.15) * rastgele(0.8-1.2).
 *  - Yeni kayıt = min(kontenjan, floor(talep), seatCapacity - mevcutÖğrenci) (>=0).
 *    spawnStudent ile 'lisans' öğrencileri yarat. sonTalep/sonKayit güncelle.
 *  - YL/doktora açıksa: talep*0.15 → min(ylKontenjan,...) YL; talep*0.08 → doktora.
 *    (YL/doktora için seat kısıtı yok — lab/kütüphanede çalışırlar.)
 *  - Ödenek: yeni kayıt başına BALANCE.OGRENCI_ODENEK (+YL_ODENEK/DOKTORA_ODENEK);
 *    'arastirma_universitesi' stratejisi x1.25. earn + notify(iyi, toplam).
 *  - Kontenjan dolmadıysa notify(bilgi) 'X bölümünde N kontenjan boş kaldı'.
 *
 * semesterEnd(state): biten dönem için (game.ts, semesterStart'tan önce çağırır).
 *  - ilerleme >= BALANCE.MEZUNIYET_ESIK öğrenciler mezun: removeAgent, toplamMezun++,
 *    dept.mezunSayisi++, mezun başına BALANCE.MEZUN_BONUS earn + PRESTIJ.mezun.
 *    notify(iyi) '... bölümünden N öğrenci mezun oldu'.
 *
 * dailyDepartmentUpdate(state): gün sonu.
 *  - Bırakma: mutluluk < BALANCE.MUTLULUK_BIRAKMA_ESIK öğrenciler BIRAKMA_OLASILIK ile
 *    bırakır: removeAgent, toplamBirakan++, addPrestij(PRESTIJ.birakan), notify(kotu, toplu).
 *  - 'yemek_subvansiyon' stratejisi: tüm öğrencilere mutluluk +2 (gider economy'de).
 *  - Prestij doğal sürüklenme: ortalama mutluluk > 70 ise +0.3, < 40 ise -0.5.
 */
import { GameState } from '../core/types';

export function canOpenDepartment(state: GameState, defId: string): { ok: boolean; eksik: string[] } {
  // TODO(workflow)
  return { ok: false, eksik: ['uygulanmadı'] };
}

export function openDepartment(state: GameState, defId: string): boolean {
  // TODO(workflow)
  return false;
}

export function setQuota(state: GameState, deptId: number, kontenjan: number): void {
  // TODO(workflow)
  void state; void deptId; void kontenjan;
}

export function setYlQuota(state: GameState, deptId: number, kontenjan: number): void {
  // TODO(workflow)
  void state; void deptId; void kontenjan;
}

export function setDoktoraQuota(state: GameState, deptId: number, kontenjan: number): void {
  // TODO(workflow)
  void state; void deptId; void kontenjan;
}

export function toggleGradProgram(state: GameState, deptId: number, level: 'yl' | 'doktora'): boolean {
  // TODO(workflow)
  return false;
}

export function assignClassrooms(state: GameState): void {
  // TODO(workflow)
  void state;
}

export function seatCapacity(state: GameState, deptId: number): number {
  // TODO(workflow)
  return 0;
}

export function semesterStart(state: GameState): void {
  // TODO(workflow)
  void state;
}

export function semesterEnd(state: GameState): void {
  // TODO(workflow)
  void state;
}

export function dailyDepartmentUpdate(state: GameState): void {
  // TODO(workflow)
  void state;
}
