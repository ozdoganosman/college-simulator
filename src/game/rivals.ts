/**
 * Rakip üniversiteler ve Türkiye Üniversite Sıralaması.
 *
 * Rakipler her yıl kendi "güç" karakterlerine göre gelişir. Sıralama skoru
 * prestij + yayın + mezun bileşimidir; oyuncunun uzun vadeli hedefi 1 numara
 * olmaktır. Transfer bonusları rakibin sırasına bağlanır: zirvedeki üniden
 * hoca çalmak pahalı, dibe düşenden ucuzdur.
 *
 * NOT: Bu modül yalnızca core/types, core/util ve data/names'e bağımlıdır —
 * state.ts buradan import edebilsin diye (döngüsel import yok).
 */
import {
  Alan, DONEM_GUN, GameState, RANK_LABEL, SiralamaSatir, Student, YilSonuSonuc, yil,
} from '../core/types';
import { clamp, pick, randInt, randRange } from '../core/util';
import { RAKIP_UNILER, UNI_SEHIRLER } from '../data/names';

const ALANLAR: Alan[] = ['muhendis', 'artist', 'filozof', 'pratik'];

/** Sıralama skoru: prestij ağırlıklı, yayın ve mezun destekli. */
export function uniSkor(prestij: number, yayin: number, mezun: number): number {
  // yayın/mezun ağırlığı yükseltildi — üretken (araştırma/mezun) oyuncunun
  // emeği sıralamaya daha çok yansısın (zirve erişilebilir olsun)
  return Math.round(prestij + yayin * 0.8 + mezun * 0.15);
}

/** Yeni oyunda rakipleri kurar — oyuncu (100 prestij) alt sıralardan başlar. */
export function kurRakipler(state: GameState): void {
  state.rakipler = RAKIP_UNILER.map((ad, i) => {
    // yayılım: köklü devler + orta sınıf + yeni kurulanlar
    const taban = 60 + ((i * 137) % 300);
    const prestij = taban + randInt(state, -20, 40);
    // isimden ipucu: "Sanat/Sosyal/Tarih" artist-filozof, "Teknoloji/Teknik/Fen" mühendis, "İşletme" pratik
    let uzmanlik: Alan = pick(state, ALANLAR);
    if (/Teknik|Teknoloji|Fen|Politeknik|Bilim/.test(ad)) uzmanlik = 'muhendis';
    else if (/Sanat/.test(ad)) uzmanlik = 'artist';
    else if (/Sosyal|Tarih/.test(ad)) uzmanlik = 'filozof';
    else if (/İşletme/.test(ad)) uzmanlik = 'pratik';
    return {
      ad,
      prestij,
      yayin: Math.round(prestij * randRange(state, 0.2, 0.5)),
      mezun: Math.round(prestij * randRange(state, 0.5, 1.2)),
      guc: randRange(state, 0.7, 1.4),
      sehir: UNI_SEHIRLER[i % UNI_SEHIRLER.length],
      kurulus: 1955 + randInt(state, 0, 60),
      uzmanlik,
      istihdam: clamp(Math.round(50 + prestij / 12 + randInt(state, -6, 8)), 42, 96),
    };
  });
}

/** Rakip hakkında ufak bilgi cümlesi (tooltip/panel). */
export function rakipBilgi(r: import('../core/types').RakipUni): string {
  const alanAd: Record<Alan, string> = {
    muhendis: 'mühendislik', artist: 'sanat', filozof: 'sosyal bilimler', pratik: 'işletme',
  };
  const karakter = r.guc >= 1.2 ? 'hızla yükseliyor 📈' : r.guc <= 0.85 ? 'durgun dönemde 📉' : 'istikrarlı';
  return `${r.sehir} · ${r.kurulus}'te kuruldu · ${alanAd[r.uzmanlik]} alanında güçlü · mezun istihdamı %${r.istihdam} · ${karakter}`;
}

/**
 * Yıl dönümünde rakipleri geliştirir (güç karakteri de yavaşça sürüklenir) ve
 * 1-2 rakip GÖRÜNÜR bir hamle yapar — haber metinleri döndürülür (game.ts
 * bildirir; bu modül döngü olmasın diye notify'a erişmez).
 *
 * 🎯 LASTİK BANT: rakip büyümesi oyuncunun skoruna göre ölçeklenir. Oyuncunun
 * ÇOK üstündeki lider rakipler rahatlar (yavaş büyür → yaklaşılabilir hedef);
 * boyun boyuna rakipler karşı atağa geçer (kıyasıya yarış); geridekiler ılımlı.
 * Böylece "1 numara" azimli oyuncu için ~12-16 yılda erişilebilir olur, ama
 * zirveyi korumak da çaba ister (en yakın takipçi hep bası zorlar).
 */
export function rakipleriGelistir(state: GameState): string[] {
  const oyuncuSkor = uniSkor(state.prestij, state.toplamYayin, state.toplamMezun);
  const skorlar = state.rakipler.map((r) => uniSkor(r.prestij, r.yayin, r.mezun));
  const enYuksekRakip = Math.max(1, ...skorlar);
  const oyuncuLider = oyuncuSkor >= enYuksekRakip; // oyuncu 1 numara mı?

  state.rakipler.forEach((r, i) => {
    const rSkor = skorlar[i];
    const d = rSkor - oyuncuSkor; // + = rakip önde, - = geride
    // lastik bant: oyuncunun ÇOK üstündeki lider coşmaz (yaklaşılabilir);
    // hemen üstündeki tek rakip mütevazı direnir; GEÇİLEN rakip geri sıçramaz.
    let rb: number;
    if (d > 0) rb = clamp(1.0 - d / 300, 0.15, 1.0); // önde: ne kadar önde o kadar yavaş
    else rb = 0.5;                                    // geride/aynı: yavaş (leapfrog yok)
    // oyuncu 1 numaraysa EN YÜKSEK rakip ciddi meydan okur (zirve statik kalmasın)
    if (oyuncuLider && rSkor === enYuksekRakip) rb = 1.5;
    r.prestij = clamp(Math.round(r.prestij + randRange(state, -10, 26) * r.guc * rb), 30, 1000);
    r.yayin += Math.max(0, Math.round(randRange(state, 2, 14) * r.guc * rb));
    r.mezun += Math.max(0, Math.round(randRange(state, 25, 130) * r.guc * rb));
    r.guc = clamp(r.guc + randRange(state, -0.08, 0.08), 0.6, 1.5);
    r.istihdam = clamp(Math.round(r.istihdam + randRange(state, -3, 3) + (r.guc - 1) * 4), 42, 96);
  });

  // rakip hamleleri: sadece sayılar sürüklenmez — rakipler görünür işler yapar
  const haberler: string[] = [];
  const alanAd: Record<Alan, string> = {
    muhendis: 'mühendislik', artist: 'sanat', filozof: 'sosyal bilimler', pratik: 'işletme',
  };
  const adaylar = [...state.rakipler].sort((a, b) => b.prestij - a.prestij).slice(0, 10);
  const hamleSayisi = 1 + (randInt(state, 0, 1));
  for (let i = 0; i < hamleSayisi && adaylar.length > 0; i++) {
    const r = adaylar.splice(randInt(state, 0, adaylar.length - 1), 1)[0];
    switch (randInt(state, 0, 3)) {
      case 0:
        r.mezun += 40;
        r.guc = clamp(r.guc + 0.05, 0.6, 1.5);
        haberler.push(`🏫 RAKİP HAMLESİ: ${r.ad}, ${alanAd[r.uzmanlik]} alanında yeni bölüm açtı — kadrosu ve mezun ordusu büyüyor.`);
        break;
      case 1:
        r.prestij = clamp(r.prestij + 12, 30, 1000);
        haberler.push(`🏗️ RAKİP HAMLESİ: ${r.ad} dev bir kampüs binası açtı (prestiji sıçradı).`);
        break;
      case 2:
        r.yayin += 18;
        r.prestij = clamp(r.prestij + 5, 30, 1000);
        haberler.push(`🎓 RAKİP HAMLESİ: ${r.ad} yıldız bir profesör transfer etti — yayın üretimi hızlanacak.`);
        break;
      default:
        r.istihdam = clamp(r.istihdam + 3, 42, 96);
        state.sonrakiTalepCarpan = Math.max(0.6, state.sonrakiTalepCarpan * 0.96);
        haberler.push(`🎗 RAKİP HAMLESİ: ${r.ad} dev burs programı ilan etti — bir sonraki YKS'de talebin biraz kayabilir (×0.96).`);
        break;
    }
  }
  return haberler;
}

/** Güncel sıralama — oyuncu dahil, skora göre azalan. */
export function siralama(state: GameState): SiralamaSatir[] {
  const liste: SiralamaSatir[] = state.rakipler.map((r) => ({
    ad: r.ad,
    prestij: Math.round(r.prestij),
    yayin: r.yayin,
    mezun: r.mezun,
    skor: uniSkor(r.prestij, r.yayin, r.mezun),
    oyuncu: false,
  }));
  liste.push({
    ad: 'ÜNİVERSİTEN',
    prestij: Math.round(state.prestij),
    yayin: state.toplamYayin,
    mezun: state.toplamMezun,
    skor: uniSkor(state.prestij, state.toplamYayin, state.toplamMezun),
    oyuncu: true,
  });
  return liste.sort((a, b) => b.skor - a.skor);
}

/** Oyuncunun güncel sırası (1 tabanlı). */
export function oyuncuSirasi(state: GameState): number {
  return siralama(state).findIndex((s) => s.oyuncu) + 1;
}

/** Transfer imza bonusu çarpanı: zirvedeki üniden 1.5×, dipteki üniden 0.7×. */
export function transferBonusCarpani(state: GameState, kurum: string): number {
  const liste = siralama(state);
  const i = liste.findIndex((s) => s.ad === kurum);
  if (i < 0 || liste.length < 2) return 1;
  return 1.5 - 0.8 * (i / (liste.length - 1));
}

/** Biten yılın "Akademik Yıl Ödülleri" verisini hesaplar (yıl dönümünde çağrılır). */
export function yilSonuHesapla(state: GameState): YilSonuSonuc {
  const liste = siralama(state);
  const sira = liste.findIndex((s) => s.oyuncu) + 1;

  // yılın hocası: yayın + akademik gelişim + beceri bileşimi
  let hoca: YilSonuSonuc['yilinHocasi'] = null;
  let enHoca = 0;
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen') continue;
    const puan = a.makale * 8 + a.uluslararasiMakale * 6 + a.xp * 0.15 + (a.egitim + a.arastirma) * 0.1
      + (a.yetistirdigi ?? 0) * 5; // yetiştirdiği doktora mezunu soyağacı puanı
    if (puan > enHoca) {
      enHoca = puan;
      hoca = {
        ad: `${RANK_LABEL[a.rank]} ${a.ad}`,
        detay: `${a.makale} makale (${a.uluslararasiMakale} 🌍) · ${Math.floor(a.xp)} XP · eğitim ${Math.round(a.egitim)}`,
      };
    }
  }

  // yılın girişimcisi: en yüksek sermayeli öğrenci
  let girisimci: YilSonuSonuc['yilinGirisimcisi'] = null;
  let enSermaye = 0;
  let toplamSermaye = 0;
  let gnoToplam = 0;
  let gnoSayi = 0;
  for (const a of state.agents) {
    if (a.kind !== 'ogrenci') continue;
    const s = a as Student;
    toplamSermaye += s.sermaye;
    if (s.dersDakika >= 60) {
      // gnoHesapla ile aynı formül (döngüsel import olmasın diye burada)
      gnoToplam += clamp((s.kaliteToplam / s.dersDakika) * 2.9, 0, 4);
      gnoSayi++;
    }
    if (s.sermaye > enSermaye) {
      enSermaye = s.sermaye;
      girisimci = { ad: s.ad, detay: `sermaye ${Math.round(s.sermaye).toLocaleString('tr-TR')} ₺` };
    }
  }

  // yılın buluşu: bu yıl çıkan çığır açan yayın; yoksa uluslararası; yoksa null
  const yilBasiGun = state.gun - DONEM_GUN * 2;
  const yeni = state.publications.filter((p) => p.gun >= yilBasiGun);
  const bulus = yeni.find((p) => p.cigirAcici) ?? yeni.find((p) => p.uluslararasi) ?? null;

  const oncekiSira = state.sonSira;
  let siraPrestij = 0;
  if (oncekiSira > 0 && sira < oncekiSira) siraPrestij = Math.min(12, (oncekiSira - sira) * 3);
  if (sira === 1) siraPrestij += 5;

  return {
    yil: yil(state.gun) - 1,
    sira,
    oncekiSira,
    siralama: liste,
    yilinHocasi: hoca,
    yilinGirisimcisi: girisimci,
    yilinBulusu: bulus ? bulus.baslik : null,
    mezun: state.toplamMezun - state.yilBasi.mezun,
    yayin: state.toplamYayin - state.yilBasi.yayin,
    ortGno: gnoSayi > 0 ? gnoToplam / gnoSayi : null,
    toplamSermaye: Math.round(toplamSermaye),
    siraPrestij,
  };
}
