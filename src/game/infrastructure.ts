/**
 * Altyapı katmanı — elektrik ve su.
 *
 * Kampüs büyüdükçe elektrik ve su talebi artar; jeneratör ve su deposu
 * kapasite sağlar. Talep kapasiteyi aşarsa KESİNTİ olur: mutluluk düşer,
 * araştırma/öğrenme ve yemek üretimi yavaşlar, eşyalar daha hızlı yıpranır.
 * Kesinti durumu gün sonunda hesaplanır; ceza ertesi gün boyunca uygulanır.
 */
import { GameState } from '../core/types';
import { BALANCE } from '../data/balance';
import { notify } from './state';

/** Elektrik çeken eşya türleri ve birim tüketimleri. */
const GUC_ESYA: Partial<Record<string, number>> = {
  bilgisayar: 1.5,
  lab_tezgahi: 3,
  otomat: 2,
  yemek_bankosu: 2,
  muzik_sahnesi: 2,
  sus_havuzu: 1.5,
};

/** Toplam elektrik talebi: geçerli oda başına baz + çeken eşyalar. */
export function gucTalebi(state: GameState): number {
  let talep = 0;
  for (const r of state.rooms) {
    if (r.valid && (r.insaat ?? 0) <= 0) talep += BALANCE.GUC_ODA_BIRIM;
  }
  for (const o of state.objects) {
    if ((o.yipranma ?? 0) >= 100) continue; // bozuk eşya güç çekmez
    talep += GUC_ESYA[o.type] ?? 0;
  }
  return Math.round(talep);
}

/** Toplam elektrik kapasitesi: çalışır jeneratörler. */
export function gucKapasitesi(state: GameState): number {
  let kap = 0;
  for (const o of state.objects) {
    if (o.type === 'jenerator' && (o.yipranma ?? 0) < 100) kap += BALANCE.JENERATOR_KAPASITE;
  }
  return kap;
}

/** Toplam su talebi: klozet/lavabo tesisatı + öğrenci nüfusu. */
export function suTalebi(state: GameState): number {
  let talep = 0;
  for (const o of state.objects) {
    if (o.type === 'klozet') talep += 2;
    else if (o.type === 'lavabo') talep += 1;
  }
  for (const a of state.agents) {
    if (a.kind === 'ogrenci') talep += BALANCE.SU_OGRENCI_BIRIM;
  }
  return Math.round(talep);
}

/** Toplam su kapasitesi: çalışır su depoları. */
export function suKapasitesi(state: GameState): number {
  let kap = 0;
  for (const o of state.objects) {
    if (o.type === 'su_deposu' && (o.yipranma ?? 0) < 100) kap += BALANCE.SU_DEPOSU_KAPASITE;
  }
  return kap;
}

export interface AltyapiOzet {
  gucTalep: number; gucKap: number; gucOran: number;
  suTalep: number; suKap: number; suOran: number;
}

/** Anlık altyapı özeti (HUD + panel). Kapasite 0 ama talep varsa oran 0. */
export function altyapiOzet(state: GameState): AltyapiOzet {
  const gucTalep = gucTalebi(state), gucKap = gucKapasitesi(state);
  const suTalep = suTalebi(state), suKap = suKapasitesi(state);
  return {
    gucTalep, gucKap, gucOran: gucTalep === 0 ? 1 : gucKap / gucTalep,
    suTalep, suKap, suOran: suTalep === 0 ? 1 : suKap / suTalep,
  };
}

/**
 * Gün sonu: kesinti durumunu hesaplar, cezaları uygular, oyuncuyu uyarır.
 * Kapasite talebin en az %90'ını karşılamalı — altındaysa kesinti başlar.
 */
export function altyapiGunSonu(state: GameState): void {
  const o = altyapiOzet(state);
  const gucKesinti = o.gucOran < 0.9;
  const suKesinti = o.suOran < 0.9;

  // yeni kesinti uyarısı (durum değiştiğinde bir kez)
  if (gucKesinti && !state.altyapi.gucKesinti) {
    notify(state, `⚡ ELEKTRİK KESİNTİSİ! Talep ${o.gucTalep}, kapasite ${o.gucKap}. Cihazlar zorlanıyor — bir jeneratör daha kur (Eşya menüsü).`, 'kotu');
  }
  if (suKesinti && !state.altyapi.suKesinti) {
    notify(state, `💧 SU KESİNTİSİ! Talep ${o.suTalep}, kapasite ${o.suKap}. Kampüs susuz — bir su deposu daha kur.`, 'kotu');
  }
  if (!gucKesinti && state.altyapi.gucKesinti) notify(state, '⚡ Elektrik normale döndü.', 'iyi');
  if (!suKesinti && state.altyapi.suKesinti) notify(state, '💧 Su ikmali normale döndü.', 'iyi');

  state.altyapi.gucKesinti = gucKesinti;
  state.altyapi.suKesinti = suKesinti;

  // günlük cezalar: mutluluk düşüşü + hızlı yıpranma
  if (gucKesinti || suKesinti) {
    const dus = (gucKesinti ? 2 : 0) + (suKesinti ? 2 : 0);
    for (const a of state.agents) {
      if (a.kind === 'ogrenci' || a.kind === 'akademisyen') {
        if (a.kind === 'ogrenci') a.mutluluk = Math.max(0, a.mutluluk - dus);
        else a.memnuniyet = Math.max(0, a.memnuniyet - dus * 0.5);
      }
    }
    if (gucKesinti) {
      // elektrik yokken cihazlar aşırı ısınıp daha hızlı yıpranır
      for (const obj of state.objects) {
        if (GUC_ESYA[obj.type]) obj.yipranma = Math.min(100, (obj.yipranma ?? 0) + 1.5);
      }
    }
  }
}

/** Elektrik kesintisi öğrenme/araştırma/üretim çarpanı (agents okur). */
export function gucCarpani(state: GameState): number {
  return state.altyapi.gucKesinti ? 0.7 : 1;
}
