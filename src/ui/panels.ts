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
  ALAN_META, AcademicRank, Alan, GameState, LEVEL_LABEL, Mezun, NITELIK_META, Nitelik,
  RANK_LABEL, RoomType, Sektor, StrategyDef, Student, StudentLevel, tileIndex,
} from '../core/types';
import { courseDef, dersEtki } from '../data/courses';
import {
  ASISTAN_LIMIT, DERS_LIMIT, acikDersler, akilliOtoSec, asistanlari, blokDersi, bolumuHedefle,
  dersYukuVerimi, hocaDersCikar, hocaDersEkle, otoDersSec, verilemeyenDersler, yukVerimi,
} from '../game/schedule';
import { COURSES } from '../data/courses';
import { formatMoney } from '../core/util';
import { libraryLevel, validRooms } from '../core/grid';
import { clearSave, notify, spend } from '../game/state';
import {
  canOpenDepartment, openDepartment, seatCapacity, setDoktoraQuota, setQuota, setYlQuota,
  toggleGradProgram,
} from '../game/departments';
import {
  asistanAta, asistanBirak, assignAcademicDept, fireAcademic, hireFromPool, officeCapacity,
} from '../game/academics';
import { cancelProject, startProject } from '../game/research';
import { ogrenciGunlukKazanc } from '../game/economy';
import { rakipBilgi, siralama } from '../game/rivals';
import { MESLEKLER, SEKTOR_META, istihdamOrani, kariyerGunu, mentorlukAyarla } from '../game/alumni';
import {
  KITAP_MAX, RAF_PER_SEVIYE, kitapAl, kitapCarpani, kitaplikSayisi, koleksiyonKapasitesi,
  toplamKoleksiyon,
} from '../game/library';
import { gnoHesapla as gnoHesaplaUI, hireStaff, removeAgent } from '../game/agents';
import { BALANCE } from '../data/balance';
import { DEPT_DEFS, bolumBaskinAlan, deptDef } from '../data/departments';
import { ROOM_DEFS, ROOM_LIST } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import { STRATEGY_DEFS, strategyDef } from '../data/strategies';

export type PanelName = 'bolumler' | 'kadro' | 'program' | 'arastirma' | 'kutuphane' | 'mezunlar' | 'strateji' | 'raporlar' | 'yardim';

let getStateRef: (() => GameState) | null = null;
let acik: { name: PanelName; el: HTMLDivElement } | null = null;

const PANEL_BASLIK: Record<PanelName, string> = {
  bolumler: '🎓 Bölümler',
  kadro: '👩‍🏫 Kadro',
  program: '📅 Ders Programı',
  arastirma: '🔬 Araştırma',
  kutuphane: '📚 Kütüphane',
  mezunlar: '🤝 Mezunlar Derneği',
  strateji: '♟️ Strateji',
  raporlar: '📊 Raporlar',
  yardim: '❓ Nasıl Oynanır',
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
  el.className = 'panel' + (name === 'program' ? ' genis' : '');
  // Olay delegasyonu: panel açıkken BİR kez bağlanır, innerHTML yenilense de yaşar.
  el.addEventListener('click', onPanelClick);
  el.addEventListener('change', onPanelChange);
  el.addEventListener('mouseover', onPanelHover);
  el.addEventListener('mouseout', dersTipGizle);
  // fare basılıyken yeniden çizme — mousedown/mouseup arası DOM değişirse tık yutulur
  el.addEventListener('pointerdown', () => { isaretciBasili = true; });
  window.addEventListener('pointerup', () => { isaretciBasili = false; });
  root.appendChild(el);
  acik = { name, el };
  render(getStateRef());
}

export function closePanel(): void {
  if (!acik) return;
  dersTipGizle();
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
    case 'program': govde = programGovde(state); break;
    case 'arastirma': govde = arastirmaGovde(state); break;
    case 'kutuphane': govde = kutuphaneGovde(state); break;
    case 'mezunlar': govde = mezunlarGovde(state); break;
    case 'strateji': govde = stratejiGovde(state); break;
    case 'raporlar': govde = raporlarGovde(state); break;
    case 'yardim': govde = yardimGovde(); break;
  }
  acik.el.innerHTML = baslik(PANEL_BASLIK[acik.name]) + govde;
}

// --- Ders bilgi penceresi (hover tooltip) ----------------------------------------

let dersTipEl: HTMLDivElement | null = null;
let dersBolumleriCache: Map<string, string[]> | null = null;

/** courseId -> müfredatında bulunduğu bölüm adları (bir kez kurulur). */
function dersBolumleri(courseId: string): string[] {
  if (!dersBolumleriCache) {
    dersBolumleriCache = new Map();
    for (const d of DEPT_DEFS) {
      for (const ders of d.dersler) {
        const liste = dersBolumleriCache.get(ders);
        if (liste) liste.push(d.ad);
        else dersBolumleriCache.set(ders, [d.ad]);
      }
    }
  }
  return dersBolumleriCache.get(courseId) ?? [];
}

/** Dersin getirisini anlatan zengin bilgi penceresi içeriği. */
function dersTipHtml(state: GameState, courseId: string, hocaAlan: Alan | null): string {
  const c = courseDef(courseId);
  const alan = ALAN_META[c.birincil];

  // dersi şu an seçmiş hocalar
  const verenler: string[] = [];
  for (const a of state.agents) {
    if (a.kind === 'akademisyen' && (a.verdigiDersler ?? []).includes(courseId)) {
      verenler.push(`${RANK_LABEL[a.rank]} ${a.ad} (%${Math.round((dersEtki(courseId, a.alan) / 1.25) * 100)})`);
    }
  }

  const acikDeptIds = new Set(state.departments.map((d) => deptDef(d.defId).ad));
  const bolumler = dersBolumleri(courseId);
  const bolumHtml = bolumler.slice(0, 5)
    .map((b) => `<span style="color:${acikDeptIds.has(b) ? '#9fd3a8' : '#8f9ab0'}">${esc(b)}${acikDeptIds.has(b) ? ' ✔' : ''}</span>`)
    .join(' · ') + (bolumler.length > 5 ? ` <small>+${bolumler.length - 5}</small>` : '');

  const koleksiyon = state.kitapKoleksiyon[c.birincil] ?? 0;

  let uyumSatiri = '';
  if (hocaAlan) {
    const yuzde = Math.round((dersEtki(courseId, hocaAlan) / 1.25) * 100);
    const renk = yuzde >= 95 ? '#9fd3a8' : yuzde >= 70 ? '#f0c674' : '#f4a09c';
    uyumSatiri = `<div>👩‍🏫 Bu hocayla verim: <b style="color:${renk}">%${yuzde}</b>
      <small>(birincil alan %100 · ikincil %76 · alan dışı %44)</small></div>`;
  }

  return `
    <div class="tip-baslik" style="border-color:${alan.renk}">
      <b>${c.kod}</b> ${esc(c.ad)}
      <span class="rozet">${alan.emoji} ${alan.ad}</span>
    </div>
    ${uyumSatiri}
    <div>🎓 <b>Öğrenci getirisi:</b> ${NITELIK_META[c.birincil].emoji} ${NITELIK_META[c.birincil].ad}
      niteliği gelişir${c.birincil === 'artist' || c.birincil === 'pratik' ? ' + 📣 Influencer' : ''}
      — nitelikler girişim gelirine (💰 sermaye) dönüşür.</div>
    <div>🏛️ <b>Müfredatında olduğu bölümler:</b> ${bolumHtml || '<small>yok</small>'}</div>
    <div>📚 Kütüphane ${alan.ad} koleksiyonu: <b>${'📗'.repeat(koleksiyon) || 'yok'}</b>
      <small>(kütüphane çalışma hızı %${Math.round((0.35 + 0.35 * koleksiyon) * 100)})</small></div>
    <div>${verenler.length > 0
    ? `✅ <b>Şu an veren:</b> ${verenler.slice(0, 3).map(esc).join(', ')}${verenler.length > 3 ? ` +${verenler.length - 3}` : ''}`
    : '❌ Şu an hiçbir hoca bu dersi vermiyor'}</div>`;
}

function onPanelHover(e: Event): void {
  if (!(e.target instanceof Element) || !getStateRef) return;
  const hedef = e.target.closest<HTMLElement>('[data-tip-ders]');
  if (!hedef) return;
  const courseId = hedef.dataset.tipDers ?? '';
  if (!courseId) return;
  const alan = (hedef.dataset.tipAlan ?? '') as Alan | '';

  if (!dersTipEl) {
    dersTipEl = document.createElement('div');
    dersTipEl.className = 'ders-tip';
    document.body.appendChild(dersTipEl);
  }
  dersTipEl.innerHTML = dersTipHtml(getStateRef(), courseId, alan === '' ? null : alan);
  dersTipEl.style.display = 'block';

  const r = hedef.getBoundingClientRect();
  const w = 340;
  const x = Math.max(8, Math.min(r.left, window.innerWidth - w - 12));
  dersTipEl.style.left = `${x}px`;
  // altta yer yoksa üstte göster
  const yUst = r.top - dersTipEl.offsetHeight - 8;
  dersTipEl.style.top = r.bottom + 8 + dersTipEl.offsetHeight < window.innerHeight || yUst < 8
    ? `${r.bottom + 8}px`
    : `${yUst}px`;
}

function dersTipGizle(): void {
  if (dersTipEl) dersTipEl.style.display = 'none';
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
    case 'oto-ders':
      otoDersSec(state, Number(id));
      break;
    case 'oto-ders-tum': {
      const n = akilliOtoSec(state);
      notify(state, `🪄 Akıllı seçim tamamlandı: ${n} bölüm açılabilir duruma geldi.`, n > 0 ? 'iyi' : 'bilgi');
      break;
    }
    case 'ders-cikar':
      hocaDersCikar(state, Number(id), hedef.dataset.ders ?? '');
      break;
    case 'asistan-cikar':
      asistanBirak(state, Number(id));
      break;
    case 'hedefle': {
      const kalan = bolumuHedefle(state, id);
      if (kalan.length === 0) notify(state, '🎯 Eksik dersler hocalara atandı — bölüm ders şartını karşılıyor!', 'iyi');
      else notify(state, `🎯 ${kalan.length} ders atanamadı: hocaların ders kotaları dolu (kadroyu büyüt ya da ders çıkar).`, 'kotu');
      break;
    }
    case 'kitap-al':
      kitapAl(state, id as Alan);
      break;
    case 'mentorluk':
      mentorlukAyarla(state, !state.mentorluk);
      break;
    case 'kariyer-gunu':
      kariyerGunu(state);
      break;
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
  } else if (action === 'ders-ekle') {
    const sec = hedef as HTMLSelectElement;
    if (sec.value) hocaDersEkle(state, id, sec.value);
    render(state);
  } else if (action === 'asistan-ata') {
    const sec = hedef as HTMLSelectElement;
    if (sec.value) asistanAta(state, Number(sec.value), id);
    render(state);
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
      if (a.kind !== 'akademisyen') return '';
      const tazminat = 30 * a.maas;
      const dersSayisi = (a.verdigiDersler ?? []).length;
      const asistan = asistanlari(state, a.id).length;
      const verim = Math.round(dersYukuVerimi(state, a) * 100);
      const verimRenk = verim >= 90 ? '#9fd3a8' : verim >= 75 ? '#f0c674' : '#f4a09c';
      const soyagaci = (a.mezunumuz ? `<span class="rozet" style="color:#ffd166" title="Kendi doktora programımızdan yetişti${a.danismanAd ? ` — danışmanı: ${esc(a.danismanAd)}` : ''}">🎓 mezunumuz</span>` : '')
        + (a.yetistirdigi > 0 ? `<span class="rozet" style="color:#9fd3a8" title="Danışmanlığında ${a.yetistirdigi} doktora öğrencisi mezun oldu — akademik soyağacı">🌳 ${a.yetistirdigi}</span>` : '');
      return `<tr>
        <td><b>${RANK_LABEL[a.rank]} ${esc(a.ad)}</b> <span class="rozet" title="${ALAN_META[a.alan].tanim}">${ALAN_META[a.alan].emoji} ${ALAN_META[a.alan].ad}</span>${soyagaci}</td>
        <td><select data-action="bolum-sec" data-id="${a.id}">${bolumSecenekleri(state, a.deptId)}</select></td>
        <td title="${dersSayisi} ders, ${asistan} asistan — ders kalitesi ve araştırma hızı çarpanı (📅 Program panelinden yönetilir)">
          <b style="color:${verimRenk}">⚡ %${verim}</b><br><small>${dersSayisi}📚 ${asistan}👥</small></td>
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
      <tr><th>Akademisyen</th><th>Bölüm</th><th>Yük</th><th>Eğitim</th><th>Arş.</th><th>XP</th>
        <th>Makale</th><th>Maaş/gün</th><th></th></tr>
      ${satirlar}
    </table>`;
  }

  // KPSS havuzu
  const kpssSatir = state.kpssPool.map((c) => `<tr${c.mezunumuz ? ' style="background:rgba(255,209,102,0.08)"' : ''}>
      <td>${RANK_LABEL[c.rank]} ${esc(c.ad)} <span class="rozet" title="${ALAN_META[c.alan].tanim}">${ALAN_META[c.alan].emoji} ${ALAN_META[c.alan].ad}</span>${c.mezunumuz ? `<span class="rozet" style="color:#ffd166" title="Kendi doktora mezunumuz: indirimli maaş ister, becerisi danışmanından pay alır${c.danismanAd ? ` — danışmanı: ${esc(c.danismanAd)}` : ''}. Havuzdan silinmez, seni bekler.">🎓 Kendi Mezunumuz</span>` : ''}</td>
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
      <td>${RANK_LABEL[c.rank]} ${esc(c.ad)} <span class="rozet" title="${ALAN_META[c.alan].tanim}">${ALAN_META[c.alan].emoji} ${ALAN_META[c.alan].ad}</span></td>
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

// --- Mezunlar Derneği ------------------------------------------------------------

/** CSS bar grafiği satırı. */
function grafikBar(etiket: string, deger: number, max: number, renk: string, gosterim?: string): string {
  const oran = max > 0 ? Math.max(2, Math.round((100 * deger) / max)) : 0;
  return `<div class="grafik-satir">
    <span class="grafik-etiket">${etiket}</span>
    <span class="grafik-cubuk-kap"><span class="grafik-cubuk" style="width:${oran}%;background:${renk}"></span></span>
    <span class="grafik-deger">${gosterim ?? String(deger)}</span>
  </div>`;
}

function mezunlarGovde(state: GameState): string {
  const mezunlar = state.mezunlar;
  const bekleme = BALANCE.KARIYER_GUNU_BEKLEME - (state.gun - state.sonKariyerGunu);
  const kariyerHazir = state.sonKariyerGunu === 0 || bekleme <= 0;

  if (mezunlar.length === 0) {
    return `<div class="aciklama">Henüz mezunun yok. Öğrencilerin mezun olunca <b>puanlarına göre</b>
      (GNO + nitelikler + eğilim) işe yerleşir; kariyerleri her yıl ilerler, gelirlerinin bir kısmını
      derneğe bağışlar, haberleri buraya düşer. İstihdam oranını rakip üniversitelerle
      kıyaslayabilirsin. İlk mezunlarını bekliyoruz, Rektörüm! 🎓</div>`;
  }

  const calisan = mezunlar.filter((m) => !m.issiz);
  const oran = istihdamOrani(state) ?? 0;
  const ortGelir = calisan.length > 0
    ? Math.round(calisan.reduce((t2, m) => t2 + m.gelir, 0) / calisan.length)
    : 0;
  const ortGno = Math.round((mezunlar.reduce((t2, m) => t2 + m.gno, 0) / mezunlar.length) * 100) / 100;
  const yillikBagis = Math.round(calisan.reduce((t2, m) => t2 + m.gelir, 0) * BALANCE.DERNEK_BAGIS_ORANI);

  let html = `<div class="aciklama">Mezunlar <b>puanlarına göre</b> işe yerleşir, kariyerleri her yıl
    ilerler. Çalışan mezunlar yıllık gelirlerinin %${(BALANCE.DERNEK_BAGIS_ORANI * 100).toFixed(1)}'ini
    derneğe bağışlar.</div>
  <table>
    <tr><td>Kayıtlı mezun</td><td><b>${mezunlar.length}</b></td>
        <td>İstihdam oranı</td><td><b>%${oran}</b></td></tr>
    <tr><td>Ortalama yıllık gelir</td><td><b>${formatMoney(ortGelir)}</b></td>
        <td>Mezun GNO ortalaması</td><td><b>${ortGno.toFixed(2)}</b></td></tr>
    <tr><td>Yıllık dernek bağışı (tahmini)</td><td><b>${formatMoney(yillikBagis)}</b></td>
        <td>İş arayan</td><td><b>${mezunlar.length - calisan.length}</b></td></tr>
  </table>`;

  // --- etkileşim uygulamaları ---
  html += `<h3>🤝 Mezun-Öğrenci Etkileşimi</h3>
  <div class="aciklama">
    <button class="eylem" data-action="mentorluk" title="Çalışan mezunlar öğrencilere mentorluk eder: nitelik gelişimi +%15. Günlük ${formatMoney(BALANCE.MENTORLUK_GIDER)} (en az ${BALANCE.MENTORLUK_MIN_MEZUN} çalışan mezun gerekir)">
      ${state.mentorluk ? '✅ Mentorluk Programı AÇIK — kapat' : '▶ Mentorluk Programını Başlat'}</button>
    <button class="eylem" data-action="kariyer-gunu" ${kariyerHazir ? '' : 'disabled'}
      title="Başarılı bir mezun sahne alır: tüm öğrencilere 💼+📣 nitelik ve +10 mutluluk. ${formatMoney(BALANCE.KARIYER_GUNU_MALIYET)}, dönemde 1 kez">
      🎤 Kariyer Günü Düzenle (${formatMoney(BALANCE.KARIYER_GUNU_MALIYET)})${kariyerHazir ? '' : ` — ${bekleme} gün sonra`}</button>
    ${state.mentorluk ? `<span class="rozet">günlük ${formatMoney(BALANCE.MENTORLUK_GIDER)}</span>` : ''}
  </div>`;

  // --- dernek haberleri ---
  html += '<h3>📰 Dernek Haberleri</h3>';
  html += state.mezunHaber.length === 0
    ? '<div class="aciklama">Henüz haber yok — kariyerler yıl dönümünde ilerler.</div>'
    : `<div class="haber-liste">${state.mezunHaber.slice(0, 8).map((h) => `<div class="haber">${esc(h)}</div>`).join('')}</div>`;

  // --- grafik: sektör dağılımı ---
  const sektorSayi = new Map<Sektor, number>();
  const kademeSayi = [0, 0, 0, 0, 0];
  for (const m of mezunlar) {
    sektorSayi.set(m.sektor, (sektorSayi.get(m.sektor) ?? 0) + 1);
    if (!m.issiz) kademeSayi[m.kademe]++;
  }
  const enCokSektor = Math.max(1, ...sektorSayi.values());
  html += '<h3>📊 Sektör Dağılımı</h3>';
  const sektorRenk: Record<Sektor, string> = {
    muhendis: '#4e79a7', artist: '#e15759', filozof: '#b07aa1',
    pratik: '#59a14f', girisim: '#f28e2b', medya: '#c77dff',
  };
  for (const [sektor, n] of [...sektorSayi.entries()].sort((a, b) => b[1] - a[1])) {
    html += grafikBar(`${SEKTOR_META[sektor].emoji} ${SEKTOR_META[sektor].ad}`, n, enCokSektor, sektorRenk[sektor], `${n} mezun`);
  }

  // --- grafik: kariyer basamakları ---
  html += '<h3>📈 Kariyer Basamakları (çalışanlar)</h3>';
  const enCokKademe = Math.max(1, ...kademeSayi);
  const kademeAd = ['Yeni başlayan', 'Uzmanlaşan', 'Kıdemli', 'Yönetici', 'Zirve 🌟'];
  kademeSayi.forEach((n, i) => {
    html += grafikBar(kademeAd[i], n, enCokKademe, '#4a7bd4', `${n} kişi`);
  });

  // --- grafik: istihdam kıyası ---
  html += `<h3>🏆 Mezun İstihdamı: Rakiplerle Kıyas</h3>
    <div class="aciklama">Rakiplerin istihdam oranları yıllık değişir — okulunun ekosistemi
    (nitelik gelişimi, kütüphane, kariyer günleri) mezunlarını daha kolay işe yerleştirir.</div>`;
  const kiyas: { ad: string; oran: number; oyuncu: boolean }[] = state.rakipler
    .map((r) => ({ ad: r.ad, oran: r.istihdam, oyuncu: false }));
  kiyas.push({ ad: '🎓 ÜNİVERSİTEN', oran, oyuncu: true });
  kiyas.sort((a, b) => b.oran - a.oran);
  for (const k of kiyas.slice(0, 8)) {
    html += grafikBar(k.oyuncu ? '<b style="color:#ffd166">🎓 ÜNİVERSİTEN</b>' : esc(k.ad), k.oran, 100,
      k.oyuncu ? '#ffd166' : '#5b6b8f', `%${k.oran}`);
  }
  if (!kiyas.slice(0, 8).some((k) => k.oyuncu)) {
    html += grafikBar('<b style="color:#ffd166">🎓 ÜNİVERSİTEN</b>', oran, 100, '#ffd166', `%${oran}`);
  }

  // --- en başarılı mezunlar ---
  const yildizlar = [...mezunlar].sort((a, b) => b.gelir - a.gelir).slice(0, 8);
  html += `<h3>🌟 En Başarılı Mezunlar</h3>
    <table><tr><th>Mezun</th><th>Bölüm</th><th>Meslek</th><th>Yıllık gelir</th><th>GNO</th></tr>`;
  for (const m of yildizlar) {
    html += `<tr>
      <td><b>${esc(m.ad)}</b></td>
      <td><small>${esc(m.bolumAd)} '${m.yil}</small></td>
      <td>${SEKTOR_META[m.sektor].emoji} ${m.issiz ? '<span style="color:#f4a09c">iş arıyor</span>' : esc(m.meslek)}</td>
      <td>${m.issiz ? '—' : formatMoney(m.gelir)}</td>
      <td>${m.gno.toFixed(2)}</td>
    </tr>`;
  }
  html += '</table>';
  return html;
}

// --- Kütüphane -----------------------------------------------------------------

function kutuphaneGovde(state: GameState): string {
  const kutuphaneler = validRooms(state, 'kutuphane');
  const raf = kitaplikSayisi(state);
  const kapasite = koleksiyonKapasitesi(state);
  const kullanilan = toplamKoleksiyon(state);

  // şu an kütüphanede çalışan öğrenciler
  const odaIds = new Set(kutuphaneler.map((r) => r.id));
  let calisan = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci' || !a.onCampus || a.activity !== 'arastiriyor') continue;
    const rid = state.roomAt[tileIndex(Math.round(a.x), Math.round(a.y))];
    if (rid >= 0 && odaIds.has(rid)) calisan++;
  }

  let html = `<div class="aciklama">Öğrenciler boş vakitlerinde ve sıra bulamadıklarında
    kütüphanede çalışır — <b>çalışma hızını bölümlerinin alanındaki kitap koleksiyonu belirler</b>:
    kitapsız alanda yavaş (%${Math.round(BALANCE.KUTUPHANE_CALISMA_TABAN * 100)}), her koleksiyon
    seviyesi +%${Math.round(BALANCE.KITAP_CALISMA_BONUS * 100)} hız. Çalışma; mezuniyet ilerlemesi,
    not ortalaması ve alan niteliği kazandırır. Her koleksiyon seviyesi <b>${RAF_PER_SEVIYE} kitaplık
    rafı</b> ister.</div>`;

  if (kutuphaneler.length === 0) {
    html += `<div class="aciklama">⚠ Geçerli kütüphane yok — <b>🏗️ Hazır Bina → Kütüphane</b> ile
      tek tıkla kurabilirsin.</div>`;
  }

  html += `<table>
    <tr><td>Geçerli kütüphane</td><td>${kutuphaneler.length}</td></tr>
    <tr><td>Kitaplık rafı</td><td>${raf}</td></tr>
    <tr><td>Koleksiyon kapasitesi</td><td>${kullanilan} / ${kapasite} seviye ${kullanilan >= kapasite ? '<span class="rozet" style="background:#8f3535">raf ekle</span>' : ''}</td></tr>
    <tr><td>Kütüphane seviyesi (genel bonus)</td><td>${libraryLevel(state)} / 3</td></tr>
    <tr><td>Şu an çalışan öğrenci</td><td>${calisan}</td></tr>
  </table>

  <h3>📚 Kitap Koleksiyonları</h3>
  <table>
    <tr><th>Alan</th><th>Seviye</th><th>Çalışma hızı</th><th>Bölümler</th><th></th></tr>`;

  const alanBolum = new Map<Alan, number>();
  for (const d of state.departments) {
    const alan = bolumBaskinAlan(d.defId);
    alanBolum.set(alan, (alanBolum.get(alan) ?? 0) + 1);
  }

  for (const alan of Object.keys(ALAN_META) as Alan[]) {
    const seviye = state.kitapKoleksiyon[alan] ?? 0;
    const hiz = Math.round(kitapCarpani(state, alan) * 100);
    const dolu = seviye >= KITAP_MAX;
    const maliyet = dolu ? 0 : BALANCE.KITAP_MALIYET[seviye];
    const nedenler: string[] = [];
    if (!dolu && kullanilan + 1 > kapasite) nedenler.push(`Raf yetersiz (${RAF_PER_SEVIYE} kitaplık ekle)`);
    if (!dolu && state.para < maliyet) nedenler.push('Bütçe yetersiz');
    const cubuk = '📗'.repeat(seviye) + '▫️'.repeat(KITAP_MAX - seviye);
    html += `<tr>
      <td><b style="color:${ALAN_META[alan].renk}">${ALAN_META[alan].emoji} ${ALAN_META[alan].ad}</b><br><small>${ALAN_META[alan].tanim}</small></td>
      <td title="${seviye}/${KITAP_MAX}">${cubuk}</td>
      <td><b style="color:${hiz >= 100 ? '#9fd3a8' : hiz >= 70 ? '#f0c674' : '#f4a09c'}">%${hiz}</b></td>
      <td>${alanBolum.get(alan) ?? 0} bölüm</td>
      <td>${dolu ? '<span class="gerek">✔ tam</span>'
    : `<button class="eylem" data-action="kitap-al" data-id="${alan}"
        ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : `title="Seviye ${seviye + 1} koleksiyon"`}>
        Kitap Al (${formatMoney(maliyet)})</button>`}</td>
    </tr>`;
  }
  html += '</table>';

  html += `<div class="aciklama" style="margin-top:8px">💡 Bölümlerinin baskın alanına yatırım yap:
    "Bölümler" sütunu hangi alanda kaç bölümün olduğunu gösterir. Kitaplık rafı eklemek genel
    kütüphane seviyesini de (araştırma + öğrenme bonusu) yükseltir.</div>`;

  return html;
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

/** Raporlar: öğrenci girişim ekosistemi — nitelikler, sermaye, okul payı. */
function ekosistemBolumu(state: GameState): string {
  const ogrenciler = state.agents.filter((a): a is Student => a.kind === 'ogrenci');
  if (ogrenciler.length === 0) {
    return `<h3>🚀 Girişim Ekosistemi</h3>
      <div class="aciklama">Henüz öğrenci yok. Dersler öğrencilerin niteliklerini
      (🔬🎨📜💼📣) geliştirir; nitelikli öğrenciler girişim geliri üretir — okul
      %${Math.round(BALANCE.GIRISIM_OKUL_PAYI * 100)} kuluçka payı alır, mezunlar
      sermayelerinin %${Math.round(BALANCE.MEZUN_BAGIS_ORANI * 100)}'sini bağışlar.</div>`;
  }

  let toplamSermaye = 0;
  let gunlukToplam = 0;
  const ortNitelik: Record<Nitelik, number> = { muhendis: 0, artist: 0, filozof: 0, pratik: 0, influencer: 0 };
  for (const s of ogrenciler) {
    toplamSermaye += s.sermaye;
    gunlukToplam += ogrenciGunlukKazanc(state, s);
    for (const k of Object.keys(ortNitelik) as Nitelik[]) ortNitelik[k] += s.nitelik[k];
  }
  const okulPayi = Math.round(gunlukToplam * BALANCE.GIRISIM_OKUL_PAYI);
  const ortalamalar = (Object.keys(ortNitelik) as Nitelik[])
    .map((k) => `${NITELIK_META[k].emoji} ${NITELIK_META[k].ad} ${Math.round(ortNitelik[k] / ogrenciler.length)}`)
    .join(' · ');

  const zenginler = [...ogrenciler].sort((a, b) => b.sermaye - a.sermaye).slice(0, 5);
  const zenginSatir = zenginler.map((s) => {
    const dept = state.departments.find((d) => d.id === s.deptId);
    const bolum = dept ? deptDef(dept.defId).kisa : '—';
    let baskin: Nitelik = 'muhendis';
    for (const k of Object.keys(NITELIK_META) as Nitelik[]) {
      if (s.nitelik[k] > s.nitelik[baskin]) baskin = k;
    }
    return `<tr><td><b>${esc(s.ad)}</b> <small>(${bolum})</small></td>
      <td>${NITELIK_META[baskin].emoji} ${NITELIK_META[baskin].ad}</td>
      <td>${formatMoney(Math.round(s.sermaye))}</td>
      <td>${formatMoney(ogrenciGunlukKazanc(state, s))}/gün</td></tr>`;
  }).join('');

  return `<h3>🚀 Girişim Ekosistemi</h3>
    <div class="aciklama">Dersler nitelik geliştirir, nitelikli öğrenciler girişim geliri üretir.
    Okul günlük %${Math.round(BALANCE.GIRISIM_OKUL_PAYI * 100)} kuluçka payı alır; mezunlar
    sermayelerinin %${Math.round(BALANCE.MEZUN_BAGIS_ORANI * 100)}'sini okula bağışlar
    (${formatMoney(BALANCE.ZENGIN_MEZUN_ESIK)}+ sermayeli mezun prestij de getirir).
    ${state.strategies.includes('teknokent') ? '<b>Teknokent aktif: gelirler ×1.5!</b>' : '♟️ Teknokent stratejisi gelirleri ×1.5 yapar.'}</div>
    <table>
      <tr><td>Toplam öğrenci sermayesi</td><td><b>${formatMoney(Math.round(toplamSermaye))}</b></td></tr>
      <tr><td>Günlük ekosistem geliri</td><td>${formatMoney(gunlukToplam)} (okul payı ${formatMoney(okulPayi)}/gün)</td></tr>
      <tr><td>Ortalama nitelikler</td><td>${ortalamalar}</td></tr>
    </table>
    ${zenginler[0] && zenginler[0].sermaye > 0 ? `
    <h3>En Zengin Öğrenciler</h3>
    <table>
      <tr><th>Öğrenci</th><th>Baskın nitelik</th><th>💰 Sermaye</th><th>Gelir</th></tr>
      ${zenginSatir}
    </table>` : ''}`;
}

/** Raporlar: Türkiye Üniversite Sıralaması tablosu. */
function siralamaBolumu(state: GameState): string {
  const liste = siralama(state);
  const oyuncuSira = liste.findIndex((s) => s.oyuncu) + 1;
  const rakipMap = new Map(state.rakipler.map((r) => [r.ad, r]));
  const satirlar = liste.map((s, i) => {
    const madalya = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const r = rakipMap.get(s.ad);
    const bilgi = r ? rakipBilgi(r) : '';
    const adHucre = s.oyuncu
      ? '<b style="color:#ffd166">🎓 ÜNİVERSİTEN</b>'
      : `${esc(s.ad)}<br><small style="color:#7f8ba2">${esc(bilgi)}</small>`;
    return `<tr${s.oyuncu ? ' style="background:rgba(255,209,102,0.12)"' : ''} title="${esc(bilgi)}">
      <td><b>${madalya}</b></td>
      <td>${adHucre}</td>
      <td>${s.prestij}</td>
      <td>${s.yayin}</td>
      <td>${s.mezun}</td>
      <td><b>${s.skor}</b></td>
    </tr>`;
  }).join('');
  const trend = state.siraGecmisi.length > 0
    ? `<br>📈 Sıra geçmişi: <b>${state.siraGecmisi.join(' → ')} → ${oyuncuSira}</b>`
    : '';
  return `<h3>🏆 Türkiye Üniversite Sıralaması</h3>
    <div class="aciklama">Skor = prestij + yayın×0.5 + mezun×0.1. Rakipler her yıl gelişir;
    sıralamada yükselmek yıl sonunda prestij ödülü getirir — hedef: <b>1 numara olmak!</b>
    Sıran: <b>${oyuncuSira}/${liste.length}</b>${state.sonSira > 0 ? ` (geçen yıl ${state.sonSira}.)` : ''}
    · 💡 Transfer bonusları adayın kurumunun sırasına göre değişir: zirvedekiler pahalı, dibe düşenler ucuz.${trend}</div>
    <table>
      <tr><th></th><th>Üniversite</th><th>Prestij</th><th>Yayın</th><th>Mezun</th><th>Skor</th></tr>
      ${satirlar}
    </table>`;
}

function raporlarGovde(state: GameState): string {
  // Tek geçişte tüm ajan istatistikleri — gider hesabı economy.ts ile AYNI kurallarla
  // (teşvik çarpanı, asistan maaşları, mentorluk) yapılır ki rapor gerçeği yansıtsın
  const tesvik = state.strategies.includes('tesvik');
  const seviye: Record<StudentLevel, number> = { lisans: 0, yl: 0, doktora: 0 };
  const unvan: Record<AcademicRank, number> = { arsgor: 0, dr: 0, docent: 0, prof: 0 };
  let asci = 0, temizlikci = 0, maasYuku = 0, mutlulukToplam = 0, ogrenciSayisi = 0;
  let gnoToplam = 0, gnoSayi = 0, egilimToplam = 0, ekosistemGelir = 0;
  let yukToplam = 0, hocaSayisi = 0;
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') {
      seviye[a.level]++;
      mutlulukToplam += a.mutluluk;
      egilimToplam += a.egilim;
      ogrenciSayisi++;
      const gno = gnoHesaplaUI(a);
      if (gno !== null) { gnoToplam += gno; gnoSayi++; }
      ekosistemGelir += ogrenciGunlukKazanc(state, a);
      if (a.asistani !== -1) maasYuku += BALANCE.ASISTAN_MAAS;
    } else if (a.kind === 'akademisyen') {
      unvan[a.rank]++;
      maasYuku += a.maas * (tesvik ? 1.10 : 1);
      yukToplam += dersYukuVerimi(state, a);
      hocaSayisi++;
    } else {
      if (a.kind === 'asci') asci++; else temizlikci++;
      maasYuku += a.maas;
    }
  }
  maasYuku = Math.round(maasYuku);
  let doseliKare = 0;
  for (const f of state.floor) if (f !== null) doseliKare++;
  const bakim = doseliKare * BALANCE.BAKIM_GIDERI_TILE;
  const programGider = (state.mentorluk ? BALANCE.MENTORLUK_GIDER : 0)
    + (state.strategies.includes('yemek_subvansiyon') ? 2000 : 0);
  const okulPayi = Math.round(ekosistemGelir * BALANCE.GIRISIM_OKUL_PAYI);
  const gunlukNet = okulPayi - maasYuku - bakim - programGider;
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

  return `<h3>💰 Bütçe ve Günlük Denge</h3>
    <table>
      ${satir('Bütçe', formatMoney(state.para))}
      ${satir('Prestij', `⭐ ${Math.round(state.prestij)} / 1000`)}
      ${satir('Günlük maaş yükü (teşvik + asistanlar dahil)', formatMoney(maasYuku))}
      ${satir('Günlük bakım gideri', `${formatMoney(bakim)} (${doseliKare} kare zemin)`)}
      ${programGider > 0 ? satir('Günlük program giderleri', formatMoney(programGider)) : ''}
      ${satir('Günlük ekosistem geliri (okul payı)', formatMoney(okulPayi))}
      ${satir('Günlük net (ödenekler hariç)', `<b style="color:${gunlukNet >= 0 ? '#9fd3a8' : '#f4a09c'}">${gunlukNet >= 0 ? '+' : ''}${formatMoney(gunlukNet)}</b> <small>· YKS ödeneği ve dönem destekleri ayrıca gelir</small>`)}
    </table>
    ${siralamaBolumu(state)}
    <h3>🎓 Öğrenciler</h3>
    <table>
      ${satir('Lisans / YL / Doktora', `${seviye.lisans} / ${seviye.yl} / ${seviye.doktora}`)}
      ${satir('Ortalama mutluluk', ortMutluluk === null ? '—' : `${ortMutluluk} / 100`)}
      ${satir('Ortalama GNO', gnoSayi > 0 ? `${(gnoToplam / gnoSayi).toFixed(2)} / 4.00` : '—')}
      ${satir('Ortalama öğrenme eğilimi', ogrenciSayisi > 0 ? `%${Math.round(egilimToplam / ogrenciSayisi)}` : '—')}
      ${satir('Toplam mezun / bırakan', `${state.toplamMezun} / ${state.toplamBirakan}`)}
      ${satir('Mezun istihdamı', istihdamOrani(state) === null ? '— (🤝 Mezunlar paneli)' : `%${istihdamOrani(state)} (🤝 Mezunlar panelinde kıyas)`)}
    </table>
    ${ekosistemBolumu(state)}
    <h3>👩‍🏫 Kadro</h3>
    <table>
      ${satir('Ortalama ders yükü verimi', hocaSayisi > 0 ? `⚡ %${Math.round((100 * yukToplam) / hocaSayisi)} (asistanla yükselir)` : '—')}
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

// --- Nasıl Oynanır -----------------------------------------------------------

function yardimGovde(): string {
  const odaSatirlari = ROOM_LIST.map((r) => {
    const gerek = r.gereksinim.map((g) => `${g.adet}× ${OBJECT_DEFS[g.obj].ad}`).join(', ');
    return `<tr><td><b>${r.ad}</b></td><td>${r.minBoyut} kare</td><td>${gerek || '—'}</td><td>${r.aciklama}</td></tr>`;
  }).join('');

  return `
    <div class="aciklama">Prison Architect tarzı üniversite yönetimi: inşa et, kadro kur, bölüm aç,
    araştırma yap, prestijini yükselt. Sol üstteki 🎓 Öğretici seni adım adım götürür.</div>

    <h3>1) İnşaat — bina nasıl yapılır?</h3>
    <div class="aciklama">
      <b>🧱 İnşaat → Zemin</b>: çim üzerine sürükleyerek zemin döşe.
      <b>Duvar</b>: sürüklediğin dikdörtgenin <i>çerçevesine</i> duvar örer.
      <b>Kapı</b>: duvarın bir karesine tıkla — kapısız odaya kimse giremez.
      <b>Yık</b>: alan seç, %25 iade alırsın. Yürüyüş yolu döşemek öğrencileri hızlandırır.
    </div>

    <h3>2) Odalar — bir oda ne zaman "geçerli" olur?</h3>
    <div class="aciklama">
      <b>🏷️ Odalar</b> menüsünden tür seçip binanın İÇ alanını sürükleyerek işaretle. Bir oda şu 4 şartı
      sağlayınca çalışır: <b>yeterli boyut</b> + <b>tüm kareler zeminli</b> + <b>duvarla çevrili ve kapılı</b> +
      <b>gerekli eşyalar içinde</b>. Geçersiz odanın üstünde ⚠ ve eksik sebebi yazar;
      <b>🖱️ Seç</b> ile tıklayınca alt çubukta ✔/✖ kontrol listesi çıkar.
    </div>
    <table>
      <tr><th>Oda</th><th>Min boyut</th><th>Gerekli eşyalar</th><th>Ne işe yarar</th></tr>
      ${odaSatirlari}
    </table>

    <h3>3) Kadro — KPSS ve transfer</h3>
    <div class="aciklama">
      Akademisyen sayın geçerli ofislerdeki <b>çalışma masası</b> sayısını aşamaz.
      <b>KPSS/İlan</b>: ucuz, tecrübesiz Arş. Gör. <b>Transfer</b>: rakip üniversitelerden yıldız hoca —
      imza bonusu ister, prestij getirir. Her akademisyeni <b>Bölüm</b> seçicisinden bir bölüme ata.
      Hocalar ders verip araştırma yaparak XP toplar; makale şartlarını sağlayınca
      Arş. Gör. → Dr. Öğr. Üyesi → Doçent → Profesör yükselir. Aşçı (yemekhane servisi) ve
      temizlikçi (kir) almayı unutma.
    </div>

    <h3>4) Bölüm, kontenjan ve öğrenci</h3>
    <div class="aciklama">
      Bölüm açmak toplam geçerli derslik sayısına, (gerekiyorsa) laboratuvara ve bütçeye bakar.
      Dönem başında (her 20 günde bir) <b>talep</b> hesaplanır: prestij + tanıtım stratejileri + bölüm
      popülerliği. Yerleşen = min(talep, kontenjan, derslikteki sıra sayısı). Öğrenci başına
      <b>devlet ödeneği</b> alırsın. Öğretim üyesi yetersizse YÖK kontenjan vermez!
      Öğrencilerin açlık/tuvalet/enerji/eğlence ihtiyaçları var; karşılanmazsa mutsuzlaşıp
      <b>okulu bırakırlar</b> (prestij düşer). 🍲 <b>Yemek sistemi:</b> aşçılar 11:00-14:00 banko
      başında porsiyon üretir (üst barda stok görünür); yemekhanede yiyen her öğrenci 1 porsiyon
      tüketir. <b>Stok biterse aç kalırlar</b> — öğrenci arttıkça aşçı ve banko ekle. Kantindeki
      otomat yedek ama yavaş doyurur; kalan yemek gece bayatlar, malzeme günlük gidere yazılır. Doçent varsa <b>yüksek lisans</b>, profesör varsa
      <b>doktora</b> programı açabilirsin — lisansüstü öğrenciler araştırmayı hızlandırır.
      Haritada bir <b>öğrenciye tıkla</b>: not ortalaması (GNO), öğrenme eğilimi, ilerlemesi ve
      mutluluğu alt çubukta görünür. Her öğrencinin <b>öğrenme eğilimi</b> farklıdır — çalışkanlar
      hem hızlı öğrenir hem yüksek not alır.
    </div>

    <h3>4b) Ders yükü ve asistanlar</h3>
    <div class="aciklama">
      Bir hoca ne kadar çok ders verirse <b>ders kalitesi ve araştırma hızı o kadar düşer</b> —
      📅 Program panelindeki <b>⚡ verim rozeti</b> bunu gösterir (1 ders %100, 4 ders %58).
      Yüksek lisans/doktora öğrencilerini <b>🧑‍🔬 asistan</b> atayarak yükü hafiflet: her asistan
      1 dersin yükünü üstlenir (hoca başına en çok 2), okul asistana günlük maaş öder.
    </div>

    <h3>4c) 🚀 Girişim ekosistemi</h3>
    <div class="aciklama">
      Her ders, alanına göre öğrencinin niteliklerini geliştirir: 🔬 Mühendis, 🎨 Artist,
      📜 Filozof, 💼 Pratik — kantin/bank sosyalleşmesi ve sanat dersleri 📣 <b>Influencer</b>'ı
      büyütür. Nitelikli öğrenciler girişimlerinden <b>💰 sermaye</b> (gerçek ₺) kazanır:
      okul her gün <b>%10 kuluçka payı</b> alır, mezunlar sermayelerinin <b>%20</b>'sini bağışlar,
      zengin mezunlar prestij getirir. Ekosistemin durumu 📊 Raporlar panelinde;
      ♟️ Teknokent stratejisi gelirleri ×1.5 yapar.
    </div>

    <h3>5) Araştırma, yayın ve ödüller</h3>
    <div class="aciklama">
      <b>🔬 Araştırma</b> panelinden bölüm başına proje başlat (fen bölümleri laboratuvar ister).
      Hocalar boş vakitlerinde ve lisansüstü öğrenciler araştırma puanı üretir. Proje bitince:
      <b>hibe</b> + <b>makale</b> (🌍 uluslararası olabilir) + bazen 💥 <b>çığır açan buluş</b>
      (patent geliri) ve 🏆 <b>bilim ödülü</b>. Projeler otomatik zincirlenir; istemezsen iptal et.
      Kütüphanedeki <b>kitaplık</b> sayısı kütüphane seviyesini (0-3) belirler: araştırma ve öğrenme hızı artar.
      📚 <b>Kütüphane panelinden</b> alan bazlı <b>kitap koleksiyonları</b> satın al: kütüphanede
      çalışan öğrenci, bölümünün alanında kitap yoksa yavaş, koleksiyon büyüdükçe hızlı gelişir
      (ilerleme + not + nitelik). Her koleksiyon seviyesi 3 kitaplık rafı ister.
    </div>

    <h3>5b) 🏆 Sıralama ve yıl sonu ödülleri</h3>
    <div class="aciklama">
      10 rakip üniversiteyle <b>Türkiye Üniversite Sıralaması</b>'nda yarışırsın (üst barda 🏆,
      tam tablo 📊 Raporlar'da). Skor prestij + yayın + mezundan oluşur; rakipler her yıl gelişir.
      Her yıl sonunda <b>Akademik Yıl Ödülleri</b> töreni: sıralama açıklanır (yükselmek prestij
      ödülü getirir), yılın hocası, yılın girişimci öğrencisi ve yılın buluşu sahnelenir.
      Transfer adayları rakiplerden gelir: <b>zirvedeki üniden hoca ayartmak pahalı, dibe
      düşenden ucuzdur</b> — iyi üninin adayı daha becerikli olur.
    </div>

    <h3>5c) 🤝 Mezunlar Derneği</h3>
    <div class="aciklama">
      Mezunlar <b>puanlarına göre</b> (GNO + nitelik + eğilim) işe yerleşir; kariyerleri her yıl
      ilerler ve gelirlerinin bir kısmını derneğe bağışlarlar. 🤝 Mezunlar panelinde: dernek
      haberleri, sektör/kariyer grafikleri, rakiplerle <b>istihdam kıyası</b> ve en başarılı
      mezunlar. <b>Mentorluk programı</b> öğrenci gelişimini +%15 hızlandırır;
      <b>Kariyer Günü</b> etkinliği tüm öğrencilere nitelik ve mutluluk kazandırır.
      Not: Oyuna <b>0 prestijle</b> başlarsın — ilk yıllarda talep düşüktür, mezun ver ve
      yayın yap ki prestij ve talep büyüsün.
      <br>🌳 <b>Akademik soyağacı:</b> doktora öğrencilerine kayıtta danışman atanır (asistan
      olursa danışmanı o hoca olur). Doktora mezunun <b>KPSS havuzuna "🎓 Kendi Mezunumuz"</b>
      olarak düşer: indirimli maaş ister, becerisi kendi notlarına VE danışmanının gücüne
      bağlıdır; havuz yenilense de silinmez. İşe alırsan döngü tamamlanır (+2 prestij) ve
      danışmanın 🌳 sayacı artar — yılın hocası seçiminde de sayılır.
    </div>

    <h3>6) Strateji ve prestij</h3>
    <div class="aciklama">
      Geçerli bir <b>Rektörlük</b> kurunca ♟️ Strateji paneli açılır: Tanıtım Kampanyası (talep+),
      TÜBİTAK (araştırma hızı), Erasmus+ (uluslararası yayın), Teknokent (patent 2×),
      Araştırma Üniversitesi Statüsü... Prestij; yayın, mezun, buluş ve ödülle artar;
      okul bırakan ve bütçe açığıyla düşer. Yüksek prestij = yüksek talep.
    </div>

    <h3>Kontroller</h3>
    <table>
      <tr><td>Sol tık / sürükle</td><td>Araç kullan</td><td>Boşluk</td><td>Duraklat</td></tr>
      <tr><td>Sağ/orta tık sürükle</td><td>Kamera kaydır</td><td>1 / 2 / 3</td><td>Hız 1×/2×/4×</td></tr>
      <tr><td>Tekerlek</td><td>Yakınlaştır</td><td>Esc</td><td>Aracı bırak</td></tr>
      <tr><td>WASD / Ok tuşları</td><td>Kamera</td><td></td><td></td></tr>
    </table>
    <div class="aciklama" style="margin-top:8px">Oyun her gün sonunda otomatik kaydedilir.
    📊 Raporlar panelinden yeni oyun başlatabilirsin.</div>
  `;
}

// --- Ders Programı ---------------------------------------------------------------

const BLOK_SAAT = ['08:00-10:00', '10:00-12:00', '13:00-15:00', '15:00-17:00'];

function uyumYuzde(courseId: string, alan: Alan): number {
  return Math.round((dersEtki(courseId, alan) / 1.25) * 100);
}

/** Hocanın henüz seçmediği dersler için "+ ders ekle" seçicisi. */
function dersEkleSecici(hocaId: number, alan: Alan, secili: string[]): string {
  let html = `<select class="kontenjan-input ders-ekle" data-action="ders-ekle" data-id="${hocaId}">`;
  html += '<option value="">＋ ders ekle…</option>';
  for (const a of Object.keys(ALAN_META) as Alan[]) {
    const grup = COURSES.filter((c) => c.birincil === a && !secili.includes(c.id));
    if (grup.length === 0) continue;
    html += `<optgroup label="${ALAN_META[a].emoji} ${ALAN_META[a].ad}">`;
    for (const c of grup) {
      html += `<option value="${c.id}">${c.kod} ${c.ad} — %${uyumYuzde(c.id, alan)}</option>`;
    }
    html += '</optgroup>';
  }
  return html + '</select>';
}

function dersCipi(courseId: string, alan: Alan, hocaId?: number): string {
  const c = courseDef(courseId);
  const uyum = uyumYuzde(courseId, alan);
  const dusuk = uyum < 70 ? ' dusuk' : '';
  const cikar = hocaId !== undefined
    ? `<button class="cip-cikar" data-action="ders-cikar" data-id="${hocaId}" data-ders="${courseId}" title="Dersi bırak">×</button>`
    : '';
  return `<span class="ders-cip${dusuk}" style="border-color:${ALAN_META[c.birincil].renk}" data-tip-ders="${courseId}" ${alan ? `data-tip-alan="${alan}"` : ''}>`
    + `${ALAN_META[c.birincil].emoji} <b>${c.kod}</b> <small>%${uyum}</small>${cikar}</span>`;
}

function programGovde(state: GameState): string {
  const hocalar = state.agents.filter(
    (a): a is import('../core/types').Academic => a.kind === 'akademisyen',
  );

  let html = `<div class="aciklama"><b>Akış: derslerden bölümlere.</b> Her hocaya bu yıl vereceği
    dersleri seç (en çok ${DERS_LIMIT}) — bir bölüm ancak müfredatındaki TÜM dersler bir hocada
    seçiliyse açılabilir (önlisans 4, lisans 8 ders). Uyum yüzdesi öğrenme hızını belirler:
    birincil alan %100, ikincil %76, alan dışı %44.
    <br><b>⚡ Yük:</b> hoca ne kadar çok ders verirse ders kalitesi ve araştırma hızı o kadar düşer
    (1 ders %100 → ${DERS_LIMIT} ders %${Math.round(yukVerimi(DERS_LIMIT) * 100)}). Yüksek lisans /
    doktora öğrencilerini <b>🧑‍🔬 asistan</b> atayarak yükü hafiflet — her asistan 1 dersin yükünü
    alır (okul asistana günlük ${formatMoney(BALANCE.ASISTAN_MAAS)} maaş öder).</div>`;

  // --- 1) Hoca ders seçimi (çip editörü) ---
  html += `<h3>1) Hoca Ders Seçimi
    <button class="eylem" data-action="oto-ders-tum" style="margin-left:10px"
      title="Tüm seçimleri sıfırlar ve tamamlaması en kolay bölümlerin müfredatlarını hocalara dağıtır">
      🪄 Akıllı Seçim (bölümleri hedefle)</button></h3>`;
  if (hocalar.length === 0) {
    html += '<div class="aciklama">Kadroda akademisyen yok — önce 👩‍🏫 Kadro panelinden alım yap.</div>';
  } else {
    const lisansustu = state.agents.filter(
      (a): a is import('../core/types').Student => a.kind === 'ogrenci' && a.level !== 'lisans',
    );
    for (const h of hocalar) {
      const dersler = h.verdigiDersler ?? [];
      const dolu = dersler.length >= DERS_LIMIT;
      const asistanlarim = asistanlari(state, h.id);
      const verim = Math.round(yukVerimi(dersler.length, asistanlarim.length) * 100);
      const verimSinif = verim >= 90 ? 'iyi' : verim >= 75 ? 'orta' : 'dusuk';
      const bosAdaylar = lisansustu.filter((s) => s.asistani === -1);
      const asistanCipleri = asistanlarim.map((s) =>
        `<span class="ders-cip asistan" title="${esc(s.ad)} — ${LEVEL_LABEL[s.level]} · asistanlığı bırakması için ×">
          🧑‍🔬 ${esc(s.ad.split(' ')[0])} <small>${s.level === 'yl' ? 'YL' : 'Dr'}</small>
          <button class="cip-cikar" data-action="asistan-cikar" data-id="${s.id}" title="Asistanlıktan çıkar">×</button></span>`).join('');
      let asistanSecici = '';
      if (asistanlarim.length < ASISTAN_LIMIT && bosAdaylar.length > 0) {
        asistanSecici = `<select class="kontenjan-input ders-ekle" data-action="asistan-ata" data-id="${h.id}">
          <option value="">🧑‍🔬 asistan ata…</option>
          ${bosAdaylar.map((s) => `<option value="${s.id}">${esc(s.ad)} (${LEVEL_LABEL[s.level]})</option>`).join('')}
        </select>`;
      }
      html += `<div class="hoca-satir">
        <span class="hoca-ad"><b>${RANK_LABEL[h.rank]} ${esc(h.ad)}</b><br>
          <small>${ALAN_META[h.alan].emoji} ${ALAN_META[h.alan].ad} · eğitim ${h.egitim}</small></span>
        <span class="hoca-dersler">
          ${dersler.map((d) => dersCipi(d, h.alan, h.id)).join('')}
          ${dolu ? '' : dersEkleSecici(h.id, h.alan, dersler)}
          ${asistanCipleri}${asistanSecici}
        </span>
        <span class="yuk-rozet ${verimSinif}"
          title="Ders yükü verimi: ders kalitesi ve araştırma hızı çarpanı. ${dersler.length} ders${asistanlarim.length > 0 ? `, ${asistanlarim.length} asistan` : ''} — asistan atayarak yükseltebilirsin">⚡ %${verim}</span>
        <span class="hoca-kota ${dolu ? 'dolu' : ''}">${dersler.length}/${DERS_LIMIT}</span>
        <button class="eylem" data-action="oto-ders" data-id="${h.id}" ${dolu ? 'disabled' : ''}
          title="Boş kotayı alanına uygun derslerle doldur">Doldur</button>
      </div>`;
    }
  }

  // --- 2) Açık dersler ---
  const acik = acikDersler(state);
  html += `<h3>2) Açık Dersler (${acik.size})</h3><div class="aciklama">`;
  html += acik.size === 0
    ? 'Henüz ders seçilmedi.'
    : [...acik].map((id) => {
      const c = courseDef(id);
      return `<span class="rozet" data-tip-ders="${id}">${ALAN_META[c.birincil].emoji} ${c.kod}</span>`;
    }).join(' ');
  html += '</div>';

  // --- 3) Bu derslerle açılabilecek bölümler (tek tık açma) ---
  const acikDefIds = new Set(state.departments.map((d) => d.defId));
  const adaylar = DEPT_DEFS
    .filter((d) => !acikDefIds.has(d.id))
    .map((d) => ({ def: d, eksik: d.dersler.filter((x) => !acik.has(x)) }))
    .sort((a, b) => a.eksik.length - b.eksik.length || a.def.acilisMaliyeti - b.def.acilisMaliyeti);
  const hazir = adaylar.filter((a) => a.eksik.length === 0);
  const yakin = adaylar.filter((a) => a.eksik.length > 0 && a.eksik.length <= 3);

  html += `<h3>3) Bu Derslerle Açılabilecek Bölümler (${hazir.length})</h3>`;
  if (hazir.length === 0) {
    html += '<div class="aciklama">Ders şartını karşılayan bölüm yok — 🪄 Akıllı Seçim kullan ya da aşağıdan bir bölümü 🎯 hedefle.</div>';
  } else {
    html += '<table><tr><th>Bölüm</th><th>Tür</th><th>Maliyet</th><th>Diğer şartlar</th><th></th></tr>';
    for (const a of hazir) {
      const can = canOpenDepartment(state, a.def.id);
      const digerEksik = can.eksik.filter((e) => !e.includes('açık derslerde değil'));
      html += `<tr><td><b style="color:${a.def.renk}">${a.def.ad}</b></td>`
        + `<td>${a.def.tur === 'onlisans' ? '2 yıl' : '4 yıl'}</td>`
        + `<td>${formatMoney(a.def.acilisMaliyeti)}</td>`
        + `<td>${digerEksik.length === 0 ? '<span class="gerek">✔ hazır</span>' : digerEksik.map((e) => `<small style="color:#f4a09c">✖ ${e}</small>`).join('<br>')}</td>`
        + `<td><button class="eylem" data-action="bolum-ac" data-id="${a.def.id}" ${can.ok ? '' : 'disabled'} title="${can.ok ? 'Bölümü aç' : esc(can.eksik.join(' · '))}">Aç</button></td></tr>`;
    }
    html += '</table>';
  }

  if (yakin.length > 0) {
    html += `<h3>Az Ders Eksik Olanlar</h3>
      <table><tr><th>Bölüm</th><th>Eksik dersler</th><th></th></tr>`;
    for (const a of yakin.slice(0, 14)) {
      const chips = a.eksik.map((id) => {
        const c = courseDef(id);
        return `<span class="rozet" style="color:#f4a09c" data-tip-ders="${id}">${ALAN_META[c.birincil].emoji} ${c.kod}</span>`;
      }).join(' ');
      html += `<tr><td><b>${a.def.ad}</b> <small>(${a.def.tur === 'onlisans' ? '2 yıl' : '4 yıl'})</small></td><td>${chips}</td>`
        + `<td><button class="eylem" data-action="hedefle" data-id="${a.def.id}" title="Eksik dersleri uygun hocaların boş kotalarına dağıt">🎯 Dersleri Ata</button></td></tr>`;
    }
    html += '</table>';
  }

  // --- 4) Bugünün takvimi ---
  if (state.departments.length > 0) {
    const hocaAd = new Map<number, string>();
    const hocaAlan = new Map<number, Alan>();
    for (const h of hocalar) {
      hocaAd.set(h.id, h.ad);
      hocaAlan.set(h.id, h.alan);
    }
    html += '<h3>4) Bugünün Ders Programı</h3>';
    html += '<table><tr><th>Bölüm</th>' + BLOK_SAAT.map((s) => `<th>${s}</th>`).join('') + '</tr>';
    for (const dept of state.departments) {
      const def = deptDef(dept.defId);
      html += `<tr><td><b style="color:${def.renk}">${def.ad}</b></td>`;
      for (let blok = 0; blok < 4; blok++) {
        const slot = blokDersi(state, dept.id, blok);
        if (!slot) {
          html += '<td>—</td>';
          continue;
        }
        const ders = courseDef(slot.courseId);
        let hoca = '<span style="color:#f4a09c">hoca yok!</span>';
        if (slot.academicId !== -1 && hocaAd.has(slot.academicId)) {
          const alan = hocaAlan.get(slot.academicId)!;
          const hocaObj = hocalar.find((x) => x.id === slot.academicId);
          const verim = hocaObj ? Math.round(dersYukuVerimi(state, hocaObj) * 100) : 100;
          hoca = `${ALAN_META[alan].emoji} ${esc(hocaAd.get(slot.academicId)!)} <small>(%${uyumYuzde(slot.courseId, alan)}${verim < 100 ? ` · ⚡%${verim}` : ''})</small>`;
        }
        html += `<td><b>${ders.kod}</b> ${ders.ad}<br><small>${hoca}</small></td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
  }

  return html;
}
