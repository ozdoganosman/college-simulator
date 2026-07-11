// ---------------------------------------------------------------------------
// Ortak tip tanımları — tüm modüller bu sözleşmeye göre yazılır.
// GameState JSON-güvenli olmalıdır (Map/Set/class yok; sadece düz obje/dizi).
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

// --- Harita / İnşaat --------------------------------------------------------

export const MAP_W = 64;
export const MAP_H = 48;
export const TILE = 24; // px (zoom 1 iken)

export type FloorId = 'beton' | 'parke' | 'karo' | 'yol';

// wall dizisi: 0 = yok, 1 = duvar, 2 = kapı
export const WALL_NONE = 0;
export const WALL_SOLID = 1;
export const WALL_DOOR = 2;

export type RoomType =
  | 'derslik'
  | 'amfi'
  | 'yemekhane'
  | 'kutuphane'
  | 'laboratuvar'
  | 'ofis'
  | 'tuvalet'
  | 'kantin'
  | 'rektorluk';

export interface Room {
  id: number;
  type: RoomType;
  /** tile indeksleri (y * MAP_W + x) */
  tiles: number[];
  /** gereksinimler tamamsa true (validateRooms günceller) */
  valid: boolean;
  /** eksik gereksinim açıklamaları (Türkçe) */
  missing: string[];
  /** derslik/amfi/lab için atanmış bölüm id'si (assignClassrooms günceller) */
  deptId: number | null;
}

export type ObjectTypeId =
  | 'sira'          // okul sırası (öğrenci oturur, ders)
  | 'tahta'         // yazı tahtası (hoca ders anlatır)
  | 'masa'          // masa (kütüphane/yemekhane)
  | 'sandalye'      // sandalye (oturma: yemek, dinlenme)
  | 'yemek_bankosu' // yemekhane servis bankosu (aşçı gerekir)
  | 'kitaplik'      // kütüphane rafı
  | 'lab_tezgahi'   // laboratuvar tezgâhı
  | 'calisma_masasi'// akademisyen çalışma masası (ofis)
  | 'klozet'
  | 'lavabo'
  | 'otomat'        // kantin otomatı (açlık/eğlence)
  | 'bank'          // dış mekân bankı (dinlenme/eğlence)
  | 'cop_kutusu'
  | 'bilgisayar';   // kütüphane/lab verim artışı

export interface PlacedObject {
  id: number;
  type: ObjectTypeId;
  x: number;
  y: number;
  /** içinde bulunduğu oda (yoksa -1, dış mekân) */
  roomId: number;
  /** objeyi şu an kullanan/rezerve eden ajan id'si, yoksa -1 */
  reservedBy: number;
}

// --- Ajanlar -----------------------------------------------------------------

export type AgentKind = 'ogrenci' | 'akademisyen' | 'asci' | 'temizlikci';

export type StudentLevel = 'lisans' | 'yl' | 'doktora';

export type AcademicRank = 'arsgor' | 'dr' | 'docent' | 'prof';

export const RANK_LABEL: Record<AcademicRank, string> = {
  arsgor: 'Arş. Gör.',
  dr: 'Dr. Öğr. Üyesi',
  docent: 'Doç. Dr.',
  prof: 'Prof. Dr.',
};

/** Ajan aktivite durumu — davranış makinesi agents.ts içinde. */
export type AgentActivity =
  | 'yok'        // kampüste değil
  | 'geliyor'    // kapıdan hedefe yürüyor
  | 'bosta'
  | 'derse_gidiyor'
  | 'derste'
  | 'ders_veriyor'
  | 'yemege_gidiyor'
  | 'yemekte'
  | 'ihtiyaca_gidiyor'
  | 'ihtiyacta'   // tuvalet/dinlenme/eğlence
  | 'arastiriyor'
  | 'arastirmaya_gidiyor'
  | 'calisiyor'   // aşçı servis / temizlikçi temizlik
  | 'cikiyor';    // kampüsten ayrılıyor

export interface Needs {
  aclik: number;   // 0 iyi, 100 kritik
  tuvalet: number;
  enerji: number;  // 0 iyi (dinç), 100 kritik (bitkin)
  eglence: number;
}

export interface AgentBase {
  id: number;
  kind: AgentKind;
  ad: string;
  /** tile koordinatı (ondalıklı — kareler arası yumuşak hareket) */
  x: number;
  y: number;
  /** A* yolu — sıradaki hedef kareler */
  path: Point[];
  activity: AgentActivity;
  /** kampüste mi (gece öğrenciler/personel evine gider) */
  onCampus: boolean;
  /** kullandığı obje id (yoksa -1) */
  usingObject: number;
  /** aktivitenin bitiş zamanı (gün içi dakika, -1 = süresiz) */
  activityUntil: number;
}

export interface Student extends AgentBase {
  kind: 'ogrenci';
  deptId: number;
  level: StudentLevel;
  /** 0-100; 100 olunca dönem sonunda mezun */
  ilerleme: number;
  needs: Needs;
  /** 0-100 */
  mutluluk: number;
  /** kayıt olduğu dönem indeksi */
  girisDonemi: number;
}

export interface Academic extends AgentBase {
  kind: 'akademisyen';
  deptId: number;
  rank: AcademicRank;
  /** 0-100 eğitim becerisi */
  egitim: number;
  /** 0-100 araştırma becerisi */
  arastirma: number;
  /** günlük maaş ₺ */
  maas: number;
  /** akademik gelişim puanı (terfi için) */
  xp: number;
  /** yayın sayıları */
  makale: number;
  uluslararasiMakale: number;
}

export interface StaffAgent extends AgentBase {
  kind: 'asci' | 'temizlikci';
  maas: number;
}

export type Agent = Student | Academic | StaffAgent;

// --- Bölümler ----------------------------------------------------------------

export interface DeptDef {
  id: string;            // 'bilgisayar'
  ad: string;            // 'Bilgisayar Mühendisliği'
  kisa: string;          // 'BM'
  renk: string;          // hex — öğrenci/oda rengi
  labGerekli: boolean;
  minDerslik: number;
  minAkademisyen: number;
  acilisMaliyeti: number;
  /** taban talep (yıllık aday sayısı, prestij ile çarpılır) */
  tabanTalep: number;
  /** araştırma üretkenlik çarpanı */
  arastirmaCarpani: number;
}

export interface Department {
  id: number;
  defId: string;
  kontenjan: number;      // lisans kontenjanı (oyuncu ayarlar)
  ylKontenjan: number;    // yüksek lisans
  doktoraKontenjan: number;
  ylAcik: boolean;
  doktoraAcik: boolean;
  /** son yerleştirmede oluşan talep (aday sayısı) */
  sonTalep: number;
  /** son yerleştirmede kayıt olan öğrenci */
  sonKayit: number;
  /** son yerleştirmede en iyi başarı sırası (tavan) — 0 = veri yok */
  sonTavanSira: number;
  /** son yerleştirmede son yerleşenin sırası (taban) — 0 = veri yok */
  sonTabanSira: number;
  acilisDonemi: number;
  mezunSayisi: number;
}

/** Yıllık YKS yerleştirme töreni verisi (açıklanınca null'a çekilir). */
export interface YerlestirmeSatir {
  bolumAd: string;
  kisa: string;
  renk: string;
  kontenjan: number;
  yerlesen: number;
  talep: number;
  tavanSira: number;   // en yüksek başarı sırası (küçük = iyi)
  tabanSira: number;   // en düşük başarı sırası
  doldu: boolean;
  /** öğretim üyesi yetersizliğinden kontenjan verilmedi */
  iptal: boolean;
}

export interface YerlestirmeSonuc {
  yil: number;
  toplamYerlesen: number;
  odenek: number;
  satirlar: YerlestirmeSatir[];
}

// --- Araştırma / Yayın -------------------------------------------------------

export interface ResearchProject {
  id: number;
  deptId: number;
  baslik: string;
  /** 0-100 */
  ilerleme: number;
  /** toplam gereken araştırma puanı */
  hedefPuan: number;
  birikenPuan: number;
  maliyet: number;      // başlatma maliyeti (ödendi)
  baslamaGunu: number;
}

export interface Publication {
  id: number;
  baslik: string;
  yazarId: number;      // akademisyen
  deptId: number;
  uluslararasi: boolean;
  cigirAcici: boolean;
  gun: number;
}

export interface Award {
  id: number;
  ad: string;
  aciklama: string;
  gun: number;
}

// --- Kadro adayları ----------------------------------------------------------

export interface Candidate {
  id: number;
  ad: string;
  rank: AcademicRank;
  egitim: number;
  arastirma: number;
  maas: number;         // günlük maaş talebi
  /** transfer için imza bonusu (KPSS adaylarında 0) */
  bonus: number;
  /** transfer adayının geldiği üniversite (KPSS'de '') */
  kurum: string;
}

// --- Strateji ----------------------------------------------------------------

export interface StrategyDef {
  id: string;
  ad: string;
  aciklama: string;
  maliyet: number;        // ₺
  prestijGereksinimi: number;
  /** ön koşul strateji id'leri */
  onkosul: string[];
}

// --- Bildirim ----------------------------------------------------------------

export type NoticeKind = 'bilgi' | 'iyi' | 'kotu' | 'odul';

export interface Notice {
  gun: number;
  dakika: number;
  metin: string;
  kind: NoticeKind;
}

// --- Oyun durumu -------------------------------------------------------------

export interface GameState {
  para: number;
  prestij: number;        // 0-1000, başlangıç 100
  gun: number;            // 1'den başlar
  dakika: number;         // gün içi 0-1439
  hiz: number;            // 0 (durdurulmuş), 1, 2, 4
  rngSeed: number;

  // harita (uzunluk MAP_W*MAP_H)
  floor: (FloorId | null)[];
  wall: number[];         // WALL_NONE/SOLID/DOOR
  roomAt: number[];       // oda id ya da -1
  dirt: number[];         // 0-100 kirlilik

  rooms: Room[];
  objects: PlacedObject[];
  agents: Agent[];
  departments: Department[];
  projects: ResearchProject[];
  publications: Publication[];
  awards: Award[];
  notices: Notice[];

  kpssPool: Candidate[];
  transferPool: Candidate[];

  /** satın alınmış strateji id'leri */
  strategies: string[];

  nextId: number;         // tüm id'ler için tek sayaç
  /** inşaat değişiklik sayacı (render önbelleği geçersizleme) */
  insaatSurumu: number;
  /** öğretici: aktif adım indeksi (-1 = tamamlandı) */
  tutorialAdim: number;
  /** öğretici kartı görünür mü */
  tutorialAcik: boolean;
  /** bekleyen YKS yerleştirme töreni (yıl başında dolar, tören kapanınca null) */
  yerlestirme: YerlestirmeSonuc | null;
  /** toplam mezun, toplam bırakan (istatistik) */
  toplamMezun: number;
  toplamBirakan: number;
}

// --- Takvim sabitleri --------------------------------------------------------

export const DONEM_GUN = 20;            // 1 dönem = 20 gün
export const GUN_DAKIKA = 1440;

export function donemIndex(gun: number): number {
  return Math.floor((gun - 1) / DONEM_GUN);
}

export function donemGunu(gun: number): number {
  return ((gun - 1) % DONEM_GUN) + 1; // 1..DONEM_GUN
}

export function yil(gun: number): number {
  return Math.floor(donemIndex(gun) / 2) + 1;
}

/** 'Güz' | 'Bahar' */
export function donemAdi(gun: number): string {
  return donemIndex(gun) % 2 === 0 ? 'Güz' : 'Bahar';
}

// Ders saatleri (dakika cinsinden gün içi zaman)
export const T = {
  KAMPUS_ACILIS: 7 * 60 + 30,   // öğrenci/personel gelmeye başlar
  DERS1: 8 * 60,
  DERS2: 10 * 60,
  OGLE: 12 * 60,
  DERS3: 13 * 60,
  DERS4: 15 * 60,
  CIKIS: 17 * 60,
  KAMPUS_KAPANIS: 19 * 60,      // herkes gitmiş olmalı
} as const;

/** Kampüs giriş kapısı (harita alt kenarının ortası) */
export const GATE: Point = { x: Math.floor(MAP_W / 2), y: MAP_H - 1 };

export function tileIndex(x: number, y: number): number {
  return y * MAP_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}
