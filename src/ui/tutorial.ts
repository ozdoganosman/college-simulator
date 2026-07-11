/**
 * Görev tabanlı öğretici: her adımın otomatik tamamlanma kontrolü vardır;
 * adım bitince bildirim düşer ve sıradaki görev gösterilir.
 */
import { GameState, WALL_DOOR, WALL_SOLID } from '../core/types';
import { validRooms } from '../core/grid';
import { notify } from '../game/state';

interface TutorialStep {
  baslik: string;
  /** HTML — araç/panel adları <b> ile vurgulanır */
  detay: string;
  kontrol: (s: GameState) => { tamam: boolean; ilerleme?: string };
}

const STEPS: TutorialStep[] = [
  {
    baslik: 'Zemin döşe',
    detay: 'Alttaki <b>🧱 İnşaat</b> menüsünden <b>Beton Zemin</b> seç ve çimin üzerine bir dikdörtgen <b>sürükle</b> (en az 20 kare). Kamera: sağ tık sürükle / WASD, yakınlaşma: tekerlek.',
    kontrol: (s) => {
      let n = 0;
      for (const f of s.floor) if (f !== null) n++;
      return { tamam: n >= 20, ilerleme: `${Math.min(n, 20)}/20 kare` };
    },
  },
  {
    baslik: 'Duvar ör ve kapı koy',
    detay: '<b>🧱 İnşaat → Duvar</b> ile zeminin çevresine sürükleyerek çerçeve duvar ör. Sonra <b>Kapı</b> aracını seç ve duvarın bir karesine <b>tıkla</b> — kapısız odaya kimse giremez!',
    kontrol: (s) => {
      let duvar = 0, kapi = 0;
      for (const w of s.wall) {
        if (w === WALL_SOLID) duvar++;
        else if (w === WALL_DOOR) kapi++;
      }
      return { tamam: duvar >= 12 && kapi >= 1, ilerleme: `${duvar} duvar, ${kapi} kapı` };
    },
  },
  {
    baslik: 'Derslik bölgesi ata',
    detay: '<b>🏷️ Odalar → Derslik</b> seç ve duvarların İÇİNDEKİ alanı sürükleyerek işaretle (en az 12 kare). Oda şimdilik ⚠ geçersiz görünecek — sonraki adımda tamamlayacağız.',
    kontrol: (s) => ({ tamam: s.rooms.some((r) => r.type === 'derslik') }),
  },
  {
    baslik: 'Dersliği donat',
    detay: '<b>🪑 Eşyalar</b> menüsünden dersliğin içine <b>1 Yazı Tahtası</b> ve <b>4 Okul Sırası</b> yerleştir. Eksik kalanı görmek için <b>🖱️ Seç</b> aracıyla odaya tıkla — alt çubukta ✔/✖ listesi çıkar.',
    kontrol: (s) => ({ tamam: validRooms(s, 'derslik').length >= 1 }),
  },
  {
    baslik: 'Akademisyen ofisi kur',
    detay: 'Yeni bir kapalı alan yap (ya da mevcut binaya oda ekle): <b>Odalar → Akademisyen Ofisi</b> + içine <b>Çalışma Masası</b>. Her masa 1 akademisyene kadro açar.',
    kontrol: (s) => ({ tamam: validRooms(s, 'ofis').length >= 1 }),
  },
  {
    baslik: 'Tuvalet yap',
    detay: '<b>Odalar → Tuvalet</b> (min 4 kare) + içine <b>Klozet</b> ve <b>Lavabo</b>. Tuvaleti olmayan kampüste öğrenciler hızla mutsuzlaşır ve okulu bırakır!',
    kontrol: (s) => ({ tamam: validRooms(s, 'tuvalet').length >= 1 }),
  },
  {
    baslik: 'KPSS ile 2 akademisyen al',
    detay: '<b>👩‍🏫 Kadro</b> panelini aç → <b>KPSS / İlan Havuzu</b> tablosundan iki adayı <b>İşe Al</b>. Ucuz ama tecrübesizler; sonra rakip üniversitelerden yıldız <b>transfer</b> de edebilirsin.',
    kontrol: (s) => {
      const n = s.agents.filter((a) => a.kind === 'akademisyen').length;
      return { tamam: n >= 2, ilerleme: `${Math.min(n, 2)}/2 akademisyen` };
    },
  },
  {
    baslik: 'İkinci dersliği kur',
    detay: 'Bölüm açmak için <b>2 geçerli derslik</b> gerekir. Bir derslik daha yap: zemin + duvar + kapı + oda ataması + tahta ve 4 sıra.',
    kontrol: (s) => {
      const n = validRooms(s, 'derslik').length + validRooms(s, 'amfi').length;
      return { tamam: n >= 2, ilerleme: `${Math.min(n, 2)}/2 derslik` };
    },
  },
  {
    baslik: 'İlk bölümünü aç',
    detay: '<b>🎓 Bölümler</b> panelinde "Yeni Bölüm Aç" listesinden birini seç — başlangıç için <b>İşletme</b> (₺150.000, laboratuvar istemez) idealdir. Kontenjanı da buradan ayarlarsın.',
    kontrol: (s) => ({ tamam: s.departments.length >= 1 }),
  },
  {
    baslik: 'Akademisyenleri bölüme ata',
    detay: '<b>👩‍🏫 Kadro</b> panelinde her akademisyenin <b>Bölüm</b> seçicisinden yeni bölümü seç. Bölümde yeterli öğretim üyesi yoksa YÖK kontenjan vermez, öğrenci gelmez!',
    kontrol: (s) => {
      const n = s.agents.filter((a) => a.kind === 'akademisyen' && a.deptId !== -1).length;
      return { tamam: n >= 2, ilerleme: `${Math.min(n, 2)}/2 atanmış` };
    },
  },
  {
    baslik: 'Yemekhane + aşçı',
    detay: '<b>Odalar → Yemekhane</b> (min 20 kare) + <b>Yemek Bankosu</b> ve <b>4 Sandalye</b>. Sonra <b>Kadro</b> panelinin en altından bir <b>Aşçı</b> işe al — aşçı yoksa servis yapılmaz.',
    kontrol: (s) => ({
      tamam: validRooms(s, 'yemekhane').length >= 1 && s.agents.some((a) => a.kind === 'asci'),
    }),
  },
  {
    baslik: 'İlk öğrencilerini karşıla',
    detay: 'Her şey hazır! Hızı <b>▶▶▶</b> yap ve dönem başını bekle (her dönem 20 gün — üstte "Gün X/20"). Dönem başında öğrenciler kayıt olur ve <b>devlet ödeneği</b> yatar. 💡 Bu arada <b>🔬 Araştırma</b> panelinden bir proje başlatabilirsin.',
    kontrol: (s) => ({ tamam: s.agents.some((a) => a.kind === 'ogrenci') }),
  },
];

let elem: HTMLElement | null = null;
let sonImza = '';

export function initTutorial(): void {
  elem = document.getElementById('hud-tutorial');
}

export function refreshTutorial(state: GameState): void {
  if (!elem) return;

  // adım kontrolü — kart gizliyken de ilerler
  if (state.tutorialAdim >= 0 && state.tutorialAdim < STEPS.length) {
    const adim = STEPS[state.tutorialAdim];
    if (adim.kontrol(state).tamam) {
      notify(state, `✔ Görev tamamlandı: ${adim.baslik}`, 'iyi');
      state.tutorialAdim++;
      if (state.tutorialAdim >= STEPS.length) {
        state.tutorialAdim = -1;
        notify(state, '🎉 Öğretici bitti! Artık kütüphane, laboratuvar, strateji ve lisansüstü programlarla üniversiteni büyüt.', 'odul');
      }
      sonImza = '';
    }
  }

  // görünüm
  let html = '';
  if (state.tutorialAdim === -1) {
    html = '';
  } else if (!state.tutorialAcik) {
    html = `<button class="tut-cip" data-tut="ac">🎓 Öğretici (${state.tutorialAdim + 1}/${STEPS.length})</button>`;
  } else {
    const adim = STEPS[state.tutorialAdim];
    const k = adim.kontrol(state);
    html = `
      <div class="tut-kart">
        <div class="tut-baslik">
          <span>🎓 Öğretici — Adım ${state.tutorialAdim + 1}/${STEPS.length}</span>
          <span>
            <button class="tut-btn" data-tut="atla" title="Bu adımı atla">Atla</button>
            <button class="tut-btn" data-tut="gizle" title="Kartı gizle">—</button>
          </span>
        </div>
        <div class="tut-gorev">${adim.baslik}</div>
        <div class="tut-detay">${adim.detay}</div>
        ${k.ilerleme ? `<div class="tut-ilerleme">📊 ${k.ilerleme}</div>` : ''}
      </div>`;
  }

  if (html !== sonImza) {
    sonImza = html;
    elem.innerHTML = html;
    for (const b of elem.querySelectorAll<HTMLButtonElement>('[data-tut]')) {
      b.addEventListener('click', () => {
        if (b.dataset.tut === 'gizle') state.tutorialAcik = false;
        else if (b.dataset.tut === 'ac') state.tutorialAcik = true;
        else if (b.dataset.tut === 'atla') {
          state.tutorialAdim++;
          if (state.tutorialAdim >= STEPS.length) state.tutorialAdim = -1;
        }
        sonImza = '';
        refreshTutorial(state);
      });
    }
  }
}
