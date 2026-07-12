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
  ALAN_META, Academic, Department, GameState, MezuniyetSonuc, RANK_LABEL, Room, Student,
  YerlestirmeSatir, donemIndex, yil,
} from '../core/types';
import { courseDef, dersEtki, rebuildDersProgrami, verilemeyenDersler } from './schedule';
import { chance, clamp, formatMoney, newId, randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { bolumBaskinAlan, deptDef } from '../data/departments';
import { addPrestij, earn, notify, spend } from './state';
import { gnoHesapla, removeAgent, spawnStudent } from './agents';
import { istihdamOrani, mezunEkle, mutevelliBonusu } from './alumni';
import { cazibePuani, faaliyetPuani } from './campus';
import { bolumUcreti, odemeGucu } from './economy';

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
    ucret: null,
    sonGeriCevrilen: 0,
    kapaniyor: false,
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
  // YERLEŞİK: mevcut geçerli atamalar KORUNUR (bölüm silinene / oda bozulana dek
  // değişmez). Yalnız atamasız/boş odalar en çok ihtiyacı olan bölüme verilir —
  // böylece derslik yeri sabit kalır ama yeni oda kurulunca aç bölüme akar.
  for (const r of state.rooms) {
    if (r.deptId !== null && (!r.valid || !state.departments.some((d) => d.id === r.deptId))) {
      r.deptId = null;
    }
  }
  if (state.departments.length === 0) {
    for (const d of state.departments) d.derslikId = null;
    return;
  }

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

  // KORUNAN atamalardan mevcut doluluğu say (sıfırdan değil)
  const koltuk = new Map<number, number>();
  const odaAdedi = new Map<number, number>();
  for (const d of state.departments) {
    koltuk.set(d.id, 0);
    odaAdedi.set(d.id, 0);
  }
  for (const r of state.rooms) {
    if (sinifMi(r) && r.valid && r.deptId !== null && koltuk.has(r.deptId)) {
      koltuk.set(r.deptId, (koltuk.get(r.deptId) ?? 0) + (odaSira.get(r.id) ?? 0));
      odaAdedi.set(r.deptId, (odaAdedi.get(r.deptId) ?? 0) + 1);
    }
  }

  // minDerslik GÜVENCESİ: hiçbir açık bölüm derslik yoksun kalmasın. Önce atamasız
  // geçerli derslikten al; yoksa FAZLASI olan bir bölümün BİRİNCİL OLMAYAN dersliğini
  // devret (yeni açılan bölüm aç kalmasın; bölümlerin birincil dersliği hiç oynamaz).
  for (const d of state.departments) {
    const minOda = deptDef(d.defId).minDerslik;
    let guard = 0;
    while ((odaAdedi.get(d.id) ?? 0) < minOda && guard++ < 64) {
      let oda = state.rooms.find((r) => sinifMi(r) && r.valid && r.deptId === null);
      if (!oda) {
        let kaynakOda: Room | undefined;
        for (const src of state.departments) {
          if (src.id === d.id) continue;
          if ((odaAdedi.get(src.id) ?? 0) <= deptDef(src.defId).minDerslik) continue; // fazlası yok
          kaynakOda = state.rooms.find(
            (r) => sinifMi(r) && r.valid && r.deptId === src.id && r.id !== src.derslikId,
          );
          if (kaynakOda) {
            odaAdedi.set(src.id, (odaAdedi.get(src.id) ?? 0) - 1);
            koltuk.set(src.id, (koltuk.get(src.id) ?? 0) - (odaSira.get(kaynakOda.id) ?? 0));
            break;
          }
        }
        oda = kaynakOda;
      }
      if (!oda) break; // fiziken derslik yetmiyor
      oda.deptId = d.id;
      odaAdedi.set(d.id, (odaAdedi.get(d.id) ?? 0) + 1);
      koltuk.set(d.id, (koltuk.get(d.id) ?? 0) + (odaSira.get(oda.id) ?? 0));
    }
  }

  // Yalnız ATAMASIZ geçerli derslikleri, doyma oranı en düşük bölüme ver.
  // Bölüm doymuş sayılır: koltuk >= öğrenci + kontenjan VE oda >= minDerslik.
  for (const r of state.rooms) {
    if (!sinifMi(r) || !r.valid || r.deptId !== null) continue;
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
    // hepsi doyduysa bile atamasız oda kalmasın: en az odalı bölüme ver
    if (!secilen) {
      let enAz = Infinity;
      for (const d of state.departments) {
        const oda = odaAdedi.get(d.id) ?? 0;
        if (oda < enAz) { enAz = oda; secilen = d; }
      }
    }
    if (secilen) {
      r.deptId = secilen.id;
      koltuk.set(secilen.id, (koltuk.get(secilen.id) ?? 0) + (odaSira.get(r.id) ?? 0));
      odaAdedi.set(secilen.id, (odaAdedi.get(secilen.id) ?? 0) + 1);
    }
  }

  // Her bölümün YERLEŞİK (birincil) dersliği: hâlâ geçerliyse koru, değilse ilk atanan.
  for (const d of state.departments) {
    const gecerli = d.derslikId != null && state.rooms.some(
      (r) => r.id === d.derslikId && sinifMi(r) && r.valid && r.deptId === d.id,
    );
    if (!gecerli) {
      const ilk = state.rooms.find((r) => sinifMi(r) && r.valid && r.deptId === d.id);
      d.derslikId = ilk ? ilk.id : null;
    }
  }

  // Lablar: sticky — yalnız atamasız/geçersiz olanları lab gerektiren bölümlere dağıt
  const labBolumler = state.departments.filter((d) => deptDef(d.defId).labGerekli);
  if (labBolumler.length > 0) {
    let i = 0;
    for (const r of state.rooms) {
      if (r.type !== 'laboratuvar' || !r.valid || r.deptId !== null) continue;
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
    if (o.type === 'sira' && odalar.has(o.roomId) && (o.yipranma ?? 0) < 100) sira++;
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

    // kademeli kapanış: yeni kayıt alınmaz, tören satırında da görünmez
    if (dept.kapaniyor) {
      dept.sonTalep = 0;
      dept.sonKayit = 0;
      dept.sonGeriCevrilen = 0;
      continue;
    }

    if ((akademisyen.get(dept.id) ?? 0) < def.minAkademisyen) {
      dept.sonTalep = 0;
      dept.sonKayit = 0;
      dept.sonTavanSira = 0;
      dept.sonTabanSira = 0;
      dept.sonGeriCevrilen = 0;
      notify(state, `${def.ad}: öğretim üyesi yetersiz, YÖK kontenjan vermedi`, 'kotu');
      torenSatirlari.push({
        bolumAd: def.ad, kisa: def.kisa, renk: def.renk,
        kontenjan: dept.kontenjan, yerlesen: 0, talep: 0,
        tavanSira: 0, tabanSira: 0, doldu: false, iptal: true,
        tam: 0, yari: 0, ucretli: 0, geriCevrilen: 0,
      });
      continue;
    }

    // prestij 0'ken bile %12 taban talep vardır (yeni kurulan üniversiteye
    // yine de öğrenci gelir) — prestij yükseldikçe tam talebe yaklaşılır
    let talep = def.tabanTalep * (0.12 + 0.88 * Math.pow(state.prestij / 100, 0.7));
    if (state.ucret === 0) talep *= 1.1;               // devlet modeli: ücretsiz okul cazip
    talep *= state.sonrakiTalepCarpan;                 // rakip olayı etkisi
    talep *= 1 + 0.03 * mutevelliBonusu(state, 'pratik'); // heyetteki iş dünyası mezunları
    talep *= 1 + cazibePuani(state) / 250; // kampüs cazibesi: yurt + ulaşım + faaliyet (en çok +%40)
    if (state.strategies.includes('tanitim')) talep *= 1.25;
    if (state.strategies.includes('uluslararasi_ofis')) talep *= 1.15;
    talep *= randRange(state, 0.8, 1.2);

    // Kontenjan burs kademelerine bölünür (vakıf modeli); ücret 0 ise herkes burslu.
    // Ücretli/yarı burslu talep adayların ödeme gücüne bağlıdır: fiyat ödeme
    // gücünü aşarsa o kademenin adayı hızla azalır (burslu kademeler hep dolar).
    // Bölüme özel ücret varsa o geçerlidir — popüler bölüm pahalıya satılabilir.
    const bUcret = bolumUcreti(state, dept.id);
    const kesir = (fiyat: number): number => (fiyat <= 0 ? 1
      : Math.min(1, Math.pow(odemeGucu(state) / fiyat, 1.5)));
    let tamKont: number;
    let yariKont: number;
    if (state.ucret === 0) {
      tamKont = dept.kontenjan;
      yariKont = 0;
    } else {
      tamKont = Math.round((dept.kontenjan * state.bursTam) / 100);
      yariKont = Math.round((dept.kontenjan * state.bursYari) / 100);
    }
    const ucretliKont = Math.max(0, dept.kontenjan - tamKont - yariKont);
    const tAday = Math.floor(talep);
    const istekli = {
      tam: Math.min(tamKont, tAday),
      yari: Math.min(yariKont, Math.floor(tAday * kesir(bUcret / 2))),
      ucretli: Math.min(ucretliKont, Math.floor(tAday * kesir(bUcret))),
    };
    const istekliToplam = istekli.tam + istekli.yari + istekli.ucretli;

    const bosKoltuk = Math.max(0, seatCapacity(state, dept.id) - (lisans.get(dept.id) ?? 0));
    let kalanKoltuk = bosKoltuk;
    // doldurma sırası: tam burslu (en yüksek sıralı) → %50 → ücretli
    const yerlesenler = { tam: 0, yari: 0, ucretli: 0 };
    for (const kademe of ['tam', 'yari', 'ucretli'] as const) {
      const n = Math.min(istekli[kademe], kalanKoltuk);
      yerlesenler[kademe] = n;
      kalanKoltuk -= n;
      const bursOrani = kademe === 'tam' ? 100 : kademe === 'yari' ? 50 : 0;
      for (let i = 0; i < n; i++) {
        const s = spawnStudent(state, dept.id, 'lisans', bursOrani);
        // burslular yüksek sıralamadan gelir: eğilimli, mutlu başlar
        if (kademe === 'tam') { s.egilim += BALANCE.BURS_EGILIM_TAM; s.mutluluk += 5; }
        else if (kademe === 'yari') s.egilim += BALANCE.BURS_EGILIM_YARI;
      }
    }
    const yeniKayit = yerlesenler.tam + yerlesenler.yari + yerlesenler.ucretli;
    const geriCevrilen = istekliToplam - yeniKayit; // koltuk yetmedi — kayıt yapılamadı
    dept.sonTalep = tAday;
    dept.sonKayit = yeniKayit;
    dept.sonGeriCevrilen = geriCevrilen;
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
      tam: yerlesenler.tam, yari: yerlesenler.yari, ucretli: yerlesenler.ucretli, geriCevrilen,
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

    if (geriCevrilen > 0) {
      notify(state, `⚠️ ${def.ad}: derslik koltuğu yetmedi — ${geriCevrilen} istekli aday geri çevrildi! Derslik/sıra ekle.`, 'kotu');
    } else if (yeniKayit < dept.kontenjan) {
      notify(state, `${def.ad} bölümünde ${dept.kontenjan - yeniKayit} kontenjan boş kaldı`, 'bilgi');
    }
  }

  if (state.strategies.includes('arastirma_universitesi')) odenek *= 1.25;
  if (toplamYeni > 0) {
    odenek = Math.round(odenek);
    earn(state, odenek);
    notify(state, `📥 Dönem ödeneği: ${formatMoney(odenek)}  (${toplamYeni} yeni öğrenci)`, 'iyi');
  }

  state.sonrakiTalepCarpan = 1; // rakip olayı etkisi bu yerleştirmeyle tüketildi

  // Sonuçlar her zaman törenle açıklanır
  state.yerlestirme = {
    yil: yil(state.gun),
    toplamYerlesen: toplamYeni,
    odenek: Math.round(odenek),
    satirlar: torenSatirlari,
    ucret: state.ucret,
    anket: tercihAnketi(state),
  };
  return true;
}

/**
 * Tercih anketi: yeni öğrenciler "neden bizi seçti?" — gerçek talep
 * çarpanlarından türetilen ağırlıklar yüzdelenir (törende gösterilir).
 */
function tercihAnketi(state: GameState): { neden: string; oran: number; panel?: string }[] {
  const acikDefler = state.departments.map((d) => deptDef(d.defId));
  const ortTaban = acikDefler.length > 0
    ? acikDefler.reduce((t, d) => t + d.tabanTalep, 0) / acikDefler.length
    : 0;
  // panel: satıra tıklanınca açılacak yönetim ekranı (o etkeni büyütmenin yolu)
  const adaylar: { neden: string; agirlik: number; panel?: string }[] = [
    { neden: '🏛️ Üniversitenin prestiji ve sıralaması', agirlik: 10 + state.prestij, panel: 'arastirma' },
    { neden: '✨ Kampüs cazibesi (yurt, ulaşım, aktiviteler)', agirlik: cazibePuani(state), panel: 'raporlar' },
    {
      neden: state.ucret === 0 ? '🆓 Ücretsiz eğitim' : '🎗️ Burs imkânları',
      agirlik: state.ucret === 0 ? 45 : state.bursTam * 2 + state.bursYari,
      panel: 'strateji',
    },
    { neden: '⭐ Bölümlerin popülerliği', agirlik: ortTaban / 4, panel: 'bolumler' },
    { neden: '📣 Tanıtım kampanyası', agirlik: state.strategies.includes('tanitim') ? 30 : 0, panel: 'strateji' },
    { neden: '💼 Mezunların iş bulma başarısı', agirlik: (istihdamOrani(state) ?? 0) / 2, panel: 'mezunlar' },
  ];
  if (state.ucret > 0 && state.ucret <= odemeGucu(state)) {
    adaylar.push({ neden: '₺ Ödenebilir kayıt ücreti', agirlik: 25 * (1 - state.ucret / (odemeGucu(state) * 2)), panel: 'strateji' });
  }
  const secilen = adaylar.filter((a) => a.agirlik > 0).sort((a, b) => b.agirlik - a.agirlik).slice(0, 5);
  const toplam = secilen.reduce((t, a) => t + a.agirlik, 0);
  if (toplam <= 0) return [];
  const sonuc = secilen.map((a) => ({
    neden: a.neden, oran: Math.round((100 * a.agirlik) / toplam), panel: a.panel,
  }));
  // yuvarlama artığını en büyüğe ver — toplamları %100 olsun
  const fark = 100 - sonuc.reduce((t, a) => t + a.oran, 0);
  if (sonuc.length > 0) sonuc[0].oran += fark;
  return sonuc;
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

  // 📝 DÖNEM SINAVLARI — mezuniyetten önce: not = GNO + eğilim + şans.
  // Kalan öğrenci ilerleme kaybeder (bütünleme = gelecek dönem telafi).
  // 🎗 BURS BAŞARI ŞARTI (ücretli modelde): GNO şartın altına düşen burslunun
  // bursu bir kademe düşer; onur listesine giren ücretli/yarı burslu bir kademe
  // BAŞARI BURSU kazanır (100→50→0 ve tersi).
  let gecen = 0, kalanlar = 0, onur = 0;
  let bursDusen = 0, bursKazanan = 0;
  const bursluModel = state.ucret > 0;
  // dönemlik sınav destekleri: etüt +5, gece kütüphanesi +3 (satın alındıysa)
  const destekBonus = (state.sinavDestek?.etut ? 5 : 0) + (state.sinavDestek?.gece ? 3 : 0);
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    const gercekGno = gnoHesapla(a); // null = henüz yeterli ders verisi yok
    const gno = gercekGno ?? 1.2;
    const sinavNotu = clamp(
      25 + gno * 20 + (a.egilim - 100) * 0.1 + destekBonus + randRange(state, -8, 8), 0, 100,
    );
    if (sinavNotu < BALANCE.SINAV_GECME) {
      kalanlar++;
      a.ilerleme = Math.max(0, a.ilerleme - 15);
      a.mutluluk = clamp(a.mutluluk - 10, 0, 100);
    } else if (sinavNotu >= BALANCE.SINAV_ONUR) {
      onur++;
      a.mutluluk = clamp(a.mutluluk + 5, 0, 100);
      gecen++;
      if (bursluModel && a.level === 'lisans' && a.burs < 100) {
        a.burs = a.burs >= 50 ? 100 : 50; // başarı bursu: bir kademe yukarı
        a.mutluluk = clamp(a.mutluluk + 10, 0, 100);
        bursKazanan++;
      }
    } else {
      gecen++;
    }
    // burs şartı: veri varken GNO eşiğin altındaysa kademe düşer (onurla çakışmaz)
    if (bursluModel && a.level === 'lisans' && a.burs > 0
        && gercekGno !== null && gercekGno < BALANCE.BURS_GNO_SART) {
      a.burs = a.burs >= 100 ? 50 : 0;
      a.mutluluk = clamp(a.mutluluk - 8, 0, 100);
      bursDusen++;
    }
  }
  if (gecen + kalanlar > 0) {
    notify(
      state,
      `📝 Dönem sınavları: ${gecen} geçti · ${kalanlar} KALDI (bütünleme: ilerleme -15) · ${onur} onur listesinde 🌟${destekBonus > 0 ? ` (destekler +${destekBonus} not verdi)` : ''}`,
      kalanlar > gecen ? 'kotu' : 'bilgi',
    );
  }
  state.sinavDestek = { etut: false, gece: false }; // destekler dönemliktir

  // Kademeli kapanış: öğrencisi kalmayan "kapanıyor" bölümleri sil —
  // bu dönem hiç mezun olmasa bile kontrol edilmeli
  kapananBolumleriTemizle(state);
  if (bursDusen + bursKazanan > 0) {
    notify(
      state,
      `🎗 Burs güncellemesi: ${bursKazanan} öğrenci BAŞARI BURSU kazandı (onur listesi) · ${bursDusen} öğrencinin bursu düştü (GNO < ${BALANCE.BURS_GNO_SART.toFixed(1)})`,
      bursDusen > bursKazanan ? 'kotu' : 'iyi',
    );
  }

  // önce topla (removeAgent diziyi değiştirir), sonra çıkar.
  // önlisans 2 yıllıktır: mezuniyet eşiği yarısıdır.
  // LİSANSÜSTÜ dersleri bitirmek yetmez: YL tez yazar, doktora önce YETERLİK
  // sınavını geçer, sonra tez — tez araştırma dakikalarıyla ilerler.
  const mezunlar: Student[] = [];
  let tezeGecen = 0, yeterlikGecen = 0, yeterlikKalan = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    const dept = deptMap.get(a.deptId);
    const esik = dept && deptDef(dept.defId).tur === 'onlisans'
      ? BALANCE.MEZUNIYET_ESIK / 2
      : BALANCE.MEZUNIYET_ESIK;
    if (a.ilerleme < esik) continue;
    if (a.level === 'lisans') { mezunlar.push(a); continue; }

    const asama = a.asama ?? 'ders';
    if (asama === 'ders') {
      if (a.level === 'doktora') {
        // yeterlik sınavı: GNO + eğilim şansı belirler; kalan dönem tekrar dener
        const gno = gnoHesapla(a) ?? 2;
        const sans = clamp(0.3 + gno * 0.16 + (a.egilim - 100) / 250, 0.25, 0.92);
        if (chance(state, sans)) { a.asama = 'tez'; yeterlikGecen++; }
        else { a.ilerleme = Math.max(70, a.ilerleme - 8); yeterlikKalan++; }
      } else {
        a.asama = 'tez';
        tezeGecen++;
      }
      continue;
    }
    // tez savunması: tez puanı hedefe ulaştıysa mezun
    const tezHedef = a.level === 'doktora' ? BALANCE.TEZ_HEDEF * 1.6 : BALANCE.TEZ_HEDEF;
    if ((a.tezPuan ?? 0) >= tezHedef) mezunlar.push(a);
  }
  if (tezeGecen + yeterlikGecen + yeterlikKalan > 0) {
    notify(state,
      `📜 Lisansüstü: ${tezeGecen > 0 ? `${tezeGecen} YL öğrencisi tez aşamasına geçti · ` : ''}`
      + `${yeterlikGecen > 0 ? `${yeterlikGecen} doktora adayı YETERLİĞİ geçti · ` : ''}`
      + `${yeterlikKalan > 0 ? `${yeterlikKalan} aday yeterlikte KALDI (gelecek dönem tekrar)` : ''}`
        .replace(/ · $/, ''),
      yeterlikKalan > yeterlikGecen ? 'kotu' : 'iyi');
  }
  if (mezunlar.length === 0) return;

  const bolumMezun = new Map<number, number>();
  let toplamBagis = 0;
  let zenginMezun = 0;
  // mezuniyet töreni verisi: dereceler (GNO), onur, bölüm kırılımı
  const torenDereceler: MezuniyetSonuc['dereceler'] = [];
  let torenOnur = 0;
  for (const s of mezunlar) {
    // girişim ekosistemi: mezun, sermayesinin bir kısmını okula bağışlar
    const bagis = Math.round(s.sermaye * BALANCE.MEZUN_BAGIS_ORANI);
    toplamBagis += bagis;
    if (s.sermaye >= BALANCE.ZENGIN_MEZUN_ESIK) zenginMezun++;
    // mezunlar derneğine kayıt: puanına göre işe yerleşir, kariyeri yıllık ilerler
    const mezunDept = deptMap.get(s.deptId);
    const gnoDegeri = gnoHesapla(s);
    const dernekKaydi = mezunEkle(state, s, mezunDept ? deptDef(mezunDept.defId).ad : 'Kapanan Bölüm', gnoDegeri);
    if ((gnoDegeri ?? 0) >= 3.2) torenOnur++;
    torenDereceler.push({
      ad: s.ad,
      bolumAd: mezunDept ? deptDef(mezunDept.defId).kisa : '—',
      gno: gnoDegeri ?? 0,
      meslek: dernekKaydi.issiz ? 'iş arıyor' : dernekKaydi.meslek,
      issiz: dernekKaydi.issiz,
      doktora: s.level === 'doktora',
    });
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

  // 🎓 MEZUNİYET TÖRENİ — kep atma ekranı (törenle açıklanır)
  torenDereceler.sort((a, b) => b.gno - a.gno);
  state.mezuniyet = {
    yil: yil(state.gun),
    toplam: mezunlar.length,
    onur: torenOnur,
    bagis: toplamBagis,
    bolumler: [...bolumMezun.entries()].map(([deptId, n]) => {
      const dept = deptMap.get(deptId);
      const def = dept ? deptDef(dept.defId) : null;
      return { ad: def ? def.ad : 'Bölüm', renk: def ? def.renk : '#888', n };
    }).sort((a, b) => b.n - a.n),
    dereceler: torenDereceler.slice(0, 5),
  };
}

/** Kademeli kapanışı başlat/geri al (🎓 Bölümler panelinden). */
export function bolumKapatToggle(state: GameState, deptId: number): void {
  const dept = state.departments.find((d) => d.id === deptId);
  if (!dept) return;
  const def = deptDef(dept.defId);
  dept.kapaniyor = !dept.kapaniyor;
  if (dept.kapaniyor) {
    dept.ylAcik = false;
    dept.doktoraAcik = false;
    notify(state, `🚪 ${def.ad} KADEMELİ KAPANIŞA alındı: yeni kayıt yok; mevcut öğrenciler mezun olunca bölüm kapanacak. (Panelden geri alınabilir)`, 'kotu');
  } else {
    notify(state, `↩️ ${def.ad} kapanıştan çıkarıldı — bir sonraki YKS'de yeniden kayıt alır.`, 'iyi');
  }
}

/** Öğrencisi kalmayan "kapanıyor" bölümleri kaldırır (dönem sonunda çağrılır). */
function kapananBolumleriTemizle(state: GameState): void {
  const kapanacak = state.departments.filter((d) => d.kapaniyor
    && !state.agents.some((a) => a.kind === 'ogrenci' && a.deptId === d.id));
  for (const dept of kapanacak) {
    const def = deptDef(dept.defId);
    state.departments = state.departments.filter((d) => d.id !== dept.id);
    for (const r of state.rooms) if (r.deptId === dept.id) r.deptId = null;
    state.projects = state.projects.filter((p) => p.deptId !== dept.id);
    state.dersProgrami = state.dersProgrami.filter((s) => s.deptId !== dept.id);
    for (const a of state.agents) {
      if (a.kind === 'akademisyen' && a.deptId === dept.id) a.deptId = -1;
    }
    addPrestij(state, -3);
    notify(state, `🚪 ${def.ad} bölümü resmen KAPANDI — son öğrencisi mezun oldu. Derslikler havuza döndü, hocalar programa göre yeniden bağlanacak (-3 prestij).`, 'kotu');
  }
  if (kapanacak.length > 0) {
    assignClassrooms(state);
    rebuildDersProgrami(state);
  }
}

export function dailyDepartmentUpdate(state: GameState): void {
  // Bırakma — mutluluk desteğinden ÖNCE değerlendirilir
  const birakanlar: number[] = [];
  for (const a of state.agents) {
    // burslu öğrenci okulu daha zor bırakır (kaybedecek şeyi var)
    if (a.kind === 'ogrenci' && a.mutluluk < BALANCE.MUTLULUK_BIRAKMA_ESIK
        && chance(state, BALANCE.BIRAKMA_OLASILIK * (a.burs >= 50 ? 0.5 : 1))) {
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

  // Yemekhane sübvansiyonu + mali politikalar + heyetin sosyal üyeleri (mutluluk)
  const subvansiyon = state.strategies.includes('yemek_subvansiyon');
  // ödeme gücünü aşan ücret huzursuzluk yaratır — bölüm ücreti bazında
  const guc = odemeGucu(state);
  const pahaliBolum = new Map<number, boolean>();
  for (const d of state.departments) pahaliBolum.set(d.id, bolumUcreti(state, d.id) > guc);
  const ortakMutluluk = (state.ucret === 0 ? 0.3 : 0)
    + 0.4 * mutevelliBonusu(state, 'sosyal')
    + (faaliyetPuani(state) >= 50 ? 0.3 : 0); // canlı kampüs yaşamı moral verir
  let toplamMutluluk = 0;
  let ogrenciSayisi = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    if (subvansiyon) a.mutluluk = clamp(a.mutluluk + 2, 0, 100);
    // burslu okumak moral verir; ücretli öğrenci fahiş fiyatta huzursuzlaşır
    const bursMutluluk = a.burs >= 100 ? 0.4 : a.burs >= 50 ? 0.2
      : pahaliBolum.get(a.deptId) ? -0.6 : 0;
    const kisilikMutluluk = a.kisilik === 'sosyal' ? 0.15 : 0; // 🎉 sosyal kelebek
    a.mutluluk = clamp(a.mutluluk + ortakMutluluk + bursMutluluk + kisilikMutluluk, 0, 100);
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
