import { GameState, MAP_H, MAP_W, Point, WALL_SOLID, tileIndex } from './types';

/**
 * A* — 4 yönlü, duvarlar geçilmez (kapılar geçilir).
 * Başarısızsa boş dizi döner. Yol, başlangıç karesini içermez; hedefi içerir.
 */
export function findPath(state: GameState, from: Point, to: Point): Point[] {
  const sx = Math.round(from.x), sy = Math.round(from.y);
  const tx = Math.round(to.x), ty = Math.round(to.y);
  if (sx === tx && sy === ty) return [];
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return [];
  if (state.wall[tileIndex(tx, ty)] === WALL_SOLID) return [];

  const size = MAP_W * MAP_H;
  const gScore = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const start = tileIndex(sx, sy);
  const goal = tileIndex(tx, ty);
  gScore[start] = 0;

  // basit ikili yığın
  const heap: number[] = [start];
  const fScore = new Float32Array(size).fill(Infinity);
  fScore[start] = Math.abs(tx - sx) + Math.abs(ty - sy);

  const less = (a: number, b: number) => fScore[a] < fScore[b];
  const push = (v: number) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const cur = pop();
    if (cur === goal) {
      // yolu geri sar
      const path: Point[] = [];
      let node = goal;
      while (node !== start && node !== -1) {
        path.push({ x: node % MAP_W, y: Math.floor(node / MAP_W) });
        node = cameFrom[node];
      }
      path.reverse();
      return path;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W);
    const dirs = [ [1, 0], [-1, 0], [0, 1], [0, -1] ] as const;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const nt = tileIndex(nx, ny);
      if (closed[nt] || state.wall[nt] === WALL_SOLID) continue;
      // çimde yürümek biraz daha yavaş (yol döşemeyi teşvik)
      const maliyet = state.floor[nt] === null ? 1.4 : 1;
      const g = gScore[cur] + maliyet;
      if (g < gScore[nt]) {
        gScore[nt] = g;
        fScore[nt] = g + Math.abs(tx - nx) + Math.abs(ty - ny);
        cameFrom[nt] = cur;
        push(nt);
      }
    }
  }
  return [];
}
