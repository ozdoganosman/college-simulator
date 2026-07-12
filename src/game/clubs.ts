/**
 * Öğrenci kulüpleri — kampüsü "topluluk" yapan organize sosyal yaşam.
 *
 * Kulüp kurmak tek seferlik kurulum + günlük küçük gider ister; ilgili aktivite
 * objesi kampüste olmalı (bozuk olmayan). Üyelik dinamiktir: ilgili niteliği en
 * yüksek 12 öğrenci "üye" sayılır — her gün nitelik + mutluluk kazanır,
 * dönem sonunda kulüp şenliği yapılır.
 */
import { GameState, Nitelik, ObjectTypeId, Student } from '../core/types';
import { BALANCE } from '../data/balance';
import { notify, spend } from './state';

export interface KulupDef {
  id: string;
  ad: string;
  emoji: string;
  /** kuruluş şartı: kampüste bu obje (bozuk değil); null = obje şartı yok */
  obje: ObjectTypeId | null;
  nitelik: Nitelik;
  aciklama: string;
}

export const KULUPLER: KulupDef[] = [
  { id: 'satranc', ad: 'Satranç Kulübü', emoji: '♟️', obje: 'satranc_masasi', nitelik: 'filozof', aciklama: 'Üyelerin 📜 Filozof niteliği gelişir' },
  { id: 'muzik', ad: 'Müzik Topluluğu', emoji: '🎸', obje: 'muzik_sahnesi', nitelik: 'artist', aciklama: 'Üyelerin 🎨 Artist niteliği gelişir' },
  { id: 'spor', ad: 'Spor Kulübü', emoji: '🏀', obje: 'basket_potasi', nitelik: 'pratik', aciklama: 'Üyelerin 💼 Pratik niteliği gelişir' },
  { id: 'girisim', ad: 'Girişimcilik Kulübü', emoji: '🚀', obje: null, nitelik: 'influencer', aciklama: 'Üyelerin 📣 Influencer niteliği gelişir' },
];

export function kulupDef(id: string): KulupDef | undefined {
  return KULUPLER.find((k) => k.id === id);
}

export function kulupKurulabilir(state: GameState, def: KulupDef): { ok: boolean; neden: string } {
  if (state.kulupler.includes(def.id)) return { ok: false, neden: 'Zaten kurulu' };
  const ogrenci = state.agents.filter((a) => a.kind === 'ogrenci').length;
  if (ogrenci < 10) return { ok: false, neden: 'En az 10 öğrenci gerekir' };
  if (def.obje && !state.objects.some((o) => o.type === def.obje && (o.yipranma ?? 0) < 100)) {
    return { ok: false, neden: 'Kampüste çalışır durumda ilgili aktivite objesi gerekir' };
  }
  return { ok: true, neden: '' };
}

export function kulupKur(state: GameState, id: string): boolean {
  const def = kulupDef(id);
  if (!def) return false;
  const kontrol = kulupKurulabilir(state, def);
  if (!kontrol.ok) {
    notify(state, `${def.ad} kurulamadı: ${kontrol.neden}.`, 'kotu');
    return false;
  }
  if (!spend(state, BALANCE.KULUP_KURULUM, def.ad)) return false;
  state.kulupler.push(id);
  uyelikTazele(state, def); // gerçek üye kaydı: kuruluşta yazılır
  const n = (state.kulupUyeListe[id] ?? []).length;
  notify(state, `${def.emoji} ${def.ad} kuruldu — ${n} öğrenci üye yazıldı! Üyeler günlük gelişir, dönem sonunda şenlik yapılır (günlük ${BALANCE.KULUP_GIDER}₺).`, 'iyi');
  return true;
}

export function kulupKapat(state: GameState, id: string): void {
  const def = kulupDef(id);
  state.kulupler = state.kulupler.filter((k) => k !== id);
  delete state.kulupUyeListe[id];
  if (def) notify(state, `${def.emoji} ${def.ad} kapatıldı — günlük gideri kesildi.`, 'bilgi');
}

/**
 * Üyeliği tazele: mezun olanlar düşer, boş koltuklara ilgili niteliği en
 * yüksek üye-olmayan öğrenciler yazılır (dönem sonunda çağrılır).
 */
function uyelikTazele(state: GameState, def: KulupDef): void {
  const mevcut = new Set((state.kulupUyeListe[def.id] ?? []));
  const kayitli: number[] = [];
  for (const a of state.agents) {
    if (a.kind === 'ogrenci' && mevcut.has(a.id)) kayitli.push(a.id); // hâlâ okuyanlar
  }
  if (kayitli.length < 12) {
    const adaylar = state.agents
      .filter((a): a is Student => a.kind === 'ogrenci' && !mevcut.has(a.id))
      .sort((a, b) => b.nitelik[def.nitelik] - a.nitelik[def.nitelik]);
    for (const aday of adaylar.slice(0, 12 - kayitli.length)) kayitli.push(aday.id);
  }
  state.kulupUyeListe[def.id] = kayitli;
}

/** Kulübün kayıtlı üyeleri (gerçek liste — eski kayıtta liste yoksa doldurulur). */
export function kulupUyeleri(state: GameState, def: KulupDef): Student[] {
  if (!state.kulupUyeListe[def.id]) uyelikTazele(state, def);
  const ids = new Set(state.kulupUyeListe[def.id]);
  return state.agents.filter((a): a is Student => a.kind === 'ogrenci' && ids.has(a.id));
}

/** Kulüp fiilen çalışıyor mu: gereken aktivite objesi sağlam olmalı. */
export function kulupAktif(state: GameState, def: KulupDef): boolean {
  if (!def.obje) return true;
  return state.objects.some((o) => o.type === def.obje && (o.yipranma ?? 0) < 100);
}

/** Günlük kulüp etkisi: üyelere nitelik +0.4, mutluluk +0.15 (obje sağlamsa). */
export function gunlukKulupEtkisi(state: GameState): void {
  for (const id of state.kulupler) {
    const def = kulupDef(id);
    if (!def) continue;
    if (!kulupAktif(state, def)) continue; // sahne/pota bozuk: kulüp askıda
    for (const uye of kulupUyeleri(state, def)) {
      uye.nitelik[def.nitelik] = Math.min(100, uye.nitelik[def.nitelik] + 0.4);
      uye.mutluluk = Math.min(100, uye.mutluluk + 0.15);
    }
  }
}

/** Dönem sonu kulüp şenliği: üyelere nitelik +1.5, mutluluk +4; üyelik tazelenir. */
export function kulupSenligi(state: GameState): void {
  if (state.kulupler.length === 0) return;
  const adlar: string[] = [];
  for (const id of state.kulupler) {
    const def = kulupDef(id);
    if (!def) continue;
    if (kulupAktif(state, def)) {
      for (const uye of kulupUyeleri(state, def)) {
        uye.nitelik[def.nitelik] = Math.min(100, uye.nitelik[def.nitelik] + 1.5);
        uye.mutluluk = Math.min(100, uye.mutluluk + 4);
      }
      adlar.push(`${def.emoji} ${def.ad}`);
    } else {
      notify(state, `${def.emoji} ${def.ad} şenliğe katılamadı — gerekli aktivite alanı BOZUK (tamirci bekliyor).`, 'kotu');
    }
    uyelikTazele(state, def); // mezunlar düşer, yeni yetenekler yazılır
  }
  if (adlar.length > 0) {
    notify(state, `🎪 Dönem sonu kulüp şenliği: ${adlar.join(', ')} — üyeler nitelik ve moral kazandı!`, 'iyi');
  }
}
