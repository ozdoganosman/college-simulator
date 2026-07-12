import './styles.css';
import { GameState } from './core/types';
import { BALANCE } from './data/balance';
import { createInitialState, loadGame } from './game/state';
import { advance, initNewGame } from './game/game';
import { createCamera, clampCamera } from './ui/camera';
import { createUIState } from './ui/uistate';
import { attachInput } from './ui/input';
import { render } from './ui/renderer';
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
(window as unknown as Record<string, unknown>).__sim = {
  state: () => state,
  advance: (dk: number) => advance(state, dk),
  build, departments, academics, research, agents, library, prefab, rivals, alumni, campus,
  economy, schedule, events, accreditation, maintenance, clubs, infrastructure, incidents, macro,
  ui, cam,
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
