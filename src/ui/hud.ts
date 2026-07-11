import { GameState, donemAdi, donemGunu, DONEM_GUN, yil } from '../core/types';
import { formatClock, formatMoney } from '../core/util';
import { FLOOR_DEFS, ROOM_DEFS, ROOM_LIST, WALL_COST, DOOR_COST } from '../data/rooms';
import { OBJECT_LIST } from '../data/objects';
import { libraryLevel } from '../core/grid';
import type { UIState, Tool } from './uistate';
import { openPanel } from './panels';

let topEl: HTMLElement;
let toolbarEl: HTMLElement;
let subbarEl: HTMLElement;
let noticesEl: HTMLElement;

type Kategori = 'insaat' | 'oda' | 'esya' | null;
let acikKategori: Kategori = null;

export function initHud(getState: () => GameState, ui: UIState): void {
  topEl = document.getElementById('hud-top')!;
  toolbarEl = document.getElementById('hud-toolbar')!;
  subbarEl = document.getElementById('hud-subbar')!;
  noticesEl = document.getElementById('hud-notifications')!;

  // Üst bar BİR kez kurulur; refreshHud yalnızca metinleri günceller —
  // böylece hız/duraklat butonlarına tıklama asla yutulmaz.
  topEl.innerHTML = `
    <span class="stat para" data-st="para"></span>
    <span class="stat" data-st="prestij"></span>
    <span class="stat" data-st="ogrenci" title="Öğrenci"></span>
    <span class="stat" data-st="akademisyen" title="Akademisyen"></span>
    <span class="stat" data-st="kutuphane" title="Kütüphane seviyesi"></span>
    <span class="stat tarih" data-st="tarih"></span>
    <span class="hiz-grup">
      <button class="hiz" data-hiz="0">⏸</button>
      <button class="hiz" data-hiz="1">▶</button>
      <button class="hiz" data-hiz="2">▶▶</button>
      <button class="hiz" data-hiz="4">▶▶▶</button>
    </span>
  `;
  for (const b of topEl.querySelectorAll<HTMLButtonElement>('.hiz')) {
    b.addEventListener('click', () => {
      getState().hiz = Number(b.dataset.hiz);
      refreshHud(getState(), ui);
    });
  }

  buildToolbar(getState, ui);
  renderSubbarRef = () => renderSubbar(getState, ui);
  document.addEventListener('tool-changed', () => {
    acikKategori = null;
    renderSubbar(getState, ui);
    highlightToolbar();
  });
  document.addEventListener('room-selected', () => renderSubbar(getState, ui));
}

function buildToolbar(getState: () => GameState, ui: UIState): void {
  toolbarEl.innerHTML = '';
  const btn = (etiket: string, id: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.className = 'tb-btn';
    b.dataset.id = id;
    b.textContent = etiket;
    b.addEventListener('click', onClick);
    toolbarEl.appendChild(b);
    return b;
  };

  btn('🖱️ Seç', 'sec', () => setTool(ui, { kind: 'sec' }, getState));
  btn('🧱 İnşaat', 'insaat', () => toggleKategori('insaat', getState, ui));
  btn('🏷️ Odalar', 'oda', () => toggleKategori('oda', getState, ui));
  btn('🪑 Eşyalar', 'esya', () => toggleKategori('esya', getState, ui));
  btn('🎓 Bölümler', 'panel-bolumler', () => openPanel('bolumler'));
  btn('👩‍🏫 Kadro', 'panel-kadro', () => openPanel('kadro'));
  btn('🔬 Araştırma', 'panel-arastirma', () => openPanel('arastirma'));
  btn('♟️ Strateji', 'panel-strateji', () => openPanel('strateji'));
  btn('📊 Raporlar', 'panel-raporlar', () => openPanel('raporlar'));
}

function toggleKategori(k: Exclude<Kategori, null>, getState: () => GameState, ui: UIState): void {
  acikKategori = acikKategori === k ? null : k;
  renderSubbar(getState, ui);
  highlightToolbar();
}

function setTool(ui: UIState, tool: Tool, getState: () => GameState): void {
  ui.tool = tool;
  ui.dragStart = null;
  renderSubbar(getState, ui);
  highlightToolbar();
}

function highlightToolbar(): void {
  for (const b of toolbarEl.querySelectorAll<HTMLButtonElement>('.tb-btn')) {
    b.classList.toggle('active', b.dataset.id === acikKategori);
  }
}

function renderSubbar(getState: () => GameState, ui: UIState): void {
  subbarEl.innerHTML = '';
  const state = getState();

  const item = (etiket: string, secili: boolean, onClick: () => void, tooltip?: string) => {
    const b = document.createElement('button');
    b.className = 'sub-btn' + (secili ? ' active' : '');
    b.innerHTML = etiket;
    if (tooltip) b.title = tooltip;
    b.addEventListener('click', () => { onClick(); renderSubbar(getState, ui); });
    subbarEl.appendChild(b);
  };

  if (acikKategori === 'insaat') {
    for (const f of FLOOR_DEFS) {
      item(`${f.ad}<span class="fiyat">${formatMoney(f.maliyet)}</span>`,
        ui.tool.kind === 'zemin' && ui.tool.floor === f.id,
        () => { ui.tool = { kind: 'zemin', floor: f.id }; });
    }
    item(`Duvar<span class="fiyat">${formatMoney(WALL_COST)}</span>`, ui.tool.kind === 'duvar',
      () => { ui.tool = { kind: 'duvar' }; }, 'Sürükleyerek dikdörtgen çerçeve duvar örer');
    item(`Kapı<span class="fiyat">${formatMoney(DOOR_COST)}</span>`, ui.tool.kind === 'kapi',
      () => { ui.tool = { kind: 'kapi' }; }, 'Duvarın üstüne tıkla');
    item('🗑️ Yık', ui.tool.kind === 'yikim',
      () => { ui.tool = { kind: 'yikim' }; }, 'Sürükleyerek alanı yıkar, %25 iade');
  } else if (acikKategori === 'oda') {
    for (const r of ROOM_LIST) {
      item(r.ad, ui.tool.kind === 'oda' && ui.tool.room === r.id,
        () => { ui.tool = { kind: 'oda', room: r.id }; },
        `${r.aciklama}\nMin ${r.minBoyut} kare` );
    }
    item('❌ Oda Kaldır', ui.tool.kind === 'oda_kaldir',
      () => { ui.tool = { kind: 'oda_kaldir' }; });
  } else if (acikKategori === 'esya') {
    for (const o of OBJECT_LIST) {
      item(`${o.glyph} ${o.ad}<span class="fiyat">${formatMoney(o.maliyet)}</span>`,
        ui.tool.kind === 'esya' && ui.tool.obj === o.id,
        () => { ui.tool = { kind: 'esya', obj: o.id }; },
        o.odalar ? 'Oda: ' + o.odalar.map((x) => ROOM_DEFS[x].ad).join(', ') : 'Her yere konabilir');
    }
  } else if (ui.selectedRoomId !== -1) {
    const room = state.rooms.find((r) => r.id === ui.selectedRoomId);
    if (room) {
      const def = ROOM_DEFS[room.type];
      const div = document.createElement('div');
      div.className = 'oda-bilgi';
      const durum = room.valid
        ? '<span class="ok">✔ Kullanıma hazır</span>'
        : '<span class="hata">⚠ ' + room.missing.join(' · ') + '</span>';
      div.innerHTML = `<b>${def.ad}</b> (${room.tiles.length} kare) — ${durum}`;
      subbarEl.appendChild(div);
    }
  }
}

function setStat(anahtar: string, metin: string): void {
  const el = topEl.querySelector<HTMLElement>(`[data-st="${anahtar}"]`);
  if (el && el.textContent !== metin) el.textContent = metin;
}

let sonBildirimHtml = '';

/** Her karede çağrılır ama içerik ~saniyede 4 kez güncellenir (main.ts ayarlar). */
export function refreshHud(state: GameState, ui: UIState): void {
  let ogrenci = 0, akademisyen = 0;
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') ogrenci++;
    else if (a.kind === 'akademisyen') akademisyen++;
  }

  setStat('para', formatMoney(state.para));
  setStat('prestij', `⭐ ${Math.round(state.prestij)}`);
  setStat('ogrenci', `🎓 ${ogrenci}`);
  setStat('akademisyen', `👩‍🏫 ${akademisyen}`);
  setStat('kutuphane', `📚 Ktp. Sv. ${libraryLevel(state)}`);
  setStat('tarih', `Yıl ${yil(state.gun)} ${donemAdi(state.gun)} · Gün ${donemGunu(state.gun)}/${DONEM_GUN} · ${formatClock(state.dakika)}`);
  for (const b of topEl.querySelectorAll<HTMLButtonElement>('.hiz')) {
    b.classList.toggle('active', Number(b.dataset.hiz) === state.hiz);
  }

  // bildirimler (son 6) — değişmediyse DOM'a dokunma
  const son = state.notices.slice(-6);
  const html = son.map((n) => `<div class="notice ${n.kind}">${escapeHtml(n.metin)}</div>`).join('');
  if (html !== sonBildirimHtml) {
    sonBildirimHtml = html;
    noticesEl.innerHTML = html;
  }

  // seçili oda bilgisi açıkken (kategori kapalı) durumu tazele — butonsuz içerik,
  // yeniden çizim tıklama yutmaz
  if (ui.selectedRoomId !== -1 && subbarKategoriYok()) {
    renderSubbarRef?.();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let renderSubbarRef: (() => void) | null = null;

function subbarKategoriYok(): boolean {
  return acikKategori === null;
}
