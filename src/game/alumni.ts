/**
 * Mezunlar Derneği: iş bulma, kariyer ilerlemesi, haberler, dernek bağışları.
 *
 * Mezuniyette her öğrenci için Mezun kaydı açılır; işe yerleşme PUANLA belirlenir
 * (GNO + baskın nitelik + influencer + eğilim). Her yıl dönümünde kariyerler
 * ilerler (terfi/iş bulma/gelir artışı), dernek haberleri üretilir ve çalışan
 * mezunlar gelirlerinin küçük bir kısmını okula bağışlar. Mezun istihdam oranı
 * rakip üniversitelerle kıyaslanır.
 */
import {
  GameState, Mezun, Nitelik, NITELIK_META, Sektor, Student, yil,
} from '../core/types';
import { chance, clamp, formatMoney, newId, pick, randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { addPrestij, earn, notify, spend } from './state';
import { olayOner } from './events'; // döngüsel görünür ama yalnız çalışma anında çağrılır

/** Sektör başına kariyer basamakları (kademe 0-4). */
export const MESLEKLER: Record<Sektor, string[]> = {
  muhendis: ['Stajyer Mühendis', 'Mühendis', 'Kıdemli Mühendis', 'Teknik Direktör', 'CTO'],
  artist: ['Serbest Tasarımcı', 'Grafik Tasarımcı', 'Sanat Yönetmeni', 'Kreatif Direktör', 'Ünlü Sanatçı'],
  filozof: ['Öğretmen Adayı', 'Öğretmen', 'Editör', 'Köşe Yazarı', 'Düşünce Lideri'],
  pratik: ['Satış Temsilcisi', 'Uzman', 'Müdür', 'Genel Müdür', 'CEO'],
  girisim: ['Girişimci Adayı', 'Startup Kurucusu', 'Girişimci', 'Seri Girişimci', 'Sanayi Devi'],
  medya: ['İçerik Üreticisi', 'Fenomen', 'Influencer', 'Marka Yüzü', 'Medya Patronu'],
};

export const SEKTOR_META: Record<Sektor, { ad: string; emoji: string }> = {
  muhendis: { ad: 'Mühendislik', emoji: '🔬' },
  artist: { ad: 'Sanat', emoji: '🎨' },
  filozof: { ad: 'Eğitim/Kültür', emoji: '📜' },
  pratik: { ad: 'İş Dünyası', emoji: '💼' },
  girisim: { ad: 'Girişim', emoji: '🚀' },
  medya: { ad: 'Medya', emoji: '📣' },
};

/** Kademe başına yıllık taban gelir ₺. */
const KADEME_GELIR = [90_000, 180_000, 350_000, 700_000, 1_500_000];
const SEKTOR_CARPAN: Record<Sektor, number> = {
  muhendis: 1.1, artist: 0.95, filozof: 0.85, pratik: 1.0, girisim: 1.5, medya: 1.3,
};

function yeniGelir(m: Mezun): number {
  return Math.round(KADEME_GELIR[m.kademe] * SEKTOR_CARPAN[m.sektor] * (0.8 + m.puan / 150));
}

/** Mezuniyet: öğrenciden mezun kaydı açar, puanına göre işe yerleştirir. */
export function mezunEkle(state: GameState, s: Student, bolumAd: string, gno: number | null): Mezun {
  // baskın nitelik → sektör (yüksek sermaye girişime, influencer medyaya götürür)
  let baskin: Nitelik = 'muhendis';
  for (const k of Object.keys(NITELIK_META) as Nitelik[]) {
    if (s.nitelik[k] > s.nitelik[baskin]) baskin = k;
  }
  let sektor: Sektor = baskin === 'influencer' ? 'medya' : baskin;
  if (s.sermaye >= 80_000) sektor = 'girisim';

  const gnoDeger = gno ?? 1.5;
  const puan = Math.round(clamp(
    gnoDeger * 15 + s.nitelik[baskin] * 0.45 + s.nitelik.influencer * 0.15 + s.egilim * 0.1,
    0, 100,
  ));
  const issiz = puan < 25 || chance(state, clamp(0.45 - puan / 150, 0.03, 0.45));

  const m: Mezun = {
    id: newId(state),
    ad: s.ad,
    bolumAd,
    yil: yil(state.gun),
    gno: Math.round(gnoDeger * 100) / 100,
    puan,
    sektor,
    meslek: issiz ? 'İş arıyor' : MESLEKLER[sektor][0],
    kademe: 0,
    gelir: 0,
    issiz,
  };
  if (!m.issiz) m.gelir = yeniGelir(m);

  state.mezunlar.push(m);
  // ⭐ yıldız öğrenci takibi: mezuniyeti özel bildirilir
  if ((state.yildizlar ?? []).includes(m.ad)) {
    notify(state, `⭐ Yıldız öğrencin ${m.ad} mezun oldu — ${m.issiz ? 'iş arıyor' : `ilk durağı: ${m.meslek} (${formatMoney(m.gelir)}/yıl)`}. Kariyerini haberlerden izleyeceğiz!`, 'odul');
  }
  if (state.mezunlar.length > BALANCE.MEZUN_LIMIT) {
    // en eski ve en düşük gelirli kayıtlar düşer — mütevelli heyeti üyeleri
    // ASLA budanmaz (yoksa koltuk sessizce boşalır ve katkıları buharlaşırdı)
    const korunan = new Set(state.mutevelli);
    state.mezunlar.sort((a, b) => (korunan.has(b.id) ? 1 : 0) - (korunan.has(a.id) ? 1 : 0)
      || b.yil - a.yil || b.gelir - a.gelir);
    state.mezunlar.length = BALANCE.MEZUN_LIMIT;
  }
  return m;
}

/** Çalışan mezun oranı % (mezun yoksa null). */
export function istihdamOrani(state: GameState): number | null {
  if (state.mezunlar.length === 0) return null;
  const calisan = state.mezunlar.filter((m) => !m.issiz).length;
  return Math.round((100 * calisan) / state.mezunlar.length);
}

function haberEkle(state: GameState, metin: string): void {
  state.mezunHaber.unshift(`Yıl ${yil(state.gun)} · ${metin}`);
  if (state.mezunHaber.length > 12) state.mezunHaber.length = 12;
}

/**
 * Yıl dönümü: kariyerler ilerler, haberler üretilir, dernek bağışı toplanır.
 * game.ts yıl dönümünde çağırır.
 */
export function yillikMezunGuncelle(state: GameState): void {
  if (state.mezunlar.length === 0) return;

  const terfiler: Mezun[] = [];
  const isBulanlar: Mezun[] = [];
  let bagis = 0;

  for (const m of state.mezunlar) {
    if (m.issiz) {
      // iş arama: puan yüksekse şans yüksek
      if (chance(state, clamp(0.25 + m.puan / 200, 0.25, 0.7))) {
        m.issiz = false;
        m.meslek = MESLEKLER[m.sektor][m.kademe];
        m.gelir = yeniGelir(m);
        isBulanlar.push(m);
        if ((state.yildizlar ?? []).includes(m.ad)) {
          notify(state, `⭐ Yıldız mezunun ${m.ad} işe girdi: ${m.meslek} (${formatMoney(m.gelir)}/yıl)!`, 'odul');
        }
      }
      continue;
    }
    // terfi şansı puanla artar; gelir her yıl biraz büyür
    if (m.kademe < MESLEKLER[m.sektor].length - 1 && chance(state, 0.1 + m.puan / 350)) {
      m.kademe++;
      m.meslek = MESLEKLER[m.sektor][m.kademe];
      m.gelir = yeniGelir(m);
      terfiler.push(m);
      if ((state.yildizlar ?? []).includes(m.ad)) {
        notify(state, `⭐ Yıldız mezunun ${m.ad} TERFİ etti: artık ${m.meslek} (${formatMoney(m.gelir)}/yıl)!`, 'odul');
      }
    } else {
      m.gelir = Math.round(m.gelir * randRange(state, 1.03, 1.12));
    }
    bagis += m.gelir * BALANCE.DERNEK_BAGIS_ORANI;
  }

  // dernek haberleri: en dikkat çekici olaylar
  const yildiz = terfiler.sort((a, b) => b.kademe - a.kademe || b.gelir - a.gelir)[0];
  if (yildiz) {
    haberEkle(state, `⭐ ${yildiz.ad} (${yildiz.bolumAd} '${yildiz.yil}) ${yildiz.meslek} oldu!`);
  }
  const girisimci = terfiler.find((m) => m.sektor === 'girisim' && m !== yildiz);
  if (girisimci) {
    haberEkle(state, `🚀 ${girisimci.ad} girişimini büyüttü — artık ${girisimci.meslek}.`);
  }
  if (isBulanlar.length > 0) {
    haberEkle(state, `🤝 ${isBulanlar.length} mezunumuz bu yıl işe yerleşti (kariyer ağı işliyor).`);
  }
  const enZengin = [...state.mezunlar].sort((a, b) => b.gelir - a.gelir)[0];
  if (enZengin && enZengin.gelir > 1_000_000 && chance(state, 0.5)) {
    haberEkle(state, `💎 ${enZengin.ad} yıllık ${formatMoney(enZengin.gelir)} gelirle listelerde!`);
  }

  // 🏛️ İsimli bina bağışı: zirvedeki bir mezun nadiren dev bağış TEKLİF eder —
  // pazarlık olay kartıyla yapılır (isim hakkı karşılığı para). Olay yuvası
  // doluysa kart SIRAYA girer; sıra da doluysa teklif bu yıl gelmez.
  const zirvedekiler = state.mezunlar.filter((m) => !m.issiz && m.kademe >= 3 && m.gelir >= 800_000);
  if (zirvedekiler.length > 0 && chance(state, 0.25) && !state.bekleyenBina
      && olayOner(state, 'bina-bagisi')) {
    const bagisci = pick(state, zirvedekiler);
    const binaAd: Record<string, string> = {
      girisim: 'Teknoloji Merkezi', muhendis: 'Mühendislik Laboratuvarı',
      artist: 'Sanat Galerisi', filozof: 'Kütüphanesi', pratik: 'Konferans Salonu',
      medya: 'Medya Stüdyosu',
    };
    const tutar = Math.round(bagisci.gelir * 0.6 / 1000) * 1000;
    const bina = `${bagisci.ad.split(' ').pop()} ${binaAd[bagisci.sektor]}`;
    state.bekleyenBina = { ad: bagisci.ad, bina, tutar };
    notify(state, `🏛️ Mezunumuz ${bagisci.ad}'dan İSİMLİ BİNA BAĞIŞI teklifi geldi — karar bekliyor (olay kartı)!`, 'odul');
  }

  if (bagis > 0) {
    const tutar = Math.round(bagis);
    earn(state, tutar);
    haberEkle(state, `💝 Dernek yıllık bağışı: ${formatMoney(tutar)} (${state.mezunlar.filter((m) => !m.issiz).length} çalışan mezun).`);
    notify(state, `🤝 Mezunlar Derneği bağışı: ${formatMoney(tutar)}`, 'iyi');
  }
}

/**
 * 🎓 Mezun Buluşması: yılda 1 kez düzenlenen ağ etkinliği.
 * Çalışan mezunlar bağış bırakır, işsiz mezunların bir kısmı network sayesinde
 * iş bulur (istihdam oranı yükselir), öğrenciler ilham alır.
 */
export function mezunBulusmasi(state: GameState): boolean {
  const calisan = state.mezunlar.filter((m) => !m.issiz);
  if (calisan.length < 5) {
    notify(state, 'Buluşma için en az 5 çalışan mezun gerekir.', 'kotu');
    return false;
  }
  if (state.gun - state.sonBulusmaGunu < 40 && state.sonBulusmaGunu > 0) {
    notify(state, 'Mezun buluşması yılda bir düzenlenebilir.', 'kotu');
    return false;
  }
  if (!spend(state, BALANCE.BULUSMA_MALIYET, 'mezun buluşması')) return false;
  state.sonBulusmaGunu = state.gun;

  const bagis = calisan.length * BALANCE.BULUSMA_BAGIS;
  earn(state, bagis);

  // network etkisi: işsiz mezunların bir kısmı buluşmada iş bulur
  let isBulan = 0;
  for (const m of state.mezunlar) {
    if (m.issiz && chance(state, 0.3)) {
      m.issiz = false;
      m.kademe = 0;
      m.meslek = MESLEKLER[m.sektor][0];
      m.gelir = yeniGelir(m);
      isBulan++;
    }
  }

  // öğrenciler mezunlarla tanışır: 📣 nitelik + moral
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    a.nitelik.influencer = Math.min(100, a.nitelik.influencer + 1);
    a.mutluluk = Math.min(100, a.mutluluk + 3);
  }

  haberEkle(state, `🎓 Mezun Buluşması: ${calisan.length} mezun kampüse döndü; ${formatMoney(bagis)} bağış, ${isBulan} mezuna iş.`);
  notify(state, `🎓 Mezun Buluşması muhteşemdi: ${formatMoney(bagis)} bağış toplandı, ${isBulan} işsiz mezun network sayesinde işe girdi, öğrenciler ilham aldı (📣+1, 😊+3).`, 'odul');
  return true;
}

/** Kariyer Günü: tek seferlik etkinlik — öğrenci nitelik/mutluluk artışı. */
export function kariyerGunu(state: GameState): boolean {
  if (state.gun - state.sonKariyerGunu < BALANCE.KARIYER_GUNU_BEKLEME && state.sonKariyerGunu > 0) {
    notify(state, 'Kariyer Günü dönemde bir kez yapılabilir.', 'kotu');
    return false;
  }
  const calisan = state.mezunlar.filter((m) => !m.issiz);
  if (calisan.length === 0) {
    notify(state, 'Kariyer Günü için sahneye çıkacak çalışan mezun yok.', 'kotu');
    return false;
  }
  if (state.para < BALANCE.KARIYER_GUNU_MALIYET) {
    notify(state, `Yetersiz bütçe: Kariyer Günü ${formatMoney(BALANCE.KARIYER_GUNU_MALIYET)}`, 'kotu');
    return false;
  }
  state.para -= BALANCE.KARIYER_GUNU_MALIYET;
  state.sonKariyerGunu = state.gun;

  const konuk = pick(state, calisan);
  let etkilenen = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    a.nitelik.pratik = clamp(a.nitelik.pratik + 3, 0, 100);
    a.nitelik.influencer = clamp(a.nitelik.influencer + 3, 0, 100);
    a.mutluluk = clamp(a.mutluluk + 10, 0, 100);
    etkilenen++;
  }
  haberEkle(state, `🎤 Kariyer Günü: ${konuk.ad} (${konuk.meslek}) sahne aldı, ${etkilenen} öğrenci ilham aldı.`);
  notify(state, `🎤 Kariyer Günü yapıldı! ${konuk.ad} konuştu — ${etkilenen} öğrenciye 💼+📣 nitelik ve mutluluk.`, 'odul');
  return true;
}

/** Mentorluk programını aç/kapat (yeterli çalışan mezun ister). */
export function mentorlukAyarla(state: GameState, acik: boolean): boolean {
  if (acik) {
    const calisan = state.mezunlar.filter((m) => !m.issiz).length;
    if (calisan < BALANCE.MENTORLUK_MIN_MEZUN) {
      notify(state, `Mentorluk için en az ${BALANCE.MENTORLUK_MIN_MEZUN} çalışan mezun gerekli (şu an ${calisan}).`, 'kotu');
      return false;
    }
    notify(state, `🤝 Mentorluk programı başladı — öğrenci gelişimi +%15 (günlük ${formatMoney(BALANCE.MENTORLUK_GIDER)}).`, 'iyi');
  }
  state.mentorluk = acik;
  return true;
}

// --- Mütevelli Heyeti ---------------------------------------------------------

/** Heyetteki mezunlardan verilen sektörde kaç kişi var (pasif bonus hesabı). */
export function mutevelliBonusu(state: GameState, sektor: 'girisim' | 'muhendis' | 'pratik' | 'sosyal'): number {
  let n = 0;
  for (const id of state.mutevelli) {
    const m = state.mezunlar.find((x) => x.id === id);
    if (!m) continue;
    if (sektor === 'sosyal') {
      if (m.sektor === 'medya' || m.sektor === 'artist' || m.sektor === 'filozof') n++;
    } else if (m.sektor === sektor) n++;
  }
  return n;
}

/** Mezunu Mütevelli Heyetine atar (en çok 3 üye; kademe 2+ gerekir). */
export function mutevelliAta(state: GameState, mezunId: number): boolean {
  if (state.mutevelli.length >= 3) {
    notify(state, 'Mütevelli Heyeti dolu (en çok 3 üye) — önce birini çıkar.', 'kotu');
    return false;
  }
  if (state.mutevelli.includes(mezunId)) return false;
  const m = state.mezunlar.find((x) => x.id === mezunId);
  if (!m || m.issiz || m.kademe < 2) {
    notify(state, 'Heyet üyeliği için en az Kıdemli seviye (kademe 2+) çalışan mezun gerekir.', 'kotu');
    return false;
  }
  state.mutevelli.push(mezunId);
  haberEkle(state, `🏛️ ${m.ad} (${m.meslek}) Mütevelli Heyetine katıldı.`);
  notify(state, `🏛️ ${m.ad} Mütevelli Heyetine atandı — sektör bonusu aktif (${SEKTOR_META[m.sektor].ad}).`, 'iyi');
  return true;
}

export function mutevelliCikar(state: GameState, mezunId: number): void {
  state.mutevelli = state.mutevelli.filter((id) => id !== mezunId);
}
