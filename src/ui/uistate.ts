import type { FloorId, ObjectTypeId, Point, RoomType } from '../core/types';

export type Tool =
  | { kind: 'sec' }
  | { kind: 'zemin'; floor: FloorId }
  | { kind: 'duvar' }
  | { kind: 'kapi' }
  | { kind: 'yikim' }
  | { kind: 'oda'; room: RoomType }
  | { kind: 'oda_kaldir' }
  | { kind: 'esya'; obj: ObjectTypeId }
  | { kind: 'hazir'; prefab: string };

/** Isı haritası katmanları — haritanın üstüne renk kaplaması basar. */
export type Katman = 'yok' | 'mutluluk' | 'aclik' | 'kir' | 'yipranma';

export interface UIState {
  tool: Tool;
  /** sürükleme başlangıç karesi (dikdörtgen araçları için) */
  dragStart: Point | null;
  hoverTile: Point | null;
  /** seçili oda (bilgi göstermek için), yoksa -1 */
  selectedRoomId: number;
  /** seçili kişi (öğrenci/hoca kartı göstermek için), yoksa -1 */
  selectedAgentId: number;
  paused: boolean;
  /** aktif ısı haritası katmanı */
  katman: Katman;
  /** hazır bina kapı yönü: 0 alt · 1 sağ · 2 üst · 3 sol (R ile döner) */
  buildYon: number;
}

export function createUIState(): UIState {
  return {
    tool: { kind: 'sec' },
    dragStart: null,
    hoverTile: null,
    selectedRoomId: -1,
    selectedAgentId: -1,
    paused: false,
    katman: 'yok',
    buildYon: 0,
  };
}
