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
import { addPrestij, earn, notify } from './state';

export interface OlaySecenek {
  etiket: string;
  ipucu: string;
  uygula: (s: GameState) => string; // sonuç metni (bildirime yazılır)
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
        ipucu: 'Şeffaflık prestij verir ama kadro morali sarsılır',
        uygula: (s) => { tumHocaMoral(s, -6); addPrestij(s, 2); return 'Etik kurul soruşturması açıldı — basın şeffaflığı övdü (+2 prestij), kadro huzursuz (-6 moral).'; },
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
        ipucu: 'Para iyi ama kampüs ticarileşir',
        uygula: (s) => { earn(s, 400000); tumOgrMutluluk(s, -3); return `${formatMoney(400000)} kasaya girdi — kampüs panolarla doldu (öğrenci mutluluğu -3).`; },
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
        ipucu: 'Küçük masraf, büyük sevgi',
        uygula: (s) => { s.para -= 5000; tumOgrMutluluk(s, 4); return 'Sarman artık resmî maskot! 🐈 Öğrenci mutluluğu +4 — kedili üniversite batmaz.'; },
      },
      {
        etiket: 'Kampüse hayvan giremez',
        ipucu: 'Öğrenciler bunu unutmaz',
        uygula: (s) => { tumOgrMutluluk(s, -3); return 'Kedi belediye barınağına gönderildi — kampüs bunu konuşuyor (-3 mutluluk).'; },
      },
    ],
  },
];

export function olayTanim(id: string): OlayTanim | undefined {
  return OLAYLAR.find((o) => o.id === id);
}

/** Gün sonu: süresi dolan olayı varsayılanla kapat, gerekirse yeni olay çıkar. */
export function olayGuncelle(state: GameState): void {
  if (state.aktifOlay) {
    if (state.gun - state.aktifOlay.gun >= 2) {
      const tanim = olayTanim(state.aktifOlay.id);
      if (tanim) {
        const sonuc = tanim.secenekler[tanim.varsayilan].uygula(state);
        notify(state, `${tanim.emoji} ${tanim.baslik} (rektörlük sessiz kaldı): ${sonuc}`, 'bilgi');
      }
      state.aktifOlay = null;
      state.sonOlayGunu = state.gun;
    }
    return;
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
  const sonuc = tanim.secenekler[secim].uygula(state);
  notify(state, `${tanim.emoji} ${tanim.baslik}: ${sonuc}`, 'bilgi');
}
