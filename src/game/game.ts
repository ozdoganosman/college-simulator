import {
  Academic, AcademicRank, Alan, GameState, GUN_DAKIKA, MAP_H, donemGunu, donemIndex,
} from '../core/types';
import { AYARLAR } from '../core/settings';
import { validateRooms } from '../core/grid';
import { pick, randInt } from '../core/util';
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
import { kurRakipler, rakipleriGelistir, yilSonuHesapla } from './rivals';
import { yillikMezunGuncelle } from './alumni';
import { addPrestij, notify, saveGame } from './state';

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
  if (state.dakika >= GUN_DAKIKA) {
    state.dakika -= GUN_DAKIKA;
    endOfDay(state);
  }
}

function endOfDay(state: GameState): void {
  dailyEconomy(state);
  dailyAcademicUpdate(state);
  dailyDepartmentUpdate(state);

  state.gun += 1;

  // Önce gün içinde yapılan inşaatı işle ki yerleştirme güncel kapasiteyi görsün
  validateRooms(state);
  assignClassrooms(state);
  rebuildDersProgrami(state); // yeni günün ders programı ve hoca atamaları

  // Dönem geçişi: mezuniyet + aday havuzları + öğrenci desteği.
  // Yerleştirme OTOMATİK YAPILMAZ — yıl başında YKS dönemi açılır,
  // oyuncu hazır olunca 'Yerleştirmeyi Başlat' butonuna basar.
  if (donemGunu(state.gun) === 1) {
    semesterEnd(state);
    refreshCandidatePools(state);
    donemDestegi(state);
    if (donemIndex(state.gun) % 2 === 0) {
      // Yıl dönümü: biten yılın Akademik Yıl Ödülleri töreni (oyunun ilk günü hariç)
      if (state.gun > 1) {
        const sonuc = yilSonuHesapla(state);
        state.yilSonu = sonuc;
        if (sonuc.siraPrestij > 0) {
          addPrestij(state, sonuc.siraPrestij);
          notify(state, `🏆 Sıralamada yükseliş: ${sonuc.oncekiSira}. → ${sonuc.sira}. (+${sonuc.siraPrestij} prestij)`, 'odul');
        }
        state.sonSira = sonuc.sira;
        state.siraGecmisi.push(sonuc.sira);
        if (state.siraGecmisi.length > 12) state.siraGecmisi.shift();
        state.yilBasi = { mezun: state.toplamMezun, yayin: state.publications.length };
        rakipleriGelistir(state); // rakipler de boş durmuyor
        yillikMezunGuncelle(state); // mezun kariyerleri + dernek bağışı + haberler
      }
      if (!state.yksBekliyor) {
        state.yksBekliyor = true;
        notify(state, '🎓 YKS dönemi açıldı! Hazırlıkların bitince yerleştirmeyi başlat.', 'odul');
      }
    }
  }

  if (AYARLAR.otomatikKayit) saveGame(state);
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

  const koy = (id: string, x: number, y: number) => placePrefab(state, prefabDef(id), x, y);
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
