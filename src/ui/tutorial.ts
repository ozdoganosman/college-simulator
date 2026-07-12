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
    detay: '<b>🏷️ Odalar → Derslik</b> seç ve duvarların İÇİNDEKİ alanı sürükleyerek işaretle (en az 12 kare). Oda şimdilik ⚠ geçersiz görünecek — sonraki adımda tamamlayacağız. 💡 Kestirme: <b>🏗️ Hazır Bina → Derslik Binası</b> ile her şey tek tıkla da kurulur!',
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
    detay: '<b>👩‍🏫 Kadro</b> panelini aç → <b>KPSS / İlan Havuzu</b>ndan iki adayı <b>İşe Al</b>. Dikkat: her hocanın bir <b>alanı</b> var (🔬 Mühendis, 🎨 Artist, 📜 Filozof, 💼 Pratik) ve bölümler ancak derslerini verebilecek alanlarda hocan varsa açılır — İşletme için <b>💼 Pratik + 🎨 Artist + 🔬 Mühendis</b> birer kişi ideal.',
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
    detay: 'Bu oyunda <b>derslerden bölümlere</b> gidilir: <b>📅 Program</b> panelinde her hocaya yıllık dersleri seçilir; bir bölüm ancak müfredatı <b>açık derslerle</b> karşılanıyorsa açılır. Program panelindeki <b>"✔ Açılabilecek Bölümler"</b> listesinden birini tek tıkla aç — ya da bir bölümü <b>🎯 Dersleri Ata</b> ile hedefleyip eksik derslerini hocalara dağıt.',
    kontrol: (s) => ({ tamam: s.departments.length >= 1 }),
  },
  {
    baslik: 'Hocalar bölüme kendiliğinden bağlanır',
    detay: 'Bölüm açılınca müfredatından ders veren hocalar o bölüme <b>otomatik</b> bağlanır — ayrıca atama yok. <b>👩‍🏫 Kadro</b> panelindeki Bölüm sütunundan kontrol et; "—" görünen hocaya <b>📅 Program</b> panelinden ders dağıt. Bölümde yeterli öğretim üyesi yoksa YÖK kontenjan vermez!',
    kontrol: (s) => {
      const n = s.agents.filter((a) => a.kind === 'akademisyen' && a.deptId !== -1).length;
      return { tamam: n >= 2, ilerleme: `${Math.min(n, 2)}/2 bağlandı` };
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
    baslik: 'YKS Yerleştirmeyi başlat!',
    detay: 'Her şey hazır! Ekranın üstündeki altın <b>🎓 YKS Yerleştirmeyi Başlat</b> butonuna bas — sonuçlar törenle açıklanır, kazanan öğrenciler kampüse gelir ve <b>devlet ödeneği</b> yatar. Her yıl başında YKS dönemi yeniden açılır; acele etmeden hazırlanıp istediğin an başlatırsın.',
    kontrol: (s) => ({ tamam: s.agents.some((a) => a.kind === 'ogrenci') }),
  },
  {
    baslik: 'İlk araştırma projeni başlat',
    detay: 'Öğrencilerin geldi — şimdi <b>bilim</b> zamanı. <b>🔬 Araştırma</b> panelini aç ve bir bölümde proje başlat. Projeler <b>başlangıç maliyeti + günlük bütçe</b> ister; tamamlanınca hibe, makale ve şansla çığır açan buluş getirir (prestij yükselir). Lider hoca atarsan risk düşer. 💡 "Otomatik yenile" anahtarını dilediğin gibi ayarla.',
    kontrol: (s) => ({ tamam: s.projects.length >= 1 || s.toplamYayin >= 1 }),
  },
  {
    baslik: 'Kütüphane kur (araştırma + öğrenme)',
    detay: '<b>🏗️ Hazır Bina → Kütüphane</b> ya da <b>Odalar → Kütüphane</b> + <b>Kitaplık</b> rafları koy. Kütüphane seviyesi araştırmayı VE öğrenmeyi hızlandırır; <b>📚 Kütüphane</b> panelinden alan bazlı kitap koleksiyonu satın al.',
    kontrol: (s) => ({ tamam: validRooms(s, 'kutuphane').length >= 1 }),
  },
  {
    baslik: 'Tamirci al — kampüs yaşıyor',
    detay: 'Eşyalar zamanla <b>yıpranır</b> ve bozulur (bozuk eşya işlev görmez!). <b>👩‍🏫 Kadro</b> panelinden bir <b>🔧 Tamirci</b> al — bozukları onarır, inşaatı hızlandırır. 💡 Kampüs büyüdükçe <b>Eşyalar</b> menüsünden <b>⚡ Jeneratör</b> / <b>💧 Su Deposu</b> kurmayı ve yangına karşı <b>👮 Güvenlik</b> / <b>🧯 Yangın Dolabı</b> almayı unutma. Kolay gelsin, Rektörüm!',
    kontrol: (s) => ({ tamam: s.agents.some((a) => a.kind === 'tamirci') }),
  },
];

let elem: HTMLElement | null = null;
let sonImza = '';

/** Hazır kampüsle başlanınca zaten tamamlanmış adımları sessizce atlar. */
export function fastForwardTutorial(state: GameState): void {
  while (
    state.tutorialAdim >= 0
    && state.tutorialAdim < STEPS.length
    && STEPS[state.tutorialAdim].kontrol(state).tamam
  ) {
    state.tutorialAdim++;
  }
  if (state.tutorialAdim >= STEPS.length) state.tutorialAdim = -1;
}

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
