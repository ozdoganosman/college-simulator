/**
 * SPEC — Yönetim panelleri (DOM tabanlı, #panel-root içine çizilir).
 *
 * initPanels(getState): bir kez çağrılır, getState saklanır.
 * openPanel(name): 'bolumler'|'kadro'|'arastirma'|'strateji'|'raporlar' — açık paneli
 *   kapatıp yenisini açar; aynı ad tekrar çağrılırsa kapatır (toggle).
 * closePanel(): açık paneli kapatır. Panellerde sağ üstte ✕ (class 'kapat').
 * refreshOpenPanel(state): ~saniyede 4 kez çağrılır; açık panel varsa içeriğini günceller.
 *   ÖNEMLİ: input odaklıyken (document.activeElement bir input ise) yeniden ÇİZME —
 *   kullanıcının yazdığı kontenjan kaybolmasın. Panel div'i .panel sınıfını kullanır
 *   (styles.css'te hazır).
 */
import {
  AcademicRank, GameState, RANK_LABEL, RoomType, StrategyDef, StudentLevel,
} from '../core/types';
import { formatMoney } from '../core/util';
import { libraryLevel, validRooms } from '../core/grid';
import { clearSave, notify, spend } from '../game/state';
import {
  canOpenDepartment, openDepartment, seatCapacity, setDoktoraQuota, setQuota, setYlQuota,
  toggleGradProgram,
} from '../game/departments';
import { assignAcademicDept, fireAcademic, hireFromPool, officeCapacity } from '../game/academics';
import { cancelProject, startProject } from '../game/research';
import { hireStaff, removeAgent } from '../game/agents';
import { BALANCE } from '../data/balance';
import { DEPT_DEFS, deptDef } from '../data/departments';
import { ROOM_DEFS } from '../data/rooms';
import { STRATEGY_DEFS, strategyDef } from '../data/strategies';

export type PanelName = 'bolumler' | 'kadro' | 'arastirma' | 'strateji' | 'raporlar';

let getStateRef: (() => GameState) | null = null;
let acik: { name: PanelName; el: HTMLDivElement } | null = null;

const PANEL_BASLIK: Record<PanelName, string> = {
  bolumler: '🎓 Bölümler',
  kadro: '👩‍🏫 Kadro',
  arastirma: '🔬 Araştırma',
  strateji: '♟️ Strateji',
  raporlar: '📊 Raporlar',
};

export function initPanels(getState: () => GameState): void {
  getStateRef = getState;
}

let isaretciBasili = false;
let sonYenileme = 0;

export function openPanel(name: PanelName): void {
  if (acik && acik.name === name) {
    closePanel();
    return;
  }
  closePanel();
  const root = document.getElementById('panel-root');
  if (!root || !getStateRef) return;

  const el = document.createElement('div');
  el.className = 'panel';
  // Olay delegasyonu: panel açıkken BİR kez bağlanır, innerHTML yenilense de yaşar.
  el.addEventListener('click', onPanelClick);
  el.addEventListener('change', onPanelChange);
  // fare basılıyken yeniden çizme — mousedown/mouseup arası DOM değişirse tık yutulur
  el.addEventListener('pointerdown', () => { isaretciBasili = true; });
  window.addEventListener('pointerup', () => { isaretciBasili = false; });
  root.appendChild(el);
  acik = { name, el };
  render(getStateRef());
}

export function closePanel(): void {
  if (!acik) return;
  acik.el.remove();
  acik = null;
}

export function refreshOpenPanel(state: GameState): void {
  if (!acik) return;
  if (isaretciBasili) return; // tıklama sürüyor — DOM'u değiştirme
  const simdi = performance.now();
  if (simdi - sonYenileme < 900) return; // canlı sayaçlar için ~saniyede 1 yeterli
  const ae = document.activeElement;
  if (ae && acik.el.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
    return; // kullanıcı yazıyor — yeniden çizme
  }
  sonYenileme = simdi;
  render(state);
}

// --- Ortak yardımcılar --------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baslik(metin: string): string {
  return `<h2>${metin} <button class="kapat" data-action="kapat" title="Kapat">✕</button></h2>`;
}

function render(state: GameState): void {
  if (!acik) return;
  let govde = '';
  switch (acik.name) {
    case 'bolumler': govde = bolumlerGovde(state); break;
    case 'kadro': govde = kadroGovde(state); break;
    case 'arastirma': govde = arastirmaGovde(state); break;
    case 'strateji': govde = stratejiGovde(state); break;
    case 'raporlar': govde = raporlarGovde(state); break;
  }
  acik.el.innerHTML = baslik(PANEL_BASLIK[acik.name]) + govde;
}

// --- Olay işleyiciler ----------------------------------------------------------

function onPanelClick(e: Event): void {
  if (!(e.target instanceof Element) || !getStateRef || !acik) return;
  const hedef = e.target.closest<HTMLElement>('[data-action]');
  if (!hedef || !acik.el.contains(hedef)) return;
  const state = getStateRef();
  const action = hedef.dataset.action ?? '';
  const id = hedef.dataset.id ?? '';

  switch (action) {
    case 'kapat':
      closePanel();
      return;
    case 'bolum-ac':
      openDepartment(state, id);
      break;
    case 'yl-toggle':
      toggleGradProgram(state, Number(id), 'yl');
      break;
    case 'doktora-toggle':
      toggleGradProgram(state, Number(id), 'doktora');
      break;
    case 'ise-al-kpss':
    case 'ise-al-transfer': {
      const sec = hedef.closest('tr')?.querySelector<HTMLSelectElement>('select[data-role="aday-bolum"]');
      const deptId = sec ? Number(sec.value) : -1;
      hireFromPool(state, action === 'ise-al-kpss' ? 'kpss' : 'transfer', Number(id), deptId);
      break;
    }
    case 'akademisyen-cikar':
      fireAcademic(state, Number(id));
      break;
    case 'personel-al':
      hireStaff(state, id as 'asci' | 'temizlikci');
      break;
    case 'personel-cikar': {
      const kind = id as 'asci' | 'temizlikci';
      for (let i = state.agents.length - 1; i >= 0; i--) {
        const p = state.agents[i];
        if (p.kind === kind) {
          removeAgent(state, p.id);
          notify(state, `${p.ad} işten çıkarıldı.`, 'kotu');
          break;
        }
      }
      break;
    }
    case 'proje-baslat':
      startProject(state, Number(id));
      break;
    case 'proje-iptal':
      cancelProject(state, Number(id));
      break;
    case 'strateji-al': {
      const def = strategyDef(id);
      if (stratejiEksikleri(state, def).length > 0) break; // buton zaten disabled — emniyet
      if (!spend(state, def.maliyet, def.ad)) break;
      state.strategies.push(def.id);
      notify(state, `♟️ Strateji devrede: ${def.ad}`, 'iyi');
      break;
    }
    case 'yeni-oyun':
      if (confirm('Kayıt silinecek, emin misiniz?')) {
        clearSave();
        location.reload();
      }
      return;
    default:
      return;
  }
  render(state);
}

function onPanelChange(e: Event): void {
  if (!(e.target instanceof HTMLElement) || !getStateRef || !acik) return;
  const hedef = e.target.closest<HTMLElement>('[data-action]');
  if (!hedef || !acik.el.contains(hedef)) return;
  const state = getStateRef();
  const action = hedef.dataset.action ?? '';
  const id = Number(hedef.dataset.id ?? '-1');

  if (action === 'kontenjan' || action === 'yl-kontenjan' || action === 'doktora-kontenjan') {
    const input = hedef as HTMLInputElement;
    if (input.value.trim() === '') return; // boş bırakıldı — kontenjanı sıfırlama
    const deger = Number(input.value);
    if (!Number.isFinite(deger)) return;
    if (action === 'kontenjan') setQuota(state, id, deger);
    else if (action === 'yl-kontenjan') setYlQuota(state, id, deger);
    else setDoktoraQuota(state, id, deger);
    // clamp sonrası gerçek değeri inputa geri yaz (tam yeniden çizim yok — odak korunur)
    const dept = state.departments.find((d) => d.id === id);
    if (dept) {
      input.value = String(
        action === 'kontenjan' ? dept.kontenjan
          : action === 'yl-kontenjan' ? dept.ylKontenjan : dept.doktoraKontenjan,
      );
    }
  } else if (action === 'bolum-sec') {
    assignAcademicDept(state, id, Number((hedef as HTMLSelectElement).value));
  }
}

// --- Bölümler ------------------------------------------------------------------

function bolumlerGovde(state: GameState): string {
  // Paylaşılan sayımlar — tek geçiş
  const ogr = new Map<number, { lisans: number; yl: number; dok: number }>();
  const akd = new Map<number, { n: number; docentProf: boolean; prof: boolean }>();
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') {
      let o = ogr.get(a.deptId);
      if (!o) { o = { lisans: 0, yl: 0, dok: 0 }; ogr.set(a.deptId, o); }
      if (a.level === 'lisans') o.lisans++;
      else if (a.level === 'yl') o.yl++;
      else o.dok++;
    } else if (a.kind === 'akademisyen') {
      let k = akd.get(a.deptId);
      if (!k) { k = { n: 0, docentProf: false, prof: false }; akd.set(a.deptId, k); }
      k.n++;
      if (a.rank === 'docent' || a.rank === 'prof') k.docentProf = true;
      if (a.rank === 'prof') k.prof = true;
    }
  }
  const derslikSayisi = new Map<number, number>();
  for (const r of state.rooms) {
    if ((r.type === 'derslik' || r.type === 'amfi') && r.valid && r.deptId !== null) {
      derslikSayisi.set(r.deptId, (derslikSayisi.get(r.deptId) ?? 0) + 1);
    }
  }

  let acikTablo = '<p class="aciklama">Henüz açık bölüm yok — aşağıdan ilk bölümünüzü açın.</p>';
  if (state.departments.length > 0) {
    const satirlar = state.departments.map((d) => {
      const def = deptDef(d.defId);
      const o = ogr.get(d.id) ?? { lisans: 0, yl: 0, dok: 0 };
      const k = akd.get(d.id) ?? { n: 0, docentProf: false, prof: false };
      const uyeRozet = k.n < def.minAkademisyen
        ? '<span class="rozet" style="background:#8f3535">öğr. üyesi yetersiz</span>' : '';

      // YL butonu + (açıksa) kontenjan inputu
      let yl: string;
      if (d.ylAcik) {
        yl = `<button class="eylem" data-action="yl-toggle" data-id="${d.id}">YL Kapat</button>
          <input type="number" class="kontenjan-input" data-action="yl-kontenjan" data-id="${d.id}"
            value="${d.ylKontenjan}" min="0" max="40" title="YL kontenjanı">`;
      } else {
        const olur = k.docentProf;
        yl = `<button class="eylem" data-action="yl-toggle" data-id="${d.id}"
          ${olur ? '' : 'disabled title="En az 1 Doçent/Profesör gerekli"'}>YL Aç</button>`;
      }

      // Doktora butonu + (açıksa) kontenjan inputu
      let dok: string;
      if (d.doktoraAcik) {
        dok = `<button class="eylem" data-action="doktora-toggle" data-id="${d.id}">Dok. Kapat</button>
          <input type="number" class="kontenjan-input" data-action="doktora-kontenjan" data-id="${d.id}"
            value="${d.doktoraKontenjan}" min="0" max="40" title="Doktora kontenjanı">`;
      } else {
        const nedenler: string[] = [];
        if (!d.ylAcik) nedenler.push('Önce yüksek lisans açılmalı');
        if (!k.prof) nedenler.push('En az 1 Profesör gerekli');
        dok = `<button class="eylem" data-action="doktora-toggle" data-id="${d.id}"
          ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : ''}>Dok. Aç</button>`;
      }

      return `<tr>
        <td><b>${esc(def.ad)}</b></td>
        <td>${o.lisans} / ${o.yl} / ${o.dok}</td>
        <td><input type="number" class="kontenjan-input" data-action="kontenjan" data-id="${d.id}"
          value="${d.kontenjan}" min="0" max="300"></td>
        <td>${d.sonTalep} / ${d.sonKayit}</td>
        <td>${derslikSayisi.get(d.id) ?? 0} derslik · ${seatCapacity(state, d.id)} koltuk</td>
        <td>${k.n} / ${def.minAkademisyen}${uyeRozet}</td>
        <td>${yl} ${dok}</td>
      </tr>`;
    }).join('');

    acikTablo = `<table>
      <tr><th>Bölüm</th><th>Öğrenci (L/YL/Dok)</th><th>Kontenjan</th><th>Talep/Kayıt</th>
        <th>Derslik</th><th>Öğr. Üyesi</th><th>Lisansüstü</th></tr>
      ${satirlar}
    </table>`;
  }

  const acikIdler = new Set(state.departments.map((d) => d.defId));
  const kapali = DEPT_DEFS.filter((def) => !acikIdler.has(def.id));
  let yeniBolum = '<p class="aciklama">Tüm bölümler açıldı — tebrikler!</p>';
  if (kapali.length > 0) {
    const satirlar = kapali.map((def) => {
      const { ok, eksik } = canOpenDepartment(state, def.id);
      const gereksinim = `${def.minDerslik} derslik${def.labGerekli ? ' + laboratuvar' : ''}, `
        + `${def.minAkademisyen} öğr. üyesi`;
      const durum = ok
        ? '<span style="color:#7ee08a">Hazır</span>'
        : `<span style="color:#f4a09c">${esc(eksik.join(', '))}</span>`;
      return `<tr>
        <td><b>${esc(def.ad)}</b></td>
        <td>${gereksinim}</td>
        <td>${formatMoney(def.acilisMaliyeti)}</td>
        <td>${durum}</td>
        <td><button class="eylem" data-action="bolum-ac" data-id="${def.id}"
          ${ok ? '' : `disabled title="${esc(eksik.join(', '))}"`}>Aç</button></td>
      </tr>`;
    }).join('');
    yeniBolum = `<table>
      <tr><th>Bölüm</th><th>Gereksinim</th><th>Maliyet</th><th>Durum</th><th></th></tr>
      ${satirlar}
    </table>`;
  }

  return `${acikTablo}
    <h3>Yeni Bölüm Aç</h3>
    <p class="aciklama">Bölüm açmak için yeterli sayıda boş geçerli derslik (varsa laboratuvar)
      ve bütçe gerekir. Öğrenci gelmesi için bölüme yeterli öğretim üyesi atamayı unutmayın.</p>
    ${yeniBolum}`;
}

// --- Kadro ---------------------------------------------------------------------

function bolumSecenekleri(state: GameState, seciliDeptId: number): string {
  const sec = state.departments
    .map((d) => `<option value="${d.id}" ${seciliDeptId === d.id ? 'selected' : ''}>`
      + `${esc(deptDef(d.defId).kisa)}</option>`)
    .join('');
  return `<option value="-1" ${seciliDeptId === -1 ? 'selected' : ''}>—</option>${sec}`;
}

function kadroGovde(state: GameState): string {
  const akademisyenler = state.agents.filter((a) => a.kind === 'akademisyen');
  const masa = officeCapacity(state);
  const kadroDolu = akademisyenler.length >= masa;

  let kadroTablo = '<p class="aciklama">Henüz akademisyen yok — aşağıdaki havuzlardan alım yapın.</p>';
  if (akademisyenler.length > 0) {
    const satirlar = akademisyenler.map((a) => {
      const tazminat = 30 * a.maas;
      return `<tr>
        <td><b>${RANK_LABEL[a.rank]} ${esc(a.ad)}</b></td>
        <td><select data-action="bolum-sec" data-id="${a.id}">${bolumSecenekleri(state, a.deptId)}</select></td>
        <td>${Math.round(a.egitim)}</td>
        <td>${Math.round(a.arastirma)}</td>
        <td>${Math.floor(a.xp)}</td>
        <td>${a.makale} (${a.uluslararasiMakale} 🌍)</td>
        <td>${formatMoney(a.maas)}</td>
        <td><button class="eylem tehlike" data-action="akademisyen-cikar" data-id="${a.id}"
          title="Tazminat: 30 günlük maaş">Çıkar (${formatMoney(tazminat)})</button></td>
      </tr>`;
    }).join('');
    kadroTablo = `<table>
      <tr><th>Akademisyen</th><th>Bölüm</th><th>Eğitim</th><th>Arş.</th><th>XP</th>
        <th>Makale</th><th>Maaş/gün</th><th></th></tr>
      ${satirlar}
    </table>`;
  }

  // KPSS havuzu
  const kpssSatir = state.kpssPool.map((c) => `<tr>
      <td>${RANK_LABEL[c.rank]} ${esc(c.ad)}</td>
      <td>${c.egitim}</td>
      <td>${c.arastirma}</td>
      <td>${formatMoney(c.maas)}</td>
      <td><select data-role="aday-bolum">${bolumSecenekleri(state, -1)}</select></td>
      <td><button class="eylem" data-action="ise-al-kpss" data-id="${c.id}"
        ${kadroDolu ? 'disabled title="Ofis masası yetersiz"' : ''}>İşe Al</button></td>
    </tr>`).join('');
  const kpssTablo = state.kpssPool.length === 0
    ? '<p class="aciklama">KPSS havuzu boş — yeni adaylar dönem başında gelir.</p>'
    : `<table>
        <tr><th>Aday</th><th>Eğitim</th><th>Arş.</th><th>Maaş/gün</th><th>Bölüm</th><th></th></tr>
        ${kpssSatir}
      </table>`;

  // Transfer havuzu
  const transferSatir = state.transferPool.map((c) => {
    const nedenler: string[] = [];
    if (kadroDolu) nedenler.push('Ofis masası yetersiz');
    if (state.para < c.bonus) nedenler.push('Bütçe yetersiz (imza bonusu)');
    return `<tr>
      <td>${RANK_LABEL[c.rank]} ${esc(c.ad)}</td>
      <td>${esc(c.kurum)}</td>
      <td>${c.egitim}</td>
      <td>${c.arastirma}</td>
      <td>${formatMoney(c.maas)}</td>
      <td>${formatMoney(c.bonus)}</td>
      <td><select data-role="aday-bolum">${bolumSecenekleri(state, -1)}</select></td>
      <td><button class="eylem" data-action="ise-al-transfer" data-id="${c.id}"
        ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : ''}>Transfer Et</button></td>
    </tr>`;
  }).join('');
  const transferTablo = state.transferPool.length === 0
    ? '<p class="aciklama">Transfer havuzu boş — yeni adaylar dönem başında gelir.</p>'
    : `<table>
        <tr><th>Aday</th><th>Kurum</th><th>Eğitim</th><th>Arş.</th><th>Maaş/gün</th>
          <th>Bonus</th><th>Bölüm</th><th></th></tr>
        ${transferSatir}
      </table>`;

  // Destek personeli
  let asci = 0, temizlikci = 0;
  for (const a of state.agents) {
    if (a.kind === 'asci') asci++;
    else if (a.kind === 'temizlikci') temizlikci++;
  }
  const personelSatir = (kind: 'asci' | 'temizlikci', ad: string, adet: number): string => {
    const alim = BALANCE.PERSONEL_ALIM[kind];
    return `<tr>
      <td><b>${ad}</b></td>
      <td>${adet}</td>
      <td>${formatMoney(BALANCE.MAAS[kind])}</td>
      <td>
        <button class="eylem" data-action="personel-al" data-id="${kind}"
          ${state.para < alim ? 'disabled title="Bütçe yetersiz"' : ''}>İşe Al (${formatMoney(alim)})</button>
        <button class="eylem tehlike" data-action="personel-cikar" data-id="${kind}"
          ${adet === 0 ? 'disabled' : ''}>Çıkar</button>
      </td>
    </tr>`;
  };

  return `<p class="aciklama">Kadro: ${akademisyenler.length} / Masa: ${masa}
      ${kadroDolu ? '<span class="rozet" style="background:#8f3535">ofis masası gerekli</span>' : ''}
      — her akademisyen için geçerli bir ofiste çalışma masası gerekir.</p>
    ${kadroTablo}
    <h3>KPSS / İlan Havuzu</h3>
    ${kpssTablo}
    <h3>Transfer Havuzu</h3>
    <p class="aciklama">Deneyimli akademisyenler imza bonusu ister; transfer prestij kazandırır.</p>
    ${transferTablo}
    <h3>Destek Personeli</h3>
    <p class="aciklama">Aşçı olmadan yemekhane servis yapamaz; temizlikçiler kampüs kirini temizler.</p>
    <table>
      <tr><th>Personel</th><th>Sayı</th><th>Maaş/gün</th><th></th></tr>
      ${personelSatir('asci', 'Aşçı', asci)}
      ${personelSatir('temizlikci', 'Temizlikçi', temizlikci)}
    </table>`;
}

// --- Araştırma -----------------------------------------------------------------

function arastirmaGovde(state: GameState): string {
  let bolumler = '<p class="aciklama">Araştırma için önce bölüm açmalısınız.</p>';
  if (state.departments.length > 0) {
    // bölüm -> akademisyen var mı (tek geçiş)
    const akademisyenVar = new Set<number>();
    for (const a of state.agents) {
      if (a.kind === 'akademisyen') akademisyenVar.add(a.deptId);
    }
    const labVar = validRooms(state, 'laboratuvar').length > 0;
    const kutOfisVar = validRooms(state, 'kutuphane').length > 0 || validRooms(state, 'ofis').length > 0;

    bolumler = state.departments.map((d) => {
      const def = deptDef(d.defId);
      const proje = state.projects.find((p) => p.deptId === d.id);
      let icerik: string;
      if (proje) {
        const yuzde = Math.min(100, proje.ilerleme);
        icerik = `<div>"${esc(proje.baslik)}" — %${Math.floor(yuzde)}
            <button class="eylem tehlike" data-action="proje-iptal" data-id="${proje.id}"
              title="İade yok">İptal</button></div>
          <div style="background:#2c3140;border-radius:4px;height:10px;margin:5px 0 2px;overflow:hidden">
            <div style="width:${yuzde.toFixed(1)}%;height:100%;background:#4a7bd4"></div>
          </div>`;
      } else {
        const nedenler: string[] = [];
        if (def.labGerekli && !labVar) nedenler.push('Geçerli laboratuvar gerekli');
        if (!def.labGerekli && !kutOfisVar) nedenler.push('Geçerli kütüphane ya da ofis gerekli');
        if (!akademisyenVar.has(d.id)) nedenler.push('Bölümde akademisyen yok');
        icerik = `<button class="eylem" data-action="proje-baslat" data-id="${d.id}"
          ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : ''}>
          Proje Başlat (~${formatMoney(BALANCE.PROJE_MALIYET_TABAN)})</button>`;
      }
      return `<h3>${esc(def.ad)}</h3>${icerik}`;
    }).join('');
  }

  // Sayaçlar
  let uluslararasi = 0, bulus = 0;
  for (const p of state.publications) {
    if (p.uluslararasi) uluslararasi++;
    if (p.cigirAcici) bulus++;
  }

  // Yayınlar (son 15, en yeni üstte)
  const agentAd = new Map<number, string>();
  for (const a of state.agents) agentAd.set(a.id, a.ad);
  const deptAd = new Map<number, string>();
  for (const d of state.departments) deptAd.set(d.id, deptDef(d.defId).kisa);

  const sonYayinlar = state.publications.slice(-15).reverse();
  const yayinTablo = sonYayinlar.length === 0
    ? '<p class="aciklama">Henüz yayın yok — proje tamamlanınca makaleler burada görünür.</p>'
    : `<table>
        <tr><th>Gün</th><th>Yayın</th><th>Yazar</th><th>Bölüm</th></tr>
        ${sonYayinlar.map((p) => `<tr>
          <td>${p.gun}</td>
          <td>${p.uluslararasi ? '🌍 ' : ''}${p.cigirAcici ? '💥 ' : ''}"${esc(p.baslik)}"</td>
          <td>${esc(agentAd.get(p.yazarId) ?? '—')}</td>
          <td>${esc(deptAd.get(p.deptId) ?? '—')}</td>
        </tr>`).join('')}
      </table>`;

  const odulListe = state.awards.length === 0
    ? '<p class="aciklama">Henüz ödül yok — çığır açan buluşlar ödül kazandırabilir.</p>'
    : [...state.awards].reverse()
      .map((o) => `<div>🏆 <b>${esc(o.ad)}</b> — ${esc(o.aciklama)} (Gün ${o.gun})</div>`)
      .join('');

  return `<p class="aciklama">Toplam makale: <b>${state.publications.length}</b> ·
      Uluslararası: <b>${uluslararasi}</b> · Buluş: <b>${bulus}</b> ·
      Ödül: <b>${state.awards.length}</b></p>
    ${bolumler}
    <h3>Yayınlar (son 15)</h3>
    ${yayinTablo}
    <h3>Ödüller</h3>
    ${odulListe}`;
}

// --- Strateji ------------------------------------------------------------------

function stratejiEksikleri(state: GameState, def: StrategyDef): string[] {
  const eksik: string[] = [];
  if (validRooms(state, 'rektorluk').length === 0) eksik.push('Geçerli Rektörlük odası gerekli');
  if (state.prestij < def.prestijGereksinimi) {
    eksik.push(`Prestij ${def.prestijGereksinimi} gerekli (şu an ${Math.round(state.prestij)})`);
  }
  for (const on of def.onkosul) {
    if (!state.strategies.includes(on)) eksik.push(`Ön koşul: ${strategyDef(on).ad}`);
  }
  if (def.id === 'erasmus' && !state.publications.some((p) => p.uluslararasi)) {
    eksik.push('En az 1 uluslararası yayın gerekli');
  }
  if (def.id === 'teknokent' && validRooms(state, 'laboratuvar').length < 2) {
    eksik.push('En az 2 geçerli laboratuvar gerekli');
  }
  if (state.para < def.maliyet) eksik.push('Bütçe yetersiz');
  return eksik;
}

function stratejiGovde(state: GameState): string {
  const rektorlukVar = validRooms(state, 'rektorluk').length > 0;
  const uyari = rektorlukVar
    ? ''
    : '<p class="aciklama" style="color:#f4a09c">⚠ Strateji için Rektörlük kurmalısınız'
      + ' (geçerli bir Rektörlük odası gerekir).</p>';

  const satirlar = STRATEGY_DEFS.map((def) => {
    const onkosul = def.onkosul.length === 0
      ? '—'
      : def.onkosul.map((o) => esc(strategyDef(o).ad)).join(', ');
    let islem: string;
    if (state.strategies.includes(def.id)) {
      islem = '<span class="rozet" style="background:#2e5d3a">✔ Alındı</span>';
    } else {
      const eksik = stratejiEksikleri(state, def);
      islem = `<button class="eylem" data-action="strateji-al" data-id="${def.id}"
        ${eksik.length > 0 ? `disabled title="${esc(eksik.join(', '))}"` : ''}>Satın Al</button>`;
    }
    return `<tr>
      <td><b>${esc(def.ad)}</b><div class="aciklama" style="margin:2px 0 0">${esc(def.aciklama)}</div></td>
      <td>${formatMoney(def.maliyet)}</td>
      <td>${def.prestijGereksinimi > 0 ? `⭐ ${def.prestijGereksinimi}` : '—'}</td>
      <td>${onkosul}</td>
      <td>${islem}</td>
    </tr>`;
  }).join('');

  return `${uyari}
    <table>
      <tr><th>Strateji</th><th>Maliyet</th><th>Prestij</th><th>Ön Koşul</th><th></th></tr>
      ${satirlar}
    </table>`;
}

// --- Raporlar ------------------------------------------------------------------

function raporlarGovde(state: GameState): string {
  // Tek geçişte tüm ajan istatistikleri
  const seviye: Record<StudentLevel, number> = { lisans: 0, yl: 0, doktora: 0 };
  const unvan: Record<AcademicRank, number> = { arsgor: 0, dr: 0, docent: 0, prof: 0 };
  let asci = 0, temizlikci = 0, maasYuku = 0, mutlulukToplam = 0, ogrenciSayisi = 0;
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') {
      seviye[a.level]++;
      mutlulukToplam += a.mutluluk;
      ogrenciSayisi++;
    } else if (a.kind === 'akademisyen') {
      unvan[a.rank]++;
      maasYuku += a.maas;
    } else {
      if (a.kind === 'asci') asci++; else temizlikci++;
      maasYuku += a.maas;
    }
  }
  let uluslararasi = 0, bulus = 0;
  for (const p of state.publications) {
    if (p.uluslararasi) uluslararasi++;
    if (p.cigirAcici) bulus++;
  }
  const ortMutluluk = ogrenciSayisi > 0 ? Math.round(mutlulukToplam / ogrenciSayisi) : null;

  // Oda sayıları (tür bazında geçerli/geçersiz)
  const oda = new Map<RoomType, { gecerli: number; gecersiz: number }>();
  for (const r of state.rooms) {
    let s = oda.get(r.type);
    if (!s) { s = { gecerli: 0, gecersiz: 0 }; oda.set(r.type, s); }
    if (r.valid) s.gecerli++; else s.gecersiz++;
  }
  const odaSatirlari = oda.size === 0
    ? '<tr><td colspan="3" class="aciklama">Henüz oda yok.</td></tr>'
    : [...oda.entries()].map(([tip, s]) => `<tr>
        <td>${esc(ROOM_DEFS[tip].ad)}</td>
        <td>${s.gecerli}</td>
        <td>${s.gecersiz > 0 ? `<span style="color:#f4a09c">${s.gecersiz}</span>` : '0'}</td>
      </tr>`).join('');

  const satir = (ad: string, deger: string): string =>
    `<tr><td>${ad}</td><td>${deger}</td></tr>`;

  return `<h3>Genel</h3>
    <table>
      ${satir('Bütçe', formatMoney(state.para))}
      ${satir('Prestij', `⭐ ${Math.round(state.prestij)} / 1000`)}
      ${satir('Günlük maaş yükü', formatMoney(maasYuku))}
      ${satir('Kütüphane seviyesi', `${libraryLevel(state)} / 3`)}
    </table>
    <h3>Öğrenciler</h3>
    <table>
      ${satir('Lisans / YL / Doktora', `${seviye.lisans} / ${seviye.yl} / ${seviye.doktora}`)}
      ${satir('Ortalama mutluluk', ortMutluluk === null ? '—' : `${ortMutluluk} / 100`)}
      ${satir('Toplam mezun', String(state.toplamMezun))}
      ${satir('Toplam bırakan', String(state.toplamBirakan))}
    </table>
    <h3>Kadro</h3>
    <table>
      ${satir(RANK_LABEL.arsgor, String(unvan.arsgor))}
      ${satir(RANK_LABEL.dr, String(unvan.dr))}
      ${satir(RANK_LABEL.docent, String(unvan.docent))}
      ${satir(RANK_LABEL.prof, String(unvan.prof))}
      ${satir('Aşçı / Temizlikçi', `${asci} / ${temizlikci}`)}
    </table>
    <h3>Araştırma</h3>
    <table>
      ${satir('Makale (uluslararası)', `${state.publications.length} (${uluslararasi})`)}
      ${satir('Çığır açan buluş', String(bulus))}
      ${satir('Ödül', String(state.awards.length))}
      ${satir('Aktif proje', String(state.projects.length))}
    </table>
    <h3>Kampüs</h3>
    <table>
      <tr><th>Oda</th><th>Geçerli</th><th>Geçersiz</th></tr>
      ${odaSatirlari}
    </table>
    <h3>Tehlikeli Bölge</h3>
    <button class="eylem tehlike" data-action="yeni-oyun">Yeni Oyun (kayıt silinir)</button>`;
}
