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

export interface UIState {
  tool: Tool;
  /** sürükleme başlangıç karesi (dikdörtgen araçları için) */
  dragStart: Point | null;
  hoverTile: Point | null;
  /** seçili oda (bilgi göstermek için), yoksa -1 */
  selectedRoomId: number;
  paused: boolean;
}

export function createUIState(): UIState {
  return {
    tool: { kind: 'sec' },
    dragStart: null,
    hoverTile: null,
    selectedRoomId: -1,
    paused: false,
  };
}
