/**
 * Kampüs olay kartı — ekranın üst-ortasında bloklamayan karar kartı.
 * Oyun akmaya devam eder; 2 gün cevapsız kalırsa varsayılan seçenek uygulanır
 * (game.ts/olayGuncelle). Kart yalnızca aktif olay varken görünür.
 */
import { GameState } from '../core/types';
import { olayCoz, olayTanim } from '../game/events';

let elem: HTMLElement | null = null;
let getStateRef: (() => GameState) | null = null;
let sonOlayId = '';

export function initEventCard(getState: () => GameState): void {
  getStateRef = getState;
  elem = document.createElement('div');
  elem.id = 'olay-kart';
  document.body.appendChild(elem);
  elem.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-secim]');
    if (!b || !getStateRef) return;
    olayCoz(getStateRef(), Number(b.dataset.secim) === 1 ? 1 : 0);
    sonOlayId = '';
    refreshEventCard(getStateRef());
  });
}

export function refreshEventCard(state: GameState): void {
  if (!elem) return;
  if (!state.aktifOlay) {
    if (sonOlayId !== '') {
      sonOlayId = '';
      elem.innerHTML = '';
      elem.classList.remove('acik');
    }
    return;
  }
  const tanim = olayTanim(state.aktifOlay.id);
  if (!tanim) return;
  const kalanGun = Math.max(0, 2 - (state.gun - state.aktifOlay.gun));
  const anahtar = `${tanim.id}:${kalanGun}`;
  if (anahtar === sonOlayId) return;
  sonOlayId = anahtar;

  elem.innerHTML = `
    <div class="olay-govde">
      <div class="olay-baslik">⚡ KAMPÜS OLAYI · <b>${tanim.emoji} ${tanim.baslik}</b>
        <span class="olay-sure" title="Cevaplamazsan varsayılan seçenek uygulanır">⏳ ${kalanGun === 0 ? 'bugün son' : `${kalanGun} gün`}</span>
      </div>
      <div class="olay-metin">${tanim.metin}</div>
      <div class="olay-secenekler">
        ${tanim.secenekler.map((s, i) => `<button class="olay-btn${i === tanim.varsayilan ? ' varsayilan' : ''}"
          data-secim="${i}" title="${s.ipucu}${i === tanim.varsayilan ? ' · (cevapsız kalırsa bu uygulanır)' : ''}">${s.etiket}</button>`).join('')}
      </div>
    </div>`;
  elem.classList.add('acik');
}
