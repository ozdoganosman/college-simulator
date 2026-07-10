/**
 * SPEC — Akademik kadro: KPSS/ilan alımı, transfer, terfi, işten çıkarma.
 *
 * refreshCandidatePools(state): her dönem başında (ve oyun başında) çağrılır.
 *  - kpssPool: 6-9 aday, hepsi rank='arsgor', egitim/arastirma 20-55 arası,
 *    maas=BALANCE.MAAS.arsgor civarı (±%15), bonus=0, kurum=''.
 *  - transferPool: 4-6 aday, rank dr/docent/prof karışık, egitim/arastirma 50-95,
 *    maas = rank taban maaşının 1.1-1.5 katı, bonus = 80k-400k (rank ile artar),
 *    kurum = RAKIP_UNILER'den rastgele. İsimler AD+SOYAD'dan üretilir (util.pick).
 *
 * officeCapacity(state): geçerli 'ofis' ve 'rektorluk' odalarındaki calisma_masasi
 *   sayısı. Akademisyen sayısı bunu aşamaz (alımda kontrol, mesaj: 'Ofis masası yetersiz').
 *
 * hireFromPool(state, pool: 'kpss'|'transfer', candidateId, deptId): boolean
 *  - Kapasite ve (transferse) bonus ödemesi kontrolü; spend() ile öde.
 *  - spawnAcademic ile ajan yarat, havuzdan çıkar, notify (iyi):
 *    'Doç. Dr. X Y kadroya katıldı (transfer)' gibi. Transfer prestij +BALANCE.PRESTIJ.terfi.
 *  - deptId=-1 olabilir (bölümsüz/havuz) — bölüm henüz yoksa da alım yapılabilsin.
 *
 * assignAcademicDept(state, academicId, deptId): akademisyeni bölüme atar/taşır.
 * fireAcademic(state, academicId): tazminat = 30 günlük maaş; spend başarısızsa iptal.
 *   removeAgent ile çıkar, notify(kotu).
 *
 * dailyAcademicUpdate(state): gün sonunda çağrılır.
 *  - Terfi kontrolü (BALANCE.TERFI): xp + makale (+uluslararası) eşiği geçen akademisyen
 *    bir üst rütbeye terfi eder: rank yükselt, maas = BALANCE.MAAS[yeniRank],
 *    egitim+arastirma küçük artış (+2..+5), notify(iyi) + addPrestij(PRESTIJ.terfi).
 *  - Araştırma XP'si research.ts içinde ekleniyor; burada sadece eşik kontrolü.
 */
import { Candidate, GameState } from '../core/types';

export function refreshCandidatePools(state: GameState): void {
  // TODO(workflow)
  void state;
}

export function officeCapacity(state: GameState): number {
  // TODO(workflow)
  return 0;
}

export function hireFromPool(
  state: GameState, pool: 'kpss' | 'transfer', candidateId: number, deptId: number,
): boolean {
  // TODO(workflow)
  return false;
}

export function assignAcademicDept(state: GameState, academicId: number, deptId: number): void {
  // TODO(workflow)
  void state; void academicId; void deptId;
}

export function fireAcademic(state: GameState, academicId: number): boolean {
  // TODO(workflow)
  return false;
}

export function dailyAcademicUpdate(state: GameState): void {
  // TODO(workflow)
  void state;
}
