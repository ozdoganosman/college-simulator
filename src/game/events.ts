/**
 * Kampüs olay kartları — oyunu "izleme"den "yönetme"ye çeviren karar anları.
 *
 * Dönemde ~1-2 kez bir olay belirir (ekranın üstünde bloklamayan kart).
 * Oyuncu iki seçenekten birini seçer; 2 gün cevapsız kalırsa varsayılan
 * seçenek kendiliğinden uygulanır ("rektörlük sessiz kaldı").
 * State'te yalnızca {id, gun} tutulur — tanımlar koddadır (JSON-güvenli).
 */
import { GameState, Student } from '../core/types';
import { chance, formatMoney, randInt } from '../core/util';
import { istihdamOrani } from './alumni';
import { removeAgent } from './agents';
import { addPrestij, earn, notify } from './state';

export interface OlaySecenek {
  etiket: string;
  ipucu: string;
  uygula: (s: GameState) => string; // sonuç metni (bildirime yazılır)
  /** bu seçimin DEVAMI: verilen kararın sonucu ileride yeni olay olarak döner */
  zincir?: { id: string; gecikme: number };
}

export interface OlayTanim {
  id: string;
  emoji: string;
  baslik: string;
  metin: string;
  kosul: (s: GameState) => boolean;
  secenekler: [OlaySecenek, OlaySecenek];
  /** süre dolunca uygulanan seçenek */
  varsayilan: 0 | 1;
}

function ogrenciler(s: GameState): Student[] {
  return s.agents.filter((a): a is Student => a.kind === 'ogrenci');
}

function tumOgrMutluluk(s: GameState, delta: number): void {
  for (const o of ogrenciler(s)) o.mutluluk = Math.max(0, Math.min(100, o.mutluluk + delta));
}

function tumHocaMoral(s: GameState, delta: number): void {
  for (const a of s.agents) {
    if (a.kind === 'akademisyen') a.memnuniyet = Math.max(0, Math.min(100, a.memnuniyet + delta));
  }
}

function nitelikVer(s: GameState, k: 'artist' | 'filozof' | 'pratik' | 'influencer', delta: number): void {
  for (const o of ogrenciler(s)) o.nitelik[k] = Math.min(100, o.nitelik[k] + delta);
}

export const OLAYLAR: OlayTanim[] = [
  {
    id: 'yemek-zammi',
    emoji: '🍽️',
    baslik: 'Yemekhane Protestosu',
    metin: 'Öğrenciler yemekhane zamlarını protesto ediyor; sosyal medyada #AçKaldık etiketi yükseliyor.',
    kosul: (s) => ogrenciler(s).length >= 15,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Zammı geri çek (₺40.000)',
        ipucu: 'Bütçeden çıkar ama öğrenciler mutlu olur',
        uygula: (s) => { s.para -= 40000; tumOgrMutluluk(s, 6); return 'Zam geri çekildi — kampüste alkış! (öğrenci mutluluğu +6)'; },
      },
      {
        etiket: 'Kararlı dur',
        ipucu: 'Mutluluk düşer ama yönetim ciddiyeti prestij verir',
        uygula: (s) => { tumOgrMutluluk(s, -7); addPrestij(s, 1); return 'Yönetim geri adım atmadı — öğrenciler küskün (-7 mutluluk), basın "kararlı rektör" yazdı (+1 prestij).'; },
      },
    ],
  },
  {
    id: 'viral-video',
    emoji: '📱',
    baslik: 'Kampüs Videosu Viral Oldu',
    metin: 'Bir öğrencinin çektiği kampüs turu videosu milyonlarca izlendi. Bu rüzgârı kullanacak mısın?',
    kosul: (s) => ogrenciler(s).length >= 10,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Resmî tanıtıma çevir (₺30.000)',
        ipucu: 'Bir sonraki YKS talebi ×1.2',
        uygula: (s) => { s.para -= 30000; s.sonrakiTalepCarpan *= 1.2; return 'Video resmî tanıtım kampanyasına dönüştü — bir sonraki YKS talebi ×1.2!'; },
      },
      {
        etiket: 'Kendi haline bırak',
        ipucu: 'Bedava — belki yine işe yarar',
        uygula: (s) => {
          if (chance(s, 0.4)) { s.sonrakiTalepCarpan *= 1.08; return 'Video organik yayıldı — talep yine de biraz arttı (×1.08).'; }
          return 'Video birkaç güne unutuldu gitti.';
        },
      },
    ],
  },
  {
    id: 'intihal-iddiasi',
    emoji: '📰',
    baslik: 'İntihal İddiası',
    metin: 'Bir gazete, öğretim üyelerinden birinin makalesinde intihal olduğunu iddia ediyor.',
    kosul: (s) => s.agents.filter((a) => a.kind === 'akademisyen').length >= 3,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Soruşturma başlat',
        ipucu: 'Şeffaflık prestij verir ama kadro morali sarsılır — rapor 1 dönem sonra gelir',
        uygula: (s) => { tumHocaMoral(s, -6); addPrestij(s, 2); return 'Etik kurul soruşturması açıldı — basın şeffaflığı övdü (+2 prestij), kadro huzursuz (-6 moral). Rapor yolda…'; },
        zincir: { id: 'intihal-sonuc', gecikme: 20 },
      },
      {
        etiket: 'Üstünü ört',
        ipucu: 'Riskli: sızarsa prestij çöker',
        uygula: (s) => {
          if (chance(s, 0.4)) { addPrestij(s, -8); s.sonrakiTalepCarpan *= 0.95; return 'Örtbas SIZDI! Manşetlerdesin: -8 prestij, talep ×0.95.'; }
          return 'İddia gündemden düştü... bu sefer.';
        },
      },
    ],
  },
  {
    id: 'sartli-bagis',
    emoji: '💼',
    baslik: 'Şartlı Bağış Teklifi',
    metin: 'Bir holding, kampüse dev reklam panoları koyma şartıyla büyük bağış öneriyor.',
    kosul: () => true,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Kabul et (+₺400.000)',
        ipucu: 'Para iyi ama kampüs ticarileşir — holding bunu unutmaz',
        uygula: (s) => { earn(s, 400000); tumOgrMutluluk(s, -3); return `${formatMoney(400000)} kasaya girdi — kampüs panolarla doldu (öğrenci mutluluğu -3).`; },
        zincir: { id: 'bagisci-talebi', gecikme: 15 },
      },
      {
        etiket: 'Reddet',
        ipucu: 'İlkeli duruş prestij getirir',
        uygula: (s) => { addPrestij(s, 3); return '"Kampüs reklam panosu değildir" açıklaman akademide takdir topladı (+3 prestij).'; },
      },
    ],
  },
  {
    id: 'boru-patlagi',
    emoji: '💧',
    baslik: 'Ana Su Borusu Patladı',
    metin: 'Kampüsün ana su hattı patladı; koridorlar su içinde.',
    kosul: (s) => s.rooms.length >= 6,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Acil onarım (₺60.000)',
        ipucu: 'Pahalı ama sorun anında biter',
        uygula: (s) => { s.para -= 60000; return 'Onarım ekibi gece çalıştı — sabaha her şey kupkuru.'; },
      },
      {
        etiket: 'İdare et',
        ipucu: 'Bedava ama kampüs çamur içinde kalır',
        uygula: (s) => {
          let n = 0;
          for (let i = 0; i < s.dirt.length && n < 220; i++) {
            if (s.floor[i] !== null && randInt(s, 0, 3) === 0) { s.dirt[i] = Math.min(100, s.dirt[i] + 55); n++; }
          }
          tumOgrMutluluk(s, -5);
          return 'Sular kendiliğinden çekildi ama kampüs çamur içinde (-5 mutluluk) — temizlikçiler mesaide.';
        },
      },
    ],
  },
  {
    id: 'tercih-fuari',
    emoji: '🎪',
    baslik: 'YKS Tercih Fuarı Daveti',
    metin: 'Büyük tercih fuarından stant daveti geldi — adaylarla yüz yüze tanışma fırsatı.',
    kosul: () => true,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Stant aç (₺30.000)',
        ipucu: 'Bir sonraki YKS talebi ×1.15',
        uygula: (s) => { s.para -= 30000; s.sonrakiTalepCarpan *= 1.15; return 'Standın önünde kuyruk oluştu — bir sonraki YKS talebi ×1.15.'; },
      },
      { etiket: 'Pas geç', ipucu: 'Bütçe cebinde kalır', uygula: () => 'Fuara katılmadık; rakipler broşür dağıttı.' },
    ],
  },
  {
    id: 'festival',
    emoji: '🎪',
    baslik: 'Bahar Şenliği İzni',
    metin: 'Öğrenci konseyi kampüste iki günlük bahar şenliği düzenlemek için izin ve bütçe istiyor.',
    kosul: (s) => ogrenciler(s).length >= 20,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'İzin ver + destekle (₺25.000)',
        ipucu: 'Mutluluk +8, sanat/sosyal nitelikler gelişir',
        uygula: (s) => { s.para -= 25000; tumOgrMutluluk(s, 8); nitelikVer(s, 'artist', 1.5); nitelikVer(s, 'influencer', 1.5); return 'Şenlik muhteşemdi! Mutluluk +8, 🎨 ve 📣 nitelikleri gelişti.'; },
      },
      {
        etiket: 'Reddet',
        ipucu: 'Ders düzeni bozulmaz ama moral düşer',
        uygula: (s) => { tumOgrMutluluk(s, -5); return '"Ders varken şenlik olmaz" — öğrenciler küstü (-5 mutluluk).'; },
      },
    ],
  },
  {
    id: 'ek-hibe',
    emoji: '🧪',
    baslik: 'Acil AR-GE Çağrısı',
    metin: 'TÜBİTAK son dakika ek hibe çağrısı açtı; başvuru dosyası hazırlamak masraflı ama ödül büyük.',
    kosul: (s) => s.projects.length >= 1,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Başvur (₺10.000)',
        ipucu: '%60 şansla ₺150.000 hibe',
        uygula: (s) => {
          s.para -= 10000;
          if (chance(s, 0.6)) { earn(s, 150000); return `Başvuru KABUL — ${formatMoney(150000)} ek hibe kasada!`; }
          return 'Başvuru elendi — hakem raporu acımasızdı.';
        },
      },
      { etiket: 'Uğraşma', ipucu: 'Dosya yükü yok', uygula: () => 'Çağrıyı pas geçtik.' },
    ],
  },
  {
    id: 'grip-salgini',
    emoji: '🤒',
    baslik: 'Grip Salgını',
    metin: 'Kampüste grip vakaları hızla artıyor; revir yoğun.',
    kosul: (s) => ogrenciler(s).length >= 25,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Sağlık taraması + aşı (₺35.000)',
        ipucu: 'Salgın büyümeden söner',
        uygula: (s) => { s.para -= 35000; return 'Aşı kampanyası işe yaradı — salgın söndü, kimse etkilenmedi.'; },
      },
      {
        etiket: 'Kendi geçer',
        ipucu: 'Bedava ama kampüs perişan olur',
        uygula: (s) => { tumOgrMutluluk(s, -6); tumHocaMoral(s, -4); return 'Salgın 1 hafta sürdü: öğrenci mutluluğu -6, kadro morali -4.'; },
      },
    ],
  },
  {
    id: 'unlu-konferans',
    emoji: '🎤',
    baslik: 'Dünyaca Ünlü Profesör',
    metin: 'Nobel adayı bir profesör, Türkiye turnesinde kampüsünde konferans verebilirmiş — ücreti tuzlu.',
    kosul: (s) => s.para >= 80000,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Davet et (₺70.000)',
        ipucu: 'Prestij +4, öğrenciler ilham alır',
        uygula: (s) => { s.para -= 70000; addPrestij(s, 4); nitelikVer(s, 'filozof', 2); tumHocaMoral(s, 4); return 'Amfi tıklım tıklım! +4 prestij, 📜 nitelik +2, kadro morali +4.'; },
      },
      { etiket: 'Bütçemiz yok', ipucu: 'Fırsat kaçar', uygula: () => 'Profesör rakip üniversitede konuştu; salon doluymuş.' },
    ],
  },
  {
    id: 'staj-teklifi',
    emoji: '🤝',
    baslik: 'Mezundan Staj Anlaşması',
    metin: 'Başarılı bir mezunun şirketi, öğrencilerine öncelikli staj kontenjanı öneriyor.',
    kosul: (s) => (istihdamOrani(s) ?? 0) > 0 && s.mezunlar.filter((m) => !m.issiz).length >= 3,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Anlaşmayı imzala',
        ipucu: 'Öğrencilere 💼 pratik nitelik',
        uygula: (s) => { nitelikVer(s, 'pratik', 3); addPrestij(s, 1); return 'Staj protokolü imzalandı — 💼 pratik nitelik +3, mezun ağı güçlendi (+1 prestij).'; },
      },
      { etiket: 'Şartlar ağır, reddet', ipucu: 'Şirket logosu her yerde olacaktı', uygula: () => 'Teklif reddedildi; mezun kırgın ama anlayışlı.' },
    ],
  },
  {
    id: 'kampus-kedisi',
    emoji: '🐈',
    baslik: 'Kampüs Kedisi',
    metin: 'Kantin önüne yerleşen sarman kedi öğrencilerin maskotu oldu; konsey resmî maskot ilan edilmesini istiyor.',
    kosul: (s) => ogrenciler(s).length >= 5,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Sahiplen (mama bütçesi ₺5.000)',
        ipucu: 'Küçük masraf, büyük sevgi — bu hikâye burada bitmez',
        uygula: (s) => { s.para -= 5000; tumOgrMutluluk(s, 4); return 'Sarman artık resmî maskot! 🐈 Öğrenci mutluluğu +4 — kedili üniversite batmaz.'; },
        zincir: { id: 'kedi-festivali', gecikme: 15 },
      },
      {
        etiket: 'Kampüse hayvan giremez',
        ipucu: 'Öğrenciler bunu unutmaz',
        uygula: (s) => { tumOgrMutluluk(s, -3); return 'Kedi belediye barınağına gönderildi — kampüs bunu konuşuyor (-3 mutluluk).'; },
      },
    ],
  },
];

/**
 * ZİNCİR OLAYLARI: rastgele havuza girmez (kosul false) — yalnızca önceki
 * bir kararın devamı olarak, planlanan günde kapıya gelir.
 */
export const ZINCIR_OLAYLAR: OlayTanim[] = [
  {
    id: 'rakip-ayartma',
    emoji: '🎣',
    baslik: 'Hocana Transfer Teklifi!',
    metin: 'Bir rakip üniversite, yıldız hocalarından birine yüklü bir teklif götürdü (ayrıntılar bildirimde). Hoca kararsız — hamlen ne?',
    kosul: () => false,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Zam yap (maaş ×1.15)',
        ipucu: 'Hoca kesin kalır, morali fırlar',
        uygula: (s) => {
          const b = s.bekleyenAyartma;
          s.bekleyenAyartma = null;
          const hoca = b ? s.agents.find((a) => a.id === b.academicId && a.kind === 'akademisyen') : undefined;
          if (!hoca || hoca.kind !== 'akademisyen') return 'Hoca çoktan ayrılmış — teklif boşa düştü.';
          hoca.maas = Math.round(hoca.maas * 1.15);
          hoca.memnuniyet = Math.min(100, hoca.memnuniyet + 18);
          return `${hoca.ad} zamla ikna edildi (maaş ${formatMoney(hoca.maas)}/gün, moral +18) — rakip eli boş döndü.`;
        },
      },
      {
        etiket: 'Karışma — kendi bilir',
        ipucu: 'Bedava ama riskli: %25 ihtimalle hoca GİDER',
        uygula: (s) => {
          const b = s.bekleyenAyartma;
          s.bekleyenAyartma = null;
          const hoca = b ? s.agents.find((a) => a.id === b.academicId && a.kind === 'akademisyen') : undefined;
          if (!hoca || hoca.kind !== 'akademisyen') return 'Hoca zaten yoktu.';
          if (chance(s, 0.25)) {
            const ad = hoca.ad;
            removeAgent(s, hoca.id);
            addPrestij(s, -3);
            return `${ad} teklifi KABUL ETTİ ve ${b?.rakipAd ?? 'rakibe'} gitti! (-3 prestij) Kadro panelinden yerine birini al.`;
          }
          hoca.memnuniyet = Math.max(0, hoca.memnuniyet - 12);
          return `${hoca.ad} kaldı ama morali sarsıldı (-12) — bir dahaki teklifte gidebilir.`;
        },
      },
    ],
  },
  {
    id: 'tanitim-savasi',
    emoji: '📉',
    baslik: 'Rakip Tanıtım Savaşı Açtı',
    metin: 'Bir rakip, dev bütçeli reklam kampanyasıyla YKS adaylarının dikkatini çekiyor. Karşılık verecek misin?',
    kosul: () => false,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Karşı kampanya (₺50.000)',
        ipucu: 'Talep kaybı önlenir',
        uygula: (s) => { s.para -= 50000; return 'Karşı kampanya rakibin etkisini sıfırladı — talep korunuyor.'; },
      },
      {
        etiket: 'Boş ver',
        ipucu: 'Bedava ama bir sonraki YKS talebi ×0.88',
        uygula: (s) => { s.sonrakiTalepCarpan *= 0.88; return 'Kampanyaya karşılık verilmedi — bir sonraki YKS talebi ×0.88.'; },
      },
    ],
  },
  {
    id: 'bina-bagisi',
    emoji: '🏛️',
    baslik: 'İsimli Bina Bağışı Teklifi',
    metin: 'Zirvedeki bir mezunun dev bağış teklifi masada — karşılığında binaya kendi adının verilmesini istiyor. (Ayrıntılar bildirimde)',
    kosul: () => false,
    varsayilan: 0,
    secenekler: [
      {
        etiket: 'Kabul et — isim onun, para bizim',
        ipucu: 'Dev bağış + prestij',
        uygula: (s) => {
          const b = s.bekleyenBina;
          s.bekleyenBina = null;
          if (!b) return 'Teklif çoktan geri çekilmiş.';
          earn(s, b.tutar);
          addPrestij(s, 3);
          // GÖRSEL KARŞILIK: en büyük isimsiz geçerli oda bağışçının adını alır
          const aday = [...s.rooms]
            .filter((r) => r.valid && !r.ozelAd && r.type !== 'tuvalet')
            .sort((x, y) => y.tiles.length - x.tiles.length)[0];
          if (aday) {
            aday.ozelAd = b.bina;
            return `"${b.bina}" açıldı — kampüsteki en büyük bina ${b.ad}'ın adını taşıyor (haritada ⭐). ${formatMoney(b.tutar)} kasada (+3 prestij).`;
          }
          return `${b.ad}'ın ${formatMoney(b.tutar)} bağışı kasada (+3 prestij) — isim verilecek bina bulunamadı, ilk yeni binaya verilecek söz verildi.`;
        },
      },
      {
        etiket: 'İsim hakkı vermeyiz',
        ipucu: 'Para gider ama kurum kimliği korunur (+2 prestij)',
        uygula: (s) => {
          const b = s.bekleyenBina;
          s.bekleyenBina = null;
          addPrestij(s, 2);
          return `Teklif reddedildi — "kampüs binaları kişilere değil bilime adanır" (+2 prestij).${b ? ` ${b.ad} anlayışla karşıladı.` : ''}`;
        },
      },
    ],
  },
  {
    id: 'intihal-sonuc',
    emoji: '📜',
    baslik: 'Etik Kurul Raporu Masanda',
    metin: 'Başlattığın intihal soruşturması sonuçlandı: iddialar KISMEN DOĞRU çıktı. Rapor elinde — ne yapacaksın?',
    kosul: () => false,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Raporu kamuoyuyla paylaş',
        ipucu: 'Şeffaflık büyük prestij verir ama kadro sarsılır',
        uygula: (s) => { addPrestij(s, 4); tumHocaMoral(s, -5); return 'Rapor yayınlandı — akademik dünya dürüstlüğünü konuşuyor (+4 prestij), kadro morali -5.'; },
      },
      {
        etiket: 'Raporu arşive kaldır',
        ipucu: 'Riskli: %40 ihtimalle sızar',
        uygula: (s) => {
          if (chance(s, 0.4)) { addPrestij(s, -6); return 'Rapor SIZDI! "Örtbas rektörü" manşetleri: -6 prestij.'; }
          tumHocaMoral(s, 3);
          return 'Rapor sessizce arşive kalktı; kadro rahatladı (+3 moral)… şimdilik.';
        },
      },
    ],
  },
  {
    id: 'kedi-festivali',
    emoji: '🐈',
    baslik: 'Sarman Fenomen Oldu',
    metin: 'Maskotun sosyal medya hesabı 100 bin takipçiyi geçti! Öğrenci konseyi bir "Kedi Festivali" düzenlemek istiyor.',
    kosul: () => false,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Festivali destekle (₺12.000)',
        ipucu: 'Mutluluk + tanıtım — kedili kampüs efsanesi',
        uygula: (s) => { s.para -= 12000; tumOgrMutluluk(s, 6); s.sonrakiTalepCarpan *= 1.05; return 'Kedi Festivali muhteşemdi! Mutluluk +6, bir sonraki YKS talebi ×1.05 — Sarman kampüsün yüzü oldu.'; },
      },
      {
        etiket: 'İzin verme',
        ipucu: 'Sarman yine de sevilir ama fırsat kaçar',
        uygula: (s) => { tumOgrMutluluk(s, -2); return 'Festival iptal — öğrenciler biraz bozuldu (-2 mutluluk), Sarman umursamadı.'; },
      },
    ],
  },
  {
    id: 'bagisci-talebi',
    emoji: '💼',
    baslik: 'Holding Geri Döndü',
    metin: 'Bağış yaptığın holding reklam alanını genişletmek istiyor: "Amfilere de logo koyalım, bağışı büyütelim."',
    kosul: () => false,
    varsayilan: 1,
    secenekler: [
      {
        etiket: 'Kabul et (+₺250.000)',
        ipucu: 'Daha çok para, daha çok ticarileşme',
        uygula: (s) => { earn(s, 250000); tumOgrMutluluk(s, -4); addPrestij(s, -1); return `${formatMoney(250000)} daha kasada — ama amfiler reklam panosuna döndü (mutluluk -4, prestij -1).`; },
      },
      {
        etiket: 'Bu kadarı fazla, reddet',
        ipucu: 'Sınır çizmek prestij getirir',
        uygula: (s) => { addPrestij(s, 2); return '"Sınıflarımız satılık değil" — akademik camia alkışladı (+2 prestij). Holding küstü.'; },
      },
    ],
  },
];

export function olayTanim(id: string): OlayTanim | undefined {
  return OLAYLAR.find((o) => o.id === id) ?? ZINCIR_OLAYLAR.find((o) => o.id === id);
}

/** Karar günlüğüne yaz (son 40 kayıt tutulur). */
function gecmiseYaz(state: GameState, tanim: OlayTanim, secim: string, sonuc: string): void {
  state.olayGecmisi.push({ gun: state.gun, baslik: `${tanim.emoji} ${tanim.baslik}`, secim, sonuc });
  if (state.olayGecmisi.length > 40) state.olayGecmisi.shift();
}

/** Seçimin zinciri varsa devam olayını planla. */
function zinciriPlanla(state: GameState, secenek: OlaySecenek): void {
  if (secenek.zincir) {
    state.bekleyenZincir.push({ id: secenek.zincir.id, gun: state.gun + secenek.zincir.gecikme });
  }
}

/** Gün sonu: süresi dolan olayı varsayılanla kapat, gerekirse yeni olay çıkar. */
export function olayGuncelle(state: GameState): void {
  if (state.aktifOlay) {
    if (state.gun - state.aktifOlay.gun >= 2) {
      const tanim = olayTanim(state.aktifOlay.id);
      if (tanim) {
        const secenek = tanim.secenekler[tanim.varsayilan];
        const sonuc = secenek.uygula(state);
        zinciriPlanla(state, secenek);
        gecmiseYaz(state, tanim, `(sessiz kalındı → ${secenek.etiket})`, sonuc);
        notify(state, `${tanim.emoji} ${tanim.baslik} (rektörlük sessiz kaldı): ${sonuc}`, 'bilgi');
      }
      state.aktifOlay = null;
      state.sonOlayGunu = state.gun;
    }
    return;
  }

  // günü gelen ZİNCİR olayı her şeyden önceliklidir (bekleme süresi tanımaz)
  const zincirIdx = state.bekleyenZincir.findIndex((z) => state.gun >= z.gun);
  if (zincirIdx >= 0) {
    const z = state.bekleyenZincir.splice(zincirIdx, 1)[0];
    const tanim = olayTanim(z.id);
    if (tanim) {
      state.aktifOlay = { id: z.id, gun: state.gun };
      notify(state, `⚡ KARARININ DEVAMI: ${tanim.emoji} ${tanim.baslik} — karar bekliyor (2 gün)!`, 'kotu');
      return;
    }
  }

  if (state.gun < 4 || state.gun - state.sonOlayGunu < 6) return;
  if (!chance(state, 0.3)) return;
  const uygunlar = OLAYLAR.filter((o) => o.kosul(state));
  if (uygunlar.length === 0) return;
  const secilen = uygunlar[randInt(state, 0, uygunlar.length - 1)];
  state.aktifOlay = { id: secilen.id, gun: state.gun };
  notify(state, `⚡ KAMPÜS OLAYI: ${secilen.emoji} ${secilen.baslik} — karar bekliyor (2 gün)!`, 'kotu');
}

/** Oyuncu seçim yaptı (UI çağırır). */
export function olayCoz(state: GameState, secim: 0 | 1): void {
  if (!state.aktifOlay) return;
  const tanim = olayTanim(state.aktifOlay.id);
  state.aktifOlay = null;
  state.sonOlayGunu = state.gun;
  if (!tanim) return;
  const secenek = tanim.secenekler[secim];
  const sonuc = secenek.uygula(state);
  zinciriPlanla(state, secenek);
  gecmiseYaz(state, tanim, secenek.etiket, sonuc);
  notify(state, `${tanim.emoji} ${tanim.baslik}: ${sonuc}`, 'bilgi');
}
