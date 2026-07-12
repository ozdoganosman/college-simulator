import {
  GameState, KISILIK_META, LEVEL_LABEL, NITELIK_META, Nitelik, RANK_LABEL, ALAN_META, WALL_NONE, donemAdi,
  donemGunu, DONEM_GUN, HAFTA_KISA, MEVSIM_META, haftaGunu, mevsim, tatilMi, yil,
} from '../core/types';
import { formatClock, formatMoney } from '../core/util';
import { FLOOR_DEFS, ROOM_DEFS, ROOM_LIST, WALL_COST, DOOR_COST } from '../data/rooms';
import { OBJECT_DEFS, OBJECT_LIST } from '../data/objects';
import { isEnclosed, libraryLevel } from '../core/grid';
import {
  PREFABS, autoFurnishCost, autoFurnishRoom, prefabCost, prefabOzet, roomFurnishPlan,
  sablonlar, sablonKaydet, sablonSil,
} from '../game/prefab';
import {
  assignRoomToDept, canFinalizeDepartment, openDepartmentWithRooms, runYerlestirme,
  unassignRoomFromDept,
} from '../game/departments';
import { gnoHesapla } from '../game/agents';
import { oyuncuSirasi } from '../game/rivals';
import { cazibePuani } from '../game/campus';
import { DERS_LIMIT, asistanlari, dersYukuVerimi } from '../game/schedule';
import { bolumUcreti } from '../game/economy';
import { sonrakiDenetimGunu } from '../game/accreditation';
import { deptDef } from '../data/departments';
import { BALANCE } from '../data/balance';
import { sesBildirim, sesUyari } from './audio';
import { arkadasAdi } from '../game/social';
import { deleteRoom, demolishRoom, roomOuterRect } from '../game/build';
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
    <span class="stat para tikla" data-st="para" data-panel="raporlar"
      title="Bütçe — tıkla: 📊 Raporlar&#10;Gelir: YKS ödeneği, dönem desteği, hibe, mezun bağışı, girişim payı&#10;Gider: maaşlar, bakım, inşaat"></span>
    <span class="stat tikla" data-st="prestij" data-panel="raporlar"
      title="Prestij (0-1000) — tıkla: 📊 Raporlar&#10;Kazanç: mezun, makale, buluş, ödül, terfi, sıralama yükselişi&#10;Kayıp: okulu bırakan öğrenci, bütçe açığı&#10;Prestij yükseldikçe YKS talebi artar"></span>
    <span class="stat tikla" data-st="ogrenci" data-panel="bolumler"
      title="Öğrenci sayısı — tıkla: 🎓 Bölümler&#10;YKS yerleştirmesiyle gelir; mutsuz olan okulu bırakır"></span>
    <span class="stat tikla" data-st="akademisyen" data-panel="kadro"
      title="Akademisyen sayısı — tıkla: 👩‍🏫 Kadro&#10;KPSS/transferle alınır; ders verir, araştırma yapar, terfi eder"></span>
    <span class="stat tikla" data-st="yemek" data-panel="kadro"
      title="Mutfak yemek stoğu (porsiyon) — tıkla: 👩‍🏫 Kadro&#10;Aşçılar 11:00-14:00 banko başında üretir; her öğrenci 1 porsiyon yer&#10;Stok biterse öğrenciler aç kalır ve mutsuzlaşır; kalan yemek gece bayatlar"></span>
    <span class="stat tikla" data-st="kutuphane" data-panel="kutuphane"
      title="Kütüphane seviyesi (0-3) — tıkla: 📚 Kütüphane&#10;Kitaplık rafı sayısıyla yükselir; araştırma ve öğrenmeyi hızlandırır"></span>
    <span class="stat tikla" data-st="cazibe" data-panel="raporlar"
      title="Kampüs Cazibesi (0-100) — tıkla: 📊 Raporlar&#10;Faaliyet çeşitliliği (bank, basket, satranç, sahne, kantin...) %50&#10;+ Yurt barınması %30 + Servis durakları %20&#10;YKS talebini en çok +%40 artırır"></span>
    <span class="stat tikla" data-st="sira" data-panel="raporlar"
      title="Türkiye Üniversite Sıralaması — tıkla: 📊 Raporlar&#10;Skor = prestij + yayın + mezun · Hedef: 1 numara olmak!"></span>
    <span class="stat tikla" data-st="altyapi" data-panel="raporlar" style="display:none"
      title="Altyapı uyarısı — tıkla: 📊 Raporlar&#10;Elektrik/su kesintisi ya da aktif kriz (yangın/salgın) var"></span>
    <span class="stat tarih" data-st="tarih" title="Dönem 20 gün sürer (Güz + Bahar = 1 yıl)&#10;Dönem sonunda mezuniyet; yıl başında YKS ve Akademik Yıl Ödülleri&#10;Kırmızı bölge = SINAV HAFTASI (son 3 gün)">
      <span data-st="tarih-metin"></span>
      <span class="donem-bar" title="Akademik takvim: kırmızı bölge sınav haftası; 🏛 YÖK denetimi işareti">
        <span class="donem-sinav"></span>
        <span class="donem-dolu" data-st="donem-bar"></span>
        <span class="donem-isaret" data-st="takvim-isaret"></span>
      </span>
    </span>
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
  for (const s of topEl.querySelectorAll<HTMLElement>('.stat.tikla')) {
    s.addEventListener('click', () => {
      const panel = s.dataset.panel;
      if (panel) openPanel(panel as Parameters<typeof openPanel>[0]);
    });
  }

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

  // ⭐ yıldız öğrenci takip düğmesi (alt bar kartında — delegasyonla yaşar)
  subbarEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-yildiz]');
    if (!b) return;
    const state = getState();
    const ad = b.dataset.yildiz ?? '';
    if (state.yildizlar.includes(ad)) {
      state.yildizlar = state.yildizlar.filter((y) => y !== ad);
    } else if (state.yildizlar.length >= 5) {
      state.yildizlar.shift(); // en eski takip düşer
      state.yildizlar.push(ad);
    } else {
      state.yildizlar.push(ad);
    }
    renderSubbar(getState, ui);
  });
}

function buildToolbar(getState: () => GameState, ui: UIState): void {
  toolbarEl.innerHTML = '';
  const btn = (etiket: string, id: string, onClick: () => void, ipucu = '') => {
    const b = document.createElement('button');
    b.className = 'tb-btn';
    b.dataset.id = id;
    b.textContent = etiket;
    if (ipucu) b.title = ipucu;
    b.addEventListener('click', onClick);
    toolbarEl.appendChild(b);
    return b;
  };

  btn('🖱️ Seç', 'sec', () => setTool(ui, { kind: 'sec' }, getState),
    'Odaya tıkla: gereksinim listesi · Kişiye tıkla: öğrenci/hoca kartı');
  btn('🏗️ Hazır Bina', 'hazir', () => toggleKategori('hazir', getState, ui),
    'Tek tıkla kurulan hazır binalar — zemin, duvar, kapı ve eşyalar dahil');
  btn('🧱 İnşaat', 'insaat', () => toggleKategori('insaat', getState, ui),
    'Zemin döşe, duvar ör, kapı koy, yık — kendi binanı parça parça kur');
  btn('🏷️ Odalar', 'oda', () => toggleKategori('oda', getState, ui),
    'Kapalı alanı oda olarak işaretle (derslik, ofis, tuvalet...)');
  btn('🪑 Eşyalar', 'esya', () => toggleKategori('esya', getState, ui),
    'Odalara eşya yerleştir — her odanın zorunlu eşyaları vardır');
  const katmanlar: { id: UIState['katman']; ad: string }[] = [
    { id: 'yok', ad: '🌡️ Katman' },
    { id: 'mutluluk', ad: '🌡️ Mutluluk' },
    { id: 'aclik', ad: '🌡️ Açlık' },
    { id: 'kir', ad: '🌡️ Kir' },
    { id: 'yipranma', ad: '🌡️ Eskime' },
  ];
  const katmanBtn = btn('🌡️ Katman', 'katman', () => {
    const idx = katmanlar.findIndex((k) => k.id === ui.katman);
    ui.katman = katmanlar[(idx + 1) % katmanlar.length].id;
    katmanBtn.textContent = katmanlar[(idx + 1) % katmanlar.length].ad;
    katmanBtn.classList.toggle('katman-acik', ui.katman !== 'yok');
  }, 'Isı haritası: tıkladıkça katman değişir — öğrenci mutluluğu / açlık / kampüs kiri / eşya eskimesi. Yeşil iyi, kırmızı kötü.');
  btn('🎓 Bölümler', 'panel-bolumler', () => openPanel('bolumler'),
    'Açık bölümler, kontenjanlar, YL/doktora programları');
  btn('👩‍🏫 Kadro', 'panel-kadro', () => openPanel('kadro'),
    'Akademisyen al (KPSS/transfer), moral ve zam yönet — bölüm ataması derslerden otomatik');
  btn('📅 Program', 'panel-program', () => openPanel('program'),
    'Hocalara yıllık ders seç → açık derslerle bölüm aç · asistan ata');
  btn('🔬 Araştırma', 'panel-arastirma', () => openPanel('arastirma'),
    'Araştırma projeleri: hibe, makale, buluş ve prestij kazandırır');
  btn('📚 Kütüphane', 'panel-kutuphane', () => openPanel('kutuphane'),
    'Alan bazlı kitap koleksiyonları — kütüphanede çalışan öğrenciyi hızlandırır');
  btn('🤝 Mezunlar', 'panel-mezunlar', () => openPanel('mezunlar'),
    'Mezun kariyerleri, dernek haberleri, istihdam kıyası, mentorluk');
  btn('♟️ Strateji', 'panel-strateji', () => openPanel('strateji'),
    'Üniversite stratejileri (Rektörlük binası gerekir)');
  btn('📊 Raporlar', 'panel-raporlar', () => openPanel('raporlar'),
    'Bütçe dengesi, Türkiye sıralaması, tüm istatistikler');
  btn('❓ Nasıl Oynanır', 'panel-yardim', () => openPanel('yardim'),
    'Oyunun tüm sistemlerinin anlatımı');
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

  if (ui.tool.kind === 'bolumOdaSec') {
    // BÖLÜM AÇMA: haritadan elle derslik/lab seçim modu — toolbar kategorilerinden önce göster
    const t = ui.tool;
    const def = deptDef(t.defId);
    const div = document.createElement('div');
    div.className = 'gerek-liste';
    const derslikSayisi = t.roomIds.filter((id) => {
      const r = state.rooms.find((x) => x.id === id);
      return r && (r.type === 'derslik' || r.type === 'amfi');
    }).length;
    const labSayisi = t.roomIds.length - derslikSayisi;
    const cip = (etiketMetin: string, tamam: boolean) =>
      `<span class="gerek${tamam ? '' : ' eksik'}">${tamam ? '✔' : '✖'} ${etiketMetin}</span>`;
    let html = `<span class="baslik">📍 ${escapeHtml(def.ad)} için haritada derslik/amfi${def.labGerekli ? ' + laboratuvar' : ''} tıkla</span>`;
    html += cip(`Derslik/amfi ${derslikSayisi}/${def.minDerslik}`, derslikSayisi >= def.minDerslik);
    if (def.labGerekli) html += cip(`Laboratuvar ${labSayisi}/1`, labSayisi >= 1);
    div.innerHTML = html;

    const eylem = document.createElement('div');
    eylem.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
    const kontrol = canFinalizeDepartment(state, t.defId, t.roomIds);
    const acBtn = document.createElement('button');
    acBtn.className = 'sub-btn';
    acBtn.innerHTML = `🎉 Bölümü Aç <span class="fiyat">${formatMoney(def.acilisMaliyeti)}</span>`;
    if (!kontrol.ok) { acBtn.disabled = true; acBtn.title = kontrol.eksik.join(' · '); }
    acBtn.addEventListener('click', () => {
      if (openDepartmentWithRooms(state, t.defId, t.roomIds)) {
        ui.tool = { kind: 'sec' };
        document.dispatchEvent(new CustomEvent('tool-changed'));
      } else {
        renderSubbar(getState, ui);
      }
    });
    eylem.appendChild(acBtn);
    const iptalBtn = document.createElement('button');
    iptalBtn.className = 'sub-btn';
    iptalBtn.innerHTML = '✖ İptal';
    iptalBtn.addEventListener('click', () => {
      ui.tool = { kind: 'sec' };
      document.dispatchEvent(new CustomEvent('tool-changed'));
    });
    eylem.appendChild(iptalBtn);
    div.appendChild(eylem);
    subbarEl.appendChild(div);
    return;
  }

  if (acikKategori === 'hazir') {
    for (const p of PREFABS) {
      item(
        `${ROOM_DEFS[p.room].ad === p.ad ? '' : ''}${p.ad} <span class="fiyat">${p.w}×${p.h} · ${formatMoney(prefabCost(p))}</span>`,
        ui.tool.kind === 'hazir' && ui.tool.prefab === p.id,
        () => { ui.tool = { kind: 'hazir', prefab: p.id }; },
        `Tek tık = ${p.w}×${p.h} kurulur · SÜRÜKLE = istediğin boyutta kur (eşyalar boyuta göre döşenir)\nVarsayılan içerik: ${prefabOzet(p)}`,
      );
    }
    // özel şablonlar (💾 ile kaydedilenler) — sil butonlu
    for (const s of sablonlar()) {
      const secili = ui.tool.kind === 'hazir' && ui.tool.prefab === s.id;
      const b = document.createElement('button');
      b.className = 'tb-btn' + (secili ? ' aktif' : '');
      b.innerHTML = `⭐ ${s.ad} <span class="fiyat">${s.w}×${s.h} · ${formatMoney(prefabCost(s))}</span>`
        + '<span class="cip-cikar" style="margin-left:6px">×</span>';
      b.title = 'Özel şablon · × ile sil';
      b.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('cip-cikar')) {
          sablonSil(s.id);
          if (secili) ui.tool = { kind: 'sec' };
          renderSubbar(getState, ui);
        } else {
          ui.tool = { kind: 'hazir', prefab: s.id };
          renderSubbar(getState, ui);
        }
      });
      subbarEl.appendChild(b);
    }
    const div = document.createElement('div');
    div.className = 'oda-bilgi';
    const yonAd = ['⬇ alt', '➡ sağ', '⬆ üst', '⬅ sol'][ui.buildYon % 4];
    div.innerHTML = `Tek tık: varsayılan boyut · <b>Sürükle: büyüt/küçült</b> · <b>R: döndür</b> (kapı: ${yonAd}) · sağ tık/Esc: iptal.<br>`
      + 'Eşyalar boyuta göre döşenir, maliyet canlı görünür. Bütçe yetmezse hayalet amber olur.';
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
  } else if (ui.selectedRoomIds.length >= 2) {
    // TOPLU SEÇİM paneli: birden çok bina seçili
    const div = document.createElement('div');
    div.className = 'gerek-liste';
    const n = ui.selectedRoomIds.length;
    const bilgi = document.createElement('span');
    bilgi.className = 'baslik';
    bilgi.textContent = `🏢 ${n} bina seçili (Shift+tık ile ekle/çıkar)`;
    div.appendChild(bilgi);
    const eylem = document.createElement('div');
    eylem.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
    const tasiHep = document.createElement('button');
    tasiHep.className = 'sub-btn';
    tasiHep.innerHTML = '📦 Hepsini Taşı';
    tasiHep.title = 'Seçili binaları düzenlerini bozmadan birlikte taşı';
    tasiHep.addEventListener('click', () => {
      ui.tool = { kind: 'tasiGrup', roomIds: [...ui.selectedRoomIds] };
      document.dispatchEvent(new CustomEvent('tool-changed'));
    });
    eylem.appendChild(tasiHep);
    const yikHep = document.createElement('button');
    yikHep.className = 'sub-btn';
    yikHep.innerHTML = '🧨 Hepsini Yık';
    yikHep.addEventListener('click', () => {
      if (confirm(`${n} bina tümüyle yıkılsın mı? (%25 iade)`)) {
        for (const id of [...ui.selectedRoomIds]) demolishRoom(state, id);
        ui.selectedRoomIds = [];
        ui.selectedRoomId = -1;
        renderSubbar(getState, ui);
      }
    });
    eylem.appendChild(yikHep);
    const temizle = document.createElement('button');
    temizle.className = 'sub-btn';
    temizle.innerHTML = '✖ Seçimi Temizle';
    temizle.addEventListener('click', () => {
      ui.selectedRoomIds = [];
      ui.selectedRoomId = -1;
      renderSubbar(getState, ui);
    });
    eylem.appendChild(temizle);
    div.appendChild(eylem);
    subbarEl.appendChild(div);
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

      // 🏫 BÖLÜM BAĞLANTISI: derslik/amfi/lab'ı elle bir bölüme ekle / bölümden ayır
      const bolumOdasi = room.type === 'derslik' || room.type === 'amfi' || room.type === 'laboratuvar';
      if (bolumOdasi && room.valid) {
        if (room.deptId !== null) {
          const sahipDept = state.departments.find((d) => d.id === room.deptId);
          const ayirBtn = document.createElement('button');
          ayirBtn.className = 'sub-btn';
          ayirBtn.innerHTML = `🔓 ${sahipDept ? escapeHtml(deptDef(sahipDept.defId).ad) : 'Bölümden'} Ayır`;
          ayirBtn.title = 'Bu odayı bölümünden ayırır — oda yerinde kalır, başka bölüme eklenebilir';
          ayirBtn.addEventListener('click', () => {
            unassignRoomFromDept(state, room.id);
            renderSubbar(getState, ui);
          });
          div.appendChild(ayirBtn);
        } else if (state.departments.length > 0) {
          const secici = document.createElement('select');
          secici.className = 'kontenjan-input';
          secici.innerHTML = '<option value="">🏫 Bölüme ekle…</option>'
            + state.departments.map((d) => `<option value="${d.id}">${escapeHtml(deptDef(d.defId).ad)}</option>`).join('');
          secici.addEventListener('change', () => {
            if (secici.value) assignRoomToDept(state, room.id, Number(secici.value));
            renderSubbar(getState, ui);
          });
          div.appendChild(secici);
        }
      }

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

      // 🏗️ BİNA AKSİYONLARI: taşı / kopyala / tek tık yık
      const aksiyon = document.createElement('div');
      aksiyon.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';

      const tasiBtn = document.createElement('button');
      tasiBtn.className = 'sub-btn';
      tasiBtn.innerHTML = '📦 Taşı';
      tasiBtn.title = 'Binayı eşya, duvar ve öğrencileriyle birlikte yeni boş yere taşı (ücretsiz)';
      tasiBtn.addEventListener('click', () => {
        ui.tool = { kind: 'tasi', roomId: room.id };
        document.dispatchEvent(new CustomEvent('tool-changed'));
      });
      aksiyon.appendChild(tasiBtn);

      const kopyaP = PREFABS.find((p) => p.room === room.type);
      // yeniden boyutlandır (türün prefabı gerekli)
      if (kopyaP) {
        const boyutBtn = document.createElement('button');
        boyutBtn.className = 'sub-btn';
        boyutBtn.innerHTML = '📐 Boyutlandır';
        boyutBtn.title = 'Binayı kimliğini koruyarak yeniden boyutlandır (yalnız fark ödenir)';
        boyutBtn.addEventListener('click', () => {
          ui.tool = { kind: 'boyutlandir', roomId: room.id, prefab: kopyaP.id };
          document.dispatchEvent(new CustomEvent('tool-changed'));
        });
        aksiyon.appendChild(boyutBtn);
      }

      // kopyala: aynı türde hazır bina aracına geç (varsa)
      if (kopyaP) {
        const kopyaBtn = document.createElement('button');
        kopyaBtn.className = 'sub-btn';
        kopyaBtn.innerHTML = '⧉ Kopyala';
        kopyaBtn.title = `Aynı türde bir ${def.ad} daha kur (Hazır Bina aracına geçer)`;
        kopyaBtn.addEventListener('click', () => {
          ui.tool = { kind: 'hazir', prefab: kopyaP.id };
          document.dispatchEvent(new CustomEvent('tool-changed'));
        });
        aksiyon.appendChild(kopyaBtn);
      }

      // şablon kaydet: bu binanın tür+boyutunu Hazır Bina'ya ekle
      const sablonBtn = document.createElement('button');
      sablonBtn.className = 'sub-btn';
      sablonBtn.innerHTML = '💾 Şablon';
      sablonBtn.title = 'Bu binayı (tür + boyut) özel şablon olarak kaydet — Hazır Bina listesine eklenir';
      sablonBtn.addEventListener('click', () => {
        const rect = roomOuterRect(state, room.id);
        if (!rect) return;
        const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
        const ad = (prompt('Şablon adı:', `${def.ad} ${w}×${h}`) ?? '').trim();
        if (!ad) return;
        const yeni = sablonKaydet(room.type, w, h, ad);
        ui.tool = { kind: 'hazir', prefab: yeni.id };
        document.dispatchEvent(new CustomEvent('tool-changed'));
      });
      aksiyon.appendChild(sablonBtn);

      const yikBtn = document.createElement('button');
      yikBtn.className = 'sub-btn';
      yikBtn.innerHTML = '🧨 Yık Bina';
      yikBtn.title = 'Binayı tümüyle yık (duvar+zemin+eşya), %25 iade';
      yikBtn.addEventListener('click', () => {
        if (confirm(`${def.ad} tümüyle yıkılsın mı? (eşyaların %25'i iade edilir)`)) {
          demolishRoom(state, room.id);
          ui.selectedRoomId = -1;
          renderSubbar(getState, ui);
        }
      });
      aksiyon.appendChild(yikBtn);
      div.appendChild(aksiyon);

      // oda düzenleme: genişletme ipucu + oda ataması silme
      const ipucu = document.createElement('span');
      ipucu.className = 'gerek';
      ipucu.textContent = '✏️ Genişlet: Odalar aracıyla bitişiğine sürükle · Küçült: Oda Kaldır';
      div.appendChild(ipucu);

      const sil = document.createElement('button');
      sil.className = 'sub-btn';
      sil.innerHTML = '🗑️ Yalnız Oda Atamasını Sil';
      sil.title = 'Oda atamasını kaldırır — duvarlar ve eşyalar yerinde kalır (bina durur)';
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

/** Çip içinde mini ilerleme barı (0-1 oran). */
function miniBar(oran: number, renk: string): string {
  const y = Math.max(3, Math.min(100, Math.round(oran * 100)));
  return `<span class="mini-bar"><span style="width:${y}%;background:${renk}"></span></span>`;
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
    const takipte = state.yildizlar.includes(a.ad);
    // lisansüstü aşama rozeti: ders dönemi / tez (ilerleme yüzdesiyle)
    const tezHedef = a.level === 'doktora' ? BALANCE.TEZ_HEDEF * 1.6 : BALANCE.TEZ_HEDEF;
    const asamaEk = a.level === 'lisans' ? ''
      : a.asama === 'tez' ? ` · 📜 Tez %${Math.min(99, Math.round(100 * (a.tezPuan ?? 0) / tezHedef))}`
        : a.level === 'doktora' ? ' · 📖 Ders (yeterlik bekliyor)' : ' · 📖 Ders dönemi';
    let html = `<span class="baslik">${takipte ? '⭐ ' : ''}🎓 ${a.ad} — ${LEVEL_LABEL[a.level]}${asamaEk} · ${bolum}</span>`;
    html += `<button class="eylem" data-yildiz="${a.ad.replace(/"/g, '')}"
      title="${takipte ? 'Takipten çıkar' : 'Yıldız öğrenci olarak takip et: mezuniyeti, işi ve terfileri sana bildirilir (en çok 5)'}">
      ${takipte ? '⭐ Takipte — çıkar' : '☆ Takip Et'}</button>`;
    if (a.kisilik && a.kisilik !== 'normal') {
      html += cip(`${KISILIK_META[a.kisilik].emoji} ${KISILIK_META[a.kisilik].ad} — ${KISILIK_META[a.kisilik].tanim}`);
    }
    html += cip(gno === null ? '📖 GNO: henüz yok'
      : `📖 GNO ${miniBar(gno / 4, gno >= 2.5 ? '#46b45e' : gno >= 1.5 ? '#e8b931' : '#d9534f')} ${gno.toFixed(2)}`, gno !== null && gno < 2);
    html += cip(`🧠 Öğrenme eğilimi: %${a.egilim} (${egilimEtiket})`, a.egilim < 85);
    html += cip(`📈 Mezuniyet ${miniBar(a.ilerleme / 100, '#4a7bd4')} %${Math.round(a.ilerleme)}`);
    html += cip(`😊 Mutluluk ${miniBar(a.mutluluk / 100, a.mutluluk >= 60 ? '#46b45e' : a.mutluluk >= 40 ? '#e8b931' : '#d9534f')} %${Math.round(a.mutluluk)}`, a.mutluluk < 40);
    const nitelikler = (Object.keys(NITELIK_META) as Nitelik[])
      .map((k) => `${NITELIK_META[k].emoji} ${Math.round(a.nitelik[k])}`)
      .join(' · ');
    html += cip(nitelikler);
    if (state.ucret > 0) {
      html += cip(a.burs >= 100 ? '🎖 Tam burslu' : a.burs >= 50 ? '🎗 %50 burslu'
        : `💳 Ücretli (${formatMoney(bolumUcreti(state, a.deptId))}/yıl)`);
    }
    html += cip(`💰 Sermaye: ${formatMoney(Math.round(a.sermaye))}`);
    const dost = arkadasAdi(state, a);
    if (dost) html += cip(`🤝 Yakın arkadaşı: ${dost}`);
    if (hoca && hoca.kind === 'akademisyen') {
      html += cip(`🧑‍🔬 Asistanlık: ${RANK_LABEL[hoca.rank]} ${hoca.ad}`);
    }
    if (a.level !== 'lisans' && a.danisman !== -1) {
      const d = state.agents.find((x) => x.id === a.danisman);
      if (d && d.kind === 'akademisyen') {
        html += cip(`🧭 Danışmanı: ${RANK_LABEL[d.rank]} ${d.ad}`);
      }
    }
    return html;
  }
  if (a.kind === 'akademisyen') {
    const verim = Math.round(dersYukuVerimi(state, a) * 100);
    const asistan = asistanlari(state, a.id).length;
    const ders = (a.verdigiDersler ?? []).length;
    let html = `<span class="baslik">${RANK_LABEL[a.rank]} ${a.ad} (${a.yas}) · ${ALAN_META[a.alan].emoji} ${ALAN_META[a.alan].ad}</span>`;
    const m = Math.round(a.memnuniyet);
    html += cip(`${m >= 65 ? '😊' : m >= 45 ? '😐' : '😠'} Memnuniyet ${miniBar(m / 100, m >= 65 ? '#46b45e' : m >= 45 ? '#e8b931' : '#d9534f')} %${m}`, m < 45);
    html += cip(`📚 Ders: ${ders}/${DERS_LIMIT} · 👥 Asistan: ${asistan}`);
    html += cip(`⚡ Yük verimi ${miniBar(verim / 100, verim >= 90 ? '#46b45e' : verim >= 75 ? '#e8b931' : '#d9534f')} %${verim} — kalite ve araştırma çarpanı`, verim < 75);
    html += cip(`🎓 Eğitim: ${Math.round(a.egitim)} · 🔬 Araştırma: ${Math.round(a.arastirma)}`);
    html += cip(`📄 Makale: ${a.makale} (${a.uluslararasiMakale} 🌍)`);
    if (a.yetistirdigi > 0) html += cip(`🌳 Yetiştirdiği doktora: ${a.yetistirdigi}`);
    if (a.mezunumuz) html += cip(`🎓 Kendi mezunumuz${a.danismanAd ? ` — danışmanı ${a.danismanAd}` : ''}`);
    return html;
  }
  const rol = a.kind === 'asci' ? 'Aşçı' : a.kind === 'tamirci' ? '🔧 Tamirci' : 'Temizlikçi';
  const beceri = Math.round(a.beceri ?? 40);
  return `<span class="baslik">${rol} ${a.ad}</span>`
    + cip(`🛠 Beceri ${miniBar(beceri / 100, beceri >= 70 ? '#46b45e' : '#e8b931')} ${beceri} — çalıştıkça ustalaşır (hız ×${(0.7 + beceri / 125).toFixed(2)})`)
    + cip(`Maaş: ${formatMoney(a.maas)}/gün`);
}

function setStat(anahtar: string, metin: string): void {
  const el = topEl.querySelector<HTMLElement>(`[data-st="${anahtar}"]`);
  if (el && el.textContent !== metin) el.textContent = metin;
}

let sonBildirimHtml = '';
let sonNoticeSayi = -1;

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
  setStat('yemek', `🍲 ${Math.floor(state.yemekStok)}`);
  setStat('kutuphane', `📚 Ktp. Sv. ${libraryLevel(state)}`);
  setStat('cazibe', `✨ ${cazibePuani(state)}`);
  setStat('sira', `🏆 ${oyuncuSirasi(state)}/${state.rakipler.length + 1}`);
  // altyapı/kriz uyarısı: yalnız sorun varken görünür
  const altyapiEl = topEl.querySelector<HTMLElement>('[data-st="altyapi"]');
  if (altyapiEl) {
    const uyarilar: string[] = [];
    if (state.altyapi.gucKesinti) uyarilar.push('⚡');
    if (state.altyapi.suKesinti) uyarilar.push('💧');
    if (state.yanginlar.length > 0) uyarilar.push('🔥');
    if (state.salgin) uyarilar.push('🤒');
    if (uyarilar.length > 0) {
      altyapiEl.style.display = '';
      altyapiEl.textContent = `⚠️ ${uyarilar.join('')}`;
      altyapiEl.style.color = '#f4a09c';
    } else {
      altyapiEl.style.display = 'none';
    }
  }
  const sinavHaftasi = donemGunu(state.gun) > DONEM_GUN - 3;
  setStat('tarih-metin', `${MEVSIM_META[mevsim(state.gun)].emoji} Yıl ${yil(state.gun)} ${donemAdi(state.gun)} · ${HAFTA_KISA[haftaGunu(state.gun)]} ${donemGunu(state.gun)}/${DONEM_GUN} · ${formatClock(state.dakika)}${tatilMi(state.gun) ? ' · 🏖 TATİL' : ''}${sinavHaftasi ? ' · 📝 SINAV' : ''}${state.yksBekliyor ? ' · 🎓 YKS' : ''}`);
  const donemOran = ((donemGunu(state.gun) - 1) * 1440 + state.dakika) / (DONEM_GUN * 1440);
  const bar = topEl.querySelector<HTMLElement>('[data-st="donem-bar"]');
  if (bar) bar.style.width = `${Math.round(donemOran * 100)}%`;
  // takvim işareti: bu dönemde YÖK denetimi varsa çubukta 🏛 görünür
  const isaret = topEl.querySelector<HTMLElement>('[data-st="takvim-isaret"]');
  if (isaret) {
    const denetimGunu = sonrakiDenetimGunu(state);
    const donemBasi = state.gun - donemGunu(state.gun) + 1;
    if (denetimGunu >= donemBasi && denetimGunu < donemBasi + DONEM_GUN) {
      isaret.textContent = '🏛';
      isaret.style.left = `${Math.round((((denetimGunu - donemBasi) + 0.5) / DONEM_GUN) * 100)}%`;
      isaret.title = `YÖK akreditasyon denetimi: gün ${denetimGunu} (karne: 📊 Raporlar)`;
      isaret.style.display = 'block';
    } else {
      isaret.style.display = 'none';
    }
  }
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
    // yeni bildirim(ler) geldiyse en yenisinin türüne göre ses çal (ilk çizim hariç)
    if (sonNoticeSayi >= 0 && state.notices.length > sonNoticeSayi && son.length > 0) {
      const yeni = son[son.length - 1];
      if (yeni.kind === 'kotu' && (state.yanginlar.length > 0 || state.altyapi.gucKesinti)) sesUyari();
      else sesBildirim(yeni.kind);
    }
  }
  sonNoticeSayi = state.notices.length;

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
