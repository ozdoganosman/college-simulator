import {
  Academic, AcademicRank, Alan, GameState, GUN_DAKIKA, MAP_H, donemGunu, donemIndex, tileIndex, yil,
} from '../core/types';
import { ROOM_DEFS } from '../data/rooms';
import { AYARLAR } from '../core/settings';
import { validateRooms } from '../core/grid';
import { clamp, pick, randInt } from '../core/util';
import { AD, SOYAD } from '../data/names';
import { BALANCE } from '../data/balance';
import { buildFloor } from './build';
import { placePrefab, prefabDef } from './prefab';
import { hireStaff, spawnAcademic, updateAgents } from './agents';
import { updateResearch } from './research';
import { dailyAcademicUpdate, refreshCandidatePools } from './academics';
import { assignClassrooms, dailyDepartmentUpdate, donemDestegi, semesterEnd } from './departments';
import { rebuildDersProgrami, tumunuOtoSec } from './schedule';
import { dailyEconomy } from './economy';
import { kurRakipler, rakipleriGelistir, siralama, yilSonuHesapla } from './rivals';
import { yillikMezunGuncelle } from './alumni';
import { donemIstifaKontrol, yillikYaslanma } from './academics';
import { kontrolBasarimlar } from './goals';
import { denetimUygula } from './accreditation';
import { olayGuncelle, olayOner } from './events';
import { gunlukYipranma } from './maintenance';
import { cazibePuani } from './campus';
import { altyapiGunSonu } from './infrastructure';
import { salginGunSonu, yanginTetikle, yanginlariGuncelle } from './incidents';
import { makroGunGuncelle } from './macro';
import { gunlukKulupEtkisi, kulupSenligi } from './clubs';
import { addPrestij, notify, saveGame, talepCarp } from './state';

/** Simülasyonu dtMin oyun-dakikası ilerletir (büyük adımları böler). */
export function advance(state: GameState, dtMin: number): void {
  let kalan = Math.min(dtMin, 240); // sekme arka planda kaldıysa dev adım atlama
  while (kalan > 0) {
    const step = Math.min(kalan, 5);
    stepSim(state, step);
    kalan -= step;
  }
}

function stepSim(state: GameState, dt: number): void {
  state.dakika += dt;
  updateAgents(state, dt);
  updateResearch(state, dt);
  insaatIlerlet(state, dt);
  yanginlariGuncelle(state, dt); // aktif yangınlar sim adımında yayılır/söner
  if (state.dakika >= GUN_DAKIKA) {
    state.dakika -= GUN_DAKIKA;
    endOfDay(state);
  }
}

/**
 * Şantiyeler ilerler: temel hız (dış müteahhit) + odada fiilen duran her usta
 * (tamirci) büyük hız katar. Biten inşaat odayı hizmete açar.
 */
function insaatIlerlet(state: GameState, dtMin: number): void {
  let degisti = false;
  for (const room of state.rooms) {
    if (!room.insaat || room.insaat <= 0) continue;
    const karolar = new Set(room.tiles);
    let usta = 0;
    for (const a of state.agents) {
      if (a.kind === 'tamirci' && a.onCampus
          && karolar.has(tileIndex(Math.round(a.x), Math.round(a.y)))) usta++;
    }
    room.insaat -= dtMin * (0.5 + 1.2 * usta);
    if (room.insaat <= 0) {
      room.insaat = 0;
      degisti = true;
      notify(state, `🏗️ İnşaat tamamlandı: ${room.ozelAd ?? ROOM_DEFS[room.type].ad} hizmete açıldı!`, 'iyi');
    }
  }
  if (degisti) validateRooms(state);
}

function endOfDay(state: GameState): void {
  // yemek sistemi gün kapanışı: kalan yemek bayatlar, aç kalanlar raporlanır
  if (state.acKalanBugun > 0) {
    notify(state, `🍽️ Bugün ${state.acKalanBugun} öğrenci aç kaldı (stok bitti ya da yemeğe ulaşamadı) — aşçı/yemekhane kapasitesini gözden geçir!`, 'kotu');
  }
  state.dunAcKalan = state.acKalanBugun;
  state.acKalanBugun = 0;
  state.yemekStok = 0; // kalan yemek bayatladı

  dailyEconomy(state);
  dailyAcademicUpdate(state);
  dailyDepartmentUpdate(state);
  gunlukYipranma(state); // eşyalar eskir; bozulanlar tamirci bekler
  gunlukKulupEtkisi(state); // kulüp üyeleri nitelik/moral kazanır
  altyapiGunSonu(state); // elektrik/su kesinti kontrolü + cezalar
  yanginTetikle(state); // yıpranmış eşya düşük şansla tutuşabilir
  salginGunSonu(state); // salgın ilerler / dönemsel yenisi çıkar

  // denetim karnesi ortalama izlemesi: tek günlük şans yerine dönem ortalaması
  // (acKalanBugun az önce dunAcKalan'a devredildi — bugünün gerçek sayısı odur)
  state.denetimIzleme.ac += state.dunAcKalan;
  state.denetimIzleme.cazibe += cazibePuani(state);
  state.denetimIzleme.gun += 1;

  state.gun += 1;

  // Önce gün içinde yapılan inşaatı işle ki yerleştirme güncel kapasiteyi görsün
  validateRooms(state);
  assignClassrooms(state);
  rebuildDersProgrami(state); // yeni günün ders programı ve hoca atamaları

  // Dönem geçişi: mezuniyet + aday havuzları + öğrenci desteği.
  // Yerleştirme OTOMATİK YAPILMAZ — yıl başında YKS dönemi açılır,
  // oyuncu hazır olunca 'Yerleştirmeyi Başlat' butonuna basar.
  if (donemGunu(state.gun) === 1) {
    // trend fotoğrafı: biten dönemin son hali (Raporlar grafikleri)
    let trendOgr = 0, trendMut = 0;
    for (const a of state.agents) {
      if (a.kind === 'ogrenci') { trendOgr++; trendMut += a.mutluluk; }
    }
    state.trend.push({
      gun: state.gun,
      para: Math.round(state.para),
      prestij: Math.round(state.prestij),
      ogrenci: trendOgr,
      mutluluk: trendOgr > 0 ? Math.round(trendMut / trendOgr) : 0,
    });
    if (state.trend.length > 24) state.trend.shift();

    semesterEnd(state);
    kulupSenligi(state); // dönem sonu kulüp şenliği
    donemIstifaKontrol(state); // mutsuz hocalar rakiplere gidebilir
    donemRakipOlayi(state); // rakipler boş durmaz: skandal, atılım, ayartma, kampanya
    refreshCandidatePools(state);
    donemDestegi(state);
    if (donemIndex(state.gun) % 2 === 0) {
      // Yıl dönümü: biten yılın Akademik Yıl Ödülleri töreni (oyunun ilk günü hariç)
      if (state.gun > 1) {
        const sonuc = yilSonuHesapla(state);
        // tören yorgunluğu önlemi: yıl dönümüne denk gelen mezuniyet ayrı tören
        // açmaz — özeti yıl sonu ekranına satır olarak girer
        if (state.mezuniyet) {
          sonuc.mezuniyetOzet = {
            toplam: state.mezuniyet.toplam,
            onur: state.mezuniyet.onur,
            bagis: state.mezuniyet.bagis,
          };
          state.mezuniyet = null;
        }
        state.yilSonu = sonuc;
        if (sonuc.siraPrestij > 0) {
          addPrestij(state, sonuc.siraPrestij);
          notify(state, `🏆 Sıralamada yükseliş: ${sonuc.oncekiSira}. → ${sonuc.sira}. (+${sonuc.siraPrestij} prestij)`, 'odul');
        }
        state.sonSira = sonuc.sira;
        state.siraGecmisi.push(sonuc.sira);
        if (state.siraGecmisi.length > 12) state.siraGecmisi.shift();
        state.yilBasi = { mezun: state.toplamMezun, yayin: state.toplamYayin };
        for (const haber of rakipleriGelistir(state)) notify(state, haber, 'bilgi'); // rakipler boş durmuyor
        yillikMezunGuncelle(state); // mezun kariyerleri + dernek bağışı + haberler
        yillikYaslanma(state); // yaş +1; emeklilik yaşına gelen ayrılır
        makroGunGuncelle(state); // ülke ekonomisi: enflasyon/teşvik/kriz
        // YÖK akreditasyon denetimi: 3. yıldan itibaren 2 yılda bir
        if (yil(state.gun) > 1 && (yil(state.gun) - 1) % 2 === 0) denetimUygula(state);
      }
      if (!state.yksBekliyor) {
        state.yksBekliyor = true;
        notify(state, '🎓 YKS dönemi açıldı! Hazırlıkların bitince yerleştirmeyi başlat.', 'odul');
      } else if (state.gun > 1) {
        // yerleştirme bir yıl atlandı: birikmiş talep etkisi yarıya söner —
        // olay çarpanları yıllar boyunca üst üste binip talebi uçuramaz
        state.sonrakiTalepCarpan = 1 + (state.sonrakiTalepCarpan - 1) * 0.5;
      }
    }
  }

  // KALDI sonrası takip denetimi: günü geldiyse YÖK tekrar kapıda
  if (state.takipDenetimGunu !== null && state.gun >= state.takipDenetimGunu) {
    state.takipDenetimGunu = null;
    denetimUygula(state, true);
  }

  // Kampüs olay kartları: süresi dolanı kapat, sırası geldiyse yenisini çıkar
  olayGuncelle(state);

  // Başarımlar + iflas takibi
  kontrolBasarimlar(state);

  // 👑 ZAFER: 1 numara olununca bir kez şampiyonluk töreni
  if (!state.zaferGosterildi && state.basarimlar.includes('bir_numara')) {
    state.zaferGosterildi = true;
    state.zafer = true;
  }
  if (state.para < 0) {
    state.borcGunleri++;
    const limit = BALANCE.IFLAS_GUN[state.zorluk];
    if (state.borcGunleri >= limit) {
      state.oyunBitti = `Üniversite ${limit} gün boyunca borç içinde yüzdü — YÖK mali denetim sonunda KAYYUM ATADI. Rektörlük maceran ${yil(state.gun)}. yılda sona erdi.`;
      state.hiz = 0;
    } else if (state.borcGunleri === Math.ceil(limit / 2)) {
      notify(state, `🚨 YÖK MALİ DENETİM UYARISI: ${limit - state.borcGunleri} gün içinde bütçeyi artıya çıkarmazsan üniversiteye kayyum atanacak!`, 'kotu');
    }
  } else {
    state.borcGunleri = 0;
  }

  if (AYARLAR.otomatikKayit) saveGame(state);
}

/**
 * Rakip olayları: dönem başında %45 şansla rakipler bir hamle yapar —
 * skandal (talebin artar), atılım, hoca ayartma girişimi ya da tanıtım savaşı.
 */
function donemRakipOlayi(state: GameState): void {
  if (state.rakipler.length === 0 || randInt(state, 0, 99) >= 45) return;
  const zar = randInt(state, 0, 3);
  const guclu = siralama(state).filter((s) => !s.oyuncu).slice(0, 8);
  const rakipAd = guclu.length > 0 ? pick(state, guclu).ad : state.rakipler[0].ad;
  const rakip = state.rakipler.find((r) => r.ad === rakipAd);

  if (zar === 0 && rakip) {
    rakip.prestij = Math.max(30, rakip.prestij - 20);
    talepCarp(state, 1.15);
    notify(state, `📰 ${rakip.ad}'de intihal skandalı patladı! Öğrenciler alternatif arıyor — bir sonraki YKS talebin artacak (×1.15).`, 'iyi');
  } else if (zar === 1 && rakip) {
    rakip.prestij = Math.min(1000, rakip.prestij + 20);
    rakip.yayin += 10;
    notify(state, `🚀 ${rakip.ad} dev bir AR-GE hibesi kaptı — sıralamada güçleniyor.`, 'bilgi');
  } else if (zar === 2) {
    // en değerli hocaya ayartma girişimi — KARŞI HAMLE kartı olarak gelir
    let hedef: Academic | null = null;
    let enIyi = -1;
    for (const a of state.agents) {
      if (a.kind !== 'akademisyen') continue;
      const deger = a.egitim + a.arastirma + a.makale * 5;
      if (deger > enIyi) {
        enIyi = deger;
        hedef = a;
      }
    }
    if (hedef && !state.bekleyenAyartma && olayOner(state, 'rakip-ayartma')) {
      state.bekleyenAyartma = { academicId: hedef.id, rakipAd };
      notify(state, `🎣 ${rakipAd}, ${hedef.ad}'a transfer teklif etti — kararın bekleniyor (olay kartı)!`, 'kotu');
    } else if (hedef) {
      // kart hiç gösterilemeyecekse eski davranış: moral sarsılır
      hedef.memnuniyet = clamp(hedef.memnuniyet - 12, 0, 100);
      notify(state, `🎣 ${rakipAd}, ${hedef.ad}'a transfer teklif etti — morali sarsıldı (%${Math.round(hedef.memnuniyet)}). Zam vermenin tam zamanı olabilir!`, 'kotu');
    }
  } else if (olayOner(state, 'tanitim-savasi')) {
    // tanıtım savaşı — karşı kampanya kartı (yuva doluysa kuyruğa girer)
    notify(state, `📉 ${rakipAd} dev bir tanıtım kampanyası başlattı — karşılık verecek misin (olay kartı)?`, 'kotu');
  } else {
    talepCarp(state, 0.88);
    notify(state, `📉 ${rakipAd} dev bir tanıtım kampanyası başlattı — bir sonraki YKS talebin düşebilir (×0.88).`, 'kotu');
  }
}

/** Yeni oyun kurulumu (boş kampüs + başlangıç aday havuzları). */
export function initNewGame(state: GameState): void {
  kurHazirKampus(state);
  kurRakipler(state);
  refreshCandidatePools(state);
  assignClassrooms(state);
  rebuildDersProgrami(state);
  notify(state, 'Üniversiteye hoş geldiniz, Rektörüm! Temel kampüsünüz hazır: 4 derslik, ofis, yemekhane, kantin ve tuvaletler.', 'bilgi');
  notify(state, '5 akademisyeniniz ve mutfak/temizlik personeliniz göreve hazır. Bölümler panelinden ilk bölümünüzü açın.', 'bilgi');
  notify(state, '🎓 Hazır olunca üstteki "YKS Yerleştirmeyi Başlat" butonuna bas — öğrenciler o zaman gelir.', 'odul');
}

/** Yeni oyunda temel gereksinimleri karşılayan ücretsiz başlangıç kampüsü. */
function kurHazirKampus(state: GameState): void {
  const paraOnce = state.para;
  state.para = 50_000_000; // şablon hediyedir — sonda eski bütçeye dönülür

  // başlangıç kampüsü hediyedir: şantiye beklemeden hazır gelir (aninda=true)
  const koy = (id: string, x: number, y: number) =>
    placePrefab(state, prefabDef(id), x, y, undefined, undefined, true);
  // üst sıra: 4 derslik
  koy('p_derslik', 12, 5);
  koy('p_derslik', 22, 5);
  koy('p_derslik', 32, 5);
  koy('p_derslik', 42, 5);
  // orta sıra: ofis + yemekhane + kantin + 2 tuvalet
  koy('p_ofis', 12, 15);
  koy('p_yemekhane', 21, 15);
  koy('p_kantin', 33, 15);
  koy('p_tuvalet', 41, 15);
  koy('p_tuvalet', 48, 15);
  // yürüyüş yolları: kapıdan kampüse omurga
  buildFloor(state, 31, 24, 33, MAP_H - 1, 'yol');
  buildFloor(state, 12, 12, 52, 13, 'yol');
  buildFloor(state, 12, 22, 52, 23, 'yol');

  // personel + 5 akademisyen (tüm alanlardan)
  hireStaff(state, 'asci');
  hireStaff(state, 'temizlikci');
  hireStaff(state, 'tamirci');
  const kadro: [AcademicRank, Alan][] = [
    ['dr', 'muhendis'], ['arsgor', 'muhendis'], ['arsgor', 'artist'],
    ['arsgor', 'filozof'], ['arsgor', 'pratik'],
  ];
  for (const [rank, alan] of kadro) {
    spawnAcademic(
      state,
      `${pick(state, AD)} ${pick(state, SOYAD)}`,
      -1,
      rank,
      alan,
      randInt(state, 30, rank === 'dr' ? 70 : 55),
      randInt(state, 30, rank === 'dr' ? 70 : 55),
      BALANCE.MAAS[rank],
    );
  }
  // Başlangıç ders seçimleri akıllı yapılır: birkaç bölüm ilk günden açılabilir olsun
  tumunuOtoSec(state);

  state.para = paraOnce;
}
