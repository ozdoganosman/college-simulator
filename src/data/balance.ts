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
  MAAS: { arsgor: 1200, dr: 2000, docent: 3000, prof: 4500, asci: 900, temizlikci: 700 },
  PERSONEL_ALIM: { asci: 5000, temizlikci: 3000 }, // ilan maliyeti
  ASISTAN_MAAS: 500,           // asistan atanan YL/doktora öğrencisinin günlük maaşı ₺

  // Araştırma
  PROJE_MALIYET_TABAN: 40000,
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
  KARIYER_GUNU_MALIYET: 75_000,
  KARIYER_GUNU_BEKLEME: 20,    // gün (dönemde 1 kez)

  // Öğrenci girişim ekosistemi
  GIRISIM_OKUL_PAYI: 0.10,     // öğrenci günlük girişim gelirinden okulun kuluçka payı
  MEZUN_BAGIS_ORANI: 0.20,     // mezuniyette sermayeden okula bağış oranı
  ZENGIN_MEZUN_ESIK: 150_000,  // bu sermayenin üstünde mezun olan prestij getirir

  // Öğrenci
  DERS_ILERLEME: 1.2,          // ders periyodu başına ilerleme puanı (öğretmenli)
  OGRETMENSIZ_CARPAN: 0.3,
  MEZUNIYET_ESIK: 100,         // ~4 dönemde mezuniyet hedefi
  MUTLULUK_BIRAKMA_ESIK: 25,   // altındaysa her gün bırakma riski
  BIRAKMA_OLASILIK: 0.12,

  // İhtiyaç artış hızları (dakika başına)
  NEED_RATE: { aclik: 0.09, tuvalet: 0.11, enerji: 0.05, eglence: 0.06 },

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
  DAKIKA_SANIYE: 20,           // 1x hızda saniye başına oyun dakikası (1 gün ≈ 72 sn)
} as const;
