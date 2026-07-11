/**
 * YKS Yerleştirme Sonuçları töreni — yıl başında tam ekran, animasyonlu açıklama.
 * state.yerlestirme dolduğunda otomatik açılır; tören açıkken simülasyon durur.
 */
import { GameState } from '../core/types';
import { formatMoney } from '../core/util';

let root: HTMLElement | null = null;
let acikMi = false;

export function initCeremony(): void {
  root = document.getElementById('toren-root');
}

export function isCeremonyOpen(): boolean {
  return acikMi;
}

/** main.ts her çeyrek saniyede çağırır; bekleyen sonuç varsa töreni başlatır. */
export function checkCeremony(state: GameState): void {
  if (!acikMi && state.yerlestirme) open(state);
}

function sira(n: number): string {
  return n > 0 ? n.toLocaleString('tr-TR') : '—';
}

function open(state: GameState): void {
  if (!root || !state.yerlestirme) return;
  acikMi = true;
  const y = state.yerlestirme;

  const satirlar = y.satirlar.map((s, i) => {
    const gecikme = 1.4 + i * 0.55; // başlıktan sonra sırayla gel
    let durum: string;
    if (s.iptal) {
      durum = '<span class="toren-rozet iptal">KONTENJAN VERİLMEDİ</span>';
    } else if (s.doldu) {
      durum = '<span class="toren-rozet doldu">KONTENJAN DOLDU! 🎉</span>';
    } else if (s.yerlesen === 0) {
      durum = '<span class="toren-rozet bos">HİÇ YERLEŞEN YOK 😢</span>';
    } else {
      durum = `<span class="toren-rozet yari">${s.kontenjan - s.yerlesen} KONTENJAN BOŞ</span>`;
    }
    return `
      <div class="toren-satir" style="animation-delay:${gecikme}s">
        <span class="toren-renk" style="background:${s.renk}"></span>
        <span class="toren-bolum">${s.bolumAd}</span>
        <span class="toren-veri">
          <b class="sayac" data-hedef="${s.yerlesen}" data-gecikme="${gecikme}">0</b>/${s.kontenjan} yerleşti
          <small>talep: ${s.talep.toLocaleString('tr-TR')}</small>
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
        </div>
        <button class="menu-btn toren-btn" id="toren-kapat" style="animation-delay:${ozetGecikme + 0.5}s">
          🎓 Dersler Başlasın!
        </button>
      </div>
    </div>`;

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
        el.textContent = String(Math.round(hedef * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(adim);
      };
      requestAnimationFrame(adim);
    }, gecikme + 200);
  }

  document.getElementById('toren-kapat')?.addEventListener('click', () => {
    state.yerlestirme = null;
    acikMi = false;
    root!.classList.remove('acik');
    root!.innerHTML = '';
    if (state.hiz === 0) state.hiz = 1; // dersler başlasın!
  });
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
