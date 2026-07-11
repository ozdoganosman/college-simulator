import {
  GameState, LEVEL_LABEL, RANK_LABEL, ALAN_META, WALL_NONE, donemAdi, donemGunu, DONEM_GUN, yil,
} from '../core/types';
import { formatClock, formatMoney } from '../core/util';
import { FLOOR_DEFS, ROOM_DEFS, ROOM_LIST, WALL_COST, DOOR_COST } from '../data/rooms';
import { OBJECT_DEFS, OBJECT_LIST } from '../data/objects';
import { isEnclosed, libraryLevel } from '../core/grid';
import {
  PREFABS, autoFurnishCost, autoFurnishRoom, prefabCost, prefabOzet, roomFurnishPlan,
} from '../game/prefab';
import { runYerlestirme } from '../game/departments';
import { gnoHesapla } from '../game/agents';
import { DERS_LIMIT, asistanlari, dersYukuVerimi } from '../game/schedule';
import { deptDef } from '../data/departments';
import { deleteRoom } from '../game/build';
import type { UIState, Tool } from './uistate';
import { openPanel } from './panels';

let topEl: HTMLElement;
let toolbarEl: HTMLElement;
let subbarEl: HTMLElement;
let noticesEl: HTMLElement;

type Kategori = 'insaat' | 'oda' | 'esya' | 'hazir' | null;
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
      <button class="hiz" id="menu-ac" title="Menü (Esc)">☰</button>
    </span>
  `;
  document.getElementById('menu-ac')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('toggle-menu'));
  });

  // YKS yerleştirme butonu: YKS dönemi açıkken görünür, basınca sonuç töreni gelir
  document.getElementById('yks-cta')?.addEventListener('click', () => {
    runYerlestirme(getState());
  });
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
  btn('🏗️ Hazır Bina', 'hazir', () => toggleKategori('hazir', getState, ui));
  btn('🧱 İnşaat', 'insaat', () => toggleKategori('insaat', getState, ui));
  btn('🏷️ Odalar', 'oda', () => toggleKategori('oda', getState, ui));
  btn('🪑 Eşyalar', 'esya', () => toggleKategori('esya', getState, ui));
  btn('🎓 Bölümler', 'panel-bolumler', () => openPanel('bolumler'));
  btn('👩‍🏫 Kadro', 'panel-kadro', () => openPanel('kadro'));
  btn('📅 Program', 'panel-program', () => openPanel('program'));
  btn('🔬 Araştırma', 'panel-arastirma', () => openPanel('arastirma'));
  btn('♟️ Strateji', 'panel-strateji', () => openPanel('strateji'));
  btn('📊 Raporlar', 'panel-raporlar', () => openPanel('raporlar'));
  btn('❓ Nasıl Oynanır', 'panel-yardim', () => openPanel('yardim'));
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

  if (acikKategori === 'hazir') {
    for (const p of PREFABS) {
      item(
        `${ROOM_DEFS[p.room].ad === p.ad ? '' : ''}${p.ad} <span class="fiyat">${p.w}×${p.h} · ${formatMoney(prefabCost(p))}</span>`,
        ui.tool.kind === 'hazir' && ui.tool.prefab === p.id,
        () => { ui.tool = { kind: 'hazir', prefab: p.id }; },
        `Tek tıkla kurulur: zemin + duvar + kapı + oda + eşyalar\nİçerik: ${prefabOzet(p)}`,
      );
    }
    const div = document.createElement('div');
    div.className = 'oda-bilgi';
    div.innerHTML = 'Bina imlecin altında önizlenir; <b>yeşilse</b> tıklayıp kur. Alan tamamen boş olmalı.';
    subbarEl.appendChild(div);
  } else if (acikKategori === 'insaat') {
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
    // seçili oda türünün gereksinim özeti — oyuncu ne yapacağını görsün
    if (ui.tool.kind === 'oda') {
      const def = ROOM_DEFS[ui.tool.room];
      const gerekler = def.gereksinim
        .map((g) => `${g.adet}× ${OBJECT_DEFS[g.obj].ad}`)
        .join(' · ');
      const div = document.createElement('div');
      div.className = 'oda-bilgi';
      div.innerHTML = `<b>${def.ad}</b> için gerekli: en az ${def.minBoyut} kare · zemin döşeli · `
        + `duvarla çevrili + kapı${gerekler ? ' · ' + gerekler : ''} — <i>${def.aciklama}</i>`;
      subbarEl.appendChild(div);
    }
  } else if (acikKategori === 'esya') {
    for (const o of OBJECT_LIST) {
      item(`${o.glyph} ${o.ad}<span class="fiyat">${formatMoney(o.maliyet)}</span>`,
        ui.tool.kind === 'esya' && ui.tool.obj === o.id,
        () => { ui.tool = { kind: 'esya', obj: o.id }; },
        o.odalar ? 'Oda: ' + o.odalar.map((x) => ROOM_DEFS[x].ad).join(', ') : 'Her yere konabilir');
    }
  } else if (ui.selectedAgentId !== -1) {
    const a = state.agents.find((x) => x.id === ui.selectedAgentId);
    if (a) {
      const div = document.createElement('div');
      div.className = 'gerek-liste';
      div.innerHTML = agentCard(state, a);
      subbarEl.appendChild(div);
    }
  } else if (ui.selectedRoomId !== -1) {
    const room = state.rooms.find((r) => r.id === ui.selectedRoomId);
    if (room) {
      const def = ROOM_DEFS[room.type];
      const div = document.createElement('div');
      div.className = 'gerek-liste';

      const cip = (etiket: string, tamam: boolean) =>
        `<span class="gerek${tamam ? '' : ' eksik'}">${tamam ? '✔' : '✖'} ${etiket}</span>`;

      const boyutOk = room.tiles.length >= def.minBoyut;
      const zeminOk = !room.tiles.some(
        (t) => state.floor[t] === null && state.wall[t] === WALL_NONE,
      );
      const kapaliOk = !def.kapali || isEnclosed(state, room);

      let html = `<span class="baslik">${def.ad} (${room.tiles.length} kare)</span>`;
      html += cip(`Boyut ${room.tiles.length}/${def.minBoyut}`, boyutOk);
      html += cip('Zemin döşeli', zeminOk);
      if (def.kapali) html += cip('Duvarla çevrili + kapı', kapaliOk);
      for (const g of def.gereksinim) {
        const adet = state.objects.filter((o) => o.roomId === room.id && o.type === g.obj).length;
        html += cip(`${OBJECT_DEFS[g.obj].ad} ${Math.min(adet, g.adet)}/${g.adet}`, adet >= g.adet);
      }
      html += room.valid
        ? '<span class="gerek">✔ Oda kullanıma hazır</span>'
        : '';
      div.innerHTML = html;

      // otomatik döşeme: eksik eşyaları boyuta göre desenle yerleştir
      const plan = roomFurnishPlan(state, room);
      if (plan.length > 0) {
        const b = document.createElement('button');
        b.className = 'sub-btn';
        b.innerHTML = `🪄 Otomatik Döşe (${plan.length} eşya) <span class="fiyat">${formatMoney(autoFurnishCost(state, room))}</span>`;
        b.title = 'Odayı türüne uygun desenle döşer — oda büyüdükçe eşya (ve kapasite) artar';
        b.addEventListener('click', () => {
          autoFurnishRoom(state, room.id);
          renderSubbar(getState, ui);
        });
        div.appendChild(b);
      }

      // oda düzenleme: genişletme ipucu + silme
      const ipucu = document.createElement('span');
      ipucu.className = 'gerek';
      ipucu.textContent = '✏️ Genişlet: Odalar aracıyla bitişiğine sürükle · Küçült: Oda Kaldır aracı';
      div.appendChild(ipucu);

      const sil = document.createElement('button');
      sil.className = 'sub-btn';
      sil.innerHTML = '🗑️ Odayı Sil';
      sil.title = 'Oda atamasını tamamen kaldırır — duvarlar ve eşyalar yerinde kalır';
      sil.addEventListener('click', () => {
        deleteRoom(state, room.id);
        ui.selectedRoomId = -1;
        renderSubbar(getState, ui);
      });
      div.appendChild(sil);
      subbarEl.appendChild(div);
    }
  }
}

/** Tıklanan kişinin bilgi kartı (öğrenci: GNO + eğilim; hoca: yük verimi). */
function agentCard(state: GameState, a: GameState['agents'][number]): string {
  const cip = (metin: string, kotu = false) =>
    `<span class="gerek${kotu ? ' eksik' : ''}">${metin}</span>`;

  if (a.kind === 'ogrenci') {
    const dept = state.departments.find((d) => d.id === a.deptId);
    const bolum = dept ? deptDef(dept.defId).ad : 'Bölümsüz';
    const gno = gnoHesapla(a);
    const egilimEtiket = a.egilim >= 115 ? 'çalışkan' : a.egilim >= 85 ? 'normal' : 'zorlanıyor';
    const hoca = a.asistani !== -1 ? state.agents.find((x) => x.id === a.asistani) : undefined;
    let html = `<span class="baslik">🎓 ${a.ad} — ${LEVEL_LABEL[a.level]} · ${bolum}</span>`;
    html += cip(gno === null ? '📖 GNO: henüz yok' : `📖 GNO: ${gno.toFixed(2)}/4.00`, gno !== null && gno < 2);
    html += cip(`🧠 Öğrenme eğilimi: %${a.egilim} (${egilimEtiket})`, a.egilim < 85);
    html += cip(`📈 Mezuniyet ilerlemesi: %${Math.round(a.ilerleme)}`);
    html += cip(`😊 Mutluluk: %${Math.round(a.mutluluk)}`, a.mutluluk < 40);
    if (hoca && hoca.kind === 'akademisyen') {
      html += cip(`🧑‍🔬 Asistanlık: ${RANK_LABEL[hoca.rank]} ${hoca.ad}`);
    }
    return html;
  }
  if (a.kind === 'akademisyen') {
    const verim = Math.round(dersYukuVerimi(state, a) * 100);
    const asistan = asistanlari(state, a.id).length;
    const ders = (a.verdigiDersler ?? []).length;
    let html = `<span class="baslik">${RANK_LABEL[a.rank]} ${a.ad} · ${ALAN_META[a.alan].emoji} ${ALAN_META[a.alan].ad}</span>`;
    html += cip(`📚 Ders: ${ders}/${DERS_LIMIT} · 👥 Asistan: ${asistan}`);
    html += cip(`⚡ Yük verimi: %${verim} — ders kalitesi ve araştırma hızı çarpanı`, verim < 75);
    html += cip(`🎓 Eğitim: ${Math.round(a.egitim)} · 🔬 Araştırma: ${Math.round(a.arastirma)}`);
    html += cip(`📄 Makale: ${a.makale} (${a.uluslararasiMakale} 🌍)`);
    return html;
  }
  const rol = a.kind === 'asci' ? 'Aşçı' : 'Temizlikçi';
  return `<span class="baslik">${rol} ${a.ad}</span>` + cip(`Maaş: ${formatMoney(a.maas)}/gün`);
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

  document.getElementById('yks-cta')?.classList.toggle('hidden', !state.yksBekliyor);

  // bildirimler (son 6) — değişmediyse DOM'a dokunma
  const son = state.notices.slice(-6);
  const html = son.map((n) => `<div class="notice ${n.kind}">${escapeHtml(n.metin)}</div>`).join('');
  if (html !== sonBildirimHtml) {
    sonBildirimHtml = html;
    noticesEl.innerHTML = html;
  }

  // seçili oda bilgisi açıkken (kategori kapalı) durumu tazele — butonsuz içerik,
  // yeniden çizim tıklama yutmaz
  if ((ui.selectedRoomId !== -1 || ui.selectedAgentId !== -1) && subbarKategoriYok()) {
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
