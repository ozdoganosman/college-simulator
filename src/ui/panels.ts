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
 *
 * --- Bölümler paneli ---
 *  - Açık bölümler tablosu: Ad, öğrenci sayısı (lisans/YL/Dok ayrı), kontenjan input
 *    (değişince setQuota), son talep/kayıt, atanmış derslik sayısı + koltuk (seatCapacity),
 *    akademisyen sayısı / minAkademisyen (eksikse kırmızı rozet 'öğr. üyesi yetersiz'),
 *    YL/Doktora aç butonları (toggleGradProgram, koşulu tutmuyorsa disabled + title) ve
 *    açıksa YL/doktora kontenjan inputları.
 *  - 'Yeni Bölüm Aç' bölümü: DEPT_DEFS içinden açılmamışlar; her biri için ad, maliyet,
 *    gereksinim özeti (X derslik, lab, Y öğr. üyesi) ve canOpenDepartment sonucu:
 *    ok ise aktif 'Aç' butonu (openDepartment), değilse disabled + eksikler listesi.
 *
 * --- Kadro paneli ---
 *  - Mevcut kadro tablosu: Unvan+Ad (RANK_LABEL), bölüm (select ile assignAcademicDept,
 *    '—' = bölümsüz), eğitim/araştırma, XP, makale (ulusl. ayrı), günlük maaş,
 *    'İşten Çıkar' (fireAcademic, confirm istemez ama tazminat tutarını butona yaz).
 *  - Ofis kapasitesi göstergesi: 'Kadro X / masa Y'.
 *  - KPSS/İlan sekmesi-tablosu: adaylar (hireFromPool 'kpss'). Transfer tablosu: kurum,
 *    bonus dahil (hireFromPool 'transfer'). Alım butonları para/masa yetersizse disabled.
 *  - Personel: aşçı/temizlikçi sayısı + 'İşe Al' (hireStaff) + son personeli çıkar.
 *
 * --- Araştırma paneli ---
 *  - Bölüm başına: aktif proje (başlık, ilerleme çubuğu %, iptal butonu) ya da
 *    'Proje Başlat' (startProject; koşullar tutmuyorsa disabled + neden title).
 *  - Yayınlar listesi (son 15): gün, başlık, yazar, bölüm, 🌍 uluslararası / 💥 çığır açan.
 *  - Ödüller listesi. Toplam sayaçlar: makale, uluslararası, buluş, ödül.
 *
 * --- Strateji paneli ---
 *  - Rektörlük odası (geçerli) yoksa uyarı 'Strateji için Rektörlük kurmalısınız' ve liste
 *    disabled. STRATEGY_DEFS listesi: ad, açıklama, maliyet, prestij şartı, ön koşullar.
 *    Satın alınmışsa ✔; alınabilirse buton (para düş + state.strategies.push + notify).
 *    Özel ek şartlar: 'erasmus' için >=1 uluslararası yayın; 'teknokent' için >=2 geçerli lab.
 *
 * --- Raporlar paneli ---
 *  - Genel istatistik: para, prestij, öğrenci (seviye bazında), akademisyen (unvan bazında),
 *    toplam mezun/bırakan, yayın sayıları, kütüphane seviyesi (libraryLevel),
 *    ortalama öğrenci mutluluğu, günlük maaş yükü, oda sayıları (tür bazında geçerli/geçersiz).
 *  - 'Yeni Oyun' butonu (clearSave + location.reload, önce confirm).
 */
import { GameState } from '../core/types';

export type PanelName = 'bolumler' | 'kadro' | 'arastirma' | 'strateji' | 'raporlar';

export function initPanels(getState: () => GameState): void {
  // TODO(workflow)
  void getState;
}

export function openPanel(name: PanelName): void {
  // TODO(workflow)
  void name;
}

export function closePanel(): void {
  // TODO(workflow)
}

export function refreshOpenPanel(state: GameState): void {
  // TODO(workflow)
  void state;
}
