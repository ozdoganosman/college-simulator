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
import {
  ALAN_META, Academic, Department, GameState, RANK_LABEL, Room, Student, YerlestirmeSatir,
  donemIndex, yil,
} from '../core/types';
import { courseDef, dersEtki, rebuildDersProgrami, verilemeyenDersler } from './schedule';
import { chance, clamp, formatMoney, newId, randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { bolumBaskinAlan, deptDef } from '../data/departments';
import { addPrestij, earn, notify, spend } from './state';
import { gnoHesapla, removeAgent, spawnStudent } from './agents';
import { mezunEkle } from './alumni';

function sinifMi(r: Room): boolean {
  return r.type === 'derslik' || r.type === 'amfi';
}

export function canOpenDepartment(state: GameState, defId: string): { ok: boolean; eksik: string[] } {
  if (state.departments.some((d) => d.defId === defId)) {
    return { ok: false, eksik: ['Bölüm zaten açık'] };
  }
  const def = deptDef(defId);
  const eksik: string[] = [];

  // Toplam derslik, açık bölümlerin asgari ihtiyaçları + yeni bölümün ihtiyacını
  // karşılamalı (derslikler bölümlere her gün yeniden dengelenerek dağıtılır).
  const toplamDerslik = state.rooms.filter((r) => sinifMi(r) && r.valid).length;
  let gerekli = def.minDerslik;
  for (const d of state.departments) gerekli += deptDef(d.defId).minDerslik;
  if (toplamDerslik < gerekli) {
    eksik.push(`Toplam ${gerekli} geçerli derslik gerekli (mevcut ${toplamDerslik})`);
  }
  if (def.labGerekli && !state.rooms.some((r) => r.type === 'laboratuvar' && r.valid)) {
    eksik.push('Geçerli laboratuvar yok');
  }
  // Öğretim kapasitesi: her bölüm günde 4 blok ders ister, bir hoca günde en çok
  // 2 blok verebilir — kapasite yetmezse program "hoca yok!" ile dolar
  const hocaSayisi = state.agents.filter((a) => a.kind === 'akademisyen').length;
  const blokIhtiyac = (state.departments.length + 1) * 4;
  if (hocaSayisi * 2 < blokIhtiyac) {
    eksik.push(`Öğretim kapasitesi yetersiz: ${Math.ceil((blokIhtiyac - hocaSayisi * 2) / 2)} hoca daha gerek (bir hoca günde en çok 2 blok ders verir)`);
  }
  // Müfredat şartı: bölümün TÜM dersleri "açık derslerde" olmalı — yani her ders
  // en az bir hocanın yıllık ders seçiminde bulunmalı (derslerden bölümlere).
  for (const dersId of verilemeyenDersler(state, defId)) {
    const ders = courseDef(dersId);
    const alan = ALAN_META[ders.birincil];
    eksik.push(`${ders.kod} ${ders.ad} açık derslerde değil — 📅 Program panelinden ${alan.emoji} ${alan.ad} bir hocaya seçtir`);
  }
  if (state.para < def.acilisMaliyeti) {
    eksik.push(`Bütçe yetersiz (${formatMoney(def.acilisMaliyeti)} gerekli)`);
  }
  return { ok: eksik.length === 0, eksik };
}

export function openDepartment(state: GameState, defId: string): boolean {
  const kontrol = canOpenDepartment(state, defId);
  if (!kontrol.ok) {
    // buton "hazır" gösterdiyse bile son durum değişmiş olabilir — sebebi söyle
    notify(state, `Bölüm açılamadı: ${kontrol.eksik[0]}`, 'kotu');
    return false;
  }
  const def = deptDef(defId);
  if (!spend(state, def.acilisMaliyeti, `${def.ad} açılışı`)) return false;

  const dept: Department = {
    id: newId(state),
    defId,
    kontenjan: 40,
    ylKontenjan: 8,
    doktoraKontenjan: 4,
    ylAcik: false,
    doktoraAcik: false,
    sonTalep: 0,
    sonKayit: 0,
    sonTavanSira: 0,
    sonTabanSira: 0,
    acilisDonemi: donemIndex(state.gun),
    mezunSayisi: 0,
  };
  state.departments.push(dept);
  addPrestij(state, 5);
  notify(state, `🎉 ${def.ad} bölümü açıldı!`, 'iyi');
  assignClassrooms(state);
  rebuildDersProgrami(state);
  return true;
}

export function setQuota(state: GameState, deptId: number, kontenjan: number): void {
  const dept = state.departments.find((d) => d.id === deptId);
  if (dept) dept.kontenjan = clamp(Math.round(kontenjan), 0, 300);
}

export function setYlQuota(state: GameState, deptId: number, kontenjan: number): void {
  const dept = state.departments.find((d) => d.id === deptId);
  if (dept) dept.ylKontenjan = clamp(Math.round(kontenjan), 0, 40);
}

export function setDoktoraQuota(state: GameState, deptId: number, kontenjan: number): void {
  const dept = state.departments.find((d) => d.id === deptId);
  if (dept) dept.doktoraKontenjan = clamp(Math.round(kontenjan), 0, 40);
}

export function toggleGradProgram(state: GameState, deptId: number, level: 'yl' | 'doktora'): boolean {
  const dept = state.departments.find((d) => d.id === deptId);
  if (!dept) return false;
  const def = deptDef(dept.defId);

  if (level === 'yl') {
    if (dept.ylAcik) {
      dept.ylAcik = false;
      dept.doktoraAcik = false; // doktora YL'ye bağlı
      return true;
    }
    const uyeVar = state.agents.some((a) =>
      a.kind === 'akademisyen' && a.deptId === dept.id && (a.rank === 'docent' || a.rank === 'prof'));
    if (!uyeVar) {
      notify(state, `${def.ad}: yüksek lisans için en az 1 Doçent/Profesör gerekli`, 'kotu');
      return false;
    }
    dept.ylAcik = true;
    notify(state, `🎓 ${def.ad} yüksek lisans programı açıldı!`, 'iyi');
    return true;
  }

  if (dept.doktoraAcik) {
    dept.doktoraAcik = false;
    return true;
  }
  if (!dept.ylAcik) {
    notify(state, `${def.ad}: doktora için önce yüksek lisans programı açılmalı`, 'kotu');
    return false;
  }
  const profVar = state.agents.some((a) =>
    a.kind === 'akademisyen' && a.deptId === dept.id && a.rank === 'prof');
  if (!profVar) {
    notify(state, `${def.ad}: doktora için en az 1 Profesör gerekli`, 'kotu');
    return false;
  }
  dept.doktoraAcik = true;
  notify(state, `🎓 ${def.ad} doktora programı açıldı!`, 'iyi');
  return true;
}

export function assignClassrooms(state: GameState): void {
  // Derslikler her çağrıda SIFIRDAN, ihtiyaç oranına göre dengelenerek dağıtılır —
  // böylece yeni açılan bölüm de mevcut stoktan adil pay alır.
  for (const r of state.rooms) {
    if (sinifMi(r) || r.deptId !== null) {
      if (sinifMi(r)) r.deptId = null;
      else if (!r.valid || !state.departments.some((d) => d.id === r.deptId)) r.deptId = null;
    }
  }
  if (state.departments.length === 0) return;

  // oda -> sıra sayısı (tek geçiş)
  const odaSira = new Map<number, number>();
  for (const o of state.objects) {
    if (o.type === 'sira') odaSira.set(o.roomId, (odaSira.get(o.roomId) ?? 0) + 1);
  }

  // bölüm -> lisans öğrenci sayısı
  const ogrenci = new Map<number, number>();
  for (const a of state.agents) {
    if (a.kind === 'ogrenci' && a.level === 'lisans') {
      ogrenci.set(a.deptId, (ogrenci.get(a.deptId) ?? 0) + 1);
    }
  }

  const koltuk = new Map<number, number>();
  const odaAdedi = new Map<number, number>();
  for (const d of state.departments) {
    koltuk.set(d.id, 0);
    odaAdedi.set(d.id, 0);
  }

  // Geçerli derslik/amfileri tek tek, doyma oranı en düşük bölüme ver.
  // Bölüm doymuş sayılır: koltuk >= öğrenci + kontenjan VE oda >= minDerslik.
  for (const r of state.rooms) {
    if (!sinifMi(r) || !r.valid) continue;
    let secilen: Department | null = null;
    let enKotu = Infinity;
    for (const d of state.departments) {
      const ihtiyac = Math.max(1, (ogrenci.get(d.id) ?? 0) + d.kontenjan);
      const mevcut = koltuk.get(d.id) ?? 0;
      const minOda = deptDef(d.defId).minDerslik;
      if (mevcut >= ihtiyac && (odaAdedi.get(d.id) ?? 0) >= minOda) continue; // doydu
      const oran = mevcut / ihtiyac;
      if (oran < enKotu) {
        enKotu = oran;
        secilen = d;
      }
    }
    if (secilen) {
      r.deptId = secilen.id;
      koltuk.set(secilen.id, (koltuk.get(secilen.id) ?? 0) + (odaSira.get(r.id) ?? 0));
      odaAdedi.set(secilen.id, (odaAdedi.get(secilen.id) ?? 0) + 1);
    }
  }

  // Lablar: lab gerektiren bölümlere sırayla dağıt (ortak kullanım — atama kozmetik)
  const labBolumler = state.departments.filter((d) => deptDef(d.defId).labGerekli);
  if (labBolumler.length > 0) {
    let i = 0;
    for (const r of state.rooms) {
      if (r.type !== 'laboratuvar' || !r.valid) continue;
      r.deptId = labBolumler[i % labBolumler.length].id;
      i++;
    }
  }
}

export function seatCapacity(state: GameState, deptId: number): number {
  const odalar = new Set<number>();
  for (const r of state.rooms) {
    if (sinifMi(r) && r.valid && r.deptId === deptId) odalar.add(r.id);
  }
  if (odalar.size === 0) return 0;
  let sira = 0;
  for (const o of state.objects) {
    if (o.type === 'sira' && odalar.has(o.roomId)) sira++;
  }
  return sira;
}

/**
 * YKS yerleştirmesini çalıştırır — oyuncu 'Yerleştirmeyi Başlat' butonuna basınca.
 * Yılda bir kez (yksBekliyor açıkken) çalışır; sonuçlar törenle açıklanır.
 */
export function runYerlestirme(state: GameState): boolean {
  if (!state.yksBekliyor) {
    notify(state, 'YKS dönemi kapalı — yeni yerleştirme her yıl başında açılır.', 'kotu');
    return false;
  }
  if (state.departments.length === 0) {
    notify(state, 'Önce bir bölüm açmalısın (🎓 Bölümler paneli).', 'kotu');
    return false;
  }
  state.yksBekliyor = false;

  // bölüm -> akademisyen ve lisans öğrenci sayıları (tek geçiş)
  const akademisyen = new Map<number, number>();
  const lisans = new Map<number, number>();
  for (const a of state.agents) {
    if (a.kind === 'akademisyen') {
      akademisyen.set(a.deptId, (akademisyen.get(a.deptId) ?? 0) + 1);
    } else if (a.kind === 'ogrenci' && a.level === 'lisans') {
      lisans.set(a.deptId, (lisans.get(a.deptId) ?? 0) + 1);
    }
  }

  let odenek = 0;
  let toplamYeni = 0;
  const torenSatirlari: YerlestirmeSatir[] = [];

  for (const dept of state.departments) {
    const def = deptDef(dept.defId);

    if ((akademisyen.get(dept.id) ?? 0) < def.minAkademisyen) {
      dept.sonTalep = 0;
      dept.sonKayit = 0;
      dept.sonTavanSira = 0;
      dept.sonTabanSira = 0;
      notify(state, `${def.ad}: öğretim üyesi yetersiz, YÖK kontenjan vermedi`, 'kotu');
      torenSatirlari.push({
        bolumAd: def.ad, kisa: def.kisa, renk: def.renk,
        kontenjan: dept.kontenjan, yerlesen: 0, talep: 0,
        tavanSira: 0, tabanSira: 0, doldu: false, iptal: true,
      });
      continue;
    }

    // prestij 0'ken bile %12 taban talep vardır (yeni kurulan üniversiteye
    // yine de öğrenci gelir) — prestij yükseldikçe tam talebe yaklaşılır
    let talep = def.tabanTalep * (0.12 + 0.88 * Math.pow(state.prestij / 100, 0.7));
    if (state.strategies.includes('tanitim')) talep *= 1.25;
    if (state.strategies.includes('uluslararasi_ofis')) talep *= 1.15;
    talep *= randRange(state, 0.8, 1.2);

    const bosKoltuk = seatCapacity(state, dept.id) - (lisans.get(dept.id) ?? 0);
    const yeniKayit = Math.max(0, Math.min(dept.kontenjan, Math.floor(talep), bosKoltuk));
    for (let i = 0; i < yeniKayit; i++) spawnStudent(state, dept.id, 'lisans');
    dept.sonTalep = Math.floor(talep);
    dept.sonKayit = yeniKayit;
    // önlisans öğrencisi için ödenek daha düşük
    const birimOdenek = def.tur === 'onlisans'
      ? Math.round(BALANCE.OGRENCI_ODENEK * 0.65)
      : BALANCE.OGRENCI_ODENEK;
    odenek += yeniKayit * birimOdenek;
    toplamYeni += yeniKayit;

    // YKS başarı sıraları: çekicilik arttıkça tavan/taban sırası iyileşir (küçülür)
    const cekicilik = Math.max(1, talep);
    const doldu = yeniKayit >= dept.kontenjan && yeniKayit > 0;
    if (yeniKayit > 0) {
      dept.sonTavanSira = Math.max(850, Math.round(3_000_000 / (cekicilik * randRange(state, 10, 22))));
      dept.sonTabanSira = doldu
        ? Math.max(dept.sonTavanSira * 2, Math.round(3_000_000 / (cekicilik * randRange(state, 1.6, 2.6))))
        : Math.round(randRange(state, 1_700_000, 2_600_000)); // boş kaldıysa taban dibe vurur
    } else {
      dept.sonTavanSira = 0;
      dept.sonTabanSira = 0;
    }
    torenSatirlari.push({
      bolumAd: def.ad, kisa: def.kisa, renk: def.renk,
      kontenjan: dept.kontenjan, yerlesen: yeniKayit, talep: dept.sonTalep,
      tavanSira: dept.sonTavanSira, tabanSira: dept.sonTabanSira, doldu, iptal: false,
    });

    if (dept.ylAcik) {
      const ylKayit = Math.max(0, Math.min(dept.ylKontenjan, Math.floor(talep * 0.15)));
      for (let i = 0; i < ylKayit; i++) spawnStudent(state, dept.id, 'yl');
      odenek += ylKayit * BALANCE.YL_ODENEK;
      toplamYeni += ylKayit;
    }
    if (dept.doktoraAcik) {
      const dokKayit = Math.max(0, Math.min(dept.doktoraKontenjan, Math.floor(talep * 0.08)));
      for (let i = 0; i < dokKayit; i++) spawnStudent(state, dept.id, 'doktora');
      odenek += dokKayit * BALANCE.DOKTORA_ODENEK;
      toplamYeni += dokKayit;
    }

    if (yeniKayit < dept.kontenjan) {
      notify(state, `${def.ad} bölümünde ${dept.kontenjan - yeniKayit} kontenjan boş kaldı`, 'bilgi');
    }
  }

  if (state.strategies.includes('arastirma_universitesi')) odenek *= 1.25;
  if (toplamYeni > 0) {
    odenek = Math.round(odenek);
    earn(state, odenek);
    notify(state, `📥 Dönem ödeneği: ${formatMoney(odenek)}  (${toplamYeni} yeni öğrenci)`, 'iyi');
  }

  // Sonuçlar her zaman törenle açıklanır
  state.yerlestirme = {
    yil: yil(state.gun),
    toplamYerlesen: toplamYeni,
    odenek: Math.round(odenek),
    satirlar: torenSatirlari,
  };
  return true;
}

/** Her dönem başında mevcut öğrenciler için devlet desteği (ekonomi dengesi). */
export function donemDestegi(state: GameState): void {
  let ogrenci = 0;
  for (const a of state.agents) if (a.kind === 'ogrenci') ogrenci++;
  if (ogrenci === 0) return;
  const tutar = ogrenci * BALANCE.DONEM_DESTEK;
  earn(state, tutar);
  notify(state, `🏛️ Dönem desteği: ${formatMoney(tutar)} (${ogrenci} öğrenci)`, 'iyi');
}

export function semesterEnd(state: GameState): void {
  const deptMap = new Map<number, Department>();
  for (const d of state.departments) deptMap.set(d.id, d);

  // önce topla (removeAgent diziyi değiştirir), sonra çıkar.
  // önlisans 2 yıllıktır: mezuniyet eşiği yarısıdır.
  const mezunlar: Student[] = [];
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    const dept = deptMap.get(a.deptId);
    const esik = dept && deptDef(dept.defId).tur === 'onlisans'
      ? BALANCE.MEZUNIYET_ESIK / 2
      : BALANCE.MEZUNIYET_ESIK;
    if (a.ilerleme >= esik) mezunlar.push(a);
  }
  if (mezunlar.length === 0) return;

  const bolumMezun = new Map<number, number>();
  let toplamBagis = 0;
  let zenginMezun = 0;
  for (const s of mezunlar) {
    // girişim ekosistemi: mezun, sermayesinin bir kısmını okula bağışlar
    const bagis = Math.round(s.sermaye * BALANCE.MEZUN_BAGIS_ORANI);
    toplamBagis += bagis;
    if (s.sermaye >= BALANCE.ZENGIN_MEZUN_ESIK) zenginMezun++;
    // mezunlar derneğine kayıt: puanına göre işe yerleşir, kariyeri yıllık ilerler
    const mezunDept = deptMap.get(s.deptId);
    mezunEkle(state, s, mezunDept ? deptDef(mezunDept.defId).ad : 'Kapanan Bölüm', gnoHesapla(s));
    // Doktora → Arş. Gör. döngüsü: kendi doktora mezunumuz KPSS havuzuna düşer —
    // indirimli maaş ister, becerisi kendi çalışmasına VE danışmanına bağlıdır
    if (s.level === 'doktora') {
      const danisman = state.agents.find(
        (a): a is Academic => a.id === s.danisman && a.kind === 'akademisyen',
      );
      const alan = mezunDept ? bolumBaskinAlan(mezunDept.defId) : s.nitelik.muhendis >= s.nitelik.pratik ? 'muhendis' : 'pratik';
      const gno = gnoHesapla(s) ?? 2;
      state.kpssPool.push({
        id: newId(state),
        ad: s.ad,
        rank: 'arsgor',
        alan,
        egitim: clamp(Math.round(28 + gno * 8 + (danisman?.egitim ?? 40) * 0.25), 25, 90),
        arastirma: clamp(Math.round(28 + s.nitelik[alan] * 0.3 + (danisman?.arastirma ?? 40) * 0.3), 25, 90),
        maas: Math.round(BALANCE.MAAS.arsgor * 0.85), // yuvaya dönüş indirimi
        bonus: 0,
        kurum: '',
        mezunumuz: true,
        danismanAd: danisman ? `${RANK_LABEL[danisman.rank]} ${danisman.ad}` : undefined,
      });
      if (danisman) {
        danisman.yetistirdigi++;
        addPrestij(state, 1);
        notify(state, `🌳 ${danisman.ad}'in doktora öğrencisi ${s.ad} mezun oldu — KPSS havuzunda bizi bekliyor!`, 'odul');
      } else {
        notify(state, `🎓 Doktora mezunumuz ${s.ad} KPSS havuzuna katıldı — kendi yetiştirdiğimiz akademisyen!`, 'iyi');
      }
    }
    removeAgent(state, s.id);
    state.toplamMezun++;
    const dept = deptMap.get(s.deptId);
    if (dept) dept.mezunSayisi++;
    earn(state, BALANCE.MEZUN_BONUS + bagis);
    addPrestij(state, BALANCE.PRESTIJ.mezun);
    if (s.level === 'doktora') addPrestij(state, 1); // doktora mezunu ekstra prestij
    bolumMezun.set(s.deptId, (bolumMezun.get(s.deptId) ?? 0) + 1);
  }

  for (const [deptId, n] of bolumMezun) {
    const dept = deptMap.get(deptId);
    if (!dept) continue;
    notify(state, `🎓 ${deptDef(dept.defId).ad} bölümünden ${n} öğrenci mezun oldu`, 'iyi');
  }
  if (toplamBagis > 0) {
    notify(state, `💝 Mezun bağışları: ${formatMoney(toplamBagis)} — girişimci mezunlar okulunu unutmaz!`, 'odul');
  }
  if (zenginMezun > 0) {
    addPrestij(state, Math.min(10, zenginMezun * 2));
    notify(state, `💰 ${zenginMezun} zengin girişimci mezun verdik — prestij +${Math.min(10, zenginMezun * 2)}!`, 'odul');
  }
}

export function dailyDepartmentUpdate(state: GameState): void {
  // Bırakma — mutluluk desteğinden ÖNCE değerlendirilir
  const birakanlar: number[] = [];
  for (const a of state.agents) {
    if (a.kind === 'ogrenci' && a.mutluluk < BALANCE.MUTLULUK_BIRAKMA_ESIK
        && chance(state, BALANCE.BIRAKMA_OLASILIK)) {
      birakanlar.push(a.id);
    }
  }
  for (const id of birakanlar) {
    removeAgent(state, id);
    state.toplamBirakan++;
    addPrestij(state, BALANCE.PRESTIJ.birakan);
  }
  if (birakanlar.length > 0) {
    notify(state, `😞 ${birakanlar.length} öğrenci okulu bıraktı`, 'kotu');
  }

  // Yemekhane sübvansiyonu: mutluluk +2 (gider economy.ts'te)
  const subvansiyon = state.strategies.includes('yemek_subvansiyon');
  let toplamMutluluk = 0;
  let ogrenciSayisi = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    if (subvansiyon) a.mutluluk = clamp(a.mutluluk + 2, 0, 100);
    toplamMutluluk += a.mutluluk;
    ogrenciSayisi++;
  }

  // Prestij doğal sürüklenme
  if (ogrenciSayisi > 0) {
    const ortalama = toplamMutluluk / ogrenciSayisi;
    if (ortalama > 70) addPrestij(state, 0.3);
    else if (ortalama < 40) addPrestij(state, -0.5);
  }
}
