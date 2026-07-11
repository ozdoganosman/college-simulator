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
import { AcademicRank, Candidate, DONEM_GUN, GameState, RANK_LABEL } from '../core/types';
import { chance, clamp, formatMoney, newId, pick, randInt, randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { AD, RAKIP_UNILER, SOYAD } from '../data/names';
import { removeAgent, spawnAcademic } from './agents';
import { ASISTAN_LIMIT, asistanlari, dersYukuVerimi, otoDersSec, rebuildDersProgrami } from './schedule';
import { siralama } from './rivals';
import { transferBonusCarpani } from './rivals';

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
  // Kendi doktora mezunlarımız havuzdan silinmez — işe alınana dek bekler (en yeni 8)
  const mezunlarimiz = state.kpssPool.filter((c) => c.mezunumuz).slice(-8);
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
      yas: randInt(state, 27, 38),
    });
  }
  state.kpssPool = [...mezunlarimiz, ...kpss];

  // Transfer havuzu: deneyimli adaylar, imza bonusu ister
  const transfer: Candidate[] = [];
  const transferSayi = randInt(state, 4, 6);
  for (let i = 0; i < transferSayi; i++) {
    const rank = pick(state, ['dr', 'docent', 'prof'] as const);
    const [bonusMin, bonusMax] = BONUS_ARALIK[rank];
    // aday sıralamadaki bir rakipten gelir: zirvedeki üniden ayartmak pahalı,
    // dibe düşenden ucuz — becerileri de kurumunun gücünü yansıtır
    const rakip = state.rakipler.length > 0 ? pick(state, state.rakipler) : null;
    const kurum = rakip ? rakip.ad : pick(state, RAKIP_UNILER);
    const carpan = transferBonusCarpani(state, kurum);
    const beceriTaban = Math.round(clamp(40 + (carpan - 0.7) * 45, 40, 78)); // iyi üni = iyi hoca
    // aday çoğunlukla kurumunun uzmanlık alanından çıkar
    const alan = rakip && randInt(state, 0, 99) < 60 ? rakip.uzmanlik : pick(state, ALANLAR);
    transfer.push({
      id: newId(state),
      ad: rastgeleAd(state),
      rank,
      alan,
      egitim: randInt(state, beceriTaban, 95),
      arastirma: randInt(state, beceriTaban, 95),
      maas: Math.round(BALANCE.MAAS[rank] * randRange(state, 1.1, 1.5)),
      bonus: Math.round((randRange(state, bonusMin, bonusMax) * carpan) / 1000) * 1000,
      kurum,
      yas: randInt(state, 38, 58),
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

  const yeni = spawnAcademic(state, aday.ad, deptId, aday.rank, aday.alan, aday.egitim, aday.arastirma, aday.maas, aday.yas);
  if (aday.mezunumuz) {
    // akademik soyağacı: kendi mezunumuz kadroya döndü — döngü tamamlandı
    yeni.mezunumuz = true;
    yeni.danismanAd = aday.danismanAd;
    addPrestij(state, 2);
    notify(state, `🌳 ${aday.ad} kendi doktora mezunumuz olarak kadroya döndü — akademik soyağacımız büyüyor! (+2 prestij)`, 'odul');
  }
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


/** YL/doktora öğrencisini hocaya asistan atar — okul asistana günlük maaş öder. */
export function asistanAta(state: GameState, studentId: number, academicId: number): boolean {
  const ogrenci = state.agents.find((a) => a.id === studentId);
  const hoca = state.agents.find((a) => a.id === academicId);
  if (!ogrenci || ogrenci.kind !== 'ogrenci' || !hoca || hoca.kind !== 'akademisyen') return false;
  if (ogrenci.level === 'lisans') {
    notify(state, 'Yalnızca yüksek lisans ve doktora öğrencileri asistan olabilir.', 'kotu');
    return false;
  }
  if (asistanlari(state, academicId).length >= ASISTAN_LIMIT) {
    notify(state, `${hoca.ad} en fazla ${ASISTAN_LIMIT} asistan alabilir.`, 'kotu');
    return false;
  }
  ogrenci.asistani = academicId;
  ogrenci.danisman = academicId; // danışmanlık asistanlığı izler (akademik soyağacı)
  notify(
    state,
    `🧑‍🔬 ${ogrenci.ad}, ${RANK_LABEL[hoca.rank]} ${hoca.ad}'in asistanı oldu (günlük ${formatMoney(BALANCE.ASISTAN_MAAS)}).`,
    'iyi',
  );
  return true;
}

/** Asistanlıktan çıkarır. */
export function asistanBirak(state: GameState, studentId: number): void {
  const ogrenci = state.agents.find((a) => a.id === studentId);
  if (!ogrenci || ogrenci.kind !== 'ogrenci') return;
  ogrenci.asistani = -1;
}

/**
 * Rakipten HEDEFLİ hoca ayartma: kur masrafı öde, şans prestij farkına bağlı.
 * Başarı: rakibin yıldız hocası kadroya katılır, rakip sarsılır (+3 prestij).
 * Ret: masraf gitti, haber duyuldu (-2 prestij). Dönemde 1 kez denenebilir.
 */
export function hedefliAyartma(state: GameState, rakipAd: string): boolean {
  const rakip = state.rakipler.find((r) => r.ad === rakipAd);
  if (!rakip) return false;
  if (state.gun - state.sonAyartmaGunu < DONEM_GUN && state.sonAyartmaGunu > 0) {
    notify(state, `Transfer masası bu dönem kapalı — bir sonraki dönem yeniden dene (dönemde 1 girişim).`, 'kotu');
    return false;
  }
  if (officeCapacity(state) <= state.agents.filter((a) => a.kind === 'akademisyen').length) {
    notify(state, 'Ofis masası yetersiz — önce yeni hocaya masa hazırla.', 'kotu');
    return false;
  }
  if (!spend(state, BALANCE.AYARTMA_MALIYET, 'transfer görüşmesi')) return false;
  state.sonAyartmaGunu = state.gun;

  const sans = clamp(0.25 + (state.prestij - rakip.prestij) / 400, 0.05, 0.75);
  if (!chance(state, sans)) {
    addPrestij(state, -2);
    notify(state, `🎣 ${rakip.ad}'in yıldız hocası teklifini REDDETTİ — görüşme basına sızdı (-2 prestij, masraf yandı).`, 'kotu');
    return false;
  }

  const rank: AcademicRank = rakip.prestij >= 220 ? 'prof' : 'docent';
  const taban = clamp(Math.round(48 + rakip.prestij / 8), 48, 92);
  const alan = rakip.uzmanlik ?? pick(state, [...ALANLAR]);
  const hoca = spawnAcademic(
    state,
    `${pick(state, AD)} ${pick(state, SOYAD)}`,
    -1,
    rank,
    alan,
    clamp(taban + randInt(state, -6, 8), 40, 95),
    clamp(taban + randInt(state, -6, 8), 40, 95),
    Math.round(BALANCE.MAAS[rank] * 1.25), // yıldız hoca yüksek maaş ister
    randInt(state, 42, 56),
  );
  hoca.memnuniyet = 78;
  rakip.prestij = Math.max(30, rakip.prestij - 15);
  addPrestij(state, 3);
  notify(state, `🎣 TRANSFER DARBESİ: ${RANK_LABEL[rank]} ${hoca.ad}, ${rakip.ad}'den kadromuza katıldı! (+3 prestij, rakip sarsıldı) — 📅 Program'dan ders dağıtmayı unutma.`, 'odul');
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

/** Hocanın kıdemine göre beklediği günlük maaş. */
export function beklenenMaas(a: { rank: AcademicRank; xp: number }): number {
  return Math.round(BALANCE.MAAS[a.rank] * (1 + Math.min(0.5, a.xp / 800)));
}

/** Zam ver: maaş ×ZAM_ORANI, memnuniyet sıçrar. */
export function zamVer(state: GameState, academicId: number): boolean {
  const a = state.agents.find((x) => x.id === academicId);
  if (!a || a.kind !== 'akademisyen') return false;
  a.maas = Math.round(a.maas * BALANCE.ZAM_ORANI);
  a.memnuniyet = clamp(a.memnuniyet + 18, 0, 100);
  notify(state, `💰 ${a.ad}'a zam verildi: günlük ${formatMoney(a.maas)} — morali yükseldi.`, 'iyi');
  return true;
}

/**
 * Dönem başı memnuniyet kontrolü: çok mutsuz hocalar istifa edip
 * sıralamadaki güçlü bir rakibe transfer olur (game.ts çağırır).
 */
export function donemIstifaKontrol(state: GameState): void {
  const mutsuzlar = state.agents.filter(
    (a) => a.kind === 'akademisyen' && a.memnuniyet < BALANCE.ISTIFA_ESIK,
  );
  for (const a of mutsuzlar) {
    if (a.kind !== 'akademisyen') continue;
    if (!chance(state, BALANCE.ISTIFA_OLASILIK)) continue;
    const rakipler = siralama(state).filter((s) => !s.oyuncu).slice(0, 6);
    const kurum = rakipler.length > 0 ? pick(state, rakipler).ad : 'rakip bir üniversite';
    const hedef = state.rakipler.find((r) => r.ad === kurum);
    if (hedef) hedef.prestij = Math.min(1000, hedef.prestij + 5);
    const etiket = `${RANK_LABEL[a.rank]} ${a.ad}`;
    removeAgent(state, a.id);
    rebuildDersProgrami(state);
    addPrestij(state, -3);
    notify(state, `📤 ${etiket} İSTİFA ETTİ — ${kurum}'a transfer oldu! (düşük memnuniyet; prestij -3)`, 'kotu');
  }
}

/** Yıl dönümü: herkes 1 yaş alır; emeklilik yaşına gelen onurla ayrılır. */
export function yillikYaslanma(state: GameState): void {
  const emekliler: string[] = [];
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen') continue;
    a.yas++;
    if (a.yas >= BALANCE.EMEKLILIK_YASI) emekliler.push(`${RANK_LABEL[a.rank]} ${a.ad}`);
  }
  for (const ad of emekliler) {
    const a = state.agents.find(
      (x) => x.kind === 'akademisyen' && `${RANK_LABEL[x.rank]} ${x.ad}` === ad,
    );
    if (!a || a.kind !== 'akademisyen') continue;
    if (a.yetistirdigi > 0) addPrestij(state, 2); // onurlu bir kariyer
    removeAgent(state, a.id);
    rebuildDersProgrami(state);
    notify(state, `👋 ${ad} ${BALANCE.EMEKLILIK_YASI} yaşında emekliye ayrıldı — kampüs kendisine minnettar.`, 'bilgi');
  }
}

export function dailyAcademicUpdate(state: GameState): void {
  const zorCarpan = state.zorluk === 'zor' ? 1.3 : 1;
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen') continue;
    // --- memnuniyet sürüklenmesi: maaş beklentisi + ders yükü + okulun hali ---
    let d = 0;
    const oran = a.maas / beklenenMaas(a);
    if (oran < 0.95) d -= (0.95 - oran) * 4;      // maaş beklentinin altında
    else if (oran > 1.1) d += 0.15;               // cömert maaş
    if (dersYukuVerimi(state, a) < 0.7) d -= 0.25; // aşırı ders yükü
    if (asistanlari(state, a.id).length > 0) d += 0.1;
    if (state.para < 0) d -= 0.4;                  // batan gemide kimse kalmaz
    if (state.prestij >= 200) d += 0.1;
    if (d < 0) d *= zorCarpan;
    a.memnuniyet = clamp(a.memnuniyet + d, 0, 100);
    const yeni = SONRAKI_RANK[a.rank];
    if (yeni === null) continue;
    const esik = BALANCE.TERFI[yeni];
    const uluslararasiGerek = 'uluslararasi' in esik ? esik.uluslararasi : 0;
    if (a.xp < esik.xp || a.makale < esik.makale || a.uluslararasiMakale < uluslararasiGerek) {
      continue;
    }
    a.rank = yeni;
    a.maas = Math.max(a.maas, BALANCE.MAAS[yeni]);
    a.memnuniyet = clamp(a.memnuniyet + 15, 0, 100); // terfi moral kaynağıdır
    a.egitim = clamp(a.egitim + randInt(state, 2, 5), 0, 100);
    a.arastirma = clamp(a.arastirma + randInt(state, 2, 5), 0, 100);
    addPrestij(state, BALANCE.PRESTIJ.terfi);
    notify(state, `${a.ad}, ${RANK_LABEL[yeni]} unvanına terfi etti!`, 'iyi');
  }
}
