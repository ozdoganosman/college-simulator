/**
 * SPEC — Ajan davranış sistemi (öğrenci, akademisyen, aşçı, temizlikçi).
 *
 * updateAgents(state, dtMin): her simülasyon adımında çağrılır.
 *  - Günlük ritim (state.dakika, T sabitleri):
 *    - T.KAMPUS_ACILIS'ten itibaren onCampus=false ajanlar GATE'te belirir
 *      (onCampus=true, activity='geliyor', kademeli/rastgele gecikmeyle yığılma olmasın).
 *    - T.CIKIS'ten sonra öğrenci ve personel GATE'e yürüyüp onCampus=false olur
 *      (activity='cikiyor' -> GATE'e varınca 'yok'). Akademisyenler de çıkar.
 *    - Gece (KAMPUS_KAPANIS) hâlâ kampüste kalan varsa doğrudan onCampus=false yap.
 *  - Hareket: a.path doluysa sıradaki kareye doğru yürü (hız ~2.4 kare/oyun-dk...
 *    gerçekçi değil ama oynanış için: HIZ = 0.12 kare/dakika*dt yerine pratikte
 *    SPEED=0.35 kare/dk kullan). Kareye varınca path.shift().
 *  - Yol bulma: findPath(state, {x:round,y:round}, hedef). Yol yoksa aktiviteyi iptal et.
 *  - Öğrenci ihtiyaçları (BALANCE.NEED_RATE): kampüsteyken dakika başına artar.
 *    Ders saatlerinde (T.DERS1..T.CIKIS arasındaki ders bloklarında) dersteyse öğrenir.
 *  - Öğrenci davranış önceliği (bosta iken karar):
 *    1) Kritik ihtiyaç (>75): tuvalet -> geçerli tuvalette boş klozet; açlık -> yemekhane
 *       (banko + görevde aşçı varsa) yoksa kantindeki otomat; enerji/eğlence -> kantin
 *       sandalyesi ya da bank.
 *    2) Ders bloğu başladıysa: kendi bölümüne atanmış (room.deptId) geçerli derslikte boş
 *       'sira' rezerve et -> git -> 'derste' (blok sonuna kadar). Sıra yoksa bekle (bosta).
 *    3) Öğle (T.OGLE..T.DERS3): yemeğe git.
 *    4) YL/doktora öğrencisi ders bloklarının yarısında derse girmek yerine 'arastiriyor'
 *       (geçerli lab varsa lab, yoksa kütüphane) — research sistemine katkı orada okunur.
 *    5) Hiçbiri yoksa: eğlence/dinlenme ya da rastgele gezin.
 *  - Derste: blok bitince ilerleme += BALANCE.DERS_ILERLEME * (odada 'ders_veriyor'
 *    akademisyen varsa 1 yoksa BALANCE.OGRETMENSIZ_CARPAN) * (1 + kütüphaneSeviyesi *
 *    BALANCE.KUTUPHANE_OGRENME_BONUS). Pratikte dakika başına oransal ekle.
 *  - Mutluluk: karşılanmayan kritik ihtiyaç dakikada -0.05; ihtiyaç karşılanınca +;
 *    0-100 clamp. İhtiyaç objesi kullanılırken ilgili ihtiyaç dakikada ~-2 azalır.
 *  - Akademisyen: ders bloklarında kendi bölümünün dolu dersliğine gidip 'ders_veriyor'
 *    (tahta başı). Bölümün o blokta dersliği yoksa ofis/lab'da 'arastiriyor'.
 *    XP: ders bloğu başına BALANCE.XP_DERS (dailyAcademicUpdate toplayabilsin diye
 *    doğrudan a.xp'ye ekle).
 *  - Aşçı: 11:00-14:00 arasında geçerli yemekhanedeki bankonun başında 'calisiyor';
 *    diğer zamanlarda bosta/gezinir. Görevdeki aşçı yoksa yemekhane servis yapamaz.
 *  - Temizlikçi: en kirli kareyi bulur, gider, temizler (dakikada -8 kir, 0'a inince
 *    yeni hedef). Kir: her ajan yürürken bulunduğu kareye +0.02/dk kir bırakır (max 100).
 *  - Obje rezervasyonu: kullanmadan önce reservedBy=agent.id yap; bırakınca -1'e çek.
 *    Ajan kampüsten çıkarken rezervasyonlarını bırakmalı.
 *
 * spawnStudent: yeni öğrenci ajanı yaratır (kampüs dışında başlar), state.agents'a ekler.
 * spawnAcademic: yeni akademisyen ajanı yaratır ve ekler (academics.ts çağırır).
 * hireStaff/fireStaff: personel yönetimi (panels çağırır); alım maliyeti
 *   BALANCE.PERSONEL_ALIM, günlük maaş BALANCE.MAAS.
 * removeAgent: ajanı state'ten güvenle çıkarır (rezervasyonları bırakarak).
 */
import {
  Academic, AcademicRank, Agent, GameState, StaffAgent, Student, StudentLevel,
} from '../core/types';

export function updateAgents(state: GameState, dtMin: number): void {
  // TODO(workflow): davranış makinesi
  void state; void dtMin;
}

export function spawnStudent(state: GameState, deptId: number, level: StudentLevel): Student {
  // TODO(workflow)
  throw new Error('spawnStudent henüz uygulanmadı');
}

export function spawnAcademic(
  state: GameState, ad: string, deptId: number, rank: AcademicRank,
  egitim: number, arastirma: number, maas: number,
): Academic {
  // TODO(workflow)
  throw new Error('spawnAcademic henüz uygulanmadı');
}

export function hireStaff(state: GameState, kind: 'asci' | 'temizlikci'): StaffAgent | null {
  // TODO(workflow)
  return null;
}

export function removeAgent(state: GameState, agentId: number): void {
  // TODO(workflow)
  void state; void agentId;
}
