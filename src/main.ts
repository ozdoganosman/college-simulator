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
initCeremony();
initMenu({
  getState: () => state,
  yeniOyun: () => {
    const s = createInitialState();
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
(window as unknown as Record<string, unknown>).__sim = {
  state: () => state,
  advance: (dk: number) => advance(state, dk),
  build, departments, academics, research, agents, library, prefab, rivals, alumni,
  ui, cam,
};

let sonZaman = performance.now();
let hudSayac = 0;

function frame(t: number): void {
  const gecenSn = Math.min(0.25, (t - sonZaman) / 1000);
  sonZaman = t;

  if (state.hiz > 0 && !isMenuOpen() && !isCeremonyOpen()) {
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
    if (!isMenuOpen()) checkCeremony(state);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
