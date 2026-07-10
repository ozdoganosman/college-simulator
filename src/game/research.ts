/**
 * SPEC — Bilimsel araştırma, yayınlar, buluşlar, ödüller.
 *
 * startProject(state, deptId): boolean — panelden çağrılır.
 *  - Koşullar: bölüm var; bölümün deptDef.labGerekli ise geçerli laboratuvar olmalı
 *    (labGerekli değilse geçerli kütüphane ya da ofis yeter); bölümde >=1 akademisyen;
 *    bölüm başına aynı anda en fazla 1 aktif proje.
 *  - Maliyet: BALANCE.PROJE_MALIYET_TABAN * (0.8-1.4 rastgele); spend başarısızsa false.
 *  - hedefPuan = BALANCE.PROJE_HEDEF_PUAN * (0.7-1.3); baslik PROJE_KALIP+PROJE_KONU'dan.
 *  - notify(bilgi) 'X bölümünde yeni araştırma projesi: "..."'.
 *
 * updateResearch(state, dtMin): her sim adımında.
 *  - Aktif her proje için puan üretimi: bölümdeki 'arastiriyor' aktivitesindeki
 *    akademisyenlerin arastirma toplamı * 0.01/dk + 'arastiriyor' YL öğrencisi * 0.05
 *    + doktora öğrencisi * 0.12 (kampüsteyse).
 *  - Çarpanlar: deptDef.arastirmaCarpani; kütüphane seviyesi
 *    (1 + libraryLevel*BALANCE.KUTUPHANE_ARASTIRMA_BONUS); strateji: 'tubitak' x1.25,
 *    'arastirma_universitesi' x1.30 (çarpımsal). Lab'daki bilgisayar başına +%3 (max +%15).
 *  - Akademisyen XP: ürettiği puan * BALANCE.XP_ARASTIRMA_CARPAN.
 *  - birikenPuan >= hedefPuan olunca completeProject.
 *
 * completeProject (iç):
 *  - Hibe: BALANCE.ARASTIRMA_HIBE * (0.8-1.5) kazan (earn), notify(iyi).
 *  - Yayın: bölümün en yüksek arastirma'lı akademisyeni yazar olur. Uluslararası olasılığı
 *    BALANCE.ULUSLARARASI_OLASILIK + yazar.arastirma/400 + ('erasmus' varsa +0.3, clamp 0.9).
 *    'tesvik' stratejisi yayın sayısını etkiler: %20 olasılıkla 2. makale (ikinci yazar).
 *    Publication kaydı ekle; yazar.makale++ (uluslararasiysa uluslararasiMakale++ de);
 *    addPrestij(makale ya da uluslararasiMakale); uluslararasiysa hibe x ULUSLARARASI_HIBE_CARPAN.
 *  - Çığır açan buluş: BALANCE.BULUS_OLASILIK (+yazar.arastirma>80 ise +0.05). Olursa:
 *    cigirAcici=true, BULUS_GELIR ('teknokent' varsa x2) kazan, addPrestij(PRESTIJ.bulus),
 *    notify(odul) 'ÇIĞIR AÇAN BULUŞ: ...'.
 *    Ödül: buluş sonrası BALANCE.ODUL_OLASILIK ile ODUL_ADLARI'ndan bir Award ekle,
 *    addPrestij(PRESTIJ.odul), notify(odul).
 *  - Projeyi state.projects'ten çıkar (biten projeler yayında görünür zaten).
 *
 * cancelProject(state, projectId): iade yok, notify(kotu).
 */
import { GameState } from '../core/types';

export function startProject(state: GameState, deptId: number): boolean {
  // TODO(workflow)
  return false;
}

export function updateResearch(state: GameState, dtMin: number): void {
  // TODO(workflow)
  void state; void dtMin;
}

export function cancelProject(state: GameState, projectId: number): void {
  // TODO(workflow)
  void state; void projectId;
}
