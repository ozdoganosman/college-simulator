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
 *  - Hareket: a.path doluysa sıradaki kareye doğru yürü; kareye varınca path.shift().
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
 *  - Derste: dakika başına ilerleme += (BALANCE.DERS_ILERLEME/120) * (odada 'ders_veriyor'
 *    aynı bölümden akademisyen varsa 1 yoksa BALANCE.OGRETMENSIZ_CARPAN) *
 *    (1 + kütüphaneSeviyesi * BALANCE.KUTUPHANE_OGRENME_BONUS).
 *  - Mutluluk: herhangi bir ihtiyaç > 85 ise -0.06/dk; hepsi < 50 ise +0.03/dk; 0-100 clamp.
 *    İhtiyaç objesi kullanılırken ilgili ihtiyaç dakikada ~2 azalır (yemek 3).
 *  - Akademisyen: ders bloklarında kendi bölümünün i'inci geçerli dersliğinde 'ders_veriyor'
 *    (tahta başı). Bölümün o blokta dersliği yoksa ofis/lab/kütüphanede 'arastiriyor'.
 *    XP: ders verirken dakika başına BALANCE.XP_DERS/120.
 *  - Aşçı: 11:00-14:00 arasında geçerli yemekhanedeki bankonun başında 'calisiyor';
 *    diğer zamanlarda bosta/gezinir. Görevdeki aşçı yoksa yemekhane servis yapamaz
 *    (mutfakAcik yardımcı fonksiyonu).
 *  - Temizlikçi: en kirli kareyi (>20) bulur, gider, temizler (dakikada -8 kir).
 *    Kir: her ajan bulunduğu kareye +0.02/dk bırakır (çöp kutusuna 2 kare yakınsa yarısı).
 *  - Obje rezervasyonu: kullanmadan önce reservedBy=agent.id; bırakınca -1.
 *    Ajan kampüsten çıkarken rezervasyonlarını bırakır.
 *
 * spawnStudent / spawnAcademic / hireStaff / removeAgent: ajan yaşam döngüsü.
 */
import {
  Academic, AcademicRank, Agent, AgentActivity, AgentKind, GameState, GATE, MAP_H, MAP_W,
  Needs, PlacedObject, Point, Room, StaffAgent, Student, StudentLevel, T,
  DONEM_GUN, donemGunu, donemIndex, inBounds, programGunu, tatilMi, tileIndex,
} from '../core/types';
import { chance, clamp, newId, pick, randInt, randRange } from '../core/util';
import { courseDef, dersEtki } from '../data/courses';
import { asistanSayilari, yukVerimi } from './schedule';
import { kitapCarpani } from './library';
import { bolumBaskinAlan } from '../data/departments';
import { ulasimSeviyesi, yurtKapasitesi } from './campus';
import { gucCarpani } from './infrastructure';
import { findPath } from '../core/pathfinding';
import { libraryLevel, roomCenter, walkable } from '../core/grid';
import { BALANCE } from '../data/balance';
import { AD, SOYAD } from '../data/names';
import { notify, spend } from './state';

// kare/oyun-dakikası yürüme hızları
const SPEED: Record<AgentKind, number> = {
  ogrenci: 0.5,
  akademisyen: 0.45,
  asci: 0.42,
  temizlikci: 0.42,
  tamirci: 0.42,
  guvenlik: 0.48, // güvenlik hızlı — yangına koşar
};

const DERS_BLOKLARI: number[] = [T.DERS1, T.DERS2, T.DERS3, T.DERS4];
const BLOK_SURE = 120;
const ASCI_BASLA = 11 * 60;
const ASCI_BITIS = 14 * 60;

/** İçinde bulunulan ders bloğunun başlangıç dakikası, blok dışıysa -1. */
export function dersBlogu(dakika: number): number {
  for (const b of DERS_BLOKLARI) {
    if (dakika >= b && dakika < b + BLOK_SURE) return b;
  }
  return -1;
}

/** Görevde ('calisiyor') aşçı var mı — yemekhane servisi için gerekli. */
export function mutfakAcik(state: GameState): boolean {
  return state.agents.some(
    (a) => a.kind === 'asci' && a.onCampus && a.activity === 'calisiyor',
  );
}

/** Ajanın tuttuğu tüm obje rezervasyonlarını bırakır. */
export function releaseReservations(state: GameState, agentId: number): void {
  for (const o of state.objects) {
    if (o.reservedBy === agentId) o.reservedBy = -1;
  }
}

// --- Çöp kutusu yakınlığı önbelleği (obje sayısı değişince yenilenir) -------

let copCacheAnahtar = -1;
let copYakini = new Set<number>();

function copYakiniSet(state: GameState): Set<number> {
  // önbellek anahtarı: çöp kutularının konum/id özeti (eşit sayıda takas da yakalanır)
  let anahtar = state.objects.length;
  for (const o of state.objects) {
    if (o.type === 'cop_kutusu') anahtar = (anahtar * 31 + o.id * 7 + o.x * 131 + o.y) | 0;
  }
  if (anahtar === copCacheAnahtar) return copYakini;
  copCacheAnahtar = anahtar;
  copYakini = new Set<number>();
  for (const o of state.objects) {
    if (o.type !== 'cop_kutusu') continue;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (inBounds(x, y)) copYakini.add(tileIndex(x, y));
      }
    }
  }
  return copYakini;
}

// --- Çağrı başına ortak önbellek ---------------------------------------------

interface Ctx {
  dk: number;
  ogrenmeCarpan: number;
  mutfak: boolean;
  /** roomId -> o odada 'ders_veriyor' akademisyenlerin bölüm id'leri */
  teacherRooms: Map<number, Set<number>>;
  /** roomId -> odadaki en iyi hocanın eğitim becerisi */
  teacherSkill: Map<number, number>;
  /** roomId -> bloktaki dersin hocaya alan uyumu (0.55-1.25) */
  teacherEtki: Map<number, number>;
  /** deptId -> güncel bloktaki ders (nitelik gelişimi için) */
  blokDersleri: Map<number, string>;
  objById: Map<number, PlacedObject>;
  /** deptId -> boş sıra yığını (geçerli, bölüme atanmış dersliklerde) */
  freeSira: Map<number, PlacedObject[]>;
  freeKlozet: PlacedObject[];
  freeYemekSandalye: PlacedObject[];
  freeKantinSandalye: PlacedObject[];
  freeOtomat: PlacedObject[];
  freeBank: PlacedObject[];
  freeMasa: PlacedObject[];
  freeBanko: PlacedObject[];
  tahtaByRoom: Map<number, PlacedObject>;
  /** akademisyenin gün içinde tuttuğu çalışma masası / aşçının bankosu */
  deskOf: Map<number, PlacedObject>;
  bankoOf: Map<number, PlacedObject>;
  labs: Room[];
  kutuphaneler: Room[];
  /** geçerli kütüphane oda id'leri (çalışma hızı kontrolü) */
  kutuphaneIds: Set<number>;
  /** deptId -> bölümün baskın alanı (kütüphane çalışması hangi alanda gelişir) */
  deptAlan: Map<number, import('../core/types').Alan>;
  /** geçerli yurt odaları + yurtta kalan öğrenci id'leri (kapasite kadar) */
  yurtOdalar: Room[];
  yurtSakinleri: Set<number>;
  /** boş sosyal aktivite objeleri (basket/satranç/sahne) */
  freeAktivite: PlacedObject[];
  /** ulaşım seviyesi (0-5) — kampüse geliş hızlanır */
  ulasim: number;
  yemekhaneler: Room[];
  kantinler: Room[];
  /** deptId -> bölüme atanmış geçerli derslik/amfiler */
  deptClassrooms: Map<number, Room[]>;
  /** akademisyen id -> bölümündeki kampüsteki akademisyenler arasındaki sırası */
  academicIndex: Map<number, number>;
  copYakini: Set<number>;
  /** toplam öğrenci sayısı (mutfak üretim tavanı için) */
  ogrenciSayisi: number;
  /** Pazar tatili: ders yok, kampüs sosyalleşir (sınav haftası hariç) */
  tatil: boolean;
  /** elektrik kesintisi öğrenme/araştırma/üretim çarpanı (0.7 kesintide) */
  gucCarpan: number;
}

function buildCtx(state: GameState, dk: number): Ctx {
  const roomById = new Map<number, Room>();
  const deptClassrooms = new Map<number, Room[]>();
  const labs: Room[] = [];
  const kutuphaneler: Room[] = [];
  const yemekhaneler: Room[] = [];
  const kantinler: Room[] = [];

  const yurtOdalar: Room[] = [];
  for (const r of state.rooms) {
    roomById.set(r.id, r);
    if (!r.valid) continue;
    if (r.type === 'yurt') yurtOdalar.push(r);
    if ((r.type === 'derslik' || r.type === 'amfi') && r.deptId !== null) {
      const liste = deptClassrooms.get(r.deptId);
      if (liste) liste.push(r);
      else deptClassrooms.set(r.deptId, [r]);
    } else if (r.type === 'laboratuvar') labs.push(r);
    else if (r.type === 'kutuphane') kutuphaneler.push(r);
    else if (r.type === 'yemekhane') yemekhaneler.push(r);
    else if (r.type === 'kantin') kantinler.push(r);
  }

  const objById = new Map<number, PlacedObject>();
  const freeSira = new Map<number, PlacedObject[]>();
  const freeKlozet: PlacedObject[] = [];
  const freeYemekSandalye: PlacedObject[] = [];
  const freeKantinSandalye: PlacedObject[] = [];
  const freeOtomat: PlacedObject[] = [];
  const freeBank: PlacedObject[] = [];
  const freeAktivite: PlacedObject[] = [];
  const freeMasa: PlacedObject[] = [];
  const freeBanko: PlacedObject[] = [];
  const tahtaByRoom = new Map<number, PlacedObject>();
  const deskOf = new Map<number, PlacedObject>();
  const bankoOf = new Map<number, PlacedObject>();

  for (const o of state.objects) {
    objById.set(o.id, o);
    if ((o.yipranma ?? 0) >= 100) continue; // BOZUK eşya kullanılamaz — tamirci onarana dek
    if (o.type === 'tahta' && o.roomId >= 0 && !tahtaByRoom.has(o.roomId)) {
      tahtaByRoom.set(o.roomId, o);
    }
    if (o.reservedBy !== -1) {
      if (o.type === 'calisma_masasi') deskOf.set(o.reservedBy, o);
      else if (o.type === 'yemek_bankosu') bankoOf.set(o.reservedBy, o);
      continue;
    }
    const oda = o.roomId >= 0 ? roomById.get(o.roomId) : undefined;
    switch (o.type) {
      case 'sira':
        if (oda && oda.valid && oda.deptId !== null && (oda.type === 'derslik' || oda.type === 'amfi')) {
          const yigin = freeSira.get(oda.deptId);
          if (yigin) yigin.push(o);
          else freeSira.set(oda.deptId, [o]);
        }
        break;
      case 'klozet':
        if (oda && oda.valid && oda.type === 'tuvalet') freeKlozet.push(o);
        break;
      case 'sandalye':
        if (oda && oda.valid && oda.type === 'yemekhane') freeYemekSandalye.push(o);
        else if (oda && oda.valid && oda.type === 'kantin') freeKantinSandalye.push(o);
        break;
      case 'otomat':
        if (oda && oda.valid && oda.type === 'kantin') freeOtomat.push(o);
        break;
      case 'bank':
        freeBank.push(o);
        break;
      case 'basket_potasi':
      case 'satranc_masasi':
      case 'muzik_sahnesi':
        freeAktivite.push(o);
        break;
      case 'calisma_masasi':
        if (oda && oda.valid && oda.type === 'ofis') freeMasa.push(o);
        break;
      case 'yemek_bankosu':
        if (oda && oda.valid && oda.type === 'yemekhane') freeBanko.push(o);
        break;
      default:
        break;
    }
  }

  // öğretmen mevcudu + akademisyen sınıf sırası + mutfak durumu (tek geçiş)
  // güncel bloğun bölüm dersleri (ders programından)
  const blokBaslangic = dersBlogu(dk);
  const blokNo = blokBaslangic === -1 ? -1 : DERS_BLOKLARI.indexOf(blokBaslangic);
  const blokDersleri = new Map<number, string>(); // deptId -> courseId
  if (blokNo >= 0) {
    const seans = blokNo < 2 ? 0 : 1; // blok 0-1 = sabah (08-12), 2-3 = öğleden sonra (12-16)
    const pg = programGunu(state.gun); // haftalık program günü (Cmt→Pzt tekrarı, Paz tatil)
    for (const s of state.dersProgrami ?? []) {
      if (s.gun === pg && s.seans === seans) blokDersleri.set(s.deptId, s.courseId);
    }
  }

  const teacherRooms = new Map<number, Set<number>>();
  const teacherSkill = new Map<number, number>();
  const teacherEtki = new Map<number, number>();
  const academicIndex = new Map<number, number>();
  const deptAkademik = new Map<number, Academic[]>();
  const asistanlar = asistanSayilari(state);
  let mutfak = false;
  for (const a of state.agents) {
    if (!a.onCampus) continue;
    if (a.kind === 'akademisyen') {
      const liste = deptAkademik.get(a.deptId);
      if (liste) liste.push(a);
      else deptAkademik.set(a.deptId, [a]);
      if (a.activity === 'ders_veriyor') {
        const rid = state.roomAt[tileIndex(Math.round(a.x), Math.round(a.y))];
        if (rid >= 0) {
          const set = teacherRooms.get(rid);
          if (set) set.add(a.deptId);
          else teacherRooms.set(rid, new Set([a.deptId]));
          if ((teacherSkill.get(rid) ?? 0) < a.egitim) teacherSkill.set(rid, a.egitim);
          // alan-ders uyumu × ders yükü verimi: bu bloktaki dersin gerçek kalitesi
          const ders = blokDersleri.get(a.deptId);
          const yuk = yukVerimi((a.verdigiDersler ?? []).length, asistanlar.get(a.id) ?? 0);
          const etki = (ders ? dersEtki(ders, a.alan) : 1) * yuk;
          if ((teacherEtki.get(rid) ?? 0) < etki) teacherEtki.set(rid, etki);
        }
      }
    } else if (a.kind === 'asci' && a.activity === 'calisiyor') {
      mutfak = true;
    }
  }
  // sınıf sırası: bloktaki derse EN UYGUN hoca ilk dersliği alır (otomatik atama)
  for (const [deptId, liste] of deptAkademik) {
    const ders = blokDersleri.get(deptId);
    if (ders) {
      liste.sort((a, b) =>
        dersEtki(ders, b.alan) * (0.5 + b.egitim / 100) - dersEtki(ders, a.alan) * (0.5 + a.egitim / 100));
    }
    liste.forEach((a, i) => academicIndex.set(a.id, i));
  }

  const deptAlan = new Map<number, import('../core/types').Alan>();
  for (const d of state.departments) deptAlan.set(d.id, bolumBaskinAlan(d.defId));

  // yurt sakinleri: kapasite kadar öğrenci (id sırasıyla — kayıt önceliği)
  const yurtSakinleri = new Set<number>();
  const kapasite = yurtOdalar.length > 0 ? yurtKapasitesi(state) : 0;
  let ogrenciSayisi = 0;
  for (const a of state.agents) if (a.kind === 'ogrenci') ogrenciSayisi++;
  if (kapasite > 0) {
    const ogrenciIds: number[] = [];
    for (const a of state.agents) if (a.kind === 'ogrenci') ogrenciIds.push(a.id);
    ogrenciIds.sort((x, y) => x - y);
    for (const id of ogrenciIds.slice(0, kapasite)) yurtSakinleri.add(id);
  }

  return {
    dk,
    ogrenmeCarpan: (1 + libraryLevel(state) * BALANCE.KUTUPHANE_OGRENME_BONUS)
      * (state.vizyon === 'egitim' ? 1.18 : state.vizyon === 'arastirma' ? 0.92
        : state.vizyon === 'girisim' ? 0.95 : 1),
    mutfak,
    teacherRooms,
    teacherSkill,
    teacherEtki,
    blokDersleri,
    objById,
    freeSira,
    freeKlozet,
    freeYemekSandalye,
    freeKantinSandalye,
    freeOtomat,
    freeBank,
    freeMasa,
    freeBanko,
    tahtaByRoom,
    deskOf,
    bankoOf,
    labs,
    kutuphaneler,
    kutuphaneIds: new Set(kutuphaneler.map((r) => r.id)),
    deptAlan,
    yurtOdalar,
    yurtSakinleri,
    freeAktivite,
    ulasim: ulasimSeviyesi(state),
    yemekhaneler,
    kantinler,
    deptClassrooms,
    academicIndex,
    copYakini: copYakiniSet(state),
    ogrenciSayisi,
    tatil: tatilMi(state.gun),
    gucCarpan: gucCarpani(state),
  };
}

// --- Hareket ve hedef yardımcıları -------------------------------------------

function moveAgent(state: GameState, a: Agent, dtMin: number): void {
  let butce = SPEED[a.kind] * dtMin;
  while (butce > 0 && a.path.length > 0) {
    const h = a.path[0];
    // yol üstüne sonradan duvar örüldüyse rotayı iptal et (bosta karar verilir)
    if (!walkable(state, h.x, h.y)) {
      a.path = [];
      break;
    }
    const dx = h.x - a.x, dy = h.y - a.y;
    const mesafe = Math.hypot(dx, dy);
    if (mesafe <= butce) {
      a.x = h.x;
      a.y = h.y;
      a.path.shift();
      butce -= mesafe;
    } else {
      a.x += (dx / mesafe) * butce;
      a.y += (dy / mesafe) * butce;
      butce = 0;
    }
  }
}

/** Hedefe yol kur; oradaysa path boş kalır. Ulaşılamıyorsa false. */
function goTo(state: GameState, a: Agent, hedef: Point): boolean {
  const sx = Math.round(a.x), sy = Math.round(a.y);
  if (sx === hedef.x && sy === hedef.y) {
    a.path = [];
    return true;
  }
  const p = findPath(state, { x: sx, y: sy }, hedef);
  if (p.length === 0) return false;
  a.path = p;
  return true;
}

function randomWalkableFloorTile(state: GameState): Point | null {
  for (let i = 0; i < 12; i++) {
    const x = randInt(state, 0, MAP_W - 1);
    const y = randInt(state, 0, MAP_H - 1);
    if (state.floor[tileIndex(x, y)] !== null && walkable(state, x, y)) return { x, y };
  }
  for (let i = 0; i < 8; i++) {
    const x = randInt(state, 0, MAP_W - 1);
    const y = randInt(state, 0, MAP_H - 1);
    if (walkable(state, x, y)) return { x, y };
  }
  return null;
}

function randomRoomTile(state: GameState, oda: Room): Point | null {
  for (let i = 0; i < 8; i++) {
    const t = pick(state, oda.tiles);
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (walkable(state, x, y)) return { x, y };
  }
  for (const t of oda.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (walkable(state, x, y)) return { x, y };
  }
  return null;
}

function adjacentWalkable(state: GameState, o: PlacedObject): Point | null {
  const komsular = [
    [o.x + 1, o.y], [o.x - 1, o.y], [o.x, o.y + 1], [o.x, o.y - 1],
  ] as const;
  for (const [x, y] of komsular) {
    if (walkable(state, x, y)) return { x, y };
  }
  return walkable(state, o.x, o.y) ? { x: o.x, y: o.y } : null;
}

function idleWander(state: GameState, a: Agent, dtMin: number): void {
  if (a.path.length > 0) return;
  if (!chance(state, dtMin / 15)) return;
  const hedef = randomWalkableFloorTile(state);
  if (hedef) goTo(state, a, hedef);
}

// --- Ortak yaşam döngüsü -----------------------------------------------------

function leaveCampus(state: GameState, a: Agent): void {
  a.onCampus = false;
  a.activity = 'yok';
  a.path = [];
  a.usingObject = -1;
  a.activityUntil = -1;
  // evde geçen gece: yemek, uyku, banyo — ihtiyaçlar büyük ölçüde sıfırlanır
  if (a.kind === 'ogrenci') {
    // günü çok aç kapatan öğrenci "aç kaldı" sayılır — sadece yemekhane
    // kuyruğunda değil, yemeğe HİÇ ulaşamayanlar da rapora girer
    if (a.needs.aclik > 75) state.acKalanBugun++;
    a.needs.aclik = randRange(state, 10, 25);
    a.needs.tuvalet = randRange(state, 5, 15);
    a.needs.enerji = randRange(state, 10, 25);
    a.needs.eglence = Math.max(0, a.needs.eglence * 0.5);
    a.mutluluk = clamp(a.mutluluk + 0.5, 0, 100);
  }
}

function finishActivity(state: GameState, a: Agent, ctx: Ctx): void {
  if (a.usingObject !== -1) {
    const o = ctx.objById.get(a.usingObject);
    if (o && o.reservedBy === a.id) o.reservedBy = -1;
  }
  a.usingObject = -1;
  a.activityUntil = -1;
  a.activity = 'bosta';
}

function maybeArrive(state: GameState, a: Agent, dk: number, dtMin: number, ulasim: number): void {
  if (dk < T.KAMPUS_ACILIS || dk >= T.CIKIS) return;
  // kademeli varış: açılış penceresinde seyrek, sonrasında hızla tamamlanır;
  // servis durakları gelişi hızlandırır (durak başına +%35); Pazar kampüs tenha
  const p = (dk < T.DERS1 ? dtMin / 30 : dtMin / 4) * (1 + 0.35 * ulasim)
    * (tatilMi(state.gun) ? 0.45 : 1);
  if (!chance(state, p)) return;
  a.onCampus = true;
  a.x = GATE.x;
  a.y = GATE.y;
  a.path = [];
  a.activity = 'geliyor';
  a.usingObject = -1;
  a.activityUntil = -1;
  const hedef = randomWalkableFloorTile(state);
  if (!hedef || !goTo(state, a, hedef)) {
    // kapıdan kampüse yol YOK (giriş duvarla kapanmış olabilir) — sessizce
    // yığılmak yerine oyuncu uyarılır (günde bir kez)
    if (state.sonErisimUyariGunu !== state.gun) {
      state.sonErisimUyariGunu = state.gun;
      notify(state, '🚧 Gelenler kampüse GİREMİYOR — girişten binalara yürünebilir yol yok! Kapı önünü ve duvarları kontrol et.', 'kotu');
    }
  }
}

function depositDirt(state: GameState, a: Agent, dtMin: number, ctx: Ctx): void {
  const idx = tileIndex(Math.round(a.x), Math.round(a.y));
  const oran = ctx.copYakini.has(idx) ? 0.01 : 0.02;
  state.dirt[idx] = Math.min(100, state.dirt[idx] + oran * dtMin);
}

// --- Öğrenci -----------------------------------------------------------------

function enBuyukIhtiyac(n: Needs, esik: number): keyof Needs | null {
  let sec: keyof Needs | null = null;
  let deger = esik;
  const anahtarlar: (keyof Needs)[] = ['tuvalet', 'aclik', 'enerji', 'eglence'];
  for (const k of anahtarlar) {
    if (n[k] > deger) {
      deger = n[k];
      sec = k;
    }
  }
  return sec;
}

/**
 * Listeden ajana EN YAKIN eşyayı alır (listeden çıkarır). Eskiden "son inşa
 * edilen" (LIFO) seçiliyordu — öğrenci kampüsün öbür ucundaki tuvalete koşuyordu.
 */
function enYakinNesne(liste: PlacedObject[], a: Agent): PlacedObject | undefined {
  if (liste.length === 0) return undefined;
  let sec = 0;
  let enKisa = Infinity;
  for (let i = 0; i < liste.length; i++) {
    const d = Math.abs(liste[i].x - a.x) + Math.abs(liste[i].y - a.y);
    if (d < enKisa) { enKisa = d; sec = i; }
  }
  return liste.splice(sec, 1)[0];
}

function trySatisfy(state: GameState, s: Student, ctx: Ctx, need: keyof Needs): boolean {
  let obj: PlacedObject | undefined;
  let git: AgentActivity = 'ihtiyaca_gidiyor';
  if (need === 'tuvalet') {
    obj = enYakinNesne(ctx.freeKlozet, s);
  } else if (need === 'aclik') {
    git = 'yemege_gidiyor';
    // yemekhane ancak servis açıksa VE yemek stoğu varsa doyurur
    if (ctx.mutfak && state.yemekStok >= 1) obj = enYakinNesne(ctx.freeYemekSandalye, s);
    if (!obj) obj = enYakinNesne(ctx.freeOtomat, s);
  } else {
    // sosyal aktiviteler öncelikli: basket/satranç/sahne kampüs yaşamını canlandırır
    obj = enYakinNesne(ctx.freeAktivite, s) ?? enYakinNesne(ctx.freeKantinSandalye, s)
      ?? enYakinNesne(ctx.freeBank, s);
  }
  if (!obj) return false;
  obj.reservedBy = s.id;
  if (!goTo(state, s, { x: obj.x, y: obj.y })) {
    obj.reservedBy = -1;
    return false;
  }
  s.usingObject = obj.id;
  s.activity = git;
  s.activityUntil = -1;
  return true;
}

function tryClass(state: GameState, s: Student, ctx: Ctx, blok: number): boolean {
  // 😴 tembel kişilik: ara sıra dersi asar (o blok başka şeyle oyalanır)
  if (s.kisilik === 'tembel' && chance(state, 0.12)) return false;
  const yigin = ctx.freeSira.get(s.deptId);
  const obj = yigin ? yigin.pop() : undefined;
  if (!obj) return false;
  obj.reservedBy = s.id;
  if (!goTo(state, s, { x: obj.x, y: obj.y })) {
    obj.reservedBy = -1;
    return false;
  }
  s.usingObject = obj.id;
  s.activity = 'derse_gidiyor';
  s.activityUntil = blok + BLOK_SURE;
  return true;
}

function tryResearch(state: GameState, s: Student, ctx: Ctx, bitis: number): boolean {
  const odalar = ctx.labs.length > 0 ? ctx.labs : ctx.kutuphaneler;
  if (odalar.length === 0) return false;
  const oda = pick(state, odalar);
  const hedef = randomRoomTile(state, oda);
  if (!hedef || !goTo(state, s, hedef)) return false;
  s.activity = 'arastirmaya_gidiyor';
  s.activityUntil = bitis;
  return true;
}

/** Kütüphanede ders çalışmaya git (lisans dahil herkes). */
function tryKutuphane(state: GameState, s: Student, ctx: Ctx, bitis: number): boolean {
  if (ctx.kutuphaneler.length === 0) return false;
  const oda = pick(state, ctx.kutuphaneler);
  const hedef = randomRoomTile(state, oda);
  if (!hedef || !goTo(state, s, hedef)) return false;
  s.activity = 'arastirmaya_gidiyor';
  s.activityUntil = bitis;
  return true;
}

function decideStudent(state: GameState, s: Student, dtMin: number, ctx: Ctx): void {
  const dk = ctx.dk;
  const n = s.needs;

  // 1) kritik ihtiyaç
  const kritik = enBuyukIhtiyac(n, 75);
  if (kritik && trySatisfy(state, s, ctx, kritik)) return;

  // 2/4) ders bloğu — YL/doktora blokların yarısında araştırmayı seçer
  // (Pazar tatili: ders yok, gün sosyalleşmeye kalır)
  const blok = ctx.tatil ? -1 : dersBlogu(dk);
  if (blok !== -1) {
    const bitis = blok + BLOK_SURE;
    if (s.level !== 'lisans' && chance(state, 0.5)) {
      if (tryResearch(state, s, ctx, bitis)) return;
    }
    // kitaplı kütüphane cazibesi: alanının koleksiyonu varsa bazı öğrenciler
    // dersi kütüphane çalışmasına tercih eder (kitap yatırımı karşılığını verir)
    const alan = ctx.deptAlan.get(s.deptId);
    const kutupCekim = s.kisilik === 'kitapkurdu' ? 0.4 : 0.2; // 🐛 kitap kurdu 2× çekilir
    if (alan && (state.kitapKoleksiyon[alan] ?? 0) > 0 && chance(state, kutupCekim)
        && tryKutuphane(state, s, ctx, bitis)) return;
    if (tryClass(state, s, ctx, blok)) return;
    if (s.level !== 'lisans' && tryResearch(state, s, ctx, bitis)) return;
    if (tryKutuphane(state, s, ctx, bitis)) return; // sıra yok: kütüphanede çalış
  }

  // 3) öğle yemeği
  if (dk >= T.OGLE && dk < T.DERS3 && n.aclik > 10) {
    if (trySatisfy(state, s, ctx, 'aclik')) return;
  }

  // 5) yüksek (kritik olmayan) ihtiyaç, kendi kendine kütüphane çalışması ya da gezinme
  const yuksek = enBuyukIhtiyac(n, 60);
  if (yuksek && trySatisfy(state, s, ctx, yuksek)) return;
  if (chance(state, s.kisilik === 'kitapkurdu' ? 0.6 : 0.3) && tryKutuphane(state, s, ctx, dk + 90)) return;
  idleWander(state, s, dtMin);
}

function updateStudent(state: GameState, s: Student, dtMin: number, ctx: Ctx): void {
  const dk = ctx.dk;
  const n = s.needs;

  // ihtiyaç artışı
  n.aclik = clamp(n.aclik + BALANCE.NEED_RATE.aclik * dtMin, 0, 100);
  n.tuvalet = clamp(n.tuvalet + BALANCE.NEED_RATE.tuvalet * dtMin, 0, 100);
  n.enerji = clamp(n.enerji + BALANCE.NEED_RATE.enerji * dtMin, 0, 100);
  n.eglence = clamp(n.eglence + BALANCE.NEED_RATE.eglence * dtMin, 0, 100);

  // mutluluk
  if (n.aclik > 85 || n.tuvalet > 85 || n.enerji > 85 || n.eglence > 85) {
    s.mutluluk -= 0.06 * dtMin;
  } else if (n.aclik < 50 && n.tuvalet < 50 && n.enerji < 50 && n.eglence < 50) {
    s.mutluluk += 0.01 * dtMin;
  }
  s.mutluluk = clamp(s.mutluluk, 0, 100);

  switch (s.activity) {
    case 'derse_gidiyor':
      if (s.activityUntil !== -1 && dk >= s.activityUntil) finishActivity(state, s, ctx);
      else if (s.path.length === 0) s.activity = 'derste';
      break;
    case 'derste': {
      if (s.activityUntil !== -1 && dk >= s.activityUntil) {
        finishActivity(state, s, ctx);
        break;
      }
      const rid = state.roomAt[tileIndex(Math.round(s.x), Math.round(s.y))];
      const ogretmenli = rid >= 0 && ctx.teacherRooms.get(rid)?.has(s.deptId) === true;
      // hocanın eğitim becerisi VE dersin alanına uygunluğu (× hoca ders yükü) öğrenme hızını etkiler
      const kalite = ogretmenli
        ? (0.6 + (ctx.teacherSkill.get(rid) ?? 50) / 125) * (ctx.teacherEtki.get(rid) ?? 1)
        : BALANCE.OGRETMENSIZ_CARPAN;
      // öğrencinin kendi öğrenme eğilimi de hızı ve not ortalamasını belirler;
      // dönemin son 3 günü SINAV HAFTASI: herkes asılır (×1.25)
      const sinavHaftasi = donemGunu(state.gun) > DONEM_GUN - 3 ? 1.25 : 1;
      const efektif = kalite * (s.egilim / 100) * ctx.ogrenmeCarpan * sinavHaftasi * ctx.gucCarpan;
      s.ilerleme = clamp(s.ilerleme + (BALANCE.DERS_ILERLEME / BLOK_SURE) * dtMin * efektif, 0, 100);
      s.kaliteToplam += efektif * dtMin;
      s.dersDakika += dtMin;
      // her ders alanına göre nitelik kazandırır (artist/pratik dersleri influencer'ı da besler)
      const dersId = ctx.blokDersleri.get(s.deptId);
      if (dersId) {
        const alan = courseDef(dersId).birincil;
        // mentorluk programı: mezun mentorlar nitelik gelişimini hızlandırır
        const mentor = state.mentorluk ? 1.15 : 1;
        const artis = (2.0 / BLOK_SURE) * dtMin * efektif * mentor;
        s.nitelik[alan] = clamp(s.nitelik[alan] + artis, 0, 100);
        if (alan === 'artist' || alan === 'pratik') {
          s.nitelik.influencer = clamp(s.nitelik.influencer + artis * 0.35, 0, 100);
        }
      }
      break;
    }
    case 'yemege_gidiyor':
      if (s.path.length === 0) {
        // yemekhane sandalyesindeyse tabldot alınır: 1 porsiyon stoktan düşer;
        // yürürken stok bittiyse aç kalır (mutsuzluk + sayaç) — otomat porsiyon istemez
        const oturak = ctx.objById.get(s.usingObject);
        if (oturak && oturak.type === 'sandalye') {
          if (state.yemekStok >= 1) {
            state.yemekStok -= 1;
          } else {
            state.acKalanBugun++;
            s.mutluluk = clamp(s.mutluluk - 3, 0, 100);
            finishActivity(state, s, ctx);
            break;
          }
        }
        s.activity = 'yemekte';
        s.activityUntil = dk + 30;
      }
      break;
    case 'yemekte': {
      // sıcak yemek (sandalye) hızlı doyurur, otomat atıştırması yavaş
      const oturak = ctx.objById.get(s.usingObject);
      const doyma = oturak && oturak.type === 'sandalye' ? 3 : 1.8;
      n.aclik = clamp(n.aclik - doyma * dtMin, 0, 100);
      if (n.aclik <= 5 || (s.activityUntil !== -1 && dk >= s.activityUntil)) {
        finishActivity(state, s, ctx);
      }
      break;
    }
    case 'ihtiyaca_gidiyor':
      if (s.path.length === 0) {
        s.activity = 'ihtiyacta';
        s.activityUntil = dk + 45;
      }
      break;
    case 'ihtiyacta': {
      const o = ctx.objById.get(s.usingObject);
      let bitti = true;
      if (o && o.type === 'klozet') {
        n.tuvalet = clamp(n.tuvalet - 2 * dtMin, 0, 100);
        bitti = n.tuvalet <= 5;
      } else if (o) {
        // sosyal alanlar: dinlenme + eğlence + türe göre nitelik gelişimi
        n.enerji = clamp(n.enerji - 2 * dtMin, 0, 100);
        n.eglence = clamp(n.eglence - (o.type === 'basket_potasi' || o.type === 'muzik_sahnesi' ? 3 : 2) * dtMin, 0, 100);
        s.nitelik.influencer = clamp(s.nitelik.influencer + 0.04 * dtMin, 0, 100);
        if (o.type === 'satranc_masasi') s.nitelik.filozof = clamp(s.nitelik.filozof + 0.08 * dtMin, 0, 100);
        else if (o.type === 'muzik_sahnesi') s.nitelik.artist = clamp(s.nitelik.artist + 0.08 * dtMin, 0, 100);
        else if (o.type === 'basket_potasi') s.nitelik.influencer = clamp(s.nitelik.influencer + 0.06 * dtMin, 0, 100);
        bitti = n.enerji <= 5 && n.eglence <= 5;
      }
      if (bitti || (s.activityUntil !== -1 && dk >= s.activityUntil)) {
        finishActivity(state, s, ctx);
      }
      break;
    }
    case 'arastirmaya_gidiyor':
      if (s.activityUntil !== -1 && dk >= s.activityUntil) finishActivity(state, s, ctx);
      else if (s.path.length === 0) s.activity = 'arastiriyor';
      break;
    case 'arastiriyor': {
      // kütüphane/lab çalışması: kütüphanedeyse hız, bölüm alanının KİTAP
      // koleksiyonuna bağlıdır — kitapsız alanda yavaş, koleksiyon büyüdükçe hızlı
      const rid = state.roomAt[tileIndex(Math.round(s.x), Math.round(s.y))];
      const kutuphanede = rid >= 0 && ctx.kutuphaneIds.has(rid);
      const alan = ctx.deptAlan.get(s.deptId);
      const kitap = kutuphanede && alan ? kitapCarpani(state, alan) : 1;
      const tez = kitap * (s.egilim / 100) * ctx.ogrenmeCarpan;
      s.ilerleme = clamp(s.ilerleme + (BALANCE.DERS_ILERLEME / BLOK_SURE) * dtMin * tez, 0, 100);
      s.kaliteToplam += 1.1 * tez * dtMin;
      s.dersDakika += dtMin;
      // 📜 tez aşamasındaki lisansüstü: araştırma dakikaları teze birikir
      if (s.level !== 'lisans' && s.asama === 'tez') {
        s.tezPuan = (s.tezPuan ?? 0) + dtMin * tez;
      }
      if (kutuphanede && alan) {
        s.nitelik[alan] = clamp(s.nitelik[alan] + (1.4 / BLOK_SURE) * dtMin * tez, 0, 100);
      }
      if (s.activityUntil !== -1 && dk >= s.activityUntil) finishActivity(state, s, ctx);
      break;
    }
    case 'bosta':
      decideStudent(state, s, dtMin, ctx);
      break;
    default:
      break;
  }
}

// --- Akademisyen ---------------------------------------------------------------

function assignedClassroom(a: Academic, ctx: Ctx): Room | null {
  const odalar = ctx.deptClassrooms.get(a.deptId);
  if (!odalar || odalar.length === 0) return null;
  const i = ctx.academicIndex.get(a.id) ?? 0;
  return i < odalar.length ? odalar[i] : null;
}

function teachTarget(state: GameState, oda: Room, ctx: Ctx): Point | null {
  const tahta = ctx.tahtaByRoom.get(oda.id);
  if (tahta) {
    const yan = adjacentWalkable(state, tahta);
    if (yan) return yan;
  }
  const merkez = roomCenter(oda);
  if (walkable(state, merkez.x, merkez.y)) return merkez;
  return randomRoomTile(state, oda);
}

function startAcademicResearch(state: GameState, a: Academic, ctx: Ctx): void {
  // kendi masası duruyorsa oraya, yoksa EN YAKIN boş ofis masasını rezerve et
  let masa = ctx.deskOf.get(a.id);
  if (!masa) {
    masa = enYakinNesne(ctx.freeMasa, a);
    if (masa) {
      masa.reservedBy = a.id;
      ctx.deskOf.set(a.id, masa);
    }
  }
  if (masa && goTo(state, a, { x: masa.x, y: masa.y })) {
    a.usingObject = masa.id;
    a.activity = 'arastirmaya_gidiyor';
    a.activityUntil = -1;
    return;
  }
  const odalar = ctx.labs.length > 0 ? ctx.labs : ctx.kutuphaneler;
  if (odalar.length > 0) {
    const hedef = randomRoomTile(state, pick(state, odalar));
    if (hedef && goTo(state, a, hedef)) {
      a.activity = 'arastirmaya_gidiyor';
      a.activityUntil = -1;
      return;
    }
  }
  a.activity = 'bosta';
}

function updateAcademic(state: GameState, a: Academic, dtMin: number, ctx: Ctx): void {
  const dk = ctx.dk;
  const blok = ctx.tatil ? -1 : dersBlogu(dk); // Pazar: ders yok, araştırma günü

  if (a.activity === 'ders_veriyor') {
    a.xp += (BALANCE.XP_DERS / BLOK_SURE) * dtMin;
  }

  // istenen mod
  let mod: 'ders' | 'yemek' | 'arastirma' = 'arastirma';
  let sinif: Room | null = null;
  if (blok !== -1) {
    sinif = assignedClassroom(a, ctx);
    if (sinif) mod = 'ders';
  } else if (dk >= T.OGLE && dk < T.DERS3
    && (ctx.yemekhaneler.length > 0 || ctx.kantinler.length > 0)) {
    mod = 'yemek';
  }

  if (mod === 'ders' && sinif) {
    // derse geçerken ofis masası SERBEST bırakılır — rezervasyon bütün gün
    // hocanın üstünde kalıp masa kıtlığında diğerlerini araştırmasız bırakmasın
    const masa = ctx.deskOf.get(a.id);
    if (masa && masa.reservedBy === a.id) {
      masa.reservedBy = -1;
      ctx.deskOf.delete(a.id);
      ctx.freeMasa.push(masa);
    }
    if (a.activity === 'ders_veriyor') {
      a.activityUntil = blok + BLOK_SURE;
    } else if (a.activity === 'derse_gidiyor') {
      if (a.path.length === 0) a.activity = 'ders_veriyor';
      a.activityUntil = blok + BLOK_SURE;
    } else {
      const hedef = teachTarget(state, sinif, ctx);
      a.usingObject = -1;
      if (hedef && goTo(state, a, hedef)) {
        a.activity = a.path.length > 0 ? 'derse_gidiyor' : 'ders_veriyor';
        a.activityUntil = blok + BLOK_SURE;
      } else {
        a.activity = 'bosta';
        idleWander(state, a, dtMin);
      }
    }
    return;
  }

  if (mod === 'yemek') {
    if (a.activity === 'yemekte') {
      if (a.activityUntil !== -1 && dk >= a.activityUntil) a.activity = 'bosta';
      return;
    }
    if (a.activity === 'yemege_gidiyor') {
      if (a.path.length === 0) {
        a.activity = 'yemekte';
        a.activityUntil = dk + 40;
      }
      return;
    }
    const odalar = ctx.yemekhaneler.length > 0 ? ctx.yemekhaneler : ctx.kantinler;
    const hedef = randomRoomTile(state, pick(state, odalar));
    if (hedef && goTo(state, a, hedef)) {
      a.activity = 'yemege_gidiyor';
      a.activityUntil = -1;
    } else {
      a.activity = 'bosta';
      idleWander(state, a, dtMin);
    }
    return;
  }

  // arastirma
  if (a.activity === 'arastiriyor') return;
  if (a.activity === 'arastirmaya_gidiyor') {
    if (a.path.length === 0) a.activity = 'arastiriyor';
    return;
  }
  startAcademicResearch(state, a, ctx);
  if (a.activity === 'bosta') idleWander(state, a, dtMin);
}

// --- Personel ------------------------------------------------------------------

/** Personel hız çarpanı: usta personel işini daha hızlı yapar (0.94 → 1.5). */
function beceriCarpani(a: StaffAgent): number {
  return 0.7 + (a.beceri ?? 40) / 125;
}

/** Çalışırken beceri gelişimi (günde ~+0.6, 100'de durur). */
function beceriGelis(a: StaffAgent, dtMin: number): void {
  a.beceri = Math.min(100, (a.beceri ?? 40) + 0.0012 * dtMin);
}

/**
 * Personel molası: pencere içinde işi bırakıp kantin/yemekhanede soluklanır —
 * personel de insandır, robot gibi kesintisiz çalışmaz. true = mola sürüyor.
 */
function personelMola(state: GameState, a: StaffAgent, ctx: Ctx, bas: number, bit: number): boolean {
  const dk = ctx.dk;
  if (a.activity === 'yemekte') {
    if (dk >= bit || dk < bas) { a.activity = 'bosta'; return false; }
    return true;
  }
  if (dk < bas || dk >= bit) return false;
  if (a.activity === 'yemege_gidiyor') {
    if (a.path.length === 0) a.activity = 'yemekte';
    return true;
  }
  const odalar = ctx.kantinler.length > 0 ? ctx.kantinler : ctx.yemekhaneler;
  if (odalar.length === 0) return false;
  const hedef = randomRoomTile(state, odalar[a.id % odalar.length]);
  if (hedef && goTo(state, a, hedef)) {
    if (a.usingObject !== -1) finishActivity(state, a, ctx);
    a.activity = 'yemege_gidiyor';
    return true;
  }
  return false;
}

function updateCook(state: GameState, a: StaffAgent, dtMin: number, ctx: Ctx): void {
  const mesai = ctx.dk >= ASCI_BASLA && ctx.dk < ASCI_BITIS;
  if (a.activity === 'calisiyor' && mesai) {
    // mutfak üretimi: banko başındaki her aşçı porsiyon üretir (malzeme gideri
    // günlük düşülür); usta aşçı daha hızlı üretir. İSRAF FRENİ: stok, öğrenci
    // sayısına göre tavana dayandıysa üretim durur — gün sonunda çöpe gidecek
    // porsiyonlar için malzeme parası yakılmaz.
    const stokTavani = ctx.ogrenciSayisi * BALANCE.YEMEK_STOK_PAY + 10;
    if (state.yemekStok < stokTavani) {
      const uretim = BALANCE.ASCI_URETIM_DK * beceriCarpani(a) * dtMin;
      state.yemekStok += uretim;
      state.gunlukUretim += uretim;
      beceriGelis(a, dtMin);
    }
  }
  if (!mesai) {
    if (a.activity === 'calisiyor' || (a.usingObject !== -1 && a.activity !== 'yemekte')) {
      finishActivity(state, a, ctx);
    }
    const banko = ctx.bankoOf.get(a.id);
    if (banko && banko.reservedBy === a.id) {
      banko.reservedBy = -1;
      ctx.bankoOf.delete(a.id);
    }
    // mesai bitti: aşçı da yemeğini yer (servisi bitirenin molası)
    if (personelMola(state, a, ctx, ASCI_BITIS, ASCI_BITIS + 45)) return;
    idleWander(state, a, dtMin);
    return;
  }
  if (a.activity === 'calisiyor') return;
  if (a.activity === 'geliyor' && a.path.length > 0) return;

  let banko = ctx.bankoOf.get(a.id);
  if (!banko) {
    banko = ctx.freeBanko.pop();
    if (banko) {
      banko.reservedBy = a.id;
      ctx.bankoOf.set(a.id, banko);
    }
  }
  if (!banko) {
    idleWander(state, a, dtMin);
    return;
  }
  const hedef = adjacentWalkable(state, banko);
  if (hedef && goTo(state, a, hedef)) {
    a.usingObject = banko.id;
    a.activity = a.path.length > 0 ? 'geliyor' : 'calisiyor';
  } else {
    idleWander(state, a, dtMin);
  }
}

function dirtiestTile(state: GameState): number {
  let idx = -1;
  let enKirli = 20;
  const boyut = MAP_W * MAP_H;
  for (let t = 0; t < boyut; t++) {
    if (state.dirt[t] > enKirli) {
      enKirli = state.dirt[t];
      idx = t;
    }
  }
  return idx;
}

function updateJanitor(state: GameState, a: StaffAgent, dtMin: number, ctx: Ctx): void {
  if (personelMola(state, a, ctx, T.OGLE + 20, T.DERS3)) return;
  if (a.activity === 'calisiyor') {
    const idx = tileIndex(Math.round(a.x), Math.round(a.y));
    state.dirt[idx] = Math.max(0, state.dirt[idx] - 8 * beceriCarpani(a) * dtMin);
    beceriGelis(a, dtMin);
    if (state.dirt[idx] <= 0) a.activity = 'bosta';
    return;
  }
  if (a.activity === 'geliyor' && a.path.length > 0) return;

  const hedefIdx = dirtiestTile(state);
  if (hedefIdx !== -1) {
    const hedef = { x: hedefIdx % MAP_W, y: Math.floor(hedefIdx / MAP_W) };
    if (goTo(state, a, hedef)) {
      a.activity = a.path.length > 0 ? 'geliyor' : 'calisiyor';
      return;
    }
  }
  a.activity = 'bosta';
  idleWander(state, a, dtMin);
}

/**
 * Tamirci/usta: en yakın bozuk eşyayı onarır; bozuk eşya yoksa ŞANTİYEDE
 * çalışır (inşaatı büyük hızlandırır — ilerleme insaatIlerlet'te işlenir).
 */
function updateRepairman(state: GameState, a: StaffAgent, dtMin: number, ctx: Ctx): void {
  if (personelMola(state, a, ctx, T.OGLE + 20, T.DERS3)) return;
  if (a.activity === 'calisiyor') {
    if (a.usingObject === -1) {
      // şantiye ustalığı: durduğu oda hâlâ inşaattaysa çalışmaya devam
      const rid = state.roomAt[tileIndex(Math.round(a.x), Math.round(a.y))];
      const oda = rid >= 0 ? state.rooms.find((r) => r.id === rid) : undefined;
      if (!oda || (oda.insaat ?? 0) <= 0) a.activity = 'bosta';
      else beceriGelis(a, dtMin);
      return;
    }
    const o = state.objects.find((x) => x.id === a.usingObject);
    if (!o) {
      a.usingObject = -1;
      a.activity = 'bosta';
      return;
    }
    o.yipranma = Math.max(0, (o.yipranma ?? 0) - BALANCE.TAMIR_HIZ * beceriCarpani(a) * dtMin);
    beceriGelis(a, dtMin);
    if (o.yipranma <= 0) {
      if (o.reservedBy === a.id) o.reservedBy = -1;
      a.usingObject = -1;
      a.activity = 'bosta';
    }
    return;
  }
  if (a.activity === 'geliyor' && a.path.length > 0) return;
  if (a.usingObject !== -1 && a.path.length === 0) {
    a.activity = 'calisiyor'; // bozuk eşyanın başına vardı
    return;
  }

  // en yakın, başka tamircinin üstlenmediği bozuk eşya
  let hedef: PlacedObject | null = null;
  let enYakin = Infinity;
  for (const o of state.objects) {
    if ((o.yipranma ?? 0) < 100 || o.reservedBy !== -1) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < enYakin) {
      enYakin = d;
      hedef = o;
    }
  }
  if (hedef) {
    const yan = adjacentWalkable(state, hedef) ?? { x: hedef.x, y: hedef.y };
    if (goTo(state, a, yan)) {
      hedef.reservedBy = a.id;
      a.usingObject = hedef.id;
      a.activity = a.path.length > 0 ? 'geliyor' : 'calisiyor';
      return;
    }
  }

  // bozuk eşya yok: şantiye varsa oraya koş — usta başında inşaat 2 kat hızlanır
  const santiye = state.rooms.find((r) => (r.insaat ?? 0) > 0);
  if (santiye) {
    const hedefKaro = randomRoomTile(state, santiye);
    if (hedefKaro && goTo(state, a, hedefKaro)) {
      a.usingObject = -1;
      a.activity = a.path.length > 0 ? 'geliyor' : 'calisiyor';
      return;
    }
  }
  a.activity = 'bosta';
  idleWander(state, a, dtMin);
}

/**
 * Güvenlik: kampüsü devriye gezer; aktif yangın varsa en yakınına koşar
 * (yakınlığı yangını söndürür — incidents.ts okur). Salgında da hijyen sağlar.
 */
function updateGuard(state: GameState, a: StaffAgent, dtMin: number, ctx: Ctx): void {
  if (personelMola(state, a, ctx, T.OGLE + 20, T.DERS3)) return;
  // yangına müdahale: en yakın yangına yönel
  if (state.yanginlar.length > 0) {
    let hedef = state.yanginlar[0];
    let enYakin = Infinity;
    for (const y of state.yanginlar) {
      const d = Math.abs(y.x - a.x) + Math.abs(y.y - a.y);
      if (d < enYakin) { enYakin = d; hedef = y; }
    }
    if (enYakin > 2) {
      if (a.path.length === 0) goTo(state, a, { x: Math.round(hedef.x), y: Math.round(hedef.y) });
      a.activity = 'calisiyor';
      return;
    }
    a.activity = 'calisiyor'; // yangının başında — söndürüyor
    beceriGelis(a, dtMin);
    return;
  }
  // devriye
  a.activity = 'bosta';
  idleWander(state, a, dtMin);
}

// --- Ana güncelleme --------------------------------------------------------------

export function updateAgents(state: GameState, dtMin: number): void {
  const dk = state.dakika;
  const ctx = buildCtx(state, dk);

  for (const a of state.agents) {
    if (!a.onCampus) {
      maybeArrive(state, a, dk, dtMin, ctx.ulasim);
      continue;
    }

    // kampüs kapanışı: yurt sakinleri YURDA çekilip uyur, kalanlar zorla çıkarılır
    if (dk >= T.KAMPUS_KAPANIS) {
      if (a.kind === 'ogrenci' && ctx.yurtSakinleri.has(a.id) && ctx.yurtOdalar.length > 0) {
        if (a.activity !== 'ihtiyacta') {
          releaseReservations(state, a.id);
          const oda = ctx.yurtOdalar[a.id % ctx.yurtOdalar.length];
          const hedef = randomRoomTile(state, oda);
          if (hedef) { a.x = hedef.x; a.y = hedef.y; }
          a.path = [];
          a.usingObject = -1;
          a.activity = 'ihtiyacta'; // yurt uykusu
          a.activityUntil = -1;
          // yurtta geçen gece: ihtiyaçlar tazelenir, morale küçük bonus
          a.needs.aclik = randRange(state, 10, 25);
          a.needs.tuvalet = randRange(state, 5, 15);
          a.needs.enerji = randRange(state, 5, 20);
          a.needs.eglence = Math.max(0, a.needs.eglence * 0.4);
          a.mutluluk = clamp(a.mutluluk + 1, 0, 100);
        }
        continue; // uyuyor — gece görünür kalabalık
      }
      releaseReservations(state, a.id);
      leaveCampus(state, a);
      a.x = GATE.x;
      a.y = GATE.y;
      continue;
    }

    // sabah: yurtta uyuyan sakinler kampüs açılışında uyanır
    if (a.kind === 'ogrenci' && a.activity === 'ihtiyacta' && a.usingObject === -1
        && ctx.yurtSakinleri.has(a.id) && dk >= T.KAMPUS_ACILIS && dk < T.CIKIS) {
      a.activity = 'bosta';
      a.activityUntil = -1;
    }

    depositDirt(state, a, dtMin, ctx);

    // çıkış saati: yurt sakinleri kampüste kalır (akşam sosyalleşir/kütüphaneye gider),
    // diğerleri her şeyi bırakıp kapıya yönelir
    const yurtta = a.kind === 'ogrenci' && ctx.yurtSakinleri.has(a.id) && ctx.yurtOdalar.length > 0;
    if (dk >= T.CIKIS && a.activity !== 'cikiyor' && !yurtta) {
      releaseReservations(state, a.id);
      a.usingObject = -1;
      a.activityUntil = -1;
      a.activity = 'cikiyor';
      goTo(state, a, GATE);
    }

    moveAgent(state, a, dtMin);

    if (a.activity === 'cikiyor') {
      if (a.path.length === 0) {
        if (Math.round(a.x) === GATE.x && Math.round(a.y) === GATE.y) {
          leaveCampus(state, a);
        } else if (chance(state, dtMin / 5)) {
          goTo(state, a, GATE); // yol tıkalıysa ara sıra yeniden dene
        }
      }
      continue;
    }

    // kapıdan hedefe varış
    if (a.activity === 'geliyor' && a.path.length === 0) a.activity = 'bosta';

    switch (a.kind) {
      case 'ogrenci':
        updateStudent(state, a, dtMin, ctx);
        break;
      case 'akademisyen':
        updateAcademic(state, a, dtMin, ctx);
        break;
      case 'asci':
        updateCook(state, a, dtMin, ctx);
        break;
      case 'temizlikci':
        updateJanitor(state, a, dtMin, ctx);
        break;
      case 'tamirci':
        updateRepairman(state, a, dtMin, ctx);
        break;
      case 'guvenlik':
        updateGuard(state, a, dtMin, ctx);
        break;
    }
  }
}

// --- Ajan yaşam döngüsü -----------------------------------------------------------

/**
 * YL/doktora öğrencisine danışman seçer: bölümün en kıdemli/araştırmacı hocası,
 * üzerindeki öğrenci sayısı az olan tercih edilir.
 */
function danismanSec(state: GameState, deptId: number): number {
  const rankPuan: Record<string, number> = { prof: 3, docent: 2, dr: 1, arsgor: 0.4 };
  const ogrenciSayisi = new Map<number, number>();
  for (const a of state.agents) {
    if (a.kind === 'ogrenci' && a.danisman !== -1) {
      ogrenciSayisi.set(a.danisman, (ogrenciSayisi.get(a.danisman) ?? 0) + 1);
    }
  }
  let secilen = -1;
  let enIyi = -1;
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen' || a.deptId !== deptId) continue;
    const puan = (rankPuan[a.rank] + a.arastirma / 50) / (1 + (ogrenciSayisi.get(a.id) ?? 0) * 0.5);
    if (puan > enIyi) {
      enIyi = puan;
      secilen = a.id;
    }
  }
  return secilen;
}

/** Kişilik zarı: nadir tipler kampüse renk katar. */
function kisilikSec(state: GameState): Student['kisilik'] {
  const r = randInt(state, 0, 99);
  if (r < 8) return 'dahi';
  if (r < 18) return 'tembel';
  if (r < 30) return 'sosyal';
  if (r < 40) return 'kitapkurdu';
  if (r < 50) return 'girisimci';
  return 'normal';
}

export function spawnStudent(
  state: GameState, deptId: number, level: StudentLevel, burs = 100,
): Student {
  const kisilik = kisilikSec(state);
  const s: Student = {
    id: newId(state),
    kind: 'ogrenci',
    ad: `${pick(state, AD)} ${pick(state, SOYAD)}`,
    x: GATE.x,
    y: GATE.y,
    path: [],
    activity: 'yok',
    onCampus: false,
    usingObject: -1,
    activityUntil: -1,
    deptId,
    level,
    ilerleme: 0,
    needs: {
      aclik: randRange(state, 10, 30),
      tuvalet: randRange(state, 10, 30),
      enerji: randRange(state, 10, 30),
      eglence: randRange(state, 10, 30),
    },
    mutluluk: randRange(state, 70, 85),
    girisDonemi: donemIndex(state.gun),
    // iki zar ortalaması: uçlar nadir, orta yaygın (çan eğrisine yakın);
    // kişilik eğilimi kaydırır (dahi +15, tembel -10)
    egilim: Math.round((randInt(state, 55, 145) + randInt(state, 55, 145)) / 2)
      + (kisilik === 'dahi' ? 15 : kisilik === 'tembel' ? -10 : 0),
    kaliteToplam: 0,
    dersDakika: 0,
    asistani: -1,
    danisman: -1,
    nitelik: {
      muhendis: randInt(state, 0, 8),
      artist: randInt(state, 0, 8),
      filozof: randInt(state, 0, 8),
      pratik: randInt(state, 0, 8),
      influencer: randInt(state, 0, 12),
    },
    sermaye: 0,
    burs,
    kisilik,
    asama: level === 'lisans' ? undefined : 'ders',
    tezPuan: 0,
  };
  state.agents.push(s);
  if (level !== 'lisans') s.danisman = danismanSec(state, deptId);
  return s;
}

/** Genel not ortalaması (0-4); yeterli ders verisi yoksa null. */
export function gnoHesapla(s: Student): number | null {
  if (s.dersDakika < 60) return null;
  // ort. ders kalitesi ~1.0 (hocalı, uyumlu) → GNO ~2.9; öğretmensiz ağırlıklıysa düşer
  return clamp((s.kaliteToplam / s.dersDakika) * 2.9, 0, 4);
}

export function spawnAcademic(
  state: GameState, ad: string, deptId: number, rank: AcademicRank, alan: Academic['alan'],
  egitim: number, arastirma: number, maas: number, yas?: number,
): Academic {
  const a: Academic = {
    id: newId(state),
    kind: 'akademisyen',
    ad,
    x: GATE.x,
    y: GATE.y,
    path: [],
    activity: 'yok',
    onCampus: false,
    usingObject: -1,
    activityUntil: -1,
    deptId,
    rank,
    alan,
    verdigiDersler: [],
    egitim,
    arastirma,
    maas,
    xp: 0,
    makale: 0,
    uluslararasiMakale: 0,
    yetistirdigi: 0,
    memnuniyet: randInt(state, 62, 80),
    yas: yas ?? randInt(state, 30, 45),
  };
  state.agents.push(a);
  return a;
}

export function hireStaff(
  state: GameState, kind: 'asci' | 'temizlikci' | 'tamirci' | 'guvenlik',
): StaffAgent | null {
  const unvan = kind === 'asci' ? 'Aşçı' : kind === 'temizlikci' ? 'Temizlikçi'
    : kind === 'tamirci' ? 'Tamirci' : 'Güvenlik';
  if (!spend(state, BALANCE.PERSONEL_ALIM[kind], `${unvan} alımı`)) return null;
  const p: StaffAgent = {
    id: newId(state),
    kind,
    ad: `${pick(state, AD)} ${pick(state, SOYAD)}`,
    x: GATE.x,
    y: GATE.y,
    path: [],
    activity: 'yok',
    onCampus: false,
    usingObject: -1,
    activityUntil: -1,
    maas: BALANCE.MAAS[kind],
    beceri: randInt(state, 30, 60),
  };
  state.agents.push(p);
  notify(state, `${unvan} işe alındı: ${p.ad} (günlük ₺${p.maas})`, 'iyi');
  return p;
}

export function removeAgent(state: GameState, agentId: number): void {
  releaseReservations(state, agentId);
  const i = state.agents.findIndex((a) => a.id === agentId);
  if (i !== -1) state.agents.splice(i, 1);
  // çıkarılan bir hocaysa asistan/danışman bağlarını, öğrenciyse arkadaşlığı çöz
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    if (a.asistani === agentId) a.asistani = -1;
    if (a.danisman === agentId) a.danisman = -1;
    if (a.arkadas === agentId) a.arkadas = -1;
  }
}
