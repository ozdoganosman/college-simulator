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
}

const cam = createCamera(canvas);
const ui = createUIState();

attachInput(canvas, () => state, cam, ui);
initHud(() => state, ui);
initPanels(() => state);

// Konsoldan / otomatik testlerden erişim için debug kancası
import * as build from './game/build';
import * as departments from './game/departments';
import * as academics from './game/academics';
import * as research from './game/research';
import * as agents from './game/agents';
(window as unknown as Record<string, unknown>).__sim = {
  state: () => state,
  advance: (dk: number) => advance(state, dk),
  build, departments, academics, research, agents,
};

let sonZaman = performance.now();
let hudSayac = 0;

function frame(t: number): void {
  const gecenSn = Math.min(0.25, (t - sonZaman) / 1000);
  sonZaman = t;

  if (state.hiz > 0) {
    advance(state, gecenSn * BALANCE.DAKIKA_SANIYE * state.hiz);
  }

  render(ctx, state, cam, ui);

  hudSayac += gecenSn;
  if (hudSayac >= 0.25) {
    hudSayac = 0;
    refreshHud(state, ui);
    refreshOpenPanel(state);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
