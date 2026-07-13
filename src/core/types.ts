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
  | 'yurt'
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
  /** bağışla verilen özel isim (harita etiketinde ⭐ ile görünür) */
  ozelAd: string | null;
  /** kalan inşaat dakikası (>0 = şantiye: oda kullanılamaz, ustalar çalışır) */
  insaat?: number;
  /** toplam inşaat süresi (ilerleme yüzdesi için) */
  insaatToplam?: number;
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
  | 'bilgisayar'    // kütüphane/lab verim artışı
  | 'ranza'         // yurt yatağı (2 öğrenci barındırır)
  | 'servis_duragi' // ulaşım: sabah kampüse geliş hızlanır, cazibe artar
  | 'basket_potasi' // aktivite: eğlence + influencer
  | 'satranc_masasi'// aktivite: eğlence + filozof
  | 'muzik_sahnesi' // aktivite: eğlence + artist
  | 'cicek_tarhi'   // dekor: kampüs estetiği
  | 'heykel'        // dekor: kampüs estetiği (prestijli görünüm)
  | 'sus_havuzu'    // dekor: kampüs estetiği
  | 'fidan'         // dekor: kampüs estetiği (ucuz yeşillik)
  | 'jenerator'     // altyapı: elektrik kapasitesi sağlar
  | 'su_deposu'     // altyapı: su kapasitesi sağlar
  | 'yangin_dolabi';// güvenlik: yakındaki yangını hızla söndürür

export interface PlacedObject {
  id: number;
  type: ObjectTypeId;
  x: number;
  y: number;
  /** içinde bulunduğu oda (yoksa -1, dış mekân) */
  roomId: number;
  /** objeyi şu an kullanan/rezerve eden ajan id'si, yoksa -1 */
  reservedBy: number;
  /** eskime (0-130): 100 ve üstü BOZUK — kullanılamaz, tamirci onarır */
  yipranma: number;
}

// --- Ajanlar -----------------------------------------------------------------

export type AgentKind = 'ogrenci' | 'akademisyen' | 'asci' | 'temizlikci' | 'tamirci' | 'guvenlik';

export type StudentLevel = 'lisans' | 'yl' | 'doktora';

export type AcademicRank = 'arsgor' | 'dr' | 'docent' | 'prof';

/** Akademisyen uzmanlık alanı — ders uygunluğunu belirler. */
export type Alan = 'muhendis' | 'artist' | 'filozof' | 'pratik';

export const ALAN_META: Record<Alan, { ad: string; emoji: string; renk: string; tanim: string }> = {
  muhendis: { ad: 'Mühendis', emoji: '🔬', renk: '#4e79a7', tanim: 'Bilim ve fen dersleri' },
  artist: { ad: 'Artist', emoji: '🎨', renk: '#e15759', tanim: 'Sanat, edebiyat ve dil dersleri' },
  filozof: { ad: 'Filozof', emoji: '📜', renk: '#b07aa1', tanim: 'Tarih, sosyal bilimler ve felsefe' },
  pratik: { ad: 'Pratik', emoji: '💼', renk: '#59a14f', tanim: 'İşletme, iktisat ve meslek dersleri' },
};

/** Öğrenci gelişim nitelikleri: 4 akademik alan + sosyal etki. */
export type Nitelik = Alan | 'influencer';

/** Öğrenci kişiliği — davranışları ve gelişimi hafifçe şekillendirir. */
export type Kisilik = 'normal' | 'dahi' | 'tembel' | 'sosyal' | 'kitapkurdu' | 'girisimci';

export const KISILIK_META: Record<Kisilik, { ad: string; emoji: string; tanim: string }> = {
  normal: { ad: 'Dengeli', emoji: '🙂', tanim: 'Sıradan bir kampüs yaşamı sürer' },
  dahi: { ad: 'Dahi', emoji: '🌟', tanim: 'Öğrenme eğilimi doğuştan yüksek (+15)' },
  tembel: { ad: 'Tembel', emoji: '😴', tanim: 'Eğilimi düşük (-10), ara sıra dersi asar' },
  sosyal: { ad: 'Sosyal Kelebek', emoji: '🎉', tanim: 'Kampüs yaşamından beslenir: her gün +mutluluk' },
  kitapkurdu: { ad: 'Kitap Kurdu', emoji: '🐛', tanim: 'Boş vaktini kütüphanede geçirmeyi sever (2× çekim)' },
  girisimci: { ad: 'Girişimci Ruh', emoji: '🚀', tanim: 'Girişim geliri ×1.25 — sermayesi hızlı büyür' },
};

export const NITELIK_META: Record<Nitelik, { ad: string; emoji: string }> = {
  muhendis: { ad: 'Mühendis', emoji: '🔬' },
  artist: { ad: 'Artist', emoji: '🎨' },
  filozof: { ad: 'Filozof', emoji: '📜' },
  pratik: { ad: 'Pratik', emoji: '💼' },
  influencer: { ad: 'Influencer', emoji: '📣' },
};

/**
 * Haftalık ders programı hücresi: bir DERSLİĞİN belirli gün+blokta hangi dersi
 * işlediği, ve o hücreye (varsa) SONRADAN sürüklenen hocası. Izgara derslikten
 * kurulur — courseId müfredattan otomatik gelir, hoca gerekmez; academicId
 * yalnız oyuncu (ya da 🪄 Akıllı Doldur) bir hoca sürükleyince dolar.
 */
export interface DersSlot {
  deptId: number;
  /** bu hücrenin ait olduğu fiziksel derslik/amfi (Room.id) */
  roomId: number;
  /** haftanın günü 0-4: Pazartesi … Cuma (hafta içi 5 gün) */
  gun: number;
  /** günün bloğu 0-1: 08:00-12:00 (sabah) / 13:00-17:00 (öğleden sonra) */
  blok: number;
  courseId: string;
  /** sürüklenerek atanan akademisyen (yoksa -1) */
  academicId: number;
  /** 📌 oyuncu bu hücreye elle bir hoca sürükledi (bilgi amaçlı rozet) */
  kilit?: boolean;
}

/** Haftalık program: 5 gün × 2 blok = derslik başına 10 hücre. */
export const HAFTA_GUN = 5;
export const GUNLUK_BLOK = 2;
export const HAFTA_ICI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] as const;
export const BLOK_SAAT = ['08:00–12:00', '13:00–17:00'] as const;

/** Programın haftalık gün indeksi (0-4). Cumartesi Pazartesi'yi tekrarlar, Pazar tatil. */
export function programGunu(gun: number): number {
  return haftaGunu(gun) % HAFTA_GUN;
}

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
  /** öğrenme eğilimi (yüzde, ~60-140) — öğrenme hızı ve not ortalaması çarpanı */
  egilim: number;
  /** not ortalaması birikimi: derste toplanan kalite ve süre (GNO = kalite/süre ölçeği) */
  kaliteToplam: number;
  dersDakika: number;
  /** asistanı olduğu akademisyen id (YL/doktora; değilse -1) */
  asistani: number;
  /** akademik danışmanı (YL/doktora öğrencisine kayıtta atanır; yoksa -1) */
  danisman: number;
  /** gelişim nitelikleri (0-100) — dersler ve kampüs yaşamıyla büyür */
  nitelik: Record<Nitelik, number>;
  /** sermayedar özelliği: öğrencinin girişimlerinden biriktirdiği para ₺ */
  sermaye: number;
  /** burs oranı: 100 tam burslu, 50 yarı, 0 ücretli — kayıt ücretinden düşülür */
  burs: number;
  /** kişilik — davranış ve gelişim çarpanları (kartta rozet) */
  kisilik: Kisilik;
  /** lisansüstü aşama: ders → (doktora: yeterlik sınavı) → tez → savunma/mezuniyet */
  asama?: 'ders' | 'tez';
  /** tez ilerlemesi (araştırma dakikalarıyla birikir; hedefe ulaşınca savunma) */
  tezPuan?: number;
  /** en yakın arkadaşının id'si (-1 = yok). Yakınında olunca moral artar */
  arkadas?: number;
}

export const LEVEL_LABEL: Record<StudentLevel, string> = {
  lisans: 'Lisans',
  yl: 'Yüksek Lisans',
  doktora: 'Doktora',
};

export interface Academic extends AgentBase {
  kind: 'akademisyen';
  deptId: number;
  rank: AcademicRank;
  /** uzmanlık alanı — hangi dersleri iyi verebildiğini belirler */
  alan: Alan;
  /** hocanın bu yıl vermeyi seçtiği dersler (en fazla 4) — açık dersleri belirler */
  verdigiDersler: string[];
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
  /** danışmanlığında doktorasını bitiren öğrenci sayısı (akademik soyağacı) */
  yetistirdigi: number;
  /** 0-100 iş memnuniyeti — düşerse zam ister, istifa edip rakibe gidebilir */
  memnuniyet: number;
  /** yaş — her yıl artar, 67'de emekli olur */
  yas: number;
  /** kendi doktora programımızdan yetişti mi */
  mezunumuz?: boolean;
  /** doktora danışmanının adı (soyağacı gösterimi) */
  danismanAd?: string;
}

export interface StaffAgent extends AgentBase {
  kind: 'asci' | 'temizlikci' | 'tamirci' | 'guvenlik';
  maas: number;
  /** 0-100 iş becerisi — çalıştıkça artar, hız çarpanı verir (0.7 + beceri/125) */
  beceri: number;
}

/** Haritada aktif yangın: konumu, şiddeti (0-100), çıkış günü. */
export interface Yangin {
  x: number;
  y: number;
  siddet: number;
}

/** Makro ekonomi durumu — yıllık olaylarla değişir, gider/gelir çarpanı verir. */
export interface MakroDurum {
  ad: string;
  emoji: string;
  giderCarpan: number;
  gelirCarpan: number;
  kalanYil: number;
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
  /** müfredat: bölümün verilmesi zorunlu dersleri (course id listesi) */
  dersler: string[];
  /** önlisans (2 yıllık, min 4 ders) ya da lisans (4 yıllık, min 8 ders) */
  tur: 'onlisans' | 'lisans';
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
  /** bölüme özel yıllık kayıt ücreti ₺ (null = okul geneli ücret geçerli) */
  ucret: number | null;
  /** son yerleştirmede koltuk yetmediği için geri çevrilen istekli aday */
  sonGeriCevrilen: number;
  /** kademeli kapanış: yeni kayıt alınmaz, son öğrenci mezun olunca bölüm silinir */
  kapaniyor: boolean;
  /**
   * 🏫 bölümün yerleşik (birincil) dersliği — assignClassrooms atar, oda yıkılana
   * ya da bölüm kapanana dek korunur. Program ızgarasında gösterilir. null = yok.
   */
  derslikId?: number | null;
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
  /** burs dağılımı: tam burslu / %50 burslu / ücretli yerleşen */
  tam: number;
  yari: number;
  ucretli: number;
  /** derslik koltuğu yetmediği için geri çevrilen istekli aday */
  geriCevrilen: number;
}

/** Dönem sonu mezuniyet töreni verisi (kapanınca null). */
export interface MezuniyetSonuc {
  yil: number;
  toplam: number;
  /** GNO >= 3.2 (yüksek onur) mezun sayısı */
  onur: number;
  /** mezuniyet bağışları toplamı ₺ */
  bagis: number;
  bolumler: { ad: string; renk: string; n: number }[];
  /** GNO dereceleri (ilk 5) + yerleştikleri iş */
  dereceler: { ad: string; bolumAd: string; gno: number; meslek: string; issiz: boolean; doktora: boolean }[];
}

export interface YerlestirmeSonuc {
  yil: number;
  toplamYerlesen: number;
  odenek: number;
  satirlar: YerlestirmeSatir[];
  /** yıllık kayıt ücreti (tören metni için) */
  ucret: number;
  /** tercih anketi: öğrenciler neden bizi seçti (neden + yüzde + tıklayınca açılacak panel) */
  anket: { neden: string; oran: number; panel?: string }[];
}

// --- Rakip üniversiteler / sıralama ------------------------------------------

export interface RakipUni {
  ad: string;
  prestij: number;   // 0-1000
  yayin: number;     // toplam yayın
  mezun: number;     // toplam mezun
  /** yıllık gelişim karakteri (0.6 durgun – 1.5 yükselen), zamanla oynar */
  guc: number;
  /** okul hakkında ufak bilgiler */
  sehir: string;
  kurulus: number;      // kuruluş yılı
  uzmanlik: Alan;       // güçlü olduğu alan — transfer adaylarına yansır
  /** mezun istihdam oranı % (yıllık günceller) */
  istihdam: number;
}

export interface SiralamaSatir {
  ad: string;
  prestij: number;
  yayin: number;
  mezun: number;
  skor: number;
  oyuncu: boolean;
}

// --- Mezunlar derneği ---------------------------------------------------------

export type Sektor = Alan | 'girisim' | 'medya';

/** Mezun kaydı: iş/kariyer sistemi yıllık olarak günceller. */
export interface Mezun {
  id: number;
  ad: string;
  bolumAd: string;
  yil: number;          // mezuniyet yılı
  gno: number;          // 0-4
  puan: number;         // işe yerleşme puanı (GNO + nitelik + eğilim bileşimi)
  sektor: Sektor;
  meslek: string;
  kademe: number;       // kariyer basamağı 0-4
  gelir: number;        // yıllık gelir ₺ (işsizse 0)
  issiz: boolean;
}

/** Yıl sonu "Akademik Yıl Ödülleri" töreni verisi (kapanınca null). */
export interface YilSonuSonuc {
  yil: number;                 // biten yıl
  sira: number;                // oyuncunun bu yılki sırası
  oncekiSira: number;          // geçen yılki sıra (0 = ilk yıl)
  siralama: SiralamaSatir[];   // skor sırasıyla tüm üniversiteler
  yilinHocasi: { ad: string; detay: string } | null;
  yilinGirisimcisi: { ad: string; detay: string } | null;
  yilinBulusu: string | null;
  mezun: number;               // bu yıl mezun olan
  yayin: number;               // bu yıl çıkan yayın
  ortGno: number | null;       // öğrenci not ortalaması
  toplamSermaye: number;       // öğrenci girişim sermayesi
  siraPrestij: number;         // sıralama yükselişi prestij ödülü
  /** yıl dönümüne denk gelen mezuniyet özeti (ayrı tören açılmaz) */
  mezuniyetOzet?: { toplam: number; onur: number; bagis: number };
}

// --- Araştırma / Yayın -------------------------------------------------------

export type ProjeTip = 'temel' | 'uygulamali' | 'atilim';

export interface ResearchProject {
  id: number;
  deptId: number;
  baslik: string;
  /** proje tipi: risk/ödül dengesini belirler */
  tip: ProjeTip;
  /** proje lideri akademisyen (riski düşürür, katkısı artar; yoksa -1) */
  liderId: number;
  /** 0-100 */
  ilerleme: number;
  /** toplam gereken araştırma puanı */
  hedefPuan: number;
  birikenPuan: number;
  maliyet: number;      // başlatma maliyeti (ödendi)
  /** aktif olduğu her gün kesilen araştırma bütçesi ₺ */
  gunlukButce: number;
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
  alan: Alan;
  egitim: number;
  arastirma: number;
  maas: number;         // günlük maaş talebi
  /** transfer için imza bonusu (KPSS adaylarında 0) */
  bonus: number;
  /** transfer adayının geldiği üniversite (KPSS'de '') */
  kurum: string;
  /** kendi doktora mezunumuz (KPSS'de indirimli, danışman becerisinden pay alır) */
  mezunumuz?: boolean;
  /** doktora danışmanının adı */
  danismanAd?: string;
  /** aday yaşı */
  yas?: number;
}

// --- Strateji ----------------------------------------------------------------

export interface StrategyDef {
  id: string;
  ad: string;
  aciklama: string;
  maliyet: number;        // ₺ (tek seferlik kurulum)
  /** günlük bakım gideri ₺ — politika aktifken her gün düşer */
  gunlukGider: number;
  prestijGereksinimi: number;
  /** ön koşul strateji id'leri */
  onkosul: string[];
}

/** Üniversite vizyonu — birbirini dışlayan eksen (Strateji panelinden seçilir). */
export type Vizyon = 'arastirma' | 'egitim' | 'girisim';

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
  /** son yayın kayıtları (görüntü için ~120 tutulur; toplamlar sayaçlarda) */
  publications: Publication[];
  /** son ödül kayıtları (~60 tutulur; toplam ayrı sayaçta) */
  awards: Award[];
  notices: Notice[];
  /** ömürlük sayaçlar — listeler budansa da toplamlar kaybolmaz */
  toplamYayin: number;
  toplamUluslararasiYayin: number;
  toplamBulus: number;
  toplamOdul: number;

  kpssPool: Candidate[];
  transferPool: Candidate[];

  /** satın alınmış strateji id'leri */
  strategies: string[];
  /** kütüphane kitap koleksiyonu seviyeleri (alan başına 0-4) */
  kitapKoleksiyon: Record<Alan, number>;
  /** rakip üniversiteler — her yıl gelişirler */
  rakipler: RakipUni[];
  /** geçen yıl sonundaki sıralama (0 = henüz yıl bitmedi) */
  sonSira: number;
  /** yıl başı istatistik tabanı (yıl sonu delta hesabı için) */
  yilBasi: { mezun: number; yayin: number };
  /** bekleyen yıl sonu ödül töreni (tören kapanınca null) */
  yilSonu: YilSonuSonuc | null;
  /** mezunlar derneği: mezun kayıtları (en fazla ~400 tutulur) */
  mezunlar: Mezun[];
  /** dernek haberleri (son ~12, en yenisi başta) */
  mezunHaber: string[];
  /** mezun-öğrenci etkileşim uygulamaları */
  mentorluk: boolean;
  sonKariyerGunu: number;   // son Kariyer Günü'nün yapıldığı gün (0 = hiç)
  /** yıl sonlarındaki sıralama geçmişi (trend grafiği) */
  siraGecmisi: number[];
  /** mutfak yemek stoğu (porsiyon) — aşçılar üretir, öğrenciler tüketir, gece bayatlar */
  yemekStok: number;
  /** bugün üretilen porsiyon (malzeme gideri için) */
  gunlukUretim: number;
  /** bugün yemekhanede aç kalan öğrenci */
  acKalanBugun: number;
  /** dün aç kalan (danışman uyarısı) */
  dunAcKalan: number;
  /** zorluk seviyesi (yeni oyunda seçilir) */
  zorluk: 'kolay' | 'normal' | 'zor';
  /** üst üste borçta geçen gün — limit aşılırsa YÖK kayyum atar (oyun biter) */
  borcGunleri: number;
  /** oyun bitti mi (kayyum gerekçesi; null = devam) */
  oyunBitti: string | null;
  /** kazanılmış başarım id'leri */
  basarimlar: string[];
  /** üniversite vizyonu (birbirini dışlayan strateji ekseni) */
  vizyon: Vizyon | null;
  /** yıllık kayıt ücreti ₺ — 0 = devlet modeli (herkes ücretsiz okur, talep +%10) */
  ucret: number;
  /** kontenjanın %'si tam burslu (yüksek sıralı aday çeker) */
  bursTam: number;
  /** kontenjanın %'si %50 burslu */
  bursYari: number;
  /** kalan kredi borcu ₺ (günlük taksitle ödenir) */
  krediBorcu: number;
  /** mütevelli heyetindeki mezun id'leri (en çok 3) — pasif bonuslar */
  mutevelli: number[];
  /** rakip olaylarının bir sonraki YKS talebine çarpanı (uygulanınca 1'e döner) */
  sonrakiTalepCarpan: number;
  /** sıradaki olay kartları — aktif yuva doluyken gelenler burada bekler */
  olayKuyrugu: string[];
  /** proje bitince aynı bölümde otomatik yenisi başlasın mı (Araştırma paneli) */
  arastirmaOtoYenile: boolean;
  /** girişe-ulaşılamıyor uyarısının son verildiği gün (günde bir uyarı) */
  sonErisimUyariGunu: number;
  /** kulüp üyeleri (kulüp id -> öğrenci id listesi) — üyelik artık gerçek */
  kulupUyeListe: Record<string, number[]>;
  /** denetim karnesi için günlük ortalama izleme (tek günlük şansa son) */
  denetimIzleme: { ac: number; cazibe: number; gun: number };
  /** KALDI sonrası planlanan takip denetimi günü (null = yok) */
  takipDenetimGunu: number | null;
  /** üst üste KALDI sayısı — 2. kez kalınca YÖK zayıf bölümü kapatır */
  ustUsteKaldi: number;
  /** altyapı kesinti durumu (endOfDay hesaplar, ceza + HUD okur) */
  altyapi: { gucKesinti: boolean; suKesinti: boolean };
  /** haritada aktif yangınlar */
  yanginlar: Yangin[];
  /** aktif salgın (null = yok) */
  salgin: { ad: string; kalanGun: number; siddet: number } | null;
  /** makro ekonomi durumu (null = normal) */
  makro: MakroDurum | null;
  /** prestij kampanyalarının son kullanım günleri (id -> gün) */
  prestijKampanya: Record<string, number>;
  /** üst üste "boş" yıl sayısı (bölüm var ama öğrenci kritik az) — YÖK kapatma sayacı */
  bosYil: number;
  /** son YÖK akreditasyon denetimi sonucu (hiç olmadıysa null) */
  sonDenetim: { gun: number; puan: number; sonuc: string } | null;
  /** dönemlik trend fotoğrafları (son 24 dönem) — Raporlar grafikleri */
  trend: { gun: number; para: number; prestij: number; ogrenci: number; mutluluk: number }[];
  /** aktif kampüs olay kartı (cevaplanınca null) */
  aktifOlay: { id: string; gun: number } | null;
  /** son olayın günü — art arda olay yağmasın */
  sonOlayGunu: number;
  /** olay günlüğü: verilen kararların kaydı (son 40) */
  olayGecmisi: { gun: number; baslik: string; secim: string; sonuc: string }[];
  /** dönemlik sınav haftası destekleri (dönem sonunda sıfırlanır) */
  sinavDestek: { etut: boolean; gece: boolean };
  /** son hedefli ayartma girişimi günü (dönemde 1 kez) */
  sonAyartmaGunu: number;
  /** son mezun buluşması günü (yılda 1 kez) */
  sonBulusmaGunu: number;
  /** bekleyen isimli bina bağışı teklifi (olay kartıyla pazarlık edilir) */
  bekleyenBina: { ad: string; bina: string; tutar: number } | null;
  /** kurulu öğrenci kulübü id'leri */
  kulupler: string[];
  /** 👑 1 numara zafer ekranı bekliyor */
  zafer: boolean;
  /** zafer ekranı bir kez gösterildi */
  zaferGosterildi: boolean;
  /** bekleyen rakip ayartma kartı hedefi */
  bekleyenAyartma: { academicId: number; rakipAd: string } | null;
  /** ⭐ takip edilen yıldız öğrenciler (isimle — mezuniyette de sürer) */
  yildizlar: string[];
  /** planlanmış zincir olayları: verdiğin kararın devamı ileride kapına gelir */
  bekleyenZincir: { id: string; gun: number }[];

  nextId: number;         // tüm id'ler için tek sayaç
  /** inşaat değişiklik sayacı (render önbelleği geçersizleme) */
  insaatSurumu: number;
  /** öğretici: aktif adım indeksi (-1 = tamamlandı) */
  tutorialAdim: number;
  /** öğretici kartı görünür mü */
  tutorialAcik: boolean;
  /** bekleyen YKS yerleştirme töreni (yıl başında dolar, tören kapanınca null) */
  yerlestirme: YerlestirmeSonuc | null;
  /** bekleyen mezuniyet töreni (dönem sonunda mezun varsa dolar) */
  mezuniyet: MezuniyetSonuc | null;
  /** YKS dönemi açık mı — oyuncu 'Yerleştirmeyi Başlat'a basana dek bekler */
  yksBekliyor: boolean;
  /** günlük ders programı (her gece ve kadro değişiminde yeniden kurulur) */
  dersProgrami: DersSlot[];
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

/** Mevsim (görsel + ambiyans): yıl 40 gün = 4 × 10 gün. 0 sonbahar … 3 yaz. */
export function mevsim(gun: number): 0 | 1 | 2 | 3 {
  return Math.floor(((gun - 1) % 40) / 10) as 0 | 1 | 2 | 3;
}

export const MEVSIM_META = [
  { ad: 'Sonbahar', emoji: '🍂' },
  { ad: 'Kış', emoji: '❄️' },
  { ad: 'İlkbahar', emoji: '🌸' },
  { ad: 'Yaz', emoji: '☀️' },
] as const;

/** Haftanın günü: 0 Pzt … 6 Paz. */
export function haftaGunu(gun: number): number {
  return (gun - 1) % 7;
}

export const HAFTA_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/**
 * Pazar günleri ders yapılmaz (kampüs sosyalleşir) — SINAV HAFTASI hariç:
 * dönemin son 3 günü tatil tanımaz.
 */
export function tatilMi(gun: number): boolean {
  return haftaGunu(gun) === 6 && donemGunu(gun) <= DONEM_GUN - 3;
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
