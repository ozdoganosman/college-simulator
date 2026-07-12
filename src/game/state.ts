import {
  GameState, MAP_H, MAP_W, Notice, NoticeKind,
} from '../core/types';
import { BALANCE } from '../data/balance';
import { DEPT_DEFS } from '../data/departments';
import { courseExists } from '../data/courses';
import { tumunuOtoSec } from './schedule';
import { kurRakipler } from './rivals';

export function createInitialState(): GameState {
  const size = MAP_W * MAP_H;
  return {
    para: BALANCE.BASLANGIC_PARA,
    prestij: BALANCE.BASLANGIC_PRESTIJ,
    gun: 1,
    dakika: 7 * 60, // 07:00'de başla
    hiz: 1,
    rngSeed: 1907,

    floor: new Array(size).fill(null),
    wall: new Array(size).fill(0),
    roomAt: new Array(size).fill(-1),
    dirt: new Array(size).fill(0),

    rooms: [],
    objects: [],
    agents: [],
    departments: [],
    projects: [],
    publications: [],
    awards: [],
    notices: [],
    toplamYayin: 0,
    toplamUluslararasiYayin: 0,
    toplamBulus: 0,
    toplamOdul: 0,

    kpssPool: [],
    transferPool: [],
    strategies: [],
    kitapKoleksiyon: { muhendis: 0, artist: 0, filozof: 0, pratik: 0 },
    rakipler: [],
    sonSira: 0,
    yilBasi: { mezun: 0, yayin: 0 },
    yilSonu: null,
    mezunlar: [],
    mezunHaber: [],
    mentorluk: false,
    sonKariyerGunu: 0,
    siraGecmisi: [],
    yemekStok: 0,
    gunlukUretim: 0,
    acKalanBugun: 0,
    dunAcKalan: 0,
    zorluk: 'normal',
    borcGunleri: 0,
    oyunBitti: null,
    basarimlar: [],
    vizyon: null,
    ucret: BALANCE.UCRET_VARSAYILAN,
    bursTam: BALANCE.BURS_TAM_VARSAYILAN,
    bursYari: BALANCE.BURS_YARI_VARSAYILAN,
    krediBorcu: 0,
    mutevelli: [],
    sonrakiTalepCarpan: 1,
    olayKuyrugu: [],
    arastirmaOtoYenile: true,
    sonErisimUyariGunu: 0,
    kulupUyeListe: {},
    denetimIzleme: { ac: 0, cazibe: 0, gun: 0 },
    takipDenetimGunu: null,
    ustUsteKaldi: 0,
    altyapi: { gucKesinti: false, suKesinti: false },
    yanginlar: [],
    salgin: null,
    makro: null,
    prestijKampanya: {},
    bosYil: 0,
    sonDenetim: null,
    trend: [],
    aktifOlay: null,
    sonOlayGunu: 0,
    olayGecmisi: [],
    bekleyenZincir: [],
    sinavDestek: { etut: false, gece: false },
    sonAyartmaGunu: 0,
    sonBulusmaGunu: 0,
    bekleyenBina: null,
    kulupler: [],
    zafer: false,
    zaferGosterildi: false,
    bekleyenAyartma: null,
    yildizlar: [],

    nextId: 1,
    insaatSurumu: 0,
    tutorialAdim: 0,
    tutorialAcik: true,
    yerlestirme: null,
    mezuniyet: null,
    yksBekliyor: true,
    dersProgrami: [],
    toplamMezun: 0,
    toplamBirakan: 0,
  };
}

export function notify(state: GameState, metin: string, kind: NoticeKind = 'bilgi'): void {
  const n: Notice = { gun: state.gun, dakika: state.dakika, metin, kind };
  state.notices.push(n);
  if (state.notices.length > 120) state.notices.splice(0, state.notices.length - 120);
}

/** Para harca; yetmiyorsa false döner ve hiçbir şey değişmez. */
export function spend(state: GameState, tutar: number, neden?: string): boolean {
  if (state.para < tutar) {
    if (neden) notify(state, `Yetersiz bütçe: ${neden}`, 'kotu');
    return false;
  }
  state.para -= tutar;
  return true;
}

export function earn(state: GameState, tutar: number): void {
  state.para += tutar;
}

export function addPrestij(state: GameState, miktar: number): void {
  let m = miktar;
  if (m > 0 && state.strategies.includes('uluslararasi_ofis')) m *= 1.1;
  state.prestij = Math.max(0, Math.min(1000, state.prestij + m));
}

/**
 * Bir sonraki YKS talep çarpanını güvenli aralıkta çarpar — olaylar üst üste
 * binse bile talep [0.6, 1.8] dışına taşamaz (birikip uçma/dibe vurma hatası).
 */
export function talepCarp(state: GameState, carpan: number): void {
  state.sonrakiTalepCarpan = Math.max(0.6, Math.min(1.8, state.sonrakiTalepCarpan * carpan));
}

const SAVE_KEY = 'universite-simulatoru-save';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* depolama dolu olabilir — sessiz geç */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (typeof s.para !== 'number' || !Array.isArray(s.wall)) return null;
    if (typeof s.insaatSurumu !== 'number') s.insaatSurumu = 0; // eski kayıt uyumu
    if (typeof s.tutorialAdim !== 'number') s.tutorialAdim = -1;
    if (typeof s.tutorialAcik !== 'boolean') s.tutorialAcik = false;
    if (s.yerlestirme === undefined) s.yerlestirme = null;
    if (typeof s.yksBekliyor !== 'boolean') s.yksBekliyor = true;
    eskiKayitUyumu(s);
    return s;
  } catch {
    return null;
  }
}

/** Eski kayıtlara sonradan eklenen alanları tamamlar. */
export function eskiKayitUyumu(s: GameState): void {
  if (!Array.isArray(s.dersProgrami)) s.dersProgrami = [];
  if (!s.kitapKoleksiyon || typeof s.kitapKoleksiyon !== 'object') {
    s.kitapKoleksiyon = { muhendis: 0, artist: 0, filozof: 0, pratik: 0 };
  }
  if (!Array.isArray(s.rakipler) || s.rakipler.length === 0) kurRakipler(s);
  if (typeof s.sonSira !== 'number') s.sonSira = 0;
  if (!s.yilBasi || typeof s.yilBasi !== 'object') {
    s.yilBasi = { mezun: s.toplamMezun ?? 0, yayin: s.publications?.length ?? 0 };
  }
  if (s.yilSonu === undefined) s.yilSonu = null;
  if (!Array.isArray(s.mezunlar)) s.mezunlar = [];
  if (!Array.isArray(s.mezunHaber)) s.mezunHaber = [];
  if (typeof s.mentorluk !== 'boolean') s.mentorluk = false;
  if (typeof s.sonKariyerGunu !== 'number') s.sonKariyerGunu = 0;
  if (!Array.isArray(s.siraGecmisi)) s.siraGecmisi = [];
  if (typeof s.yemekStok !== 'number') s.yemekStok = 0;
  if (typeof s.gunlukUretim !== 'number') s.gunlukUretim = 0;
  if (typeof s.acKalanBugun !== 'number') s.acKalanBugun = 0;
  if (typeof s.dunAcKalan !== 'number') s.dunAcKalan = 0;
  if (s.zorluk !== 'kolay' && s.zorluk !== 'zor') s.zorluk = 'normal';
  if (typeof s.borcGunleri !== 'number') s.borcGunleri = 0;
  if (s.oyunBitti === undefined) s.oyunBitti = null;
  if (!Array.isArray(s.basarimlar)) s.basarimlar = [];
  if (s.vizyon === undefined) s.vizyon = null;
  // eski harç/burs politikası → kayıt ücreti + burs kontenjanları
  const eskiMali = s as unknown as { harc?: string; burs?: boolean };
  if (typeof s.ucret !== 'number') {
    s.ucret = eskiMali.harc === 'yuksek' ? 60000 : eskiMali.harc === 'dusuk' ? 25000 : 0;
  }
  if (typeof s.bursTam !== 'number') s.bursTam = eskiMali.burs === true ? 15 : BALANCE.BURS_TAM_VARSAYILAN;
  if (typeof s.bursYari !== 'number') s.bursYari = BALANCE.BURS_YARI_VARSAYILAN;
  if (typeof s.krediBorcu !== 'number') s.krediBorcu = 0;
  if (!Array.isArray(s.mutevelli)) s.mutevelli = [];
  if (typeof s.sonrakiTalepCarpan !== 'number') s.sonrakiTalepCarpan = 1;
  if (!Array.isArray(s.olayKuyrugu)) s.olayKuyrugu = [];
  if (typeof s.arastirmaOtoYenile !== 'boolean') s.arastirmaOtoYenile = true;
  if (typeof s.sonErisimUyariGunu !== 'number') s.sonErisimUyariGunu = 0;
  if (!s.kulupUyeListe || typeof s.kulupUyeListe !== 'object') s.kulupUyeListe = {};
  if (!s.denetimIzleme || typeof s.denetimIzleme !== 'object') {
    s.denetimIzleme = { ac: 0, cazibe: 0, gun: 0 };
  }
  if (s.takipDenetimGunu === undefined) s.takipDenetimGunu = null;
  if (typeof s.ustUsteKaldi !== 'number') s.ustUsteKaldi = 0;
  if (!s.altyapi || typeof s.altyapi !== 'object') s.altyapi = { gucKesinti: false, suKesinti: false };
  if (!Array.isArray(s.yanginlar)) s.yanginlar = [];
  if (s.salgin === undefined) s.salgin = null;
  if (s.makro === undefined) s.makro = null;
  if (!s.prestijKampanya || typeof s.prestijKampanya !== 'object') s.prestijKampanya = {};
  if (typeof s.bosYil !== 'number') s.bosYil = 0;
  // ömürlük sayaçlar sonradan eklendi: eldeki listelerden tohumla
  if (typeof s.toplamYayin !== 'number') s.toplamYayin = s.publications?.length ?? 0;
  if (typeof s.toplamUluslararasiYayin !== 'number') {
    s.toplamUluslararasiYayin = (s.publications ?? []).filter((p) => p.uluslararasi).length;
  }
  if (typeof s.toplamBulus !== 'number') {
    s.toplamBulus = (s.publications ?? []).filter((p) => p.cigirAcici).length;
  }
  if (typeof s.toplamOdul !== 'number') s.toplamOdul = s.awards?.length ?? 0;
  if (s.sonDenetim === undefined) s.sonDenetim = null;
  if (s.mezuniyet === undefined) s.mezuniyet = null;
  if (!Array.isArray(s.trend)) s.trend = [];
  if (s.aktifOlay === undefined) s.aktifOlay = null;
  if (typeof s.sonOlayGunu !== 'number') s.sonOlayGunu = 0;
  if (!Array.isArray(s.olayGecmisi)) s.olayGecmisi = [];
  if (!Array.isArray(s.bekleyenZincir)) s.bekleyenZincir = [];
  if (!s.sinavDestek || typeof s.sinavDestek !== 'object') s.sinavDestek = { etut: false, gece: false };
  if (typeof s.sonAyartmaGunu !== 'number') s.sonAyartmaGunu = 0;
  if (typeof s.sonBulusmaGunu !== 'number') s.sonBulusmaGunu = 0;
  if (s.bekleyenBina === undefined) s.bekleyenBina = null;
  if (!Array.isArray(s.kulupler)) s.kulupler = [];
  if (typeof s.zafer !== 'boolean') s.zafer = false;
  if (typeof s.zaferGosterildi !== 'boolean') {
    // eski kayıt zaten 1 numaraysa zafer ekranı tekrar fırlamasın
    s.zaferGosterildi = s.basarimlar.includes('bir_numara');
  }
  if (s.bekleyenAyartma === undefined) s.bekleyenAyartma = null;
  if (!Array.isArray(s.yildizlar)) s.yildizlar = [];
  for (const r of s.rooms) {
    if (r.ozelAd === undefined) r.ozelAd = null;
    if (typeof r.insaat !== 'number') r.insaat = 0; // şantiye sonradan eklendi
    if (typeof r.insaatToplam !== 'number') r.insaatToplam = 0;
  }
  for (const o of s.objects) {
    if (typeof o.yipranma !== 'number') o.yipranma = 0; // eskime sonradan eklendi
  }
  for (const d of s.departments) {
    if (d.ucret === undefined) d.ucret = null; // bölüm bazlı ücret sonradan eklendi
    if (typeof d.sonGeriCevrilen !== 'number') d.sonGeriCevrilen = 0;
    if (typeof d.kapaniyor !== 'boolean') d.kapaniyor = false;
    if (d.derslikId === undefined) d.derslikId = null; // yerleşik derslik sonradan eklendi
  }
  for (const pr of s.projects) {
    if (pr.tip !== 'uygulamali' && pr.tip !== 'atilim') pr.tip = 'temel';
    if (typeof pr.liderId !== 'number') pr.liderId = -1;
    if (typeof pr.gunlukButce !== 'number') {
      pr.gunlukButce = Math.round(BALANCE.PROJE_GUNLUK_BUTCE
        * (pr.tip === 'atilim' ? 1.6 : pr.tip === 'uygulamali' ? 1.0 : 0.8));
    }
  }
  for (const r of s.rakipler) {
    if (typeof r.istihdam !== 'number') r.istihdam = 60 + (r.ad.length % 20);
    if (!r.sehir) r.sehir = 'Ankara';
    if (typeof r.kurulus !== 'number') r.kurulus = 1975;
    if (!r.uzmanlik) r.uzmanlik = (['muhendis', 'artist', 'filozof', 'pratik'] as const)[r.ad.length % 4];
  }
  // katalogdan kalkan bölüm/dersler kayıttan da temizlenir
  const bolumVar = new Set(DEPT_DEFS.map((d) => d.id));
  const silinen = new Set(s.departments.filter((d) => !bolumVar.has(d.defId)).map((d) => d.id));
  if (silinen.size > 0) {
    s.departments = s.departments.filter((d) => !silinen.has(d.id));
    s.agents = s.agents.filter((a) => !(a.kind === 'ogrenci' && silinen.has(a.deptId)));
    for (const a of s.agents) {
      if (a.kind === 'akademisyen' && silinen.has(a.deptId)) a.deptId = -1;
    }
    for (const r of s.rooms) if (r.deptId !== null && silinen.has(r.deptId)) r.deptId = null;
    s.projects = s.projects.filter((p) => !silinen.has(p.deptId));
  }
  s.dersProgrami = s.dersProgrami.filter((p) => courseExists(p.courseId) && !silinen.has(p.deptId));
  const alanlar = ['muhendis', 'artist', 'filozof', 'pratik'] as const;
  let dersSecimiEksik = false;
  for (const a of s.agents) {
    if (a.kind === 'akademisyen') {
      if (!(a as { alan?: string }).alan) a.alan = alanlar[a.id % alanlar.length];
      if (!Array.isArray(a.verdigiDersler)) {
        a.verdigiDersler = [];
        dersSecimiEksik = true;
      }
      if (typeof a.yetistirdigi !== 'number') a.yetistirdigi = 0;
      if (typeof a.memnuniyet !== 'number') a.memnuniyet = 70;
      if (typeof a.yas !== 'number') a.yas = 35 + (a.id % 20);
    } else if (a.kind === 'asci' || a.kind === 'temizlikci' || a.kind === 'tamirci' || a.kind === 'guvenlik') {
      if (typeof a.beceri !== 'number') a.beceri = 40 + (a.id % 21); // beceri sonradan eklendi
    } else if (a.kind === 'ogrenci') {
      if (typeof a.egilim !== 'number') a.egilim = 70 + ((a.id * 37) % 61); // 70-130
      if (typeof a.kaliteToplam !== 'number') a.kaliteToplam = 0;
      if (typeof a.dersDakika !== 'number') a.dersDakika = 0;
      if (typeof a.asistani !== 'number') a.asistani = -1;
      if (typeof a.danisman !== 'number') a.danisman = -1;
      if (!a.nitelik || typeof a.nitelik !== 'object') {
        a.nitelik = { muhendis: 0, artist: 0, filozof: 0, pratik: 0, influencer: 0 };
      }
      if (typeof a.sermaye !== 'number') a.sermaye = 0;
      // eski kayıt: ücretsiz modelde herkes tam burslu sayılır, ücretliyse öder
      if (typeof a.burs !== 'number') a.burs = s.ucret === 0 ? 100 : 0;
      if (!(a as { kisilik?: string }).kisilik) {
        // eski kayıt: kişiliği id'den deterministik dağıt (kampüs renklensin)
        const r = (a.id * 37) % 100;
        a.kisilik = r < 8 ? 'dahi' : r < 18 ? 'tembel' : r < 30 ? 'sosyal'
          : r < 40 ? 'kitapkurdu' : r < 50 ? 'girisimci' : 'normal';
      }
      // lisansüstü aşamalar sonradan eklendi: eski kayıtlar doğrudan tez
      // aşamasından devam eder (yeterlik sürpriziyle cezalandırılmaz)
      if (a.level !== 'lisans' && a.asama !== 'ders' && a.asama !== 'tez') a.asama = 'tez';
      if (a.level !== 'lisans' && typeof a.tezPuan !== 'number') a.tezPuan = 0;
      if (typeof a.arkadas !== 'number') a.arkadas = -1; // sosyal ağ sonradan eklendi
    }
  }
  if (dersSecimiEksik) tumunuOtoSec(s); // eski kayıt: dersleri otomatik seç
  for (const c of [...s.kpssPool, ...s.transferPool]) {
    if (!(c as { alan?: string }).alan) c.alan = alanlar[c.id % alanlar.length];
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* yoksay */ }
}
