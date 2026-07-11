/**
 * Rektör Danışmanı — üst-orta bilgi barı.
 *
 * Oyun durumunu okuyup EN ÖNEMLİ 3 öneriyi tıklanabilir çipler olarak gösterir;
 * çipe tıklamak ilgili paneli açar. Yeni oyuncu "şimdi ne yapmalıyım?" sorusunun
 * cevabını hep ekranda görür. ✕ ile öneri o günlüğüne kapatılabilir.
 */
import { DONEM_GUN, GameState, Student, donemGunu } from '../core/types';
import { validRooms } from '../core/grid';
import { BALANCE } from '../data/balance';
import { dersYukuVerimi } from '../game/schedule';
import { officeCapacity } from '../game/academics';
import { toplamKoleksiyon } from '../game/library';
import { seatCapacity } from '../game/departments';
import { cazibePuani, yurtKapasitesi } from '../game/campus';
import { denetimPuani, sonrakiDenetimGunu } from '../game/accreditation';
import { bozukSayisi } from '../game/maintenance';
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

  // --- YÖK denetimi yaklaşıyor ve karne zayıf ---
  const denetimKalan = sonrakiDenetimGunu(state) - state.gun;
  if (denetimKalan <= 20 && state.gun > 40) {
    const puan = denetimPuani(state);
    if (puan < BALANCE.DENETIM_GECME) {
      ekle('denetim', `🏛️ YÖK denetimi ${denetimKalan} gün sonra — karne ${puan}/100!`, `Denetimden geçmek için ${BALANCE.DENETIM_GECME} puan gerek. Raporlar > Akreditasyon Karnesi'nden zayıf kriterleri gör: hoca al, asistan ata, kitap koleksiyonu kur, cazibeyi artır. Kalırsan kontenjanlar %20 kesilir!`, 'raporlar');
    }
  }

  // --- bozuk eşyalar birikiyor ---
  const bozuk = bozukSayisi(state);
  const tamirciSayisi = state.agents.filter((a) => a.kind === 'tamirci').length;
  if (bozuk > 0 && tamirciSayisi === 0) {
    ekle('tamirci-yok', `🔧 ${bozuk} bozuk eşya — tamirci yok!`, 'Bozuk eşya işlev görmez: sıra koltuk sayılmaz, bilgisayar araştırmayı hızlandırmaz, ranza barındırmaz. Kadro panelinin altından tamirci al.', 'kadro');
  } else if (bozuk > 10) {
    ekle('tamirci-az', `🔧 ${bozuk} bozuk eşya birikti — tamirci yetişemiyor`, 'Kampüs büyüdükçe eskiyen eşya artar. İkinci bir tamirci almayı düşün (Kadro > Destek Personeli).', 'kadro');
  }

  // --- kritik ekonomi ---
  if (state.para < 0) {
    const limit = BALANCE.IFLAS_GUN[state.zorluk];
    ekle('borc', `🚨 BORÇTASIN — kayyuma ${limit - state.borcGunleri} gün!`, `Bütçe ${state.borcGunleri} gündür açıkta. ${limit} güne ulaşırsa YÖK kayyum atar ve OYUN BİTER. Gideri kıs: politika durdur, personel azalt, YKS ödeneği bekle.`, 'raporlar');
  }

  const mutsuzHoca = state.agents.filter(
    (a) => a.kind === 'akademisyen' && a.memnuniyet < 50,
  ).length;
  if (mutsuzHoca > 0) {
    ekle('hoca-mutsuz', `😠 ${mutsuzHoca} hoca mutsuz — istifa riski!`, 'Memnuniyeti 35 altına düşen hoca dönem başında istifa edip RAKİBE transfer olabilir. Kadro panelinden Zam Ver ya da ders yükünü azalt (asistan ata).', 'kadro');
  }

  if (state.dunAcKalan > 0) {
    ekle('ac-kalan', `🍽️ Dün ${state.dunAcKalan} öğrenci aç kaldı`, 'Yemek stoğu yetmedi: aşçı ekle (her aşçı dakikada ~1.4 porsiyon üretir, ayrı yemek bankosu ister) ya da kantine otomat koy.', 'kadro');
  }

  if (donemGunu(state.gun) > DONEM_GUN - 3
      && state.agents.some((a) => a.kind === 'ogrenci')) {
    ekle('sinav', '📝 SINAV HAFTASI — dönemin son 3 günü', 'Öğrenciler sınava asılıyor (öğrenme ×1.25). Dönem sonunda not <40 olan KALIR: ilerleme -15, mutluluk -10. GNO\'yu yükselt: hocalı dersler, kitaplı kütüphane, mentorluk.', 'raporlar');
  }

  // --- kuruluş akışı ---
  const hocalar = state.agents.filter((a) => a.kind === 'akademisyen');
  if (state.departments.length === 0) {
    ekle('bolum-yok', '🏛️ İlk bölümünü aç', 'Bölüm olmadan öğrenci gelmez. 📅 Program panelindeki "Açılabilecek Bölümler" listesinden tek tıkla aç.', 'program');
  } else {
    const bolumsuz = hocalar.filter((a) => a.deptId === -1).length;
    if (bolumsuz > 0) {
      ekle('hoca-bolumsuz', `👩‍🏫 ${bolumsuz} hoca bölümsüz`, 'Hoca, açık bir bölümün müfredatından ders verince o bölüme OTOMATİK bağlanır. 📅 Program panelinden ders dağıt (Oto Doldur işini görür); öğretim üyesi eksik bölüme YÖK kontenjan vermez.', 'program');
    }
    if (state.yksBekliyor) {
      ekle('yks', '🎓 YKS dönemi açık — hazırsan başlat!', 'Üstteki altın butona basınca yerleştirme yapılır, öğrenciler ve devlet ödeneği gelir. Önce derslik/kadro hazırlığını bitir; ♟️ Strateji > Mali Politikalar\'dan kayıt ücreti ve burs kontenjanlarını ayarla.', 'strateji');
    }
    // hocasız ders: program kendini onaramadıysa kadro fiziken yetmiyordur
    const hocasizDers = (state.dersProgrami ?? []).filter((s) => s.academicId === -1).length;
    if (hocasizDers > 0) {
      ekle('ders-hocasiz', `📅 ${hocasizDers} derste hoca yok!`, 'Program kendini onarmayı denedi ama o saatte müsait hoca kalmadı: kadro yetersiz ya da yıllık ders kotaları dolu. Yeni hoca al (👩‍🏫 Kadro) ya da 📅 Program > Bugünün Ders Programı hücresinden elle ata.', 'program');
    }

    // koltuk planı: geçen YKS'de aday geri çevrildiyse ya da kontenjan koltuğu aşıyorsa
    const geriCevrilen = state.departments.reduce((t, d) => t + (d.sonGeriCevrilen ?? 0), 0);
    const koltukEksik = state.departments.filter((d) => seatCapacity(state, d.id) < d.kontenjan);
    if (geriCevrilen > 0) {
      ekle('koltuk-yetmedi', `🪑 Geçen YKS'de ${geriCevrilen} istekli aday koltuk yetmediği için kaçtı!`, 'Talep var ama derslik koltuğu yok — kayıp öğrenci = kayıp ödenek ve ücret geliri. Derslik kur (Hazır Bina), sıra ekle ya da kontenjanı koltuğa göre ayarla (🎓 Bölümler).', 'bolumler');
    } else if (state.yksBekliyor && koltukEksik.length > 0) {
      ekle('koltuk-plani', `🪑 ${koltukEksik.length} bölümde koltuk < kontenjan`, 'YKS öncesi koltuk planı yap: kontenjan kadar sıra yoksa istekli adaylar geri çevrilir. Derslik/sıra ekle ya da kontenjanı düşür (🎓 Bölümler panelindeki Derslik sütununa bak).', 'bolumler');
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

  if (ogrenciler.length >= 30 && yurtKapasitesi(state) === 0 && state.para > 400_000) {
    ekle('yurt-yok', '🛏️ Yurt yok — kampüs gece bomboş', 'Yurt kur (Hazır Bina → Öğrenci Yurdu): yurtta kalanlar gece kampüste yaşar, derse tok/erken gelir; barınma cazibeyi ve YKS talebini artırır.', null);
  }
  if (ogrenciler.length >= 15 && cazibePuani(state) < 25) {
    ekle('cazibe-dusuk', `✨ Kampüs cazibesi düşük (${cazibePuani(state)}/100)`, 'Aktivite alanları ekle (🏀 basket, ♟️ satranç, 🎸 sahne — Eşyalar menüsü), servis durağı koy, yurt kur. Cazibe YKS talebine +%40\'a dek çarpan verir.', 'raporlar');
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
