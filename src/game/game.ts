import { GameState, GUN_DAKIKA, donemGunu, donemIndex } from '../core/types';
import { AYARLAR } from '../core/settings';
import { validateRooms } from '../core/grid';
import { updateAgents } from './agents';
import { updateResearch } from './research';
import { dailyAcademicUpdate, refreshCandidatePools } from './academics';
import { assignClassrooms, dailyDepartmentUpdate, donemDestegi, semesterEnd } from './departments';
import { dailyEconomy } from './economy';
import { notify, saveGame } from './state';

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

  // Dönem geçişi: mezuniyet + aday havuzları + öğrenci desteği.
  // Yerleştirme OTOMATİK YAPILMAZ — yıl başında YKS dönemi açılır,
  // oyuncu hazır olunca 'Yerleştirmeyi Başlat' butonuna basar.
  if (donemGunu(state.gun) === 1) {
    semesterEnd(state);
    refreshCandidatePools(state);
    donemDestegi(state);
    if (donemIndex(state.gun) % 2 === 0 && !state.yksBekliyor) {
      state.yksBekliyor = true;
      notify(state, '🎓 YKS dönemi açıldı! Hazırlıkların bitince yerleştirmeyi başlat.', 'odul');
    }
  }

  if (AYARLAR.otomatikKayit) saveGame(state);
}

/** Yeni oyun kurulumu (boş kampüs + başlangıç aday havuzları). */
export function initNewGame(state: GameState): void {
  refreshCandidatePools(state);
  assignClassrooms(state);
  notify(state, 'Üniversiteye hoş geldiniz, Rektörüm! Önce zemin döşeyip duvarlarla bir bina yapın.', 'bilgi');
  notify(state, 'Derslik + ofis + tuvalet kurup KPSS ile akademisyen alınca ilk bölümünüzü açabilirsiniz.', 'bilgi');
  notify(state, '🎓 Acele etme: kampüsün hazır olunca üstteki "YKS Yerleştirmeyi Başlat" butonuna bas — öğrenciler o zaman gelir.', 'odul');
}
