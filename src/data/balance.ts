/**
 * Oyun dengesi sabitleri — tek yerden ayar.
 */
export const BALANCE = {
  BASLANGIC_PARA: 2_500_000,
  BASLANGIC_PRESTIJ: 0,     // sıfırdan başla: prestiji mezun/yayın/buluşla kazan

  // Ekonomi
  OGRENCI_ODENEK: 9000,        // yerleştirmede yeni öğrenci başı devlet ödeneği ₺
  YL_ODENEK: 14000,
  DOKTORA_ODENEK: 20000,
  DONEM_DESTEK: 3000,          // her dönem başı mevcut öğrenci başına destek ₺
  BAKIM_GIDERI_TILE: 2,        // günlük, zemin döşeli kare başına ₺
  MEZUN_BONUS: 4000,           // mezun başına tek seferlik ₺

  // Maaşlar (günlük ₺)
  MAAS: { arsgor: 1200, dr: 2000, docent: 3000, prof: 4500, asci: 900, temizlikci: 700, tamirci: 800 },
  PERSONEL_ALIM: { asci: 5000, temizlikci: 3000, tamirci: 4000 }, // ilan maliyeti

  // Eşya eskimesi: her gün yıpranır, 100'de BOZULUR (tamirci onarır)
  YIPRANMA_GUN: [0.6, 1.4] as [number, number], // günlük yıpranma aralığı
  TAMIR_HIZ: 8,               // tamircinin dakikada azalttığı yıpranma
  ASISTAN_MAAS: 500,           // asistan atanan YL/doktora öğrencisinin günlük maaşı ₺

  // Mali politikalar — kayıt ücreti + burs kontenjanları (vakıf üniversitesi modeli)
  UCRET_VARSAYILAN: 20000,    // yeni oyunda yıllık kayıt ücreti ₺ (0 = devlet modeli)
  UCRET_MAX: 200000,          // panel üst sınırı ₺/yıl
  ODEME_GUCU_TABAN: 30000,    // adayların yıllık ödeme gücü tabanı ₺
  ODEME_GUCU_PRESTIJ: 400,    // prestij puanı başına ödeme gücü artışı ₺
  BURS_TAM_VARSAYILAN: 10,    // kontenjanın %'si tam burslu
  BURS_YARI_VARSAYILAN: 20,   // kontenjanın %'si %50 burslu
  BURS_EGILIM_TAM: 12,        // tam burslu öğrenci eğilim bonusu (yüksek sıradan gelir)
  BURS_EGILIM_YARI: 6,
  BURS_GNO_SART: 2.0,         // dönem sonunda GNO bunun altındaysa burs bir kademe düşer
  GIRISIM_KAZANC_TAVAN: 600,  // öğrenci başına günlük girişim geliri yumuşak tavanı ₺

  // YÖK akreditasyon denetimi (2 yılda bir)
  DENETIM_GECME: 70,          // karne puanı eşiği
  DENETIM_KOSULLU: 45,        // altı = KALDI: kontenjan kesintisi
  DENETIM_ODUL_PRESTIJ: 10,
  KREDI_FAIZ: 1.25,           // çekilen tutarın geri ödeme çarpanı
  KREDI_TAKSIT: 6000,         // günlük geri ödeme ₺

  // Sınavlar (dönem sonunda)
  SINAV_GECME: 40,            // altı KALIR: ilerleme -15, mutluluk -10
  SINAV_ONUR: 85,             // üstü onur listesi: mutluluk +5
  AYARTMA_MALIYET: 100000,    // rakipten hedefli hoca ayartma girişimi ₺ (dönemde 1)
  ETUT_MALIYET: 15000,        // dönemlik etüt programı ₺ (sınav notu +5)
  GECE_KUTUPHANE_MALIYET: 10000, // dönemlik gece kütüphanesi ₺ (sınav notu +3, kütüphane gerekir)

  // Araştırma
  PROJE_MALIYET_TABAN: 40000,
  PROJE_GUNLUK_BUTCE: 1500,    // aktif proje başına günlük bütçe ₺ (tip çarpanıyla)
  PROJE_HEDEF_PUAN: 1000,      // taban; rastgele ±%30
  ARASTIRMA_HIBE: 60000,       // proje tamamlanınca taban hibe
  ULUSLARARASI_HIBE_CARPAN: 2,
  BULUS_OLASILIK: 0.08,        // proje tamamlanınca çığır açan buluş olasılığı
  BULUS_GELIR: 350000,         // patent geliri (teknokent 2x)
  ODUL_OLASILIK: 0.3,          // buluş sonrası ödül olasılığı
  ULUSLARARASI_OLASILIK: 0.3,  // makalenin uluslararası olma taban olasılığı

  // Prestij
  PRESTIJ: {
    makale: 2, uluslararasiMakale: 6, bulus: 30, odul: 50,
    mezun: 0.5, birakan: -1.5, terfi: 3,
  },

  // Mezunlar derneği
  MEZUN_LIMIT: 400,            // kayıt tutulan azami mezun (eskiler düşer)
  DERNEK_BAGIS_ORANI: 0.005,   // çalışan mezunların yıllık gelirinden dernek bağışı
  MENTORLUK_GIDER: 2000,       // günlük ₺ (aktifken); nitelik gelişimi +%15
  MENTORLUK_MIN_MEZUN: 8,      // mentorluk için gereken çalışan mezun
  KULUP_KURULUM: 15_000,       // öğrenci kulübü kurulum ₺
  KULUP_GIDER: 300,            // kulüp başına günlük gider ₺
  BULUSMA_MALIYET: 40_000,     // mezun buluşması etkinliği ₺ (yılda 1)
  BULUSMA_BAGIS: 2_000,        // çalışan mezun başına buluşma bağışı ₺
  KARIYER_GUNU_MALIYET: 75_000,
  KARIYER_GUNU_BEKLEME: 20,    // gün (dönemde 1 kez)

  // Öğrenci girişim ekosistemi
  GIRISIM_OKUL_PAYI: 0.10,     // öğrenci günlük girişim gelirinden okulun kuluçka payı
  MEZUN_BAGIS_ORANI: 0.20,     // mezuniyette sermayeden okula bağış oranı
  ZENGIN_MEZUN_ESIK: 150_000,  // bu sermayenin üstünde mezun olan prestij getirir

  // Yemek sistemi: aşçılar mesaide porsiyon üretir, öğrenciler tüketir
  ASCI_URETIM_DK: 1.4,         // aşçı başına dakikada üretilen porsiyon
  YEMEK_MALZEME: 5,            // porsiyon başına malzeme gideri ₺ (günlük düşülür)
  YEMEK_STOK_PAY: 1.25,        // stok tavanı = öğrenci sayısı × pay + 10 (israf freni)

  // Eksi bakiye günlük gecikme faizi (borcun oranı; en az ₺250)
  EKSI_BAKIYE_FAIZ: 0.004,

  // Öğrenci
  DERS_ILERLEME: 1.2,          // ders periyodu başına ilerleme puanı (öğretmenli)
  OGRETMENSIZ_CARPAN: 0.3,
  MEZUNIYET_ESIK: 100,         // ~4 dönemde mezuniyet hedefi
  MUTLULUK_BIRAKMA_ESIK: 25,   // altındaysa her gün bırakma riski
  BIRAKMA_OLASILIK: 0.12,

  // İhtiyaç artış hızları (dakika başına)
  NEED_RATE: { aclik: 0.09, tuvalet: 0.11, enerji: 0.05, eglence: 0.06 },

  // Hoca memnuniyeti ve emeklilik
  EMEKLILIK_YASI: 67,
  ISTIFA_ESIK: 35,             // memnuniyet altındaysa dönem başında istifa riski
  ISTIFA_OLASILIK: 0.35,
  ZAM_ORANI: 1.15,             // "Zam Ver" butonu maaşı bu çarpanla artırır

  // İflas: üst üste borçta kalınabilecek gün (zorluğa göre)
  IFLAS_GUN: { kolay: 45, normal: 30, zor: 20 },

  // Akademik gelişim
  XP_DERS: 2,                  // ders periyodu başına
  XP_ARASTIRMA_CARPAN: 0.02,   // üretilen araştırma puanı başına
  TERFI: {
    dr: { xp: 100, makale: 1 },
    docent: { xp: 250, makale: 3 },
    prof: { xp: 500, makale: 8, uluslararasi: 2 },
  },

  // Kütüphane: kitaplık sayısı eşikleri -> seviye 0..3
  KUTUPHANE_ESIK: [0, 5, 12, 24],
  KUTUPHANE_ARASTIRMA_BONUS: 0.1,  // seviye başına
  KUTUPHANE_OGRENME_BONUS: 0.05,

  // Kitap koleksiyonları: alan başına seviye 0-4, raflara sığmalı
  KITAP_MALIYET: [50_000, 100_000, 180_000, 300_000], // seviye 1-4 maliyetleri
  KUTUPHANE_CALISMA_TABAN: 0.35,  // kitapsız alanda kütüphane çalışma hızı (yavaş)
  KITAP_CALISMA_BONUS: 0.35,      // koleksiyon seviyesi başına ek çalışma hızı

  // Zaman
  DAKIKA_SANIYE: 12,           // 1x hızda saniye başına oyun dakikası (1 gün = 2 dk; insanlar sakin yürür)
} as const;
