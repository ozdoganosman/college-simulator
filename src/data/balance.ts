/**
 * Oyun dengesi sabitleri — tek yerden ayar.
 */
export const BALANCE = {
  BASLANGIC_PARA: 2_500_000,
  BASLANGIC_PRESTIJ: 100,

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

  // Zaman
  DAKIKA_SANIYE: 20,           // 1x hızda saniye başına oyun dakikası (1 gün ≈ 72 sn)
} as const;
