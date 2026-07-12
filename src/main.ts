import './styles.css';
import { GameState, MAP_W, MAP_H, TILE } from './core/types';
import { BALANCE } from './data/balance';
import { createInitialState, loadGame } from './game/state';
import { advance, initNewGame } from './game/game';
import { createCamera, clampCamera } from './ui/camera';
import { createUIState } from './ui/uistate';
import { attachInput } from './ui/input';
import { render, renderMinimap } from './ui/renderer';
import { AYARLAR } from './core/settings';
import { saveGame } from './game/state';
import { sesTik } from './ui/audio';
import { initHud, refreshHud } from './ui/hud';
import { initPanels, refreshOpenPanel } from './ui/panels';
import { fastForwardTutorial, initTutorial, refreshTutorial } from './ui/tutorial';
import { initAdvisor, refreshAdvisor } from './ui/advisor';
import { initEventCard, refreshEventCard } from './ui/eventcard';
import { initMenu, isMenuOpen, openMainMenu } from './ui/menu';
import { checkCeremony, initCeremony, isCeremonyOpen } from './ui/ceremony';
import { invalidateGround } from './ui/renderer';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
minimapCanvas.width = 180;
minimapCanvas.height = 135;
const mmCtx = minimapCanvas.getContext('2d')!;

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => { resize(); clampCamera(cam, canvas); });

let state: GameState;
const kayit = loadGame();
if (kayit) {
  state = kayit;
} else {
  state = createInitialState();
  initNewGame(state);
  fastForwardTutorial(state);
}

const cam = createCamera(canvas);
const ui = createUIState();

function swapState(yeni: GameState): void {
  state = yeni;
  ui.selectedRoomId = -1;
  ui.selectedAgentId = -1;
  ui.tool = { kind: 'sec' };
  ui.dragStart = null;
  invalidateGround();
  refreshHud(state, ui);
}

attachInput(canvas, () => state, cam, ui);
initHud(() => state, ui);
initPanels(() => state);
initTutorial();
initAdvisor();
initEventCard(() => state);
initCeremony();
initMenu({
  getState: () => state,
  yeniOyun: (zorluk) => {
    const s = createInitialState();
    s.zorluk = zorluk;
    if (zorluk === 'kolay') {
      s.para = 4_000_000;
      s.prestij = 20;
    } else if (zorluk === 'zor') {
      s.para = 1_500_000;
    }
    initNewGame(s);
    fastForwardTutorial(s);
    swapState(s);
  },
  yukleState: (s) => swapState(s),
});
openMainMenu();

// Konsoldan / otomatik testlerden erişim için debug kancası
import * as build from './game/build';
import * as departments from './game/departments';
import * as academics from './game/academics';
import * as research from './game/research';
import * as agents from './game/agents';
import * as library from './game/library';
import * as prefab from './game/prefab';
import * as rivals from './game/rivals';
import * as alumni from './game/alumni';
import * as campus from './game/campus';
import * as economy from './game/economy';
import * as schedule from './game/schedule';
import * as events from './game/events';
import * as accreditation from './game/accreditation';
import * as maintenance from './game/maintenance';
import * as clubs from './game/clubs';
import * as infrastructure from './game/infrastructure';
import * as incidents from './game/incidents';
import * as macro from './game/macro';
import * as social from './game/social';
(window as unknown as Record<string, unknown>).__sim = {
  state: () => state,
  advance: (dk: number) => advance(state, dk),
  build, departments, academics, research, agents, library, prefab, rivals, alumni, campus,
  economy, schedule, events, accreditation, maintenance, clubs, infrastructure, incidents, macro,
  social, ui, cam,
};

let sonZaman = performance.now();
let hudSayac = 0;

function frame(t: number): void {
  const gecenSn = Math.min(0.25, (t - sonZaman) / 1000);
  sonZaman = t;

  if (state.hiz > 0 && !state.oyunBitti && !isMenuOpen() && !isCeremonyOpen()) {
    advance(state, gecenSn * BALANCE.DAKIKA_SANIYE * state.hiz);
  }

  render(ctx, state, cam, ui);

  // minimap: ayar açıksa ve menü/tören kapalıysa çiz
  const mmGoster = AYARLAR.minimap && !isMenuOpen() && !isCeremonyOpen();
  minimapCanvas.classList.toggle('gizli', !mmGoster);
  if (mmGoster) renderMinimap(mmCtx, state, cam, canvas);

  hudSayac += gecenSn;
  if (hudSayac >= 0.25) {
    hudSayac = 0;
    refreshHud(state, ui);
    refreshOpenPanel(state);
    refreshTutorial(state);
    refreshAdvisor(state);
    refreshEventCard(state);
    if (!isMenuOpen()) checkCeremony(state);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// minimap tıklaması: kamerayı o noktaya taşı
minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  cam.x = mx * MAP_W * TILE - (canvas.width / cam.zoom) / 2;
  cam.y = my * MAP_H * TILE - (canvas.height / cam.zoom) / 2;
  clampCamera(cam, canvas);
});

// arayüz tıklama sesi: butonlara delege dinleyici (ilk etkileşim sesi de açar)
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('button, .eylem, .menu-buton, .toolbar-btn, [data-action]')) sesTik();
}, true);

// ⌨️ hızlı kaydet: Ctrl+S / S — otomatik kayıt yuvasına anında kaydet
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!isMenuOpen() && !isCeremonyOpen()) {
      saveGame(state);
      hizliKayitBildir();
    }
  }
});

let hizliKayitEl: HTMLElement | null = null;
function hizliKayitBildir(): void {
  if (!hizliKayitEl) {
    hizliKayitEl = document.createElement('div');
    hizliKayitEl.id = 'hizli-kayit-toast';
    document.getElementById('app')?.appendChild(hizliKayitEl);
  }
  hizliKayitEl.textContent = '💾 Kaydedildi';
  hizliKayitEl.classList.add('goster');
  setTimeout(() => hizliKayitEl?.classList.remove('goster'), 1400);
}
