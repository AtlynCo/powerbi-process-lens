import { compareIds, type Edge } from "./model";

export interface Point { x: number; y: number }
export interface NodePosition extends Point { id: string }
export interface EdgePosition { key: string; path: string; label: Point; arrow: Point & { angle: number } }
export interface Layout { width: number; height: number; nodes: NodePosition[]; edges: EdgePosition[] }
export const NODE_SIZE = Object.freeze({ width: 152, height: 44 });
const round = (value: number): number => Math.round(value * 100) / 100;
const arrowAt = (end: Point, previous: Point): EdgePosition["arrow"] => ({
  x: round(end.x), y: round(end.y), angle: Math.atan2(end.y - previous.y, end.x - previous.x) * 180 / Math.PI
});

function crossesActivity(start: Point, control: Point, end: Point, node: Point): boolean {
  const ax = start.x - 2 * control.x + end.x, bx = 2 * (control.x - start.x);
  const ay = start.y - 2 * control.y + end.y, by = 2 * (control.y - start.y);
  const candidates = [0, 1];
  function roots(a: number, b: number, c: number): void {
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) > 1e-8) candidates.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        candidates.push((-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a));
      }
    }
  }
  for (const side of [-1, 1]) {
    roots(ax, bx, start.x - (node.x + side * (NODE_SIZE.width / 2 + 6)));
    roots(ay, by, start.y - (node.y + side * (NODE_SIZE.height / 2 + 6)));
  }
  const boundaries = candidates.filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
  for (let i = 1; i < boundaries.length; i++) {
    const t = (boundaries[i - 1]! + boundaries[i]!) / 2;
    const x = ax * t * t + bx * t + start.x, y = ay * t * t + by * t + start.y;
    if (Math.abs(x - node.x) < NODE_SIZE.width / 2 + 6 && Math.abs(y - node.y) < NODE_SIZE.height / 2 + 6) return true;
  }
  return false;
}

// Strongly connected components determine placement only: no topology is removed.
function components(ids: string[], edges: Edge[]): string[][] {
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]));
  for (const edge of edges) neighbors.get(edge.source)?.add(edge.target);
  const index = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], active = new Set<string>(), result: string[][] = [];
  function visit(id: string): void {
    const order = index.size;
    index.set(id, order); low.set(id, order); stack.push(id); active.add(id);
    for (const target of [...(neighbors.get(id) ?? [])].sort(compareIds)) {
      if (!neighbors.has(target)) throw new Error("Layout edge has no activity.");
      if (!index.has(target)) { visit(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)); }
      else if (active.has(target)) low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) === index.get(id)) {
      const group: string[] = [];
      let member: string;
      do { member = stack.pop()!; active.delete(member); group.push(member); } while (member !== id);
      result.push(group.sort(compareIds));
    }
  }
  for (const id of ids) if (!index.has(id)) visit(id);
  return result.sort((a, b) => compareIds(a[0]!, b[0]!));
}

export function layoutGraph(ids: string[], edges: Edge[], topology = edges): Layout {
  const sorted = [...ids].sort(compareIds);
  const groups = components(sorted, topology);
  const owners = new Map(groups.flatMap((group, index) => group.map(id => [id, index] as const)));
  const successors = groups.map(() => new Set<number>());
  const indegrees = groups.map(() => 0), ranks = groups.map(() => 0);
  for (const edge of topology) {
    const source = owners.get(edge.source), target = owners.get(edge.target);
    if (source === undefined || target === undefined) throw new Error("Layout edge has no activity.");
    if (source !== target && !successors[source]!.has(target)) { successors[source]!.add(target); indegrees[target]!++; }
  }
  const queue = groups.map((_group, index) => index).filter(index => indegrees[index] === 0);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const source = queue[cursor]!;
    for (const target of [...successors[source]!].sort((a, b) => a - b)) {
      ranks[target] = Math.max(ranks[target]!, ranks[source]! + 1);
      if (--indegrees[target]! === 0) queue.push(target);
    }
  }
  const nodes: NodePosition[] = [];
  // First-column cycles need room for left-side reciprocal metric labels.
  let x = groups.some((group, index) => ranks[index] === 0 && group.length > 1) ? 230 : 90, height = 180;
  for (let rank = 0; rank <= Math.max(0, ...ranks); rank++) {
    let y = 50;
    let rankWidth: number = NODE_SIZE.width;
    for (let index = 0; index < groups.length; index++) {
      if (ranks[index] !== rank) continue;
      const group = groups[index]!;
      const columns = group.length <= 3 ? 1 : Math.ceil(Math.sqrt(group.length));
      for (let item = 0; item < group.length; item++) {
        nodes.push({ id: group[item]!, x: x + item % columns * 270, y: y + Math.floor(item / columns) * 110 });
      }
      rankWidth = Math.max(rankWidth, (columns - 1) * 270 + NODE_SIZE.width);
      y += Math.ceil(group.length / columns) * 110 + 30;
    }
    height = Math.max(height, y + 40);
    x += rankWidth + 120;
  }
  const positions = new Map(nodes.map(node => [node.id, node]));
  const routes = new Map<string, Omit<EdgePosition, "key">>();
  const routeKey = (edge: Edge) => JSON.stringify([edge.source, edge.target]);
  const unique = [...new Map([...topology, ...edges].map(edge => [routeKey(edge), edge])).values()]
    .sort((a, b) => compareIds(routeKey(a), routeKey(b)));
  const baseHeight = height;
  let detours = 0;
  function boundary(node: Point, toward: Point): Point {
    const dx = toward.x - node.x, dy = toward.y - node.y;
    const ratio = Math.max(Math.abs(dx) / (NODE_SIZE.width / 2 + 8), Math.abs(dy) / (NODE_SIZE.height / 2 + 8));
    return { x: node.x + dx / ratio, y: node.y + dy / ratio };
  }
  for (const edge of unique) {
    const source = positions.get(edge.source), target = positions.get(edge.target);
    if (!source || !target) throw new Error("Layout edge has no activity.");
    if (source.id === target.id) {
      routes.set(routeKey(edge), {
        path: `M ${source.x + 80} ${source.y - 12} C ${source.x + 150} ${source.y - 65}, ${source.x + 150} ${source.y + 65}, ${source.x + 80} ${source.y + 12}`,
        label: { x: source.x + 144, y: source.y },
        arrow: arrowAt({ x: source.x + 80, y: source.y + 12 }, { x: source.x + 150, y: source.y + 65 })
      });
      continue;
    }
    const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
    const bend = Math.min(48, distance * 0.15);
    const control = { x: (source.x + target.x) / 2 - dy / distance * bend, y: (source.y + target.y) / 2 + dx / distance * bend };
    const start = boundary(source, control), end = boundary(target, control);
    const obstructed = nodes.some(node => node.id !== source.id && node.id !== target.id && crossesActivity(start, control, end, node));
    if (obstructed && source.x === target.x) {
      const lane = source.x + (dy > 0 ? 110 : 130), side = source.x + 84;
      routes.set(routeKey(edge), {
        path: `M ${side} ${source.y} L ${lane} ${source.y} L ${lane} ${target.y} L ${side} ${target.y}`,
        label: { x: lane + 42, y: (source.y + target.y) / 2 + (dy > 0 ? -12 : 12) },
        arrow: arrowAt({ x: side, y: target.y }, { x: lane, y: target.y })
      });
      continue;
    }
    if (obstructed) {
      // Fixed outside lanes avoid falsely appearing to terminate on intervening activities.
      const lane = baseHeight + 20 + detours++ * 12;
      const leftToRight = source.x < target.x;
      const sourceSide = source.x + 84, sourceLane = source.x + 110;
      const targetSide = target.x + (leftToRight ? -84 : 84), targetLane = target.x + (leftToRight ? -110 : 110);
      routes.set(routeKey(edge), {
        path: `M ${sourceSide} ${source.y} L ${sourceLane} ${source.y} L ${sourceLane} ${lane} L ${targetLane} ${lane} L ${targetLane} ${target.y} L ${targetSide} ${target.y}`,
        label: { x: (sourceLane + targetLane) / 2, y: lane - 5 },
        arrow: arrowAt({ x: targetSide, y: target.y }, { x: targetLane, y: target.y })
      });
      continue;
    }
    routes.set(routeKey(edge), {
      path: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
      arrow: arrowAt(end, control),
      label: {
        x: round((start.x + 2 * control.x + end.x) / 4) + (Math.abs(dy) > Math.abs(dx) * 1.2 ? -Math.sign(dy) * 64 : 0),
        y: round((start.y + 2 * control.y + end.y) / 4) - 5
      }
    });
  }
  height += detours ? detours * 12 + 40 : 0;
  return {
    width: Math.max(340, x + 30), height, nodes: nodes.sort((a, b) => compareIds(a.id, b.id)),
    edges: edges.map(edge => {
      const route = routes.get(routeKey(edge));
      if (!route) throw new Error("Missing edge route.");
      return { ...route, key: edge.key };
    })
  };
}
