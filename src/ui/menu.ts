/**
 * Ana menü + oyun içi duraklatma menüsü + kayıt/yükleme slotları + seçenekler.
 * Menü açıkken simülasyon durur (main.ts isMenuOpen kontrol eder).
 */
import { GameState } from '../core/types';
import { formatMoney } from '../core/util';
import { AYARLAR, ayarlariKaydet } from '../core/settings';
import { SLOT_SAYISI, slotSil, slotaKaydet, slottanYukle, tumSlotlar } from '../game/saves';
import { loadGame } from '../game/state';
import { invalidateGround } from './renderer';
import { closePanel } from './panels';

type MenuMode = 'ana' | 'oyunici' | 'yukle' | 'kaydet' | 'secenekler' | 'zorluk';

interface MenuCtx {
  getState: () => GameState;
  yeniOyun: (zorluk: GameState['zorluk']) => void;
  yukleState: (s: GameState) => void;
}

let ctx: MenuCtx | null = null;
let root: HTMLElement | null = null;
let mode: MenuMode | null = null;
/** yukle/kaydet/secenekler'den geri dönülecek menü */
let geriMode: 'ana' | 'oyunici' = 'ana';

export function isMenuOpen(): boolean {
  return mode !== null;
}

export function initMenu(c: MenuCtx): void {
  ctx = c;
  root = document.getElementById('menu-root');
  root?.addEventListener('click', onClick);
  document.addEventListener('toggle-menu', () => {
    if (mode === null) openInGameMenu();
    else if (mode === 'oyunici') kapat();
    // ana menüdeyken Esc bir şey yapmaz (oyuna dönecek kayıt olmayabilir)
  });
}

export function openMainMenu(): void {
  geriMode = 'ana';
  mode = 'ana';
  closePanel();
  render();
}

export function openInGameMenu(): void {
  geriMode = 'oyunici';
  mode = 'oyunici';
  closePanel();
  render();
}

function kapat(): void {
  mode = null;
  render();
}

function onClick(e: Event): void {
  if (!(e.target instanceof Element) || !ctx) return;
  const hedef = e.target.closest<HTMLElement>('[data-menu]');
  if (!hedef) return;
  const eylem = hedef.dataset.menu ?? '';
  const slot = Number(hedef.dataset.slot ?? '0');

  switch (eylem) {
    case 'devam-et': {
      // ana menüden: otomatik kayıt zaten yüklü durumda — sadece menüyü kapat
      kapat();
      break;
    }
    case 'devam-oyun':
      kapat();
      break;
    case 'yeni-oyun': {
      const st = ctx.getState();
      const ilerlemeVar = st.gun > 1 || st.rooms.length > 0;
      if (geriMode === 'oyunici' || ilerlemeVar) {
        if (!confirm('Yeni oyun başlatılsın mı? Kaydedilmemiş ilerleme kaybolur (slot kayıtları durur).')) break;
      }
      mode = 'zorluk'; // önce zorluk seçilir
      render();
      break;
    }
    case 'zorluk-sec': {
      const zorluk = (hedef.dataset.zorluk ?? 'normal') as GameState['zorluk'];
      ctx.yeniOyun(zorluk);
      kapat();
      break;
    }
    case 'yukle-menu':
      mode = 'yukle';
      render();
      break;
    case 'kaydet-menu':
      mode = 'kaydet';
      render();
      break;
    case 'secenekler':
      mode = 'secenekler';
      render();
      break;
    case 'geri':
      mode = geriMode;
      render();
      break;
    case 'ana-menu':
      openMainMenu();
      break;
    case 'slot-kaydet': {
      if (slotaKaydet(ctx.getState(), slot)) {
        render(); // meta yenilensin
      } else {
        alert('Kayıt başarısız — tarayıcı depolaması dolu olabilir.');
      }
      break;
    }
    case 'slot-yukle': {
      const s = slottanYukle(slot);
      if (s) {
        ctx.yukleState(s);
        kapat();
      } else {
        alert('Bu slot okunamadı.');
      }
      break;
    }
    case 'otokayit-yukle': {
      const s = loadGame();
      if (s) {
        ctx.yukleState(s);
        kapat();
      } else {
        alert('Otomatik kayıt bulunamadı.');
      }
      break;
    }
    case 'slot-sil':
      if (confirm(`Slot ${slot} silinsin mi?`)) {
        slotSil(slot);
        render();
      }
      break;
    case 'ayar': {
      const ad = hedef.dataset.ad as keyof typeof AYARLAR;
      AYARLAR[ad] = !AYARLAR[ad];
      ayarlariKaydet();
      if (ad === 'dekor') invalidateGround();
      render();
      break;
    }
    default:
      break;
  }
}

// --- Görünüm -----------------------------------------------------------------

function buton(etiket: string, eylem: string, buyuk = true, ekstra = ''): string {
  return `<button class="menu-btn${buyuk ? '' : ' kucuk'}" data-menu="${eylem}" ${ekstra}>${etiket}</button>`;
}

function render(): void {
  if (!root) return;
  if (mode === null) {
    root.innerHTML = '';
    root.classList.remove('acik');
    return;
  }
  root.classList.add('acik');

  let icerik = '';
  if (mode === 'ana') {
    const kayitVar = loadGame() !== null;
    icerik = `
      <div class="menu-baslik">🎓 Üniversite Simülatörü</div>
      <div class="menu-alt">Kampüsünü kur · Bölümler aç · Bilime yön ver</div>
      ${kayitVar ? buton('▶ Devam Et', 'devam-et') : ''}
      ${buton('✨ Yeni Oyun', 'yeni-oyun')}
      ${buton('📂 Oyun Yükle', 'yukle-menu')}
      ${buton('⚙️ Seçenekler', 'secenekler')}
    `;
  } else if (mode === 'oyunici') {
    icerik = `
      <div class="menu-baslik kucuk">⏸ Duraklatıldı</div>
      ${buton('▶ Oyuna Dön', 'devam-oyun')}
      ${buton('💾 Oyun Kaydet', 'kaydet-menu')}
      ${buton('📂 Oyun Yükle', 'yukle-menu')}
      ${buton('⚙️ Seçenekler', 'secenekler')}
      ${buton('✨ Yeni Oyun', 'yeni-oyun')}
      ${buton('🏠 Ana Menü', 'ana-menu')}
    `;
  } else if (mode === 'zorluk') {
    const kart = (z: string, ad: string, detay: string) => `
      <button class="menu-btn" data-menu="zorluk-sec" data-zorluk="${z}" style="text-align:left">
        <b>${ad}</b><br><small style="font-weight:400;opacity:0.85">${detay}</small>
      </button>`;
    icerik = `
      <div class="menu-baslik kucuk">Zorluk Seç</div>
      <div class="menu-alt">İflas limiti: bütçe bu kadar gün üst üste borçta kalırsa YÖK kayyum atar — oyun biter!</div>
      ${kart('kolay', '🟢 Kolay — Vakıf Desteği', '₺4.000.000 başlangıç · 20 prestij · iflas limiti 45 gün')}
      ${kart('normal', '🟡 Normal — Devlet Üniversitesi', '₺2.500.000 başlangıç · 0 prestij · iflas limiti 30 gün')}
      ${kart('zor', '🔴 Zor — Taşra Kampüsü', '₺1.500.000 başlangıç · 0 prestij · iflas limiti 20 gün · hocalar daha çabuk küser')}
      ${buton('← Geri', 'geri', false)}
    `;
  } else if (mode === 'kaydet' || mode === 'yukle') {
    const kaydetMi = mode === 'kaydet';
    const satirlar = tumSlotlar().map((m) => {
      const bilgi = m.bos
        ? '<span class="slot-bos">— boş —</span>'
        : `<b>Yıl ${m.yil} ${m.donem}</b> · Gün ${m.gun} · ${formatMoney(m.para!)} · 🎓 ${m.ogrenci} · ⭐ ${m.prestij}
           <span class="slot-zaman">${new Date(m.zaman!).toLocaleString('tr-TR')}</span>`;
      const eylemler = kaydetMi
        ? `<button class="menu-btn kucuk" data-menu="slot-kaydet" data-slot="${m.slot}">${m.bos ? 'Kaydet' : 'Üzerine Kaydet'}</button>`
        : `<button class="menu-btn kucuk" data-menu="slot-yukle" data-slot="${m.slot}" ${m.bos ? 'disabled' : ''}>Yükle</button>`;
      const sil = m.bos ? '' : `<button class="menu-btn kucuk tehlike" data-menu="slot-sil" data-slot="${m.slot}">Sil</button>`;
      return `<div class="slot-satir"><span class="slot-ad">Slot ${m.slot}</span><span class="slot-bilgi">${bilgi}</span><span class="slot-eylem">${eylemler}${sil}</span></div>`;
    }).join('');

    const otoKayit = !kaydetMi && loadGame() !== null
      ? `<div class="slot-satir"><span class="slot-ad">Oto</span><span class="slot-bilgi">Gün sonu otomatik kaydı</span>
         <span class="slot-eylem"><button class="menu-btn kucuk" data-menu="otokayit-yukle">Yükle</button></span></div>`
      : '';

    icerik = `
      <div class="menu-baslik kucuk">${kaydetMi ? '💾 Oyun Kaydet' : '📂 Oyun Yükle'}</div>
      <div class="slot-liste">${otoKayit}${satirlar}</div>
      ${buton('← Geri', 'geri')}
    `;
  } else if (mode === 'secenekler') {
    const satir = (etiket: string, aciklama: string, ad: keyof typeof AYARLAR) => `
      <div class="ayar-satir">
        <span><b>${etiket}</b><br><small>${aciklama}</small></span>
        <button class="menu-btn kucuk ${AYARLAR[ad] ? 'acik-ayar' : ''}" data-menu="ayar" data-ad="${ad}">
          ${AYARLAR[ad] ? 'Açık ✔' : 'Kapalı ✖'}
        </button>
      </div>`;
    icerik = `
      <div class="menu-baslik kucuk">⚙️ Seçenekler</div>
      <div class="ayar-liste">
        ${satir('Otomatik kayıt', 'Her oyun günü sonunda otomatik kaydeder', 'otomatikKayit')}
        ${satir('Gündüz/gece ışığı', 'Şafak, alacakaranlık ve gece renk tonları', 'isikDongusu')}
        ${satir('Izgara çizgileri', 'Yakınlaşınca kare çizgilerini göster', 'izgara')}
        ${satir('Çevre dekoru', 'Çimenlerde ağaç ve çalılar', 'dekor')}
      </div>
      ${buton('← Geri', 'geri')}
    `;
  }

  root.innerHTML = `<div class="menu-kart">${icerik}</div>`;
}
