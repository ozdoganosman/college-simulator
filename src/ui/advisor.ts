/**
 * Rektör Danışmanı — üst-orta bilgi barı.
 *
 * Oyun durumunu okuyup EN ÖNEMLİ 3 öneriyi tıklanabilir çipler olarak gösterir;
 * çipe tıklamak ilgili paneli açar. Yeni oyuncu "şimdi ne yapmalıyım?" sorusunun
 * cevabını hep ekranda görür. ✕ ile öneri o günlüğüne kapatılabilir.
 */
import { GameState, Student } from '../core/types';
import { validRooms } from '../core/grid';
import { BALANCE } from '../data/balance';
import { dersYukuVerimi } from '../game/schedule';
import { officeCapacity } from '../game/academics';
import { toplamKoleksiyon } from '../game/library';
import { seatCapacity } from '../game/departments';
import { openPanel, PanelName } from './panels';

interface Oneri {
  id: string;
  metin: string;
  detay: string;          // tooltip: neden önemli + ne yapmalı
  panel: PanelName | null;
}

let elem: HTMLElement | null = null;
let sonHtml = '';
/** kapatılan öneri id -> tekrar gösterileceği gün */
const susturulan = new Map<string, number>();

export function initAdvisor(): void {
  elem = document.getElementById('hud-advisor');
}

/** Durumdan öncelik sıralı öneri listesi üretir (ilk 3 gösterilir). */
function onerileriHesapla(state: GameState): Oneri[] {
  const o: Oneri[] = [];
  const ekle = (id: string, metin: string, detay: string, panel: PanelName | null) => {
    o.push({ id, metin, detay, panel });
  };

  // --- kritik ekonomi ---
  if (state.para < 0) {
    ekle('borc', '💸 Bütçe AÇIKTA — prestij eriyor!', 'Para eksiye düştü: her gün prestij kaybı. Gider kalemlerini Raporlar panelinde incele; gerekirse personel azalt.', 'raporlar');
  }

  if (state.dunAcKalan > 0) {
    ekle('ac-kalan', `🍽️ Dün ${state.dunAcKalan} öğrenci aç kaldı`, 'Yemek stoğu yetmedi: aşçı ekle (her aşçı dakikada ~1.4 porsiyon üretir, ayrı yemek bankosu ister) ya da kantine otomat koy.', 'kadro');
  }

  // --- kuruluş akışı ---
  const hocalar = state.agents.filter((a) => a.kind === 'akademisyen');
  if (state.departments.length === 0) {
    ekle('bolum-yok', '🏛️ İlk bölümünü aç', 'Bölüm olmadan öğrenci gelmez. 📅 Program panelindeki "Açılabilecek Bölümler" listesinden tek tıkla aç.', 'program');
  } else {
    const bolumsuz = hocalar.filter((a) => a.deptId === -1).length;
    if (bolumsuz > 0) {
      ekle('hoca-bolumsuz', `👩‍🏫 ${bolumsuz} hoca bölümsüz`, 'Bölüme atanmamış hoca derse giremez; öğretim üyesi eksik bölüme YÖK kontenjan vermez. Kadro panelinden bölüm seç.', 'kadro');
    }
    if (state.yksBekliyor) {
      ekle('yks', '🎓 YKS dönemi açık — hazırsan başlat!', 'Üstteki altın butona basınca yerleştirme yapılır, öğrenciler ve devlet ödeneği gelir. Önce derslik/kadro hazırlığını bitir.', null);
    }
  }

  // --- kampüs temelleri ---
  if (!state.agents.some((a) => a.kind === 'asci') && validRooms(state, 'yemekhane').length > 0) {
    ekle('asci-yok', '🍲 Aşçı yok — yemekhane servis yapamıyor', 'Aç kalan öğrenci mutsuzlaşır ve okulu bırakır. Kadro panelinin altından aşçı al.', 'kadro');
  }
  if (hocalar.length >= officeCapacity(state)) {
    ekle('masa-dolu', '🪑 Ofis masaları dolu — alım yapamazsın', 'Her akademisyen için geçerli bir ofiste çalışma masası gerekir. Ofisi büyüt ya da masa ekle.', null);
  }

  // --- öğrenci hali ---
  const ogrenciler = state.agents.filter((a): a is Student => a.kind === 'ogrenci');
  if (ogrenciler.length > 0) {
    const ortMutluluk = ogrenciler.reduce((t, s) => t + s.mutluluk, 0) / ogrenciler.length;
    if (ortMutluluk < 45) {
      ekle('mutsuz', `😟 Öğrenciler mutsuz (%${Math.round(ortMutluluk)})`, 'Mutluluk 25 altına düşen öğrenci okulu bırakır (prestij kaybı). Tuvalet, kantin, bank ve aşçı ihtiyaçları karşılar.', 'raporlar');
    }
    let koltuk = 0;
    for (const d of state.departments) koltuk += seatCapacity(state, d.id);
    const lisans = ogrenciler.filter((s) => s.level === 'lisans').length;
    if (lisans > koltuk) {
      ekle('sira-az', `🪑 ${lisans - koltuk} öğrenci sırasız`, 'Derslikteki sıra sayısı öğrenciden az: sırasız kalan derse giremez, yavaş öğrenir. Derslik kur ya da "Otomatik Döşe" ile sıra ekle.', null);
    }
  }

  // --- verimlilik ---
  if (hocalar.length > 0) {
    const ortVerim = hocalar.reduce((t, a) => t + (a.kind === 'akademisyen' ? dersYukuVerimi(state, a) : 0), 0) / hocalar.length;
    const lisansustu = ogrenciler.some((s) => s.level !== 'lisans' && s.asistani === -1);
    if (ortVerim < 0.75 && lisansustu) {
      ekle('yuk', `⚡ Hocalar aşırı yüklü (ort. %${Math.round(ortVerim * 100)})`, 'Çok ders veren hocanın ders kalitesi ve araştırma hızı düşer. Program panelinden YL/doktora öğrencilerini asistan ata.', 'program');
    }
  }
  if (validRooms(state, 'kutuphane').length > 0 && toplamKoleksiyon(state) === 0) {
    ekle('kitap-yok', '📚 Kütüphanede hiç kitap koleksiyonu yok', 'Kitapsız alanda çalışan öğrenci %35 hızla ilerler. Kütüphane panelinden bölümlerinin alanına koleksiyon al.', 'kutuphane');
  }

  // --- mezun ekosistemi ---
  const calisanMezun = state.mezunlar.filter((m) => !m.issiz).length;
  const kariyerHazir = state.sonKariyerGunu === 0
    || state.gun - state.sonKariyerGunu >= BALANCE.KARIYER_GUNU_BEKLEME;
  if (calisanMezun > 0 && kariyerHazir && ogrenciler.length > 0
      && state.para > BALANCE.KARIYER_GUNU_MALIYET * 2) {
    ekle('kariyer', '🎤 Kariyer Günü düzenlenebilir', 'Başarılı bir mezun sahne alır: tüm öğrencilere 💼+📣 nitelik ve +10 mutluluk. Mezunlar panelinden başlat.', 'mezunlar');
  }
  if (!state.mentorluk && calisanMezun >= BALANCE.MENTORLUK_MIN_MEZUN) {
    ekle('mentor', '🤝 Mentorluk programı hazır', `${calisanMezun} çalışan mezunun var — mentorluk öğrenci gelişimini +%15 hızlandırır (günlük ₺${BALANCE.MENTORLUK_GIDER.toLocaleString('tr-TR')}).`, 'mezunlar');
  }

  // --- büyüme fırsatı ---
  if (state.departments.length > 0 && validRooms(state, 'kutuphane').length === 0 && state.para > 600_000) {
    ekle('kutuphane-kur', '📚 Kütüphane kurmayı düşün', 'Kütüphane araştırma ve öğrenmeyi hızlandırır; öğrenciler boş vakitte orada çalışıp gelişir. 🏗️ Hazır Bina menüsünden tek tıkla kur.', 'kutuphane');
  }
  if (state.projects.length === 0 && state.departments.length > 0
      && hocalar.some((a) => a.deptId !== -1) && state.para > BALANCE.PROJE_MALIYET_TABAN * 2) {
    ekle('proje-yok', '🔬 Aktif araştırma projesi yok', 'Projeler hibe, makale, buluş ve prestij getirir — prestij olmadan sıralamada yükselemezsin.', 'arastirma');
  }

  return o;
}

/** main.ts ~saniyede 4 kez çağırır; içerik değişmedikçe DOM'a dokunmaz. */
export function refreshAdvisor(state: GameState): void {
  if (!elem) return;
  const aktif = onerileriHesapla(state)
    .filter((x) => (susturulan.get(x.id) ?? 0) <= state.gun)
    .slice(0, 3);

  const html = aktif.length === 0 ? '' : aktif.map((x) => `
    <button class="onr-cip" data-onr="${x.id}" data-panel="${x.panel ?? ''}" title="${x.detay.replace(/"/g, '&quot;')}">
      <span>${x.metin}</span><span class="onr-kapat" data-kapat="${x.id}" title="Bugünlük gizle">✕</span>
    </button>`).join('');

  if (html === sonHtml) return;
  sonHtml = html;
  elem.innerHTML = html === '' ? '' : `<span class="onr-etiket" title="Rektör Danışmanı: oyunun o anki en önemli 3 önerisi. Çipe tıkla → ilgili panel açılır.">💡</span>${html}`;

  for (const b of elem.querySelectorAll<HTMLButtonElement>('.onr-cip')) {
    b.addEventListener('click', (e) => {
      const hedef = e.target as HTMLElement;
      if (hedef.dataset.kapat) {
        susturulan.set(hedef.dataset.kapat, state.gun + 1); // yarın tekrar hatırlat
        sonHtml = '\0'; // önbelleği boz — liste boşalsa bile DOM temizlensin
        refreshAdvisor(state);
        return;
      }
      const panel = b.dataset.panel;
      if (panel) openPanel(panel as PanelName);
      else if (b.dataset.onr === 'yks') document.getElementById('yks-cta')?.click();
    });
  }
}
