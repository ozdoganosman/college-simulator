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
  NoticeKind, ProjeTip, RANK_LABEL, RoomType, Sektor, StrategyDef, Student, StudentLevel,
  tileIndex,
} from '../core/types';
import { courseDef, dersEtki } from '../data/courses';
import {
  ASISTAN_LIMIT, DERS_LIMIT, acikDersler, akilliOtoSec, asistanlari, blokDersi, bolumuHedefle,
  dersYukuVerimi, hocaDersCikar, hocaDersEkle, otoDersSec, slotKilidiAc, slotaHocaAta,
  verilemeyenDersler, yukVerimi,
} from '../game/schedule';
import { COURSES } from '../data/courses';
import { formatClock, formatMoney } from '../core/util';
import { libraryLevel, validRooms } from '../core/grid';
import { clearSave, notify, spend } from '../game/state';
import {
  bolumKapatToggle, canOpenDepartment, openDepartment, seatCapacity, setDoktoraQuota, setQuota,
  setYlQuota, toggleGradProgram,
} from '../game/departments';
import {
  asistanAta, asistanBirak, beklenenMaas, fireAcademic, hedefliAyartma, hireFromPool,
  officeCapacity, zamVer,
} from '../game/academics';
import { BASARIMLAR } from '../game/goals';
import { PROJE_TIPLERI, cancelProject, projeRiski, startProject } from '../game/research';
import { gunlukUcretGeliri, odemeGucu, ogrenciGunlukKazanc } from '../game/economy';
import { rakipBilgi, siralama } from '../game/rivals';
import {
  MESLEKLER, SEKTOR_META, istihdamOrani, kariyerGunu, mentorlukAyarla, mezunBulusmasi,
  mutevelliAta, mutevelliBonusu, mutevelliCikar,
} from '../game/alumni';
import { krediCek } from '../game/economy';
import { cazibePuani, estetikPuani, faaliyetPuani, ulasimSeviyesi, yurtKapasitesi } from '../game/campus';
import { denetimKarnesi, sonrakiDenetimGunu } from '../game/accreditation';
import { bozukSayisi } from '../game/maintenance';
import { KULUPLER, kulupKapat, kulupKur, kulupKurulabilir } from '../game/clubs';
import {
  KITAP_MAX, RAF_PER_SEVIYE, kitapAl, kitapCarpani, kitaplikSayisi, koleksiyonKapasitesi,
  toplamKoleksiyon,
} from '../game/library';
import { gnoHesapla as gnoHesaplaUI, hireStaff, removeAgent } from '../game/agents';
import { BALANCE } from '../data/balance';
import { DEPT_DEFS, bolumBaskinAlan, deptDef } from '../data/departments';
import { ROOM_DEFS, ROOM_LIST } from '../data/rooms';
import { OBJECT_DEFS } from '../data/objects';
import {
  STRATEGY_DEFS, VIZYONLAR, VIZYON_DEGISIM_MALIYET, VIZYON_MALIYET, strategyDef,
} from '../data/strategies';

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
  el.className = 'panel' + (name === 'program' || name === 'bolumler' ? ' genis' : '');
  // Olay delegasyonu: panel açıkken BİR kez bağlanır, innerHTML yenilense de yaşar.
  el.addEventListener('click', onPanelClick);
  el.addEventListener('change', onPanelChange);
  el.addEventListener('mouseover', onPanelHover);
  el.addEventListener('mouseout', dersTipGizle);
  el.addEventListener('input', onPanelInput);
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

// --- Bölüm arama (canlı filtre; yeniden çizimde odak korunur) --------------------

let bolumArama = '';

function onPanelInput(e: Event): void {
  if (!(e.target instanceof HTMLInputElement) || !getStateRef || !acik) return;
  if (e.target.id !== 'bolum-ara') return;
  bolumArama = e.target.value;
  render(getStateRef());
  // yeniden çizim odağı düşürür — imleci sona koyarak geri ver
  const inp = acik.el.querySelector<HTMLInputElement>('#bolum-ara');
  if (inp) {
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

function bolumAramaMetni(): string {
  return bolumArama.trim();
}

function bolumEslesir(ad: string): boolean {
  if (bolumAramaMetni() === '') return true;
  return ad.toLocaleLowerCase('tr').includes(bolumAramaMetni().toLocaleLowerCase('tr'));
}

// --- Olay işleyiciler ----------------------------------------------------------

function onPanelClick(e: Event): void {
  if (!(e.target instanceof Element) || !getStateRef || !acik) return;
  // denetim karnesi kısayolu: kriter satırı → düzeltileceği panel
  const karneSatir = e.target.closest<HTMLElement>('[data-karne-panel]');
  if (karneSatir && acik.el.contains(karneSatir)) {
    openPanel(karneSatir.dataset.karnePanel as PanelName);
    return;
  }
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
    case 'ise-al-transfer':
      // bölüm seçilmez — aidiyet, hocaya ders dağıtılınca derslerden türer
      hireFromPool(state, action === 'ise-al-kpss' ? 'kpss' : 'transfer', Number(id), -1);
      break;
    case 'ayartma': {
      const sec = acik?.el.querySelector<HTMLSelectElement>('select[data-role="ayartma-rakip"]');
      if (sec && sec.value) hedefliAyartma(state, sec.value);
      break;
    }
    case 'akademisyen-cikar':
      fireAcademic(state, Number(id));
      break;
    case 'zam-ver':
      zamVer(state, Number(id));
      break;
    case 'vizyon-sec': {
      const maliyet = state.vizyon === null ? VIZYON_MALIYET : VIZYON_DEGISIM_MALIYET;
      if (state.vizyon === id) break;
      if (!spend(state, maliyet, 'üniversite vizyonu')) break;
      state.vizyon = id as GameState['vizyon'];
      notify(state, `🧭 Üniversite vizyonu belirlendi: ${VIZYONLAR.find((v) => v.id === id)?.ad ?? id}`, 'odul');
      break;
    }
    case 'strateji-durdur':
      state.strategies = state.strategies.filter((s) => s !== id);
      notify(state, `⏹️ ${strategyDef(id).ad} durduruldu — günlük gideri kesildi (yeniden başlatmak tam maliyet ister).`, 'bilgi');
      break;
    case 'personel-al':
      hireStaff(state, id as 'asci' | 'temizlikci' | 'tamirci');
      break;
    case 'personel-cikar': {
      const kind = id as 'asci' | 'temizlikci' | 'tamirci';
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
    case 'mezun-bulusmasi':
      mezunBulusmasi(state);
      break;
    case 'kulup-kur':
      kulupKur(state, id);
      break;
    case 'kulup-kapat':
      kulupKapat(state, id);
      break;
    case 'slot-kilit-ac':
      slotKilidiAc(state, Number(id), Number(hedef.dataset.blok ?? '-1'));
      break;
    case 'proje-baslat': {
      const kap = hedef.closest('div[data-proje-kap]');
      const tip = (kap?.querySelector<HTMLSelectElement>('select[data-role="proje-tip"]')?.value ?? 'temel') as ProjeTip;
      const lider = Number(kap?.querySelector<HTMLSelectElement>('select[data-role="proje-lider"]')?.value ?? '-1');
      startProject(state, Number(id), tip, lider);
      break;
    }
    case 'kredi-cek':
      krediCek(state, Number(id));
      break;
    case 'mutevelli-al':
      mutevelliAta(state, Number(id));
      break;
    case 'mutevelli-cikar':
      mutevelliCikar(state, Number(id));
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
    case 'rapor-sekme':
      raporSekme = id;
      break;
    case 'arsiv-filtre':
      arsivFiltre = id as typeof arsivFiltre;
      break;
    case 'bolum-kapat':
      bolumKapatToggle(state, Number(id));
      break;
    case 'destek-etut':
      if (spend(state, BALANCE.ETUT_MALIYET, 'etüt programı')) {
        state.sinavDestek.etut = true;
        notify(state, '📖 Etüt programı açıldı — bu dönemin sınav notlarına +5.', 'iyi');
      }
      break;
    case 'destek-gece':
      if (spend(state, BALANCE.GECE_KUTUPHANE_MALIYET, 'gece kütüphanesi')) {
        state.sinavDestek.gece = true;
        notify(state, '🌙 Kütüphane bu dönem gece de açık — sınav notlarına +3.', 'iyi');
      }
      break;
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
  } else if (action === 'bolum-ucret') {
    const input = hedef as HTMLInputElement;
    const dept = state.departments.find((d) => d.id === id);
    if (!dept) return;
    if (input.value.trim() === '') {
      dept.ucret = null; // boş = okul geneli ücret
      return;
    }
    const deger = Number(input.value);
    if (!Number.isFinite(deger)) return;
    dept.ucret = Math.max(0, Math.min(BALANCE.UCRET_MAX, Math.round(deger)));
    input.value = String(dept.ucret);
  } else if (action === 'ucret-ayarla' || action === 'burs-tam' || action === 'burs-yari') {
    const input = hedef as HTMLInputElement;
    if (input.value.trim() === '') return;
    const deger = Number(input.value);
    if (!Number.isFinite(deger)) return;
    if (action === 'ucret-ayarla') {
      state.ucret = Math.max(0, Math.min(BALANCE.UCRET_MAX, Math.round(deger)));
      notify(state, state.ucret === 0
        ? '🆓 Devlet modeli: eğitim ücretsiz — talep +%10, gelir devlet ödeneğinden.'
        : `💰 Yıllık kayıt ücreti ${formatMoney(state.ucret)} — bir sonraki YKS yerleştirmesinde geçerli.`, 'bilgi');
    } else if (action === 'burs-tam') {
      state.bursTam = Math.max(0, Math.min(100 - state.bursYari, Math.round(deger)));
    } else {
      state.bursYari = Math.max(0, Math.min(100 - state.bursTam, Math.round(deger)));
    }
    render(state);
  } else if (action === 'slot-hoca') {
    const sec = hedef as HTMLSelectElement;
    const hocaId = Number(sec.value);
    const blok = Number(hedef.dataset.blok ?? '-1');
    if (hocaId >= 0 && blok >= 0) slotaHocaAta(state, id, blok, hocaId);
    render(state);
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

/** Popülerlik yıldızı: taban talebin katalogdaki en yüksek talebe oranı (1-5 ⭐). */
function populerlikYildiz(tabanTalep: number, maxTaban: number): string {
  const n = Math.max(1, Math.min(5, Math.round((5 * tabanTalep) / Math.max(1, maxTaban))));
  return `<span title="Popülerlik: YKS taban talebi ${tabanTalep} aday/yıl — popüler bölümler daha kolay dolar, prestijle talep büyür" style="letter-spacing:-2px">${'⭐'.repeat(n)}<span style="opacity:0.22">${'⭐'.repeat(5 - n)}</span></span>`;
}

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
  const maxTaban = Math.max(...DEPT_DEFS.map((d) => d.tabanTalep));

  // Bölüm başına prestij katkısı (yayınlardan) ve mezun başarısı
  const prestijKatki = new Map<number, { makale: number; uluslararasi: number; bulus: number; puan: number }>();
  for (const p of state.publications) {
    let k = prestijKatki.get(p.deptId);
    if (!k) { k = { makale: 0, uluslararasi: 0, bulus: 0, puan: 0 }; prestijKatki.set(p.deptId, k); }
    k.makale++;
    if (p.uluslararasi) k.uluslararasi++;
    if (p.cigirAcici) k.bulus++;
    k.puan += (p.uluslararasi ? BALANCE.PRESTIJ.uluslararasiMakale : BALANCE.PRESTIJ.makale)
      + (p.cigirAcici ? BALANCE.PRESTIJ.bulus : 0);
  }
  const mezunOzet = new Map<string, { n: number; calisan: number; gelir: number; puan: number }>();
  for (const m of state.mezunlar) {
    let k = mezunOzet.get(m.bolumAd);
    if (!k) { k = { n: 0, calisan: 0, gelir: 0, puan: 0 }; mezunOzet.set(m.bolumAd, k); }
    k.n++;
    k.puan += m.puan;
    if (!m.issiz) { k.calisan++; k.gelir += m.gelir; }
  }

  let acikTablo = '<p class="aciklama">Henüz açık bölüm yok — aşağıdan ilk bölümünüzü açın.</p>';
  if (state.departments.length > 0) {
    const satirlar = state.departments.filter((d) => bolumEslesir(deptDef(d.defId).ad)).map((d) => {
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

      // Prestij katkısı + mezun başarısı — bölümün okula "ne kazandırdığı"
      const pk = prestijKatki.get(d.id);
      const mz = mezunOzet.get(def.ad);
      const mezunPrestij = mz ? mz.n * BALANCE.PRESTIJ.mezun : 0;
      const toplamKatki = (pk?.puan ?? 0) + mezunPrestij;
      const prestijHucre = toplamKatki > 0
        ? `<span title="Bu bölümün okul prestijine katkısı:&#10;${pk ? `📄 ${pk.makale} makale (${pk.uluslararasi} uluslararası, ${pk.bulus} buluş)` : '📄 yayın yok'}&#10;🎓 ${mz?.n ?? 0} mezun × ${BALANCE.PRESTIJ.mezun}&#10;= yaklaşık +${Math.round(toplamKatki)} prestij"><b style="color:#e8c66a">🏛️ +${Math.round(toplamKatki)}</b></span>`
        : '<span style="color:#8f9ab0" title="Henüz katkı yok — yayınlar ve mezunlar prestij üretir">🏛️ —</span>';
      const mezunHucre = mz
        ? `<span title="${mz.n} mezun · ${mz.calisan} çalışıyor (%${Math.round((100 * mz.calisan) / mz.n)})&#10;Ortalama yıllık gelir: ${mz.calisan > 0 ? formatMoney(Math.round(mz.gelir / mz.calisan)) : '—'}&#10;Ortalama mezuniyet puanı: ${Math.round(mz.puan / mz.n)} — bölümün mezun karnesi">🎓 ${mz.n} · %${Math.round((100 * mz.calisan) / mz.n)} işte</span>`
        : '<span style="color:#8f9ab0" title="Henüz mezun vermedi">🎓 —</span>';

      const kapatBtn = d.kapaniyor
        ? `<span class="rozet" style="background:#8f3535" title="Yeni kayıt alınmıyor; son öğrenci mezun olunca bölüm silinir (-3 prestij)">KAPANIYOR</span>
           <button class="eylem" data-action="bolum-kapat" data-id="${d.id}" title="Kapanışı geri al">↩️ Geri Al</button>`
        : `<button class="eylem tehlike" data-action="bolum-kapat" data-id="${d.id}"
            title="Kademeli kapanış: yeni kayıt durur, mevcut öğrenciler mezun olunca bölüm kapanır (-3 prestij). Geri alınabilir.">Kapat</button>`;
      return `<tr>
        <td><b>${esc(def.ad)}</b><br>${populerlikYildiz(def.tabanTalep, maxTaban)} ${kapatBtn}</td>
        <td>${o.lisans} / ${o.yl} / ${o.dok}</td>
        <td><input type="number" class="kontenjan-input" data-action="kontenjan" data-id="${d.id}"
          value="${d.kontenjan}" min="0" max="300"></td>
        <td><input type="number" class="kontenjan-input" style="width:76px" data-action="bolum-ucret" data-id="${d.id}"
          value="${d.ucret ?? ''}" placeholder="${state.ucret}" min="0" max="${BALANCE.UCRET_MAX}" step="5000"
          ${state.ucret === 0 ? 'disabled' : ''}
          title="${state.ucret === 0 ? 'Okul geneli ücretsiz (devlet modeli) — bölüm ücreti uygulanmaz' : `Bölüme özel yıllık kayıt ücreti ₺ — boş bırak: okul geneli (${formatMoney(state.ucret)}) geçerli. Popüler bölümü pahalıya satabilirsin; ödeme gücünü aşarsa ücretli kademe boş kalır.`}"></td>
        <td>${d.sonTalep} / ${d.sonKayit}</td>
        <td>${derslikSayisi.get(d.id) ?? 0} derslik · ${seatCapacity(state, d.id)} koltuk
          ${seatCapacity(state, d.id) < d.kontenjan ? `<br><span class="rozet" style="background:#8f3535" title="Kontenjan ${d.kontenjan} ama koltuk ${seatCapacity(state, d.id)} — YKS'de istekli adaylar geri çevrilir! Derslik kur / sıra ekle ya da kontenjanı düşür.">koltuk &lt; kontenjan</span>` : ''}
          ${(d.sonGeriCevrilen ?? 0) > 0 ? `<br><span class="rozet" style="background:#8f5a35" title="Geçen YKS'de ${d.sonGeriCevrilen} istekli aday koltuk yetmediği için kayıt yapamadı — kaçan ödenek ve ücret geliri!">geçen YKS: ${d.sonGeriCevrilen} aday çevrildi</span>` : ''}</td>
        <td>${k.n} / ${def.minAkademisyen}${uyeRozet}</td>
        <td>${prestijHucre}<br>${mezunHucre}</td>
        <td>${yl} ${dok}</td>
      </tr>`;
    }).join('');

    acikTablo = satirlar === ''
      ? `<p class="aciklama">Aramaya uyan açık bölüm yok ("${esc(bolumAramaMetni())}").</p>`
      : `<table>
      <tr><th>Bölüm · Popülerlik</th><th>Öğrenci (L/YL/Dok)</th><th>Kontenjan</th>
        <th title="Bölüme özel yıllık kayıt ücreti — boş: okul geneli geçerli">Ücret/yıl</th><th>Talep/Kayıt</th>
        <th>Derslik</th><th>Öğr. Üyesi</th><th title="Bölümün okula kazandırdıkları: yayın prestiji ve mezun karnesi">Prestij · Mezun</th><th>Lisansüstü</th></tr>
      ${satirlar}
    </table>`;
  }

  const acikIdler = new Set(state.departments.map((d) => d.defId));
  const kapali = DEPT_DEFS
    .filter((def) => !acikIdler.has(def.id) && bolumEslesir(def.ad))
    .sort((a, b) => b.tabanTalep - a.tabanTalep);
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
        <td>${populerlikYildiz(def.tabanTalep, maxTaban)}</td>
        <td>${gereksinim}</td>
        <td>${formatMoney(def.acilisMaliyeti)}</td>
        <td>${durum}</td>
        <td><button class="eylem" data-action="bolum-ac" data-id="${def.id}"
          ${ok ? '' : `disabled title="${esc(eksik.join(', '))}"`}>Aç</button></td>
      </tr>`;
    }).join('');
    yeniBolum = `<table>
      <tr><th>Bölüm</th><th title="YKS taban talebi — popüler bölümler daha kolay dolar">Popülerlik</th><th>Gereksinim</th><th>Maliyet</th><th>Durum</th><th></th></tr>
      ${satirlar}
    </table>`;
  } else if (bolumAramaMetni() !== '') {
    yeniBolum = `<p class="aciklama">Aramaya uyan kapalı bölüm yok ("${esc(bolumAramaMetni())}").</p>`;
  }

  return `<div style="margin-bottom:8px">
      <input type="text" id="bolum-ara" class="kontenjan-input" style="width:280px;text-align:left"
        placeholder="🔍 Bölüm ara… (ör. bilgisayar, hukuk)" value="${esc(bolumAramaMetni())}">
      ${bolumAramaMetni() !== '' ? `<small style="color:#8f9ab0">${state.departments.filter((d) => bolumEslesir(deptDef(d.defId).ad)).length} açık · ${kapali.length} kapalı bölüm eşleşti</small>` : ''}
    </div>
    ${acikTablo}
    <h3>Yeni Bölüm Aç</h3>
    <p class="aciklama">Bölüm açmak için yeterli sayıda boş geçerli derslik (varsa laboratuvar)
      ve bütçe gerekir. Hocalar bölümlere <b>verdikleri derslere göre otomatik</b> bağlanır —
      📅 Program panelinden ders dağıtmak yeterli. ⭐ popülerlik = YKS taban talebi.</p>
    ${yeniBolum}`;
}

// --- Kadro ---------------------------------------------------------------------

/** Hocanın (derslerinden türetilmiş) bölüm rozeti. */
function bolumRozeti(state: GameState, deptId: number): string {
  const dept = state.departments.find((d) => d.id === deptId);
  return dept
    ? `<span class="rozet" title="Bölüm aidiyeti verdiği derslerden OTOMATİK türetilir — ${esc(deptDef(dept.defId).ad)} müfredatına ders veriyor. Değiştirmek için 📅 Program panelinden derslerini değiştir.">${esc(deptDef(dept.defId).kisa)}</span>`
    : '<span style="color:#8f9ab0" title="Bölümsüz: açık bir bölümün müfredatından ders vermiyor. 📅 Program panelinden ders dağıtın — aidiyet kendiliğinden oluşur.">—</span>';
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
      const m = Math.round(a.memnuniyet);
      const mEmoji = m >= 65 ? '😊' : m >= 45 ? '😐' : '😠';
      const mRenk = m >= 65 ? '#9fd3a8' : m >= 45 ? '#f0c674' : '#f4a09c';
      const beklenen = beklenenMaas(a);
      const zamGerek = a.maas < beklenen;
      const memnuniyetHucre = `<span title="Memnuniyet %${m} · yaş ${a.yas} (${BALANCE.EMEKLILIK_YASI}'de emekli)&#10;Beklediği maaş: ${formatMoney(beklenen)}/gün${zamGerek ? ' — beklentinin ALTINDA!' : ''}&#10;Düşük memnuniyet (<${BALANCE.ISTIFA_ESIK}) dönem başında İSTİFA riskidir: rakibe transfer olur!">
        <b style="color:${mRenk}">${mEmoji} %${m}</b></span>
        ${m < 55 ? `<br><button class="eylem" data-action="zam-ver" data-id="${a.id}" title="Maaş ×${BALANCE.ZAM_ORANI} (yeni: ${formatMoney(Math.round(a.maas * BALANCE.ZAM_ORANI))}/gün) — memnuniyet +18">Zam Ver</button>` : ''}`;
      return `<tr>
        <td><b>${RANK_LABEL[a.rank]} ${esc(a.ad)}</b> <small style="color:#8f9ab0">(${a.yas})</small> <span class="rozet" title="${ALAN_META[a.alan].tanim}">${ALAN_META[a.alan].emoji} ${ALAN_META[a.alan].ad}</span>${soyagaci}</td>
        <td>${memnuniyetHucre}</td>
        <td>${bolumRozeti(state, a.deptId)}</td>
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
      <tr><th>Akademisyen</th><th>Moral</th><th>Bölüm</th><th>Yük</th><th>Eğitim</th><th>Arş.</th><th>XP</th>
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
      <td><button class="eylem" data-action="ise-al-kpss" data-id="${c.id}"
        ${kadroDolu ? 'disabled title="Ofis masası yetersiz"' : ''}>İşe Al</button></td>
    </tr>`).join('');
  const kpssTablo = state.kpssPool.length === 0
    ? '<p class="aciklama">KPSS havuzu boş — yeni adaylar dönem başında gelir.</p>'
    : `<table>
        <tr><th>Aday</th><th>Eğitim</th><th>Arş.</th><th>Maaş/gün</th><th></th></tr>
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
      <td><button class="eylem" data-action="ise-al-transfer" data-id="${c.id}"
        ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : ''}>Transfer Et</button></td>
    </tr>`;
  }).join('');
  const transferTablo = state.transferPool.length === 0
    ? '<p class="aciklama">Transfer havuzu boş — yeni adaylar dönem başında gelir.</p>'
    : `<table>
        <tr><th>Aday</th><th>Kurum</th><th>Eğitim</th><th>Arş.</th><th>Maaş/gün</th>
          <th>Bonus</th><th></th></tr>
        ${transferSatir}
      </table>`;

  // Destek personeli
  let asci = 0, temizlikci = 0, tamirci = 0;
  const beceriToplam: Record<string, number> = { asci: 0, temizlikci: 0, tamirci: 0 };
  for (const a of state.agents) {
    if (a.kind === 'asci') { asci++; beceriToplam.asci += a.beceri ?? 40; }
    else if (a.kind === 'temizlikci') { temizlikci++; beceriToplam.temizlikci += a.beceri ?? 40; }
    else if (a.kind === 'tamirci') { tamirci++; beceriToplam.tamirci += a.beceri ?? 40; }
  }
  const personelSatir = (kind: 'asci' | 'temizlikci' | 'tamirci', ad: string, adet: number): string => {
    const alim = BALANCE.PERSONEL_ALIM[kind];
    return `<tr>
      <td><b>${ad}</b></td>
      <td>${adet}${adet > 0 ? ` <small title="Ortalama beceri — çalıştıkça artar, iş hızını belirler (×${(0.7 + Math.round(beceriToplam[kind] / adet) / 125).toFixed(2)})">🛠${Math.round(beceriToplam[kind] / adet)}</small>` : ''}</td>
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
    <p class="aciklama">🎣 <b>Hedefli Ayartma:</b> bir rakibin yıldız hocasına doğrudan teklif götür
      (${formatMoney(BALANCE.AYARTMA_MALIYET)} görüşme masrafı, dönemde 1 kez).
      Şans prestij farkına bağlıdır; ret yersen haber duyulur (-2 prestij).
      <br><select class="kontenjan-input ders-ekle" data-role="ayartma-rakip" style="width:230px">
        ${[...state.rakipler].sort((a, b) => b.prestij - a.prestij).slice(0, 10)
    .map((r) => `<option value="${esc(r.ad)}">${esc(r.ad)} (prestij ${Math.round(r.prestij)})</option>`).join('')}
      </select>
      <button class="eylem" data-action="ayartma"
        ${state.gun - state.sonAyartmaGunu < 20 && state.sonAyartmaGunu > 0 ? 'disabled title="Bu dönem denendi — dönemde 1 girişim"' : state.para < BALANCE.AYARTMA_MALIYET ? 'disabled title="Bütçe yetersiz"' : ''}>Teklif Götür</button>
      <small>şans: düşük prestijli rakipte yüksek, devlere karşı düşük</small></p>
    <h3>Destek Personeli</h3>
    <p class="aciklama">Aşçı olmadan yemekhane servis yapamaz; temizlikçiler kampüs kirini temizler;
      tamirciler bozulan eşyaları onarır (bozuk eşya işlev görmez!).
      ${bozukSayisi(state) > 0 ? `<span class="rozet" style="background:#8f3535">🔧 ${bozukSayisi(state)} bozuk eşya</span>` : ''}</p>
    <table>
      <tr><th>Personel</th><th>Sayı</th><th>Maaş/gün</th><th></th></tr>
      ${personelSatir('asci', 'Aşçı', asci)}
      ${personelSatir('temizlikci', 'Temizlikçi', temizlikci)}
      ${personelSatir('tamirci', '🔧 Tamirci', tamirci)}
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
    <button class="eylem" data-action="mezun-bulusmasi"
      ${state.gun - state.sonBulusmaGunu < 40 && state.sonBulusmaGunu > 0 ? `disabled title="Yılda 1 kez — ${40 - (state.gun - state.sonBulusmaGunu)} gün sonra"` : calisan.length < 5 ? 'disabled title="En az 5 çalışan mezun gerekir"' : ''}
      title="Mezunlar kampüse döner: çalışan başına ${formatMoney(BALANCE.BULUSMA_BAGIS)} bağış, işsiz mezunların ~%30'u network sayesinde iş bulur, öğrenciler ilham alır. ${formatMoney(BALANCE.BULUSMA_MALIYET)}, yılda 1 kez">
      🎓 Mezun Buluşması (${formatMoney(BALANCE.BULUSMA_MALIYET)})</button>
    ${state.mentorluk ? `<span class="rozet">günlük ${formatMoney(BALANCE.MENTORLUK_GIDER)}</span>` : ''}
  </div>`;

  // --- mütevelli heyeti ---
  const heyet = state.mutevelli
    .map((id) => mezunlar.find((m) => m.id === id))
    .filter((m): m is Mezun => !!m);
  const bonusOzet = [
    mutevelliBonusu(state, 'girisim') > 0 ? `🚀 girişim geliri +%${5 * mutevelliBonusu(state, 'girisim')}` : '',
    mutevelliBonusu(state, 'muhendis') > 0 ? `🔬 araştırma +%${4 * mutevelliBonusu(state, 'muhendis')}` : '',
    mutevelliBonusu(state, 'pratik') > 0 ? `💼 YKS talebi +%${3 * mutevelliBonusu(state, 'pratik')}` : '',
    mutevelliBonusu(state, 'sosyal') > 0 ? `🎭 öğrenci mutluluğu +${(0.4 * mutevelliBonusu(state, 'sosyal')).toFixed(1)}/gün` : '',
  ].filter(Boolean).join(' · ');
  html += `<h3>🏛️ Mütevelli Heyeti (${heyet.length}/3)</h3>
  <div class="aciklama">Başarılı mezunları (kademe 2+) yönetime al: sektörlerine göre kalıcı
  bonus verirler — 🚀 girişim geliri +%5 · 🔬 araştırma +%4 · 💼 talep +%3 ·
  🎭 sanat/kültür/medya mutluluk +0.4/gün (kişi başı).
  ${bonusOzet ? `<br><b>Aktif bonuslar:</b> ${bonusOzet}` : ''}</div>`;
  if (heyet.length > 0) {
    html += heyet.map((m) => `<span class="rozet" style="background:#3a3320;color:#ffe9b3;margin:2px">
      ${SEKTOR_META[m.sektor].emoji} ${esc(m.ad)} — ${esc(m.meslek)}
      <button class="cip-cikar" data-action="mutevelli-cikar" data-id="${m.id}" title="Heyetten çıkar">×</button>
    </span>`).join(' ');
  }

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
    <table><tr><th>Mezun</th><th>Bölüm</th><th>Meslek</th><th>Yıllık gelir</th><th>GNO</th><th></th></tr>`;
  for (const m of yildizlar) {
    const heyette = state.mutevelli.includes(m.id);
    const uygunluk = !m.issiz && m.kademe >= 2 && !heyette && state.mutevelli.length < 3;
    html += `<tr>
      <td><b>${esc(m.ad)}</b></td>
      <td><small>${esc(m.bolumAd)} '${m.yil}</small></td>
      <td>${SEKTOR_META[m.sektor].emoji} ${m.issiz ? '<span style="color:#f4a09c">iş arıyor</span>' : esc(m.meslek)}</td>
      <td>${m.issiz ? '—' : formatMoney(m.gelir)}</td>
      <td>${m.gno.toFixed(2)}</td>
      <td>${heyette ? '<span class="rozet">🏛️ heyette</span>'
    : uygunluk ? `<button class="eylem" data-action="mutevelli-al" data-id="${m.id}" title="Mütevelli Heyetine ata — sektör bonusu">Heyete Al</button>`
      : ''}</td>
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
        const tipMeta = PROJE_TIPLERI[proje.tip];
        const lider = state.agents.find((a) => a.id === proje.liderId);
        const risk = Math.round(projeRiski(state, proje) * 100);
        icerik = `<div>${tipMeta.emoji} "${esc(proje.baslik)}" — %${Math.floor(yuzde)}
            <span class="rozet" title="${tipMeta.aciklama}">${tipMeta.ad}</span>
            <span class="rozet" style="color:${risk >= 20 ? '#f4a09c' : '#9fd3a8'}"
              title="Başarısızlık riski — lider hocanın araştırma becerisi düşürür">⚠ %${risk} risk</span>
            <span class="rozet" title="Günlük araştırma bütçesi — proje sürdükçe her gün kesilir (başlangıç maliyeti ${formatMoney(proje.maliyet)} ödendi)">💰 ${formatMoney(proje.gunlukButce ?? 0)}/gün</span>
            ${lider ? `<span class="rozet" title="Proje lideri: araştırırken katkısı ×1.6, riski düşürür">👩‍🔬 ${esc(lider.ad)}</span>` : '<span class="rozet" style="color:#f0c674">lidersiz</span>'}
            <button class="eylem tehlike" data-action="proje-iptal" data-id="${proje.id}"
              title="İade yok">İptal</button></div>
          <div style="background:#2c3140;border-radius:4px;height:10px;margin:5px 0 2px;overflow:hidden">
            <div style="width:${yuzde.toFixed(1)}%;height:100%;background:#4a7bd4"></div>
          </div>`;
      } else {
        const nedenler: string[] = [];
        if (def.labGerekli && !labVar) nedenler.push('Geçerli laboratuvar gerekli');
        if (!def.labGerekli && !kutOfisVar) nedenler.push('Geçerli kütüphane ya da ofis gerekli');
        if (!akademisyenVar.has(d.id)) nedenler.push('Bölümün derslerini veren hoca yok (📅 Program)');
        const hocalar = state.agents.filter(
          (a): a is import('../core/types').Academic => a.kind === 'akademisyen' && a.deptId === d.id,
        );
        const tipSecici = `<select class="kontenjan-input ders-ekle" data-role="proje-tip" style="width:210px">
          ${(Object.keys(PROJE_TIPLERI) as ProjeTip[]).map((tip) => {
    const m = PROJE_TIPLERI[tip];
    return `<option value="${tip}">${m.emoji} ${m.ad} — ${formatMoney(Math.round(BALANCE.PROJE_MALIYET_TABAN * m.maliyetCarpan))} + ${formatMoney(Math.round(BALANCE.PROJE_GUNLUK_BUTCE * m.maliyetCarpan))}/gün · risk %${Math.round(m.risk * 100)}</option>`;
  }).join('')}
        </select>`;
        const liderSecici = `<select class="kontenjan-input ders-ekle" data-role="proje-lider" style="width:170px">
          <option value="-1">Lider seç (riski düşürür)…</option>
          ${hocalar.map((h) => `<option value="${h.id}">${esc(h.ad)} (arş. ${Math.round(h.arastirma)})</option>`).join('')}
        </select>`;
        icerik = `<div data-proje-kap style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${tipSecici} ${liderSecici}
          <button class="eylem" data-action="proje-baslat" data-id="${d.id}"
            ${nedenler.length > 0 ? `disabled title="${esc(nedenler.join(', '))}"` : ''}>Başlat</button>
        </div>
        <div class="aciklama" style="margin-top:4px">🧪 güvenli/ucuz · 🔧 dengeli (buluş ×1.5) ·
          💥 kumar (buluş ×3, hibe ×1.8, risk %35) — lider hocanın araştırma becerisi riski düşürür,
          lider araştırırken katkısı ×1.6. Maliyet = <b>başlangıç</b> + proje sürdükçe kesilen
          <b>günlük bütçe</b>; hızlı bitiren ucuza getirir.</div>`;
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

  // --- Vizyon ekseni: birbirini dışlayan kalıcı yön ---
  const vizyonKartlari = VIZYONLAR.map((v) => {
    const secili = state.vizyon === v.id;
    const maliyet = state.vizyon === null ? VIZYON_MALIYET : VIZYON_DEGISIM_MALIYET;
    return `<tr${secili ? ' style="background:rgba(255,209,102,0.1)"' : ''}>
      <td><b>${esc(v.ad)}</b><div class="aciklama" style="margin:2px 0 0">${esc(v.etki)}</div></td>
      <td><small style="color:#9fd3a8">✚ ${esc(v.artilar)}</small><br><small style="color:#f4a09c">− ${esc(v.eksiler)}</small></td>
      <td>${secili
    ? '<span class="rozet" style="background:#6b5a1f;color:#ffe9b3">🧭 SEÇİLİ</span>'
    : `<button class="eylem" data-action="vizyon-sec" data-id="${v.id}"
        ${!rektorlukVar || state.para < maliyet ? `disabled title="${!rektorlukVar ? 'Rektörlük gerekli' : 'Bütçe yetersiz'}"` : ''}>
        Seç (${formatMoney(maliyet)})</button>`}</td>
    </tr>`;
  }).join('');

  const satirlar = STRATEGY_DEFS.map((def) => {
    const onkosul = def.onkosul.length === 0
      ? '—'
      : def.onkosul.map((o) => esc(strategyDef(o).ad)).join(', ');
    let islem: string;
    if (state.strategies.includes(def.id)) {
      islem = `<span class="rozet" style="background:#2e5d3a">✔ AKTİF</span>
        <button class="eylem tehlike" data-action="strateji-durdur" data-id="${def.id}"
          title="Politikayı durdur: günlük gideri kesilir, etkisi kalkar. Yeniden başlatmak tam kurulum maliyeti ister.">Durdur</button>`;
    } else {
      const eksik = stratejiEksikleri(state, def);
      islem = `<button class="eylem" data-action="strateji-al" data-id="${def.id}"
        ${eksik.length > 0 ? `disabled title="${esc(eksik.join(', '))}"` : ''}>Başlat</button>`;
    }
    return `<tr>
      <td><b>${esc(def.ad)}</b><div class="aciklama" style="margin:2px 0 0">${esc(def.aciklama)}</div></td>
      <td>${formatMoney(def.maliyet)}</td>
      <td>${def.gunlukGider > 0 ? `${formatMoney(def.gunlukGider)}/gün` : '—'}</td>
      <td>${def.prestijGereksinimi > 0 ? `⭐ ${def.prestijGereksinimi}` : '—'}</td>
      <td>${onkosul}</td>
      <td>${islem}</td>
    </tr>`;
  }).join('');

  const aktifGider = state.strategies.reduce((t2, id) => t2 + strategyDef(id).gunlukGider, 0);

  return `${uyari}
    <h3>🧭 Üniversite Vizyonu</h3>
    <div class="aciklama">Kalıcı yön — <b>yalnızca biri</b> seçilebilir; sonradan değiştirmek
    ${formatMoney(VIZYON_DEGISIM_MALIYET)} tutar. Artı ve eksileriyle bir kimlik seç.</div>
    <table>
      <tr><th>Vizyon</th><th>Artı / Eksi</th><th></th></tr>
      ${vizyonKartlari}
    </table>
    <h3>💰 Mali Politikalar — Kayıt Ücreti ve Burslar</h3>
    <div class="aciklama">YKS yerleştirmesinden <b>önce</b> ücreti ve burs kontenjanlarını belirle.
    Tam burslu ücretsiz okur (yüksek sıralı, eğilimli öğrenci çeker), %50 burslu yarısını,
    ücretli tamamını öder. Adayların yıllık <b>ödeme gücü ~${formatMoney(Math.round(odemeGucu(state)))}</b>
    (prestijle artar) — ücret bunu aşarsa ücretli kontenjan boş kalır, ücretli öğrenciler huzursuzlaşır.</div>
    <div class="aciklama">
      🎓 Yıllık kayıt ücreti:
      <input type="number" class="kontenjan-input" style="width:100px" data-action="ucret-ayarla"
        value="${state.ucret}" min="0" max="${BALANCE.UCRET_MAX}" step="5000"> ₺
      ${state.ucret === 0 ? '<span class="rozet" style="background:#2c4a33;color:#9fd3a8">🆓 devlet modeli — talep +%10</span>' : `<span class="rozet">öğrenci başına günde ${formatMoney(Math.round(state.ucret / 40))}</span>`}
      <br>🎖 Tam burslu: <input type="number" class="kontenjan-input" style="width:56px" data-action="burs-tam"
        value="${state.bursTam}" min="0" max="100" ${state.ucret === 0 ? 'disabled title="Ücretsiz modelde herkes burslu sayılır"' : ''}>%
      · 🎗 %50 burslu: <input type="number" class="kontenjan-input" style="width:56px" data-action="burs-yari"
        value="${state.bursYari}" min="0" max="100" ${state.ucret === 0 ? 'disabled title="Ücretsiz modelde herkes burslu sayılır"' : ''}>%
      · 💳 Ücretli: <b>%${state.ucret === 0 ? 0 : Math.max(0, 100 - state.bursTam - state.bursYari)}</b>
      <small>(kontenjan yüzdeleri — burslu öğrenci mutlu okur, zor bırakır; ücretli gelir getirir)</small>
      <br><small>Şu anki günlük ücret geliri: <b>${formatMoney(Math.round(gunlukUcretGeliri(state)))}</b>
      · Bölüme özel ücret: 🎓 Bölümler panelindeki <b>Ücret/yıl</b> sütunu.
      🎗 <b>Başarı şartı:</b> dönem sonunda GNO &lt; ${BALANCE.BURS_GNO_SART.toFixed(1)} olan burslunun
      bursu bir kademe düşer; onur listesine giren (not ≥ ${BALANCE.SINAV_ONUR}) başarı bursu kazanır.</small>
    </div>
    <h3>📝 Sınav Haftası Destekleri <small style="color:#8f9ab0">(dönemlik — sınavdan önce al)</small></h3>
    <div class="aciklama">Dönemin son 3 günü sınav haftasıdır; bu destekler o dönemin sınav notlarına
    doğrudan eklenir ve dönem sonunda sona erer.
      <br>${state.sinavDestek.etut
    ? '<span class="rozet" style="background:#2c4a33;color:#9fd3a8">📖 Etüt Programı AKTİF (+5 not)</span>'
    : `<button class="eylem" data-action="destek-etut" ${state.para < BALANCE.ETUT_MALIYET ? 'disabled title="Bütçe yetersiz"' : ''}>📖 Etüt Programı Aç (${formatMoney(BALANCE.ETUT_MALIYET)} · not +5)</button>`}
      ${state.sinavDestek.gece
    ? '<span class="rozet" style="background:#2c4a33;color:#9fd3a8">🌙 Gece Kütüphanesi AKTİF (+3 not)</span>'
    : `<button class="eylem" data-action="destek-gece" ${validRooms(state, 'kutuphane').length === 0 ? 'disabled title="Geçerli kütüphane gerekir"' : state.para < BALANCE.GECE_KUTUPHANE_MALIYET ? 'disabled title="Bütçe yetersiz"' : ''}>🌙 Gece Kütüphanesi (${formatMoney(BALANCE.GECE_KUTUPHANE_MALIYET)} · not +3)</button>`}
    </div>
    <div class="aciklama">Kredi: acil nakit — %25 faizle günlük
    ${formatMoney(BALANCE.KREDI_TAKSIT)} taksitle geri ödenir (Rektörlük gerekmez).</div>
    <div class="aciklama">
      🏦 ${state.krediBorcu > 0
    ? `Kalan kredi borcu: <b style="color:#f4a09c">${formatMoney(state.krediBorcu)}</b> (günlük ${formatMoney(BALANCE.KREDI_TAKSIT)} taksit)`
    : `<button class="eylem" data-action="kredi-cek" data-id="1000000">Kredi Çek ₺1M</button>
       <button class="eylem" data-action="kredi-cek" data-id="2000000">Kredi Çek ₺2M</button>
       <small>geri ödeme ×${BALANCE.KREDI_FAIZ}</small>`}
    </div>

    <h3>🎭 Öğrenci Kulüpleri</h3>
    <div class="aciklama">Kulüpler kampüsü topluluğa çevirir: ilgili niteliği en yüksek <b>12 öğrenci
    üye</b> sayılır — her gün nitelik +0.4 ve moral kazanırlar, dönem sonunda 🎪 şenlik yapılır.
    Kurulum ${formatMoney(BALANCE.KULUP_KURULUM)} + günlük ${formatMoney(BALANCE.KULUP_GIDER)}.
    <br>${KULUPLER.map((k) => {
    const aktif = state.kulupler.includes(k.id);
    if (aktif) {
      return `<span class="rozet" style="background:#2c4a33;color:#9fd3a8" title="${k.aciklama}">${k.emoji} ${k.ad} AKTİF</span>
        <button class="cip-cikar" data-action="kulup-kapat" data-id="${k.id}" title="Kapat — gider kesilir">×</button>`;
    }
    const kontrol = kulupKurulabilir(state, k);
    return `<button class="eylem" data-action="kulup-kur" data-id="${k.id}"
      ${kontrol.ok ? `title="${k.aciklama}"` : `disabled title="${esc(kontrol.neden)}"`}>${k.emoji} ${k.ad} Kur</button>`;
  }).join(' ')}</div>

    <h3>♟️ Politikalar</h3>
    <div class="aciklama">Politikalar artık <b>günlük bakım gideri</b> ister ve istediğin an
    durdurulabilir (etkisi kalkar, gider kesilir). Aktif politika gideri:
    <b>${formatMoney(aktifGider)}/gün</b>.</div>
    <table>
      <tr><th>Politika</th><th>Kurulum</th><th>Günlük</th><th>Prestij</th><th>Ön Koşul</th><th></th></tr>
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

/** Raporlar: kampüs cazibesi — barınma + ulaşım + faaliyet çeşitliliği. */
function cazibeBolumu(state: GameState): string {
  const faaliyet = faaliyetPuani(state);
  const kapasite = yurtKapasitesi(state);
  const ulasim = ulasimSeviyesi(state);
  const cazibe = cazibePuani(state);
  const ogrenci = state.agents.filter((a) => a.kind === 'ogrenci').length;
  const yurtta = Math.min(kapasite, ogrenci);
  return `<h3>✨ Kampüs Cazibesi: ${cazibe}/100</h3>
    <div class="aciklama">Cazibe YKS talebini artırır (en çok +%40) — üç ayaktan oluşur:
    <b>faaliyet çeşitliliği</b> (bank, 🏀 basket potası, ♟️ satranç masası, 🎸 müzik sahnesi,
    kantin/yemekhane/kütüphane), <b>barınma</b> (🛏️ yurt: gece kampüste kalan öğrenci derse tok
    ve erken gelir — hedef: öğrencilerin yarısını barındırmak) ve <b>ulaşım</b>
    (🚌 servis durağı: sabah kampüse geliş hızlanır, durak başına +%35).</div>
    ${grafikBar('🎪 Faaliyet çeşitliliği', faaliyet, 100, '#c77dff', `${faaliyet}/100`)}
    ${grafikBar('🛏️ Barınma', yurtta, Math.max(1, Math.ceil(ogrenci * 0.5)), '#59a14f', `${yurtta} yatak dolu / ${kapasite} kapasite`)}
    ${grafikBar('🌸 Estetik', estetikPuani(state), 100, '#ff9da7', `${estetikPuani(state)}/100 (çiçek, fidan, heykel, havuz)`)}
    ${grafikBar('🚌 Ulaşım', ulasim, 5, '#4a7bd4', `${ulasim}/5 durak`)}
    <div class="aciklama">💡 Aktivite alanları öğrencilerin boş vaktinde nitelik de geliştirir:
    🏀 → 📣 Influencer · ♟️ → 📜 Filozof · 🎸 → 🎨 Artist. Yurtta kalanlar akşam kütüphanede
    çalışır, gece kampüs boş kalmaz.</div>`;
}

/** Raporlar: başarım merdiveni — nihai hedef 1 numara olmak. */
function basarimBolumu(state: GameState): string {
  const satirlar = BASARIMLAR.map((b) => {
    const tamam = state.basarimlar.includes(b.id);
    return `<span class="rozet" style="margin:2px 4px 2px 0;${tamam ? 'background:#1f6b39;color:#b8f5cd' : 'opacity:0.55'}"
      title="${esc(b.aciklama)}${b.prestij > 0 ? ` · +${b.prestij} prestij` : ''}${b.para > 0 ? ` · ${formatMoney(b.para)}` : ''}">
      ${tamam ? '🏅' : '▫️'} ${esc(b.ad)}</span>`;
  }).join('');
  return `<h3>🏅 Başarımlar (${state.basarimlar.length}/${BASARIMLAR.length})</h3>
    <div class="aciklama">Hedef merdiveni: her başarım prestij/para ödülü verir.
    Nihai hedef: <b>👑 1 NUMARA</b> olmak! ⚠ Dikkat: bütçe
    ${BALANCE.IFLAS_GUN[state.zorluk]} gün üst üste borçta kalırsa YÖK kayyum atar — oyun biter.
    ${state.borcGunleri > 0 ? `<b style="color:#f4a09c">Şu an ${state.borcGunleri} gündür borçtasın!</b>` : ''}</div>
    <div>${satirlar}</div>`;
}

/** Raporlar: YÖK akreditasyon karnesi — canlı puan + sonraki denetim. */
function denetimBolumu(state: GameState): string {
  const karne = denetimKarnesi(state);
  const puan = karne.reduce((t, k) => t + k.puan, 0);
  const kalanGun = sonrakiDenetimGunu(state) - state.gun;
  const renk = puan >= BALANCE.DENETIM_GECME ? '#7ee08a' : puan >= BALANCE.DENETIM_KOSULLU ? '#f0c674' : '#f4a09c';
  const satirlar = karne.map((k) => `<tr ${k.panel ? `data-karne-panel="${k.panel}" style="cursor:pointer" title="Tıkla: bu kriteri düzeltebileceğin panel açılır"` : ''}>
      <td>${k.ad}${k.panel ? ' <span style="opacity:0.5">↗</span>' : ''}</td>
      <td><b style="color:${k.puan >= k.max ? '#7ee08a' : k.puan > 0 ? '#f0c674' : '#f4a09c'}">${k.puan}</b> / ${k.max}</td>
      <td class="aciklama">${esc(k.detay)}</td>
    </tr>`).join('');
  const son = state.sonDenetim
    ? `Son denetim (gün ${state.sonDenetim.gun}): <b>${state.sonDenetim.puan}/100 — ${esc(state.sonDenetim.sonuc)}</b>`
    : 'Henüz denetim yapılmadı.';
  return `<h3>🏛️ YÖK Akreditasyon Karnesi</h3>
    <div class="aciklama">Her 2 yılda bir denetim (sonraki: <b>gün ${sonrakiDenetimGunu(state)}, ${kalanGun} gün kaldı</b>).
    ≥ ${BALANCE.DENETIM_GECME} GEÇER (+${BALANCE.DENETIM_ODUL_PRESTIJ} prestij) ·
    ${BALANCE.DENETIM_KOSULLU}-${BALANCE.DENETIM_GECME - 1} KOŞULLU (-5) ·
    &lt; ${BALANCE.DENETIM_KOSULLU} KALIR: <b>-15 prestij + tüm kontenjanlar %20 kesilir!</b>
    ${son}</div>
    <div class="aciklama">Şu anki canlı puan: <b style="color:${renk};font-size:15px">${puan} / 100</b></div>
    <table>
      <tr><th>Kriter</th><th>Puan</th><th>Durum</th></tr>
      ${satirlar}
    </table>`;
}

/** Raporlar sekmesi (panel yeniden çizimlerinde korunur). */
let raporSekme = 'genel';

/** Mini SVG çizgi grafiği — son 24 dönemin trendi. */
function cizgiGrafik(veri: number[], renk: string, format: (v: number) => string): string {
  if (veri.length < 2) return '<div class="aciklama" style="height:56px">📈 veri birikiyor — her dönem bir nokta…</div>';
  const w = 230, h = 54;
  const min = Math.min(...veri);
  const max = Math.max(...veri);
  const aralik = max - min || 1;
  const nokta = veri.map((v, i) =>
    `${((i / (veri.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / aralik) * (h - 10)).toFixed(1)}`);
  const son = veri[veri.length - 1];
  const egilim = veri.length >= 2 ? son - veri[veri.length - 2] : 0;
  return `<svg width="${w}" height="${h}" style="display:block">
      <polyline points="${nokta.join(' ')}" fill="none" stroke="${renk}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${nokta[nokta.length - 1].split(',')[0]}" cy="${nokta[nokta.length - 1].split(',')[1]}" r="3" fill="${renk}"/>
    </svg>
    <small style="color:#8f9ab0">son: <b style="color:${renk}">${format(son)}</b>
    ${egilim !== 0 ? `<span style="color:${egilim > 0 ? '#9fd3a8' : '#f4a09c'}">(${egilim > 0 ? '▲' : '▼'} ${format(Math.abs(egilim))})</span>` : ''}
    · aralık ${format(min)}–${format(max)}</small>`;
}

/** Raporlar: trend grafikleri — "iyi gidiyor muyum?" tek bakışta. */
function trendBolumu(state: GameState): string {
  const t = state.trend ?? [];
  const kart = (baslik: string, veri: number[], renk: string, format: (v: number) => string) =>
    `<div style="background:#242938;border-radius:8px;padding:8px 10px;min-width:250px">
      <div style="font-size:12px;color:#aab4c6;margin-bottom:4px"><b>${baslik}</b></div>
      ${cizgiGrafik(veri, renk, format)}
    </div>`;
  return `<h3>📈 Trendler <small style="color:#8f9ab0">(dönemlik, son ${Math.min(24, Math.max(t.length, 1))} nokta)</small></h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${kart('💰 Bütçe', t.map((x) => x.para), '#e8c66a', (v) => formatMoney(v))}
      ${kart('⭐ Prestij', t.map((x) => x.prestij), '#c9b8f0', (v) => String(v))}
      ${kart('🎓 Öğrenci', t.map((x) => x.ogrenci), '#4a7bd4', (v) => String(v))}
      ${kart('😊 Ort. Mutluluk', t.map((x) => x.mutluluk), '#46b45e', (v) => `%${v}`)}
    </div>`;
}

function raporlarGovde(state: GameState): string {
  // Tek geçişte tüm ajan istatistikleri — gider hesabı economy.ts ile AYNI kurallarla
  // (teşvik çarpanı, asistan maaşları, mentorluk) yapılır ki rapor gerçeği yansıtsın
  const tesvik = state.strategies.includes('tesvik');
  const seviye: Record<StudentLevel, number> = { lisans: 0, yl: 0, doktora: 0 };
  const unvan: Record<AcademicRank, number> = { arsgor: 0, dr: 0, docent: 0, prof: 0 };
  let asci = 0, temizlikci = 0, tamirciSayisi = 0, maasYuku = 0, mutlulukToplam = 0, ogrenciSayisi = 0;
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
      if (a.kind === 'asci') asci++;
      else if (a.kind === 'tamirci') tamirciSayisi++;
      else temizlikci++;
      maasYuku += a.maas;
    }
  }
  maasYuku = Math.round(maasYuku);
  let doseliKare = 0;
  for (const f of state.floor) if (f !== null) doseliKare++;
  const bakim = doseliKare * BALANCE.BAKIM_GIDERI_TILE;
  const programGider = (state.mentorluk ? BALANCE.MENTORLUK_GIDER : 0)
    + state.strategies.reduce((t2, id) => t2 + strategyDef(id).gunlukGider, 0);
  const arastirmaButce = state.projects.reduce((t2, p) => t2 + (p.gunlukButce ?? 0), 0);
  const okulPayi = Math.round(ekosistemGelir * BALANCE.GIRISIM_OKUL_PAYI);
  const ucretGelir = Math.round(gunlukUcretGeliri(state));
  const gunlukNet = okulPayi + ucretGelir - maasYuku - bakim - programGider - arastirmaButce;
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

  // --- SEKMELER: tek dev sayfa yerine konu başlıkları ---
  const sekmeler: { id: string; ad: string }[] = [
    { id: 'genel', ad: '💰 Genel & Mali' },
    { id: 'ogrenci', ad: '🎓 Öğrenci' },
    { id: 'kadro', ad: '👩‍🏫 Kadro & Kampüs' },
    { id: 'siralama', ad: '🏆 Sıralama & Başarım' },
    { id: 'olaylar', ad: '⚡ Olay Günlüğü' },
    { id: 'bildirimler', ad: '📜 Arşiv' },
  ];
  if (!sekmeler.some((s) => s.id === raporSekme)) raporSekme = 'genel';
  const sekmeBar = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    ${sekmeler.map((s) => (s.id === raporSekme
    ? `<span class="rozet" style="background:#4a7bd4;color:#fff;padding:6px 12px;font-size:12px">${s.ad}</span>`
    : `<button class="eylem" data-action="rapor-sekme" data-id="${s.id}">${s.ad}</button>`)).join('')}
  </div>`;

  let icerik = '';
  if (raporSekme === 'genel') {
    icerik = `<h3>💰 Bütçe ve Günlük Denge</h3>
    <table>
      ${satir('Bütçe', formatMoney(state.para))}
      ${satir('Prestij', `⭐ ${Math.round(state.prestij)} / 1000`)}
      ${satir('Günlük maaş yükü (teşvik + asistanlar dahil)', formatMoney(maasYuku))}
      ${satir('Günlük bakım gideri', `${formatMoney(bakim)} (${doseliKare} kare zemin)`)}
      ${programGider > 0 ? satir('Günlük program giderleri', formatMoney(programGider)) : ''}
      ${arastirmaButce > 0 ? satir('Günlük araştırma bütçesi', `${formatMoney(arastirmaButce)} (${state.projects.length} aktif proje)`) : ''}
      ${satir('Günlük ekosistem geliri (okul payı)', formatMoney(okulPayi))}
      ${ucretGelir > 0 ? satir('Günlük kayıt ücreti geliri', `${formatMoney(ucretGelir)} (yıllık ücret ${formatMoney(state.ucret)}, burslar düşülmüş)`) : ''}
      ${state.krediBorcu > 0 ? satir('🏦 Kalan kredi borcu', `<b style="color:#f4a09c">${formatMoney(state.krediBorcu)}</b> (günlük ${formatMoney(BALANCE.KREDI_TAKSIT)})`) : ''}
      ${satir('Günlük net (ödenekler hariç)', `<b style="color:${gunlukNet >= 0 ? '#9fd3a8' : '#f4a09c'}">${gunlukNet >= 0 ? '+' : ''}${formatMoney(gunlukNet)}</b> <small>· YKS ödeneği ve dönem destekleri ayrıca gelir</small>`)}
    </table>
    ${trendBolumu(state)}
    ${denetimBolumu(state)}
    <h3>Tehlikeli Bölge</h3>
    <button class="eylem tehlike" data-action="yeni-oyun">Yeni Oyun (kayıt silinir)</button>`;
  } else if (raporSekme === 'ogrenci') {
    icerik = `<h3>🎓 Öğrenciler</h3>
    <table>
      ${satir('Lisans / YL / Doktora', `${seviye.lisans} / ${seviye.yl} / ${seviye.doktora}`)}
      ${satir('Ortalama mutluluk', ortMutluluk === null ? '—' : `${ortMutluluk} / 100`)}
      ${satir('Ortalama GNO', gnoSayi > 0 ? `${(gnoToplam / gnoSayi).toFixed(2)} / 4.00` : '—')}
      ${satir('Ortalama öğrenme eğilimi', ogrenciSayisi > 0 ? `%${Math.round(egilimToplam / ogrenciSayisi)}` : '—')}
      ${satir('Toplam mezun / bırakan', `${state.toplamMezun} / ${state.toplamBirakan}`)}
      ${satir('Mezun istihdamı', istihdamOrani(state) === null ? '— (🤝 Mezunlar paneli)' : `%${istihdamOrani(state)} (🤝 Mezunlar panelinde kıyas)`)}
    </table>
    ${cazibeBolumu(state)}
    ${ekosistemBolumu(state)}`;
  } else if (raporSekme === 'kadro') {
    icerik = `<h3>👩‍🏫 Kadro</h3>
    <table>
      ${satir('Ortalama ders yükü verimi', hocaSayisi > 0 ? `⚡ %${Math.round((100 * yukToplam) / hocaSayisi)} (asistanla yükselir)` : '—')}
      ${satir(RANK_LABEL.arsgor, String(unvan.arsgor))}
      ${satir(RANK_LABEL.dr, String(unvan.dr))}
      ${satir(RANK_LABEL.docent, String(unvan.docent))}
      ${satir(RANK_LABEL.prof, String(unvan.prof))}
      ${satir('Aşçı / Temizlikçi / Tamirci', `${asci} / ${temizlikci} / ${tamirciSayisi}`)}
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
    </table>`;
  } else if (raporSekme === 'siralama') {
    icerik = `${siralamaBolumu(state)}
    ${basarimBolumu(state)}`;
  } else if (raporSekme === 'bildirimler') {
    icerik = bildirimArsiviBolumu(state);
  } else {
    icerik = olayGunluguBolumu(state);
  }

  return sekmeBar + icerik;
}

/** Bildirim arşivi filtre durumu. */
let arsivFiltre: NoticeKind | 'hepsi' = 'hepsi';

/** Raporlar: bildirim arşivi — akıp giden bildirimlerin kalıcı kaydı. */
function bildirimArsiviBolumu(state: GameState): string {
  const filtreler: { id: NoticeKind | 'hepsi'; ad: string }[] = [
    { id: 'hepsi', ad: 'Hepsi' },
    { id: 'odul', ad: '🏆 Ödül' },
    { id: 'iyi', ad: '✅ İyi' },
    { id: 'kotu', ad: '⚠️ Kötü' },
    { id: 'bilgi', ad: 'ℹ️ Bilgi' },
  ];
  const secili = state.notices.filter((n) => arsivFiltre === 'hepsi' || n.kind === arsivFiltre);
  const renk: Record<NoticeKind, string> = { odul: '#e8c66a', iyi: '#9fd3a8', kotu: '#f4a09c', bilgi: '#aab4c6' };
  const satirlar = [...secili].reverse().map((n) => `<tr>
      <td style="white-space:nowrap"><small>Gün ${n.gun} · ${formatClock(n.dakika)}</small></td>
      <td style="color:${renk[n.kind]}">${esc(n.metin)}</td>
    </tr>`).join('');
  return `<h3>📜 Bildirim Arşivi <small style="color:#8f9ab0">(son ${state.notices.length} bildirim)</small></h3>
    <div class="aciklama">Sağdaki akışta kaybolan bildirimlerin kalıcı kaydı.
    ${filtreler.map((f) => (f.id === arsivFiltre
    ? `<span class="rozet" style="background:#4a7bd4;color:#fff">${f.ad}</span>`
    : `<button class="eylem" data-action="arsiv-filtre" data-id="${f.id}">${f.ad}</button>`)).join(' ')}</div>
    ${secili.length === 0 ? '<p class="aciklama">Bu filtrede bildirim yok.</p>'
    : `<table><tr><th>Zaman</th><th>Bildirim</th></tr>${satirlar}</table>`}`;
}

/** Raporlar: olay günlüğü — verdiğin kararların kaydı. */
function olayGunluguBolumu(state: GameState): string {
  const gecmis = state.olayGecmisi ?? [];
  if (gecmis.length === 0) {
    return `<h3>⚡ Olay Günlüğü</h3>
      <div class="aciklama">Henüz karar verilmedi. Kampüs olayları belirdiğinde verdiğin
      (ya da vermediğin) kararlar buraya işlenir — bazı kararların sonuçları
      dönemler sonra kapına geri gelir…</div>`;
  }
  const satirlar = [...gecmis].reverse().map((g) => `<tr>
      <td><small>Gün ${g.gun}</small></td>
      <td><b>${esc(g.baslik)}</b></td>
      <td>${esc(g.secim)}</td>
      <td class="aciklama">${esc(g.sonuc)}</td>
    </tr>`).join('');
  return `<h3>⚡ Olay Günlüğü <small style="color:#8f9ab0">(${gecmis.length} karar)</small></h3>
    <div class="aciklama">Rektörlüğün karar geçmişi — bazı kararların devamı dönemler sonra gelir.</div>
    <table>
      <tr><th>Gün</th><th>Olay</th><th>Kararın</th><th>Sonuç</th></tr>
      ${satirlar}
    </table>`;
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
      imza bonusu ister, prestij getirir. Bölüm ataması YOKTUR: hoca hangi bölümün müfredatından
      ders veriyorsa (📅 Program paneli) o bölüme <b>otomatik</b> bağlanır.
      Hocalar ders verip araştırma yaparak XP toplar; makale şartlarını sağlayınca
      Arş. Gör. → Dr. Öğr. Üyesi → Doçent → Profesör yükselir. Aşçı (yemekhane servisi) ve
      temizlikçi (kir) almayı unutma. 😊 <b>Memnuniyet:</b> hocalar kıdemlerine göre maaş bekler;
      düşük maaş, aşırı ders yükü ve borçtaki okul morali bozar. Memnuniyeti 35 altına düşen
      hoca dönem başında <b>istifa edip rakibe gidebilir</b> — Kadro panelinden <b>Zam Ver</b>.
      Hocalar ${BALANCE.EMEKLILIK_YASI} yaşında emekli olur; kadroyu genç tutmayı planla.
      ⚠ Bütçe uzun süre borçta kalırsa <b>YÖK kayyum atar ve oyun biter</b> (limit zorluğa göre
      20-45 gün). ♟️ Strateji panelinde artık <b>vizyon seçimi</b> (tek seçim, artı/eksili) ve
      <b>günlük giderli, durdurulabilir politikalar</b> var.
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
      📝 <b>Sınavlar:</b> her dönemin son 3 günü sınav haftasıdır (öğrenme ×1.25); dönem sonunda
      notu 40'ın altında kalan öğrenci KALIR (ilerleme -15, bütünleme = telafi dönemi), 85+ onur
      listesine girer. Not GNO'dan gelir: iyi hoca + kitaplı kütüphane = az kalan.
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

    <h3>4c) ✨ Kampüs cazibesi: yurt, ulaşım, aktivite</h3>
    <div class="aciklama">
      <b>🛏️ Yurt</b> kur (Odalar/Hazır Bina; ranza başına 2 öğrenci): yurtta kalanlar gece
      kampüste yaşar, akşam kütüphanede çalışır, derse tok ve erken gelir. <b>🚌 Servis durağı</b>
      koy: sabah kampüse geliş hızlanır. <b>Aktivite alanları</b> (🏀 basket, ♟️ satranç,
      🎸 müzik sahnesi) öğrencilerin takıldığı yerlerdir — eğlence ihtiyacını karşılar VE nitelik
      geliştirir. Üçü birlikte <b>✨ Kampüs Cazibesi</b>ni (üst barda) oluşturur: YKS talebine
      en çok +%40 çarpan. Detay: 📊 Raporlar.
    </div>

    <h3>4d) 🚀 Girişim ekosistemi</h3>
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
      (patent geliri) ve 🏆 <b>bilim ödülü</b>. Artık <b>3 proje tipi</b> var: 🧪 güvenli/ucuz,
      🔧 dengeli, 💥 yüksek riskli atılım (buluş ×3 ama %35 başarısızlık) — <b>lider hoca</b>
      seç: araştırma becerisi riski düşürür, araştırırken katkısı ×1.6. Başarısız proje hibe
      getirmez! Projeler otomatik zincirlenir (temel tip); istemezsen iptal et.
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
      🏛️ Kademe 2+ mezunları <b>Mütevelli Heyetine</b> al (en çok 3): sektörlerine göre kalıcı
      bonus verirler; zirvedeki mezunlar bazen <b>isimli bina bağışı</b> yapar (dev para + prestij).
      Rakipler de boş durmaz: skandallar, atılımlar, <b>hoca ayartma girişimleri</b> ve tanıtım
      savaşları dönem başında haberlere düşer. 💰 Strateji panelindeki <b>Mali Politikalar</b>dan
      YKS'den önce <b>yıllık kayıt ücreti</b> ve <b>burs kontenjanlarını</b> (🎖 tam / 🎗 %50 / 💳 ücretli)
      ayarla: burslu öğrenci başarılı ve sadık olur, ücretli gelir getirir — ama ücret adayların
      ödeme gücünü aşarsa ücretli kontenjan boş kalır. Dara düşünce kredi çek.
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
    html += `<p class="aciklama">Hücredeki seçiciden derse <b>sonradan hoca atayabilirsin</b> —
      ders hocanın yıllık programında yoksa (kota izin veriyorsa) otomatik eklenir.
      Program hocasız kalan dersleri her gün kendini onararak doldurmayı dener;
      yine de boş kalıyorsa kadro yetmiyordur.</p>`;
    html += '<table><tr><th>Bölüm</th>' + BLOK_SAAT.map((s) => `<th>${s}</th>`).join('') + '</tr>';
    const programSlots = state.dersProgrami ?? [];
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
        let hoca = '<span style="color:#f4a09c"><b>hoca yok!</b> aşağıdan ata ↓</span>';
        if (slot.academicId !== -1 && hocaAd.has(slot.academicId)) {
          const alan = hocaAlan.get(slot.academicId)!;
          const hocaObj = hocalar.find((x) => x.id === slot.academicId);
          const verim = hocaObj ? Math.round(dersYukuVerimi(state, hocaObj) * 100) : 100;
          hoca = `${ALAN_META[alan].emoji} ${esc(hocaAd.get(slot.academicId)!)} <small>(%${uyumYuzde(slot.courseId, alan)}${verim < 100 ? ` · ⚡%${verim}` : ''})</small>`;
        }
        // slot hoca seçici: aynı saatte başka sınıfta olanlar ve kotası dolu
        // (dersi olmayan) hocalar devre dışı gösterilir
        const secenekler = hocalar.map((h) => {
          const cakisma = programSlots.some(
            (s2) => s2.blok === blok && s2.academicId === h.id && s2.deptId !== dept.id,
          );
          const dersiVar = (h.verdigiDersler ?? []).includes(slot.courseId);
          const kotaDolu = !dersiVar && (h.verdigiDersler ?? []).length >= DERS_LIMIT;
          const neden = cakisma ? ' — aynı saatte başka derste' : kotaDolu ? ` — yıllık kota dolu (${DERS_LIMIT})` : '';
          return `<option value="${h.id}" ${slot.academicId === h.id ? 'selected' : ''}
            ${cakisma || kotaDolu ? 'disabled' : ''}>${ALAN_META[h.alan].emoji} ${esc(h.ad)} · %${uyumYuzde(slot.courseId, h.alan)}${dersiVar ? '' : ' (+ders)'}${neden}</option>`;
        }).join('');
        const seciciStil = slot.academicId === -1 ? 'border-color:#c25450;background:#3a2426' : '';
        const kilitRozet = slot.kilit
          ? `<button class="cip-cikar" data-action="slot-kilit-ac" data-id="${dept.id}" data-blok="${blok}"
              title="📌 Bu slot kilitli: elle atadığın hoca gece yeniden kurulumda değişmez. Tıkla: kilidi aç.">📌</button>`
          : '';
        html += `<td><b>${ders.kod}</b> ${ders.ad} ${kilitRozet}<br><small>${hoca}</small><br>
          <select class="kontenjan-input ders-ekle" style="width:150px;font-size:11px;${seciciStil}"
            data-action="slot-hoca" data-id="${dept.id}" data-blok="${blok}"
            title="Bu derse hoca ata (📌 kilitlenir) — %uyum: alan-ders uygunluğu; (+ders) hocanın yıllık programına eklenir">
            <option value="-1" ${slot.academicId === -1 ? 'selected' : ''}>— hoca ata —</option>
            ${secenekler}
          </select></td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
  }

  return html;
}
