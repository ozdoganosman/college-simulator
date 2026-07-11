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
import { earn, notify } from './state';

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
  if (state.mezunlar.length > BALANCE.MEZUN_LIMIT) {
    // en eski ve en düşük gelirli kayıtlar düşer
    state.mezunlar.sort((a, b) => b.yil - a.yil || b.gelir - a.gelir);
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
      }
      continue;
    }
    // terfi şansı puanla artar; gelir her yıl biraz büyür
    if (m.kademe < MESLEKLER[m.sektor].length - 1 && chance(state, 0.1 + m.puan / 350)) {
      m.kademe++;
      m.meslek = MESLEKLER[m.sektor][m.kademe];
      m.gelir = yeniGelir(m);
      terfiler.push(m);
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

  if (bagis > 0) {
    const tutar = Math.round(bagis);
    earn(state, tutar);
    haberEkle(state, `💝 Dernek yıllık bağışı: ${formatMoney(tutar)} (${state.mezunlar.filter((m) => !m.issiz).length} çalışan mezun).`);
    notify(state, `🤝 Mezunlar Derneği bağışı: ${formatMoney(tutar)}`, 'iyi');
  }
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
