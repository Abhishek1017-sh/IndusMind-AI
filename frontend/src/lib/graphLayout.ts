/**
 * Deterministic graph layout for the Knowledge Graph.
 *
 * React Flow ships no layout engine. Rather than pull in a physics library and
 * tune it blind, this computes a stable, readable BFS-radial layout:
 *   • each connected component is laid out around its highest-degree hub, with
 *     BFS "rings" radiating outward (neighbours near their parent);
 *   • components are tiled left-to-right;
 *   • isolated nodes (no relationships) collect into a tidy grid below.
 *
 * Pure and deterministic — same input always yields the same coordinates, so
 * the graph never reshuffles between renders. Users can still drag nodes freely
 * (React Flow physics-free dragging) once laid out.
 */

export interface XY {
  x: number;
  y: number;
}

interface Edgeish {
  source: string;
  target: string;
}

const RING = 260; // distance between BFS levels
const NODE_GAP = 200; // gap between tiled components
const GRID_COLS = 8;
const GRID_X = 190;
const GRID_Y = 120;

function buildAdjacency(nodeIds: string[], edges: Edgeish[]) {
  const adj = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adj.set(id, new Set()));
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target) && e.source !== e.target) {
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
  }
  return adj;
}

/** Radial positions for one connected component, centred on (0,0). */
function layoutComponent(comp: string[], adj: Map<string, Set<string>>) {
  const degree = (id: string) => adj.get(id)?.size ?? 0;
  let root = comp[0];
  for (const id of comp) if (degree(id) > degree(root)) root = id;

  const level = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj.get(n) ?? []) {
      if (!level.has(m) && comp.includes(m)) {
        level.set(m, (level.get(n) ?? 0) + 1);
        queue.push(m);
      }
    }
  }

  const byLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const id of comp) {
    const l = level.get(id) ?? 1;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(id);
    maxLevel = Math.max(maxLevel, l);
  }

  const rel = new Map<string, XY>();
  for (const [l, ids] of byLevel) {
    if (l === 0) {
      rel.set(ids[0], { x: 0, y: 0 });
      continue;
    }
    const radius = l * RING;
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
      rel.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }
  return { rel, radius: maxLevel * RING };
}

export function computeGraphLayout(nodeIds: string[], edges: Edgeish[]): Map<string, XY> {
  const adj = buildAdjacency(nodeIds, edges);
  const pos = new Map<string, XY>();

  const isolated = nodeIds.filter((id) => (adj.get(id)?.size ?? 0) === 0);
  const connected = new Set(nodeIds.filter((id) => (adj.get(id)?.size ?? 0) > 0));

  // Discover connected components.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of connected) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      comp.push(n);
      for (const m of adj.get(n) ?? []) {
        if (connected.has(m) && !seen.has(m)) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length);

  // Tile components left-to-right.
  let offsetX = 0;
  let maxY = 0;
  for (const comp of components) {
    const { rel, radius } = layoutComponent(comp, adj);
    const cx = offsetX + radius;
    for (const [id, p] of rel) {
      const y = p.y;
      pos.set(id, { x: cx + p.x, y });
      maxY = Math.max(maxY, y + radius);
    }
    offsetX = cx + radius + NODE_GAP;
  }

  // Isolated nodes → compact grid beneath the connected clusters.
  const gridTop = (components.length ? maxY : 0) + 200;
  isolated.forEach((id, i) => {
    pos.set(id, {
      x: (i % GRID_COLS) * GRID_X,
      y: gridTop + Math.floor(i / GRID_COLS) * GRID_Y,
    });
  });

  return pos;
}
