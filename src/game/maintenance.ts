/**
 * Eşya eskimesi ve arıza — kampüs kurulduktan sonra da inşaat tarafına iş çıkarır.
 *
 * Her eşya her gün yıpranır; 100'e ulaşan BOZULUR ve işlev görmez:
 * bozuk sıra koltuk sayılmaz, bozuk bilgisayar araştırmayı hızlandırmaz,
 * bozuk ranza barındırmaz, bozuk aktivite objesi cazibe üretmez.
 * 🔧 Tamirci personeli bozuk eşyaları gezerek onarır.
 */
import { GameState, PlacedObject } from '../core/types';
import { randRange } from '../core/util';
import { BALANCE } from '../data/balance';
import { notify } from './state';

export function bozukMu(o: PlacedObject): boolean {
  return (o.yipranma ?? 0) >= 100;
}

export function bozukSayisi(state: GameState): number {
  let n = 0;
  for (const o of state.objects) if (bozukMu(o)) n++;
  return n;
}

/** Gün sonu: tüm eşyalar yıpranır; yeni bozulanlar toplu bildirilir. */
export function gunlukYipranma(state: GameState): void {
  let yeniBozulan = 0;
  const [min, max] = BALANCE.YIPRANMA_GUN;
  for (const o of state.objects) {
    const onceki = o.yipranma ?? 0;
    o.yipranma = Math.min(130, onceki + randRange(state, min, max));
    if (onceki < 100 && o.yipranma >= 100) {
      yeniBozulan++;
      if (o.reservedBy !== -1) o.reservedBy = -1; // bayat rezervasyonu bırak
    }
  }
  if (yeniBozulan > 0) {
    const toplam = bozukSayisi(state);
    const tamirciVar = state.agents.some((a) => a.kind === 'tamirci');
    notify(
      state,
      `🔧 ${yeniBozulan} eşya arızalandı (toplam ${toplam} bozuk)${tamirciVar ? ' — tamirciler ilgileniyor.' : ' — TAMİRCİ YOK! Kadro panelinden işe al.'}`,
      tamirciVar ? 'bilgi' : 'kotu',
    );
  }
}
