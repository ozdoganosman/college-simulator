/**
 * Tam ekran törenler: YKS Yerleştirme Sonuçları ve Akademik Yıl Ödülleri.
 * state.yerlestirme / state.yilSonu dolduğunda otomatik açılır; tören açıkken
 * simülasyon durur. Yıl sonu töreni öncelıklidir (önce ödüller, sonra YKS).
 */
import { GameState } from '../core/types';
import { formatMoney } from '../core/util';
import { openPanel } from './panels';
import type { PanelName } from './panels';

let root: HTMLElement | null = null;
let acikMi = false;

export function initCeremony(): void {
  root = document.getElementById('toren-root');
}

export function isCeremonyOpen(): boolean {
  return acikMi;
}

/** main.ts her çeyrek saniyede çağırır; bekleyen tören varsa başlatır. */
export function checkCeremony(state: GameState): void {
  if (acikMi) return;
  if (state.oyunBitti) openGameOver(state);
  else if (state.yilSonu) openYilSonu(state);
  else if (state.yerlestirme) open(state);
}

/** Oyun sonu (kayyum) ekranı — kapatılamaz, tek çıkış yeni oyun. */
let gameOverAcik = false;
function openGameOver(state: GameState): void {
  if (!root || gameOverAcik) return;
  acikMi = true;
  gameOverAcik = true;

  const mezun = state.toplamMezun;
  const yilNo = Math.floor((state.gun - 1) / 40) + 1;
  const basarim = state.basarimlar.length;
  root.innerHTML = `
    <div class="toren-perde" style="background:radial-gradient(ellipse at 50% 30%, rgba(70,20,20,0.96), rgba(12,6,6,0.98))">
      <div class="toren-kart">
        <div class="toren-ust" style="color:#f4a09c">⚖️ YÖK KAYYUM ATADI</div>
        <div class="toren-yil" style="color:#f4a09c">OYUN BİTTİ</div>
        <div class="toren-ozet" style="animation-delay:0.5s">
          ${state.oyunBitti ?? ''}
          <br><br>📊 <b>${yilNo}</b> yıl dayandın · 🎓 <b>${mezun}</b> mezun verdin ·
          🏅 <b>${basarim}</b> başarım kazandın · sıralama geçmişi:
          <b>${state.siraGecmisi.join(' → ') || '—'}</b>
        </div>
        <button class="menu-btn toren-btn" id="toren-yenioyun" style="animation-delay:1.2s">
          🔄 Yeni Oyuna Başla
        </button>
      </div>
    </div>`;
  root.classList.add('acik');
  document.getElementById('toren-yenioyun')?.addEventListener('click', () => {
    // kaydı temizle ve baştan başla — kayyum sonrası dönüş yok
    try { localStorage.removeItem('universite-simulatoru-save'); } catch { /* yoksay */ }
    location.reload();
  });
}

function sira(n: number): string {
  return n > 0 ? n.toLocaleString('tr-TR') : '—';
}

/** Kapat düğmesi + Esc/Enter bağlama ve sayaç animasyonları (ortak). */
function torenKur(state: GameState, onKapat: () => void): void {
  if (!root) return;
  root.classList.add('acik');

  // sayaç animasyonları: satır göründüğünde 0'dan hedefe say
  for (const el of root.querySelectorAll<HTMLElement>('.sayac')) {
    const hedef = Number(el.dataset.hedef ?? '0');
    const gecikme = Number(el.dataset.gecikme ?? '0') * 1000;
    const sure = 900;
    setTimeout(() => {
      const t0 = performance.now();
      const adim = (t: number) => {
        const k = Math.min(1, (t - t0) / sure);
        el.textContent = Math.round(hedef * (1 - Math.pow(1 - k, 3))).toLocaleString('tr-TR');
        if (k < 1) requestAnimationFrame(adim);
      };
      requestAnimationFrame(adim);
    }, gecikme + 200);
  }

  const kapat = () => {
    onKapat();
    acikMi = false;
    root!.classList.remove('acik');
    root!.innerHTML = '';
    document.removeEventListener('keydown', escKapat);
    if (state.hiz === 0) state.hiz = 1;
  };
  const escKapat = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.stopPropagation(); // genel Esc kısayolu (menü aç/kapat) tetiklenmesin
      kapat();
    }
  };
  document.getElementById('toren-kapat')?.addEventListener('click', kapat);
  document.addEventListener('keydown', escKapat); // güvence: buton görünmese bile geçilebilsin
}

// --- YKS Yerleştirme töreni ----------------------------------------------------

function open(state: GameState): void {
  if (!root || !state.yerlestirme) return;
  acikMi = true;
  const y = state.yerlestirme;

  const satirlar = y.satirlar.map((s, i) => {
    const gecikme = 1.4 + i * 0.55; // başlıktan sonra sırayla gel
    let durum: string;
    if (s.iptal) {
      durum = '<span class="toren-rozet iptal">KONTENJAN VERİLMEDİ</span>';
    } else if ((s.geriCevrilen ?? 0) > 0) {
      durum = `<span class="toren-rozet iptal" title="İstekli aday vardı ama derslik koltuğu yetmedi — derslik/sıra ekle!">DERSLİK YETMEDİ — ${s.geriCevrilen} ADAY ÇEVRİLDİ</span>`;
    } else if (s.doldu) {
      durum = '<span class="toren-rozet doldu">KONTENJAN DOLDU! 🎉</span>';
    } else if (s.yerlesen === 0) {
      durum = '<span class="toren-rozet bos">HİÇ YERLEŞEN YOK 😢</span>';
    } else {
      durum = `<span class="toren-rozet yari" title="Talep bu kadarını doldurdu — prestij, cazibe ve burs talebi büyütür">${s.kontenjan - s.yerlesen} KONTENJAN BOŞ</span>`;
    }
    const bursKirilim = y.ucret > 0 && s.yerlesen > 0
      ? `<small title="Burs dağılımı: tam burslu ücretsiz okur, %50 yarısını, ücretli tamamını öder">🎖 ${s.tam ?? 0} tam · 🎗 ${s.yari ?? 0} %50 · 💳 ${s.ucretli ?? 0} ücretli</small>`
      : '';
    return `
      <div class="toren-satir" style="animation-delay:${gecikme}s">
        <span class="toren-renk" style="background:${s.renk}"></span>
        <span class="toren-bolum">${s.bolumAd}</span>
        <span class="toren-veri">
          <b class="sayac" data-hedef="${s.yerlesen}" data-gecikme="${gecikme}">0</b>/${s.kontenjan} yerleşti
          <small>talep: ${s.talep.toLocaleString('tr-TR')}</small>
          ${bursKirilim}
        </span>
        <span class="toren-veri">
          <small>En yüksek sıra</small><b>${sira(s.tavanSira)}</b>
        </span>
        <span class="toren-veri">
          <small>En düşük sıra (taban)</small><b>${sira(s.tabanSira)}</b>
        </span>
        ${durum}
      </div>`;
  }).join('');

  const ozetGecikme = 1.4 + y.satirlar.length * 0.55 + 0.4;

  // Tercih anketi: öğrenciler neden bizi seçti (gerçek talep çarpanlarından).
  // Satırlar TIKLANABİLİR: o etkeni büyütebileceğin panel açılır.
  const anket = (y.anket ?? []).length > 0 && y.toplamYerlesen > 0
    ? `<div class="toren-ozet" style="animation-delay:${ozetGecikme}s;text-align:left;max-width:520px;margin:8px auto 0">
        <div style="text-align:center;margin-bottom:6px"><b>🗳️ Yeni öğrenciler neden bizi seçti?</b>
          <br><small style="opacity:0.75">💡 bir nedene tıkla — geliştirebileceğin panel açılsın</small></div>
        ${(y.anket ?? []).map((a2) => `<div ${a2.panel ? `data-anket-panel="${a2.panel}"` : ''}
          style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:13px${a2.panel ? ';cursor:pointer' : ''}"
          ${a2.panel ? 'title="Tıkla: bu etkeni büyütebileceğin panel açılır" onmouseover="this.style.background=\'rgba(232,198,106,0.12)\'" onmouseout="this.style.background=\'\'"' : ''}>
          <span style="flex:1">${a2.neden}${a2.panel ? ' <span style="opacity:0.55">↗</span>' : ''}</span>
          <span style="width:130px;background:#2c3140;border-radius:4px;height:8px;overflow:hidden"><span style="display:block;width:${a2.oran}%;height:100%;background:#e8c66a"></span></span>
          <b style="width:38px;text-align:right">%${a2.oran}</b>
        </div>`).join('')}
      </div>`
    : '';

  root.innerHTML = `
    <div class="toren-perde">
      ${konfetiHtml(y.toplamYerlesen > 0 ? 70 : 0, ozetGecikme)}
      <div class="toren-kart">
        <div class="toren-ust">📢 YKS YERLEŞTİRME SONUÇLARI</div>
        <div class="toren-yil">${y.yil}. Yıl</div>
        <div class="toren-liste">${satirlar}</div>
        <div class="toren-ozet" style="animation-delay:${ozetGecikme}s">
          Üniversitemize bu yıl <b class="sayac" data-hedef="${y.toplamYerlesen}" data-gecikme="${ozetGecikme}">0</b> öğrenci yerleşti
          · Devlet ödeneği: <b>${formatMoney(y.odenek)}</b>
          ${y.ucret > 0 ? ` · Kayıt ücreti: <b>${formatMoney(y.ucret)}/yıl</b>` : ' · <b>Ücretsiz eğitim</b>'}
        </div>
        ${anket}
        <button class="menu-btn toren-btn" id="toren-kapat" style="animation-delay:${ozetGecikme + 0.5}s">
          🎓 Dersler Başlasın!
        </button>
      </div>
    </div>`;

  torenKur(state, () => { state.yerlestirme = null; });

  // Anket satırı tıklaması: töreni kapat + ilgili paneli aç (yeni oyuncu rehberi)
  for (const el of root.querySelectorAll<HTMLElement>('[data-anket-panel]')) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = el.dataset.anketPanel as PanelName | undefined;
      document.getElementById('toren-kapat')?.click();
      if (p) openPanel(p);
    });
  }
}

// --- Akademik Yıl Ödülleri töreni ------------------------------------------------

function openYilSonu(state: GameState): void {
  if (!root || !state.yilSonu) return;
  acikMi = true;
  const y = state.yilSonu;

  // sıralama: ilk 5 + (oyuncu ilk 5'te değilse) oyuncunun bulunduğu kesit
  const oyuncuIdx = y.siralama.findIndex((s) => s.oyuncu);
  const gosterilecek: { idx: number; atla: boolean }[] = [];
  for (let i = 0; i < Math.min(5, y.siralama.length); i++) gosterilecek.push({ idx: i, atla: false });
  if (oyuncuIdx >= 5) {
    gosterilecek.push({ idx: oyuncuIdx, atla: oyuncuIdx > 5 });
  }

  let g = 1.2;
  const siraSatirlari = gosterilecek.map(({ idx, atla }) => {
    const s = y.siralama[idx];
    const gecikme = (g += 0.45);
    const madalya = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    let ok = '';
    if (s.oyuncu && y.oncekiSira > 0) {
      const fark = y.oncekiSira - y.sira;
      if (fark > 0) ok = `<span class="toren-rozet doldu">▲ ${fark} YÜKSELDİ</span>`;
      else if (fark < 0) ok = `<span class="toren-rozet iptal">▼ ${-fark} DÜŞTÜ</span>`;
      else ok = '<span class="toren-rozet yari">SIRASINI KORUDU</span>';
    } else if (s.oyuncu) {
      ok = '<span class="toren-rozet yari">İLK SIRALAMASI</span>';
    }
    return `${atla ? '<div class="toren-atla">⋮</div>' : ''}
      <div class="toren-satir${s.oyuncu ? ' vurgu' : ''}" style="animation-delay:${gecikme}s">
        <span class="toren-sira">${madalya}</span>
        <span class="toren-bolum">${s.oyuncu ? '🎓 ' : ''}${s.ad}</span>
        <span class="toren-veri"><small>Skor</small><b class="sayac" data-hedef="${s.skor}" data-gecikme="${gecikme}">0</b></span>
        <span class="toren-veri"><small>Prestij</small><b>${s.prestij}</b></span>
        <span class="toren-veri"><small>Yayın</small><b>${s.yayin}</b></span>
        ${ok}
      </div>`;
  }).join('');

  const odul = (emoji: string, baslik: string, ad: string, detay: string) => {
    const gecikme = (g += 0.55);
    return `<div class="toren-satir" style="animation-delay:${gecikme}s">
      <span class="toren-sira">${emoji}</span>
      <span class="toren-bolum"><small style="color:#c9a227">${baslik}</small><br><b>${ad}</b></span>
      <span class="toren-veri" style="flex:1"><small>${detay}</small></span>
    </div>`;
  };
  let oduller = '';
  if (y.yilinHocasi) oduller += odul('👩‍🏫', 'YILIN HOCASI', y.yilinHocasi.ad, y.yilinHocasi.detay);
  if (y.yilinGirisimcisi) oduller += odul('💰', 'YILIN GİRİŞİMCİ ÖĞRENCİSİ', y.yilinGirisimcisi.ad, y.yilinGirisimcisi.detay);
  if (y.yilinBulusu) oduller += odul('💥', 'YILIN BULUŞU', `"${y.yilinBulusu}"`, 'bilim dünyasında ses getirdi');
  if (oduller === '') {
    oduller = `<div class="toren-satir" style="animation-delay:${(g += 0.55)}s">
      <span class="toren-veri"><small>Bu yıl ödüle aday çıkmadı — kadroyu ve öğrencileri geliştir!</small></span></div>`;
  }

  const ozetGecikme = g + 0.6;
  const konfetiVar = y.sira <= 3 || (y.oncekiSira > 0 && y.sira < y.oncekiSira);

  root.innerHTML = `
    <div class="toren-perde">
      ${konfetiHtml(konfetiVar ? 80 : 0, ozetGecikme)}
      <div class="toren-kart">
        <div class="toren-ust">🏆 AKADEMİK YIL ÖDÜLLERİ</div>
        <div class="toren-yil">${y.yil}. Yıl · Türkiye Üniversite Sıralaması: <b>${y.sira}/${y.siralama.length}</b></div>
        <div class="toren-liste">${siraSatirlari}</div>
        <div class="toren-liste" style="margin-top:6px">${oduller}</div>
        <div class="toren-ozet" style="animation-delay:${ozetGecikme}s">
          🎓 <b class="sayac" data-hedef="${y.mezun}" data-gecikme="${ozetGecikme}">0</b> mezun ·
          📄 <b>${y.yayin}</b> yayın ·
          📖 GNO ort. <b>${y.ortGno === null ? '—' : y.ortGno.toFixed(2)}</b> ·
          💰 öğrenci sermayesi <b>${formatMoney(y.toplamSermaye)}</b>
          ${y.siraPrestij > 0 ? `<br>🏆 Sıralama ödülü: <b>+${y.siraPrestij} prestij</b>` : ''}
        </div>
        <button class="menu-btn toren-btn" id="toren-kapat" style="animation-delay:${ozetGecikme + 0.5}s">
          🎉 Yeni Yıla Başla!
        </button>
      </div>
    </div>`;

  torenKur(state, () => { state.yilSonu = null; });
}

/** Basit CSS konfetisi: rastgele renk/konum/gecikmeli düşen parçalar. */
function konfetiHtml(adet: number, baslamaSn: number): string {
  if (adet === 0) return '';
  const renkler = ['#ffd166', '#ef476f', '#06d6a0', '#4a7bd4', '#f78c6b', '#c77dff'];
  let html = '';
  for (let i = 0; i < adet; i++) {
    const sol = (i * 137.5) % 100; // altın açı — düzgün dağılım
    const gecikme = baslamaSn + ((i * 73) % 100) / 55;
    const sure = 2.6 + ((i * 41) % 100) / 60;
    const renk = renkler[i % renkler.length];
    const don = ((i * 97) % 720) - 360;
    html += `<span class="konfeti" style="left:${sol}vw;background:${renk};animation-delay:${gecikme}s;animation-duration:${sure}s;--don:${don}deg"></span>`;
  }
  return html;
}
