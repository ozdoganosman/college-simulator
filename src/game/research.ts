/**
 * SPEC — Bilimsel araştırma, yayınlar, buluşlar, ödüller.
 *
 * startProject(state, deptId): boolean — panelden çağrılır.
 *  - Koşullar: bölüm var; bölümün deptDef.labGerekli ise geçerli laboratuvar olmalı
 *    (labGerekli değilse geçerli kütüphane ya da ofis yeter); bölümde >=1 akademisyen;
 *    bölüm başına aynı anda en fazla 1 aktif proje.
 *  - Maliyet: BALANCE.PROJE_MALIYET_TABAN * (0.8-1.4 rastgele); spend başarısızsa false.
 *  - hedefPuan = BALANCE.PROJE_HEDEF_PUAN * (0.7-1.3); baslik PROJE_KALIP+PROJE_KONU'dan.
 *  - notify(bilgi) 'X bölümünde yeni araştırma projesi: "..."'.
 *
 * updateResearch(state, dtMin): her sim adımında.
 *  - Aktif her proje için puan üretimi: bölümdeki 'arastiriyor' aktivitesindeki
 *    akademisyenlerin arastirma toplamı * 0.01/dk + 'arastiriyor' YL öğrencisi * 0.05
 *    + doktora öğrencisi * 0.12 (kampüsteyse).
 *  - Çarpanlar: deptDef.arastirmaCarpani; kütüphane seviyesi
 *    (1 + libraryLevel*BALANCE.KUTUPHANE_ARASTIRMA_BONUS); strateji: 'tubitak' x1.25,
 *    'arastirma_universitesi' x1.30 (çarpımsal). Lab'daki bilgisayar başına +%3 (max +%15).
 *  - Akademisyen XP: ürettiği puan * BALANCE.XP_ARASTIRMA_CARPAN.
 *  - birikenPuan >= hedefPuan olunca completeProject.
 *
 * completeProject (iç):
 *  - Hibe: BALANCE.ARASTIRMA_HIBE * (0.8-1.5) kazan (earn), notify(iyi).
 *  - Yayın: bölümün en yüksek arastirma'lı akademisyeni yazar olur. Uluslararası olasılığı
 *    BALANCE.ULUSLARARASI_OLASILIK + yazar.arastirma/400 + ('erasmus' varsa +0.3, clamp 0.9).
 *    'tesvik' stratejisi yayın sayısını etkiler: %20 olasılıkla 2. makale (ikinci yazar).
 *    Publication kaydı ekle; yazar.makale++ (uluslararasiysa uluslararasiMakale++ de);
 *    addPrestij(makale ya da uluslararasiMakale); uluslararasiysa hibe x ULUSLARARASI_HIBE_CARPAN.
 *  - Çığır açan buluş: BALANCE.BULUS_OLASILIK (+yazar.arastirma>80 ise +0.05). Olursa:
 *    cigirAcici=true, BULUS_GELIR ('teknokent' varsa x2) kazan, addPrestij(PRESTIJ.bulus),
 *    notify(odul) 'ÇIĞIR AÇAN BULUŞ: ...'.
 *    Ödül: buluş sonrası BALANCE.ODUL_OLASILIK ile ODUL_ADLARI'ndan bir Award ekle,
 *    addPrestij(PRESTIJ.odul), notify(odul).
 *  - Projeyi state.projects'ten çıkar (biten projeler yayında görünür zaten).
 *
 * cancelProject(state, projectId): iade yok, notify(kotu).
 */
import {
  Academic, GameState, ProjeTip, Publication, RANK_LABEL, ResearchProject,
} from '../core/types';
import { mutevelliBonusu } from './alumni';

/** Proje tipleri: risk/ödül dengesi — lider hocanın araştırma becerisi riski düşürür. */
export const PROJE_TIPLERI: Record<ProjeTip, {
  ad: string; emoji: string; maliyetCarpan: number; hibeCarpan: number;
  bulusCarpan: number; risk: number; aciklama: string;
}> = {
  temel: {
    ad: 'Temel Araştırma', emoji: '🧪', maliyetCarpan: 0.8, hibeCarpan: 0.9,
    bulusCarpan: 0.6, risk: 0.05, aciklama: 'Güvenli ve ucuz — düşük buluş şansı',
  },
  uygulamali: {
    ad: 'Uygulamalı Proje', emoji: '🔧', maliyetCarpan: 1.0, hibeCarpan: 1.1,
    bulusCarpan: 1.5, risk: 0.15, aciklama: 'Dengeli — buluş şansı ×1.5, risk %15',
  },
  atilim: {
    ad: 'Yüksek Riskli Atılım', emoji: '💥', maliyetCarpan: 1.6, hibeCarpan: 1.8,
    bulusCarpan: 3.0, risk: 0.35, aciklama: 'Pahalı kumar — buluş ×3, hibe ×1.8, risk %35',
  },
};

/** Projenin gerçek başarısızlık riski: lider güçlüyse düşer. */
export function projeRiski(state: GameState, proje: ResearchProject): number {
  const tip = PROJE_TIPLERI[proje.tip];
  const lider = state.agents.find(
    (a): a is Academic => a.id === proje.liderId && a.kind === 'akademisyen',
  );
  return tip.risk * (lider ? 1 - lider.arastirma / 200 : 1);
}
import { chance, clamp, formatMoney, newId, pick, randRange } from '../core/util';
import { asistanSayilari, yukVerimi } from './schedule';
import { libraryLevel, validRooms } from '../core/grid';
import { BALANCE } from '../data/balance';
import { deptDef } from '../data/departments';
import { ODUL_ADLARI, PROJE_KALIP, PROJE_KONU } from '../data/names';
import { addPrestij, earn, notify, spend } from './state';

export function startProject(
  state: GameState, deptId: number, tip: ProjeTip = 'temel', liderId = -1,
): boolean {
  const dept = state.departments.find((d) => d.id === deptId);
  if (!dept) return false;
  const def = deptDef(dept.defId);

  if (def.labGerekli) {
    if (validRooms(state, 'laboratuvar').length === 0) {
      notify(state, `${def.ad} araştırması için geçerli bir laboratuvar gerekli.`, 'kotu');
      return false;
    }
  } else if (validRooms(state, 'kutuphane').length === 0 && validRooms(state, 'ofis').length === 0) {
    notify(state, 'Araştırma için geçerli bir kütüphane ya da ofis gerekli.', 'kotu');
    return false;
  }

  const akademisyenVar = state.agents.some((a) => a.kind === 'akademisyen' && a.deptId === deptId);
  if (!akademisyenVar) {
    notify(state, `${def.ad} bölümünde akademisyen yok — önce kadro atayın.`, 'kotu');
    return false;
  }

  if (state.projects.some((p) => p.deptId === deptId)) {
    notify(state, `${def.ad} bölümünde zaten aktif bir proje var.`, 'kotu');
    return false;
  }

  const tipMeta = PROJE_TIPLERI[tip];
  const maliyet = Math.round(
    BALANCE.PROJE_MALIYET_TABAN * tipMeta.maliyetCarpan * randRange(state, 0.8, 1.4),
  );
  if (!spend(state, maliyet, 'araştırma projesi')) return false;

  // lider bölümden olmalı (değilse lidersiz başlar — risk tam işler)
  const lider = state.agents.find(
    (a): a is Academic => a.id === liderId && a.kind === 'akademisyen' && a.deptId === deptId,
  );

  const konu = pick(state, PROJE_KONU);
  const baslik = pick(state, PROJE_KALIP).replace('{k}', konu);
  const proje: ResearchProject = {
    id: newId(state),
    deptId,
    baslik,
    tip,
    liderId: lider ? lider.id : -1,
    ilerleme: 0,
    hedefPuan: Math.round(BALANCE.PROJE_HEDEF_PUAN * randRange(state, 0.7, 1.3)),
    birikenPuan: 0,
    maliyet,
    baslamaGunu: state.gun,
  };
  state.projects.push(proje);
  notify(
    state,
    `${tipMeta.emoji} ${def.ad}: "${baslik}" başladı (${tipMeta.ad}${lider ? `, lider: ${lider.ad}` : ', lidersiz — risk tam'}, başarısızlık %${Math.round(projeRiski(state, proje) * 100)})`,
    'bilgi',
  );
  return true;
}

interface DeptArastirma {
  akademisyenToplam: number;      // 'arastiriyor' akademisyenlerin arastirma toplamı
  arastiranlar: Academic[];       // XP dağıtımı için
  yl: number;                     // 'arastiriyor' YL öğrenci sayısı
  doktora: number;                // 'arastiriyor' doktora öğrenci sayısı
}

export function updateResearch(state: GameState, dtMin: number): void {
  if (state.projects.length === 0) return;

  // Bölüm başına araştırma katkısını TEK geçişte topla
  const katki = new Map<number, DeptArastirma>();
  const al = (deptId: number): DeptArastirma => {
    let k = katki.get(deptId);
    if (!k) {
      k = { akademisyenToplam: 0, arastiranlar: [], yl: 0, doktora: 0 };
      katki.set(deptId, k);
    }
    return k;
  };
  const asistanlar = asistanSayilari(state);
  const liderMap = new Map<number, number>(); // deptId -> liderId
  for (const pr of state.projects) liderMap.set(pr.deptId, pr.liderId);
  for (const a of state.agents) {
    if (!a.onCampus || a.activity !== 'arastiriyor') continue;
    if (a.kind === 'akademisyen') {
      const k = al(a.deptId);
      // ders yükü araştırma hızını da düşürür — asistanlar yükü hafifletir;
      // proje LİDERİ araştırırken katkısı ×1.6
      const liderCarpan = liderMap.get(a.deptId) === a.id ? 1.6 : 1;
      k.akademisyenToplam += a.arastirma * liderCarpan
        * yukVerimi((a.verdigiDersler ?? []).length, asistanlar.get(a.id) ?? 0);
      k.arastiranlar.push(a);
    } else if (a.kind === 'ogrenci') {
      if (a.level === 'yl') al(a.deptId).yl++;
      else if (a.level === 'doktora') al(a.deptId).doktora++;
    }
  }

  // Paylaşılan çarpanlar — çağrı başına bir kez
  const kutCarpan = 1 + libraryLevel(state) * BALANCE.KUTUPHANE_ARASTIRMA_BONUS;
  let stratCarpan = 1;
  if (state.strategies.includes('tubitak')) stratCarpan *= 1.25;
  if (state.strategies.includes('arastirma_universitesi')) stratCarpan *= 1.30;
  // üniversite vizyonu (birbirini dışlayan eksen)
  if (state.vizyon === 'arastirma') stratCarpan *= 1.25;
  else if (state.vizyon === 'egitim') stratCarpan *= 0.88;
  else if (state.vizyon === 'girisim') stratCarpan *= 0.95;
  stratCarpan *= 1 + 0.04 * mutevelliBonusu(state, 'muhendis'); // heyetteki mühendis mezunlar

  // Geçerli lab + kütüphanedeki bilgisayarlar araştırmayı hızlandırır
  const bilgisayarOdalar = new Set<number>();
  for (const r of validRooms(state, 'laboratuvar')) bilgisayarOdalar.add(r.id);
  for (const r of validRooms(state, 'kutuphane')) bilgisayarOdalar.add(r.id);
  let labBilgisayar = 0;
  for (const o of state.objects) {
    if (o.type === 'bilgisayar' && bilgisayarOdalar.has(o.roomId)) labBilgisayar++;
  }
  const labCarpan = 1 + Math.min(0.15, 0.03 * labBilgisayar);

  for (const proje of [...state.projects]) {
    const dept = state.departments.find((d) => d.id === proje.deptId);
    if (!dept) continue;
    const def = deptDef(dept.defId);
    const k = katki.get(proje.deptId);
    const taban = k
      ? k.akademisyenToplam * 0.01 + k.yl * 0.05 + k.doktora * 0.12
      : 0;
    if (taban <= 0) continue;

    const puanDk = taban * def.arastirmaCarpani * kutCarpan * stratCarpan * labCarpan;
    const uretilen = puanDk * dtMin;
    proje.birikenPuan += uretilen;
    proje.ilerleme = clamp((100 * proje.birikenPuan) / proje.hedefPuan, 0, 100);

    // XP: araştıran akademisyenlere eşit paylaştır
    if (k && k.arastiranlar.length > 0) {
      const pay = (uretilen * BALANCE.XP_ARASTIRMA_CARPAN) / k.arastiranlar.length;
      for (const a of k.arastiranlar) a.xp += pay;
    }

    if (proje.birikenPuan >= proje.hedefPuan) completeProject(state, proje);
  }
}

function completeProject(state: GameState, proje: ResearchProject): void {
  const dept = state.departments.find((d) => d.id === proje.deptId);
  const bolumAdi = dept ? deptDef(dept.defId).ad : 'Bölüm';
  const tipMeta = PROJE_TIPLERI[proje.tip];

  // BAŞARISIZLIK zarı: risk tipe ve lider becerisine bağlı
  if (chance(state, projeRiski(state, proje))) {
    const lider = state.agents.find(
      (a): a is Academic => a.id === proje.liderId && a.kind === 'akademisyen',
    );
    if (lider) lider.memnuniyet = clamp(lider.memnuniyet - 5, 0, 100);
    addPrestij(state, -1);
    notify(state, `❌ "${proje.baslik}" BAŞARISIZ oldu — sonuç üretilemedi (${tipMeta.ad} riski). Hibe yok, moral bozuldu.`, 'kotu');
    const idx = state.projects.indexOf(proje);
    if (idx >= 0) state.projects.splice(idx, 1);
    return;
  }

  let hibe = Math.round(BALANCE.ARASTIRMA_HIBE * tipMeta.hibeCarpan * randRange(state, 0.8, 1.5));

  // Yazar: araştırma becerisiyle ağırlıklı rastgele seçim — böylece araştırma
  // görevlileri de zamanla makale yazıp terfi edebilir.
  const kadro: Academic[] = [];
  let agirlikToplam = 0;
  for (const a of state.agents) {
    if (a.kind !== 'akademisyen' || a.deptId !== proje.deptId) continue;
    kadro.push(a);
    agirlikToplam += a.arastirma + 10;
  }
  const yazarSec = (): Academic | null => {
    if (kadro.length === 0) return null;
    let r = randRange(state, 0, agirlikToplam);
    for (const a of kadro) {
      r -= a.arastirma + 10;
      if (r <= 0) return a;
    }
    return kadro[kadro.length - 1];
  };
  const yazar = yazarSec();
  const ikinci = yazarSec();

  let anaYayin: Publication | null = null;
  if (yazar) {
    anaYayin = publishPaper(state, proje, yazar);
    if (anaYayin.uluslararasi) hibe *= BALANCE.ULUSLARARASI_HIBE_CARPAN;

    // Akademik teşvik: %20 olasılıkla ikinci makale (ikinci yazar ya da aynı yazar)
    if (state.strategies.includes('tesvik') && chance(state, 0.2)) {
      publishPaper(state, proje, ikinci ?? yazar);
    }
  }

  earn(state, hibe);
  notify(state, `Araştırma tamamlandı: "${proje.baslik}" — hibe ${formatMoney(hibe)}.`, 'iyi');

  // Çığır açan buluş (yazar yoksa buluş da yok)
  if (yazar) {
    const bulusOlasilik = (BALANCE.BULUS_OLASILIK + (yazar.arastirma > 80 ? 0.05 : 0)) * tipMeta.bulusCarpan;
    if (chance(state, bulusOlasilik)) {
      if (anaYayin) anaYayin.cigirAcici = true;
      let gelir = BALANCE.BULUS_GELIR;
      if (state.strategies.includes('teknokent')) gelir *= 2;
      earn(state, gelir);
      addPrestij(state, BALANCE.PRESTIJ.bulus);
      notify(
        state,
        `ÇIĞIR AÇAN BULUŞ: "${proje.baslik}"! Patent geliri ${formatMoney(gelir)}.`,
        'odul',
      );

      // Buluş sonrası ödül şansı — aynı gün aynı ödül tekrarlanmasın
      if (chance(state, BALANCE.ODUL_OLASILIK)) {
        const adaylar = ODUL_ADLARI.filter(
          (ad) => !state.awards.some((o) => o.ad === ad && o.gun === state.gun),
        );
        if (adaylar.length > 0) {
          const odulAd = pick(state, adaylar);
          state.awards.push({
            id: newId(state),
            ad: odulAd,
            aciklama: `${bolumAdi} bölümünün "${proje.baslik}" buluşu ödüle layık görüldü.`,
            gun: state.gun,
          });
          addPrestij(state, BALANCE.PRESTIJ.odul);
          notify(state, `${odulAd} kazanıldı! (${bolumAdi})`, 'odul');
        }
      }
    }
  }

  const idx = state.projects.indexOf(proje);
  if (idx >= 0) state.projects.splice(idx, 1);

  // Araştırma sürekliliği: bütçe yetiyorsa aynı bölümde otomatik yeni proje başlat
  // (istemeyen oyuncu projeyi panelden iptal edebilir).
  if (dept && state.para >= BALANCE.PROJE_MALIYET_TABAN * 1.5) {
    startProject(state, dept.id);
  }
}

/** Yayın kaydı oluşturur, yazar sayaçlarını ve prestiji işler. */
function publishPaper(state: GameState, proje: ResearchProject, yazar: Academic): Publication {
  let olasilik = BALANCE.ULUSLARARASI_OLASILIK + yazar.arastirma / 400;
  if (state.strategies.includes('erasmus')) olasilik += 0.3;
  const uluslararasi = chance(state, Math.min(0.9, olasilik));

  const yayin: Publication = {
    id: newId(state),
    baslik: proje.baslik,
    yazarId: yazar.id,
    deptId: proje.deptId,
    uluslararasi,
    cigirAcici: false,
    gun: state.gun,
  };
  state.publications.push(yayin);

  yazar.makale += 1;
  if (uluslararasi) yazar.uluslararasiMakale += 1;
  addPrestij(state, uluslararasi ? BALANCE.PRESTIJ.uluslararasiMakale : BALANCE.PRESTIJ.makale);
  notify(
    state,
    `Yeni ${uluslararasi ? 'uluslararası ' : ''}makale: "${proje.baslik}" — ${RANK_LABEL[yazar.rank]} ${yazar.ad}`,
    'iyi',
  );
  return yayin;
}

export function cancelProject(state: GameState, projectId: number): void {
  const idx = state.projects.findIndex((p) => p.id === projectId);
  if (idx < 0) return;
  const proje = state.projects[idx];
  state.projects.splice(idx, 1);
  notify(state, `Araştırma projesi iptal edildi: "${proje.baslik}" (iade yok).`, 'kotu');
}
