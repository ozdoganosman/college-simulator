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
import { AcademicRank, Candidate, GameState, RANK_LABEL } from '../core/types';
import { clamp, formatMoney, newId, pick, randInt, randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { AD, RAKIP_UNILER, SOYAD } from '../data/names';
import { removeAgent, spawnAcademic } from './agents';
import { otoDersSec, rebuildDersProgrami } from './schedule';

const ALANLAR = ['muhendis', 'artist', 'filozof', 'pratik'] as const;
import { addPrestij, notify, spend } from './state';

type UstRank = 'dr' | 'docent' | 'prof';

/** Terfi merdiveni: bir üst rütbe (prof için yok). */
const SONRAKI_RANK: Record<AcademicRank, UstRank | null> = {
  arsgor: 'dr',
  dr: 'docent',
  docent: 'prof',
  prof: null,
};

/** Transfer imza bonusu aralıkları (₺) — rütbe ile artar. */
const BONUS_ARALIK: Record<UstRank, [number, number]> = {
  dr: [80_000, 160_000],
  docent: [150_000, 280_000],
  prof: [260_000, 400_000],
};

function rastgeleAd(state: GameState): string {
  return pick(state, AD) + ' ' + pick(state, SOYAD);
}

export function refreshCandidatePools(state: GameState): void {
  // KPSS havuzu: hepsi araştırma görevlisi
  const kpss: Candidate[] = [];
  const kpssSayi = randInt(state, 6, 9);
  for (let i = 0; i < kpssSayi; i++) {
    kpss.push({
      id: newId(state),
      ad: rastgeleAd(state),
      rank: 'arsgor',
      alan: ALANLAR[i % ALANLAR.length], // havuzda her alandan aday bulunsun
      egitim: randInt(state, 20, 55),
      arastirma: randInt(state, 20, 55),
      maas: Math.round(BALANCE.MAAS.arsgor * randRange(state, 0.85, 1.15)),
      bonus: 0,
      kurum: '',
    });
  }
  state.kpssPool = kpss;

  // Transfer havuzu: deneyimli adaylar, imza bonusu ister
  const transfer: Candidate[] = [];
  const transferSayi = randInt(state, 4, 6);
  for (let i = 0; i < transferSayi; i++) {
    const rank = pick(state, ['dr', 'docent', 'prof'] as const);
    const [bonusMin, bonusMax] = BONUS_ARALIK[rank];
    transfer.push({
      id: newId(state),
      ad: rastgeleAd(state),
      rank,
      alan: pick(state, ALANLAR),
      egitim: randInt(state, 50, 95),
      arastirma: randInt(state, 50, 95),
      maas: Math.round(BALANCE.MAAS[rank] * randRange(state, 1.1, 1.5)),
      bonus: Math.round(randRange(state, bonusMin, bonusMax) / 1000) * 1000,
      kurum: pick(state, RAKIP_UNILER),
    });
  }
  state.transferPool = transfer;
}

export function officeCapacity(state: GameState): number {
  const gecerliOfisler = new Set<number>();
  for (const r of state.rooms) {
    if (r.type === 'ofis' && r.valid) gecerliOfisler.add(r.id); // rektörlük masası yönetime aittir
  }
  let masa = 0;
  for (const o of state.objects) {
    if (o.type === 'calisma_masasi' && gecerliOfisler.has(o.roomId)) masa++;
  }
  return masa;
}

export function hireFromPool(
  state: GameState, pool: 'kpss' | 'transfer', candidateId: number, deptId: number,
): boolean {
  const havuz = pool === 'kpss' ? state.kpssPool : state.transferPool;
  const idx = havuz.findIndex((c) => c.id === candidateId);
  if (idx < 0) return false;
  const aday = havuz[idx];

  const akademisyenSayisi = state.agents.filter((a) => a.kind === 'akademisyen').length;
  if (akademisyenSayisi >= officeCapacity(state)) {
    notify(state, 'Ofis masası yetersiz — yeni çalışma masası kurun.', 'kotu');
    return false;
  }

  if (pool === 'transfer' && aday.bonus > 0) {
    if (!spend(state, aday.bonus, 'transfer imza bonusu')) return false;
  }

  const yeni = spawnAcademic(state, aday.ad, deptId, aday.rank, aday.alan, aday.egitim, aday.arastirma, aday.maas);
  otoDersSec(state, yeni.id); // yıllık ders seçimi otomatik başlar — panelden değiştirilebilir
  rebuildDersProgrami(state);
  havuz.splice(idx, 1);

  if (pool === 'transfer') {
    notify(
      state,
      `${RANK_LABEL[aday.rank]} ${aday.ad} kadroya katıldı (${aday.kurum}'nden transfer).`,
      'iyi',
    );
    addPrestij(state, BALANCE.PRESTIJ.terfi);
  } else {
    notify(state, `${RANK_LABEL[aday.rank]} ${aday.ad} kadroya katıldı (KPSS ataması).`, 'iyi');
  }
  return true;
}

export function assignAcademicDept(state: GameState, academicId: number, deptId: number): void {
  const a = state.agents.find((ag) => ag.id === academicId);
  if (!a || a.kind !== 'akademisyen') return;
  a.deptId = deptId;
  rebuildDersProgrami(state);
}

export function fireAcademic(state: GameState, academicId: number): boolean {
  const a = state.agents.find((ag) => ag.id === academicId);
  if (!a || a.kind !== 'akademisyen') return false;
  const tazminat = 30 * a.maas;
  if (!spend(state, tazminat, 'işten çıkarma tazminatı')) return false;
  const etiket = `${RANK_LABEL[a.rank]} ${a.ad}`;
  removeAgent(state, academicId);
  rebuildDersProgrami(state);
  notify(state, `${etiket} işten çıkarıldı (tazminat ${formatMoney(tazminat)}).`, 'kotu');
  return true;
}

export function dailyAcademicUpdate(state: GameState): void {
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen') continue;
    const yeni = SONRAKI_RANK[a.rank];
    if (yeni === null) continue;
    const esik = BALANCE.TERFI[yeni];
    const uluslararasiGerek = 'uluslararasi' in esik ? esik.uluslararasi : 0;
    if (a.xp < esik.xp || a.makale < esik.makale || a.uluslararasiMakale < uluslararasiGerek) {
      continue;
    }
    a.rank = yeni;
    a.maas = Math.max(a.maas, BALANCE.MAAS[yeni]);
    a.egitim = clamp(a.egitim + randInt(state, 2, 5), 0, 100);
    a.arastirma = clamp(a.arastirma + randInt(state, 2, 5), 0, 100);
    addPrestij(state, BALANCE.PRESTIJ.terfi);
    notify(state, `${a.ad}, ${RANK_LABEL[yeni]} unvanına terfi etti!`, 'iyi');
  }
}
