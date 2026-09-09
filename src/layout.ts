import { compareIds, type Edge } from "./model";

export interface Point { x: number; y: number }
export interface NodePosition extends Point { id: string }
export interface EdgePosition { key: string; path: string; label: Point }
export interface Layout {
  width: number;
  height: number;
  nodes: NodePosition[];
  edges: EdgePosition[];
}
const round = (value: number): number => Math.round(value * 100) / 100;

export function layoutGraph(ids: string[], edges: Edge[]): Layout {
  const sorted = [...ids].sort(compareIds);
  const radius = Math.max(160, sorted.length * 27);
  const size = 2 * radius + 280;
  const center = size / 2;
  const nodes = sorted.map((id, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(1, sorted.length);
    return { id, x: round(center + radius * Math.cos(angle)), y: round(center + radius * Math.sin(angle)) };
  });
  const positions = new Map(nodes.map(node => [node.id, node]));
  const placed: EdgePosition[] = [];
  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) throw new Error("Layout edge has no activity.");
    if (source.id === target.id) {
      placed.push({
        key: edge.key,
        path: `M ${source.x - 18} ${source.y - 21} C ${source.x - 90} ${source.y - 120}, ${source.x + 90} ${source.y - 120}, ${source.x + 18} ${source.y - 21}`,
        label: { x: source.x, y: source.y - 99 }
      });
      continue;
    }
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    // Same positive bend relative to direction separates reciprocal links.
    const bend = Math.min(65, distance * 0.18);
    const control = { x: (source.x + target.x) / 2 - dy / distance * bend, y: (source.y + target.y) / 2 + dx / distance * bend };
    const startLength = Math.hypot(control.x - source.x, control.y - source.y);
    const endLength = Math.hypot(target.x - control.x, target.y - control.y);
    const start = { x: source.x + (control.x - source.x) / startLength * 27, y: source.y + (control.y - source.y) / startLength * 27 };
    const end = { x: target.x - (target.x - control.x) / endLength * 30, y: target.y - (target.y - control.y) / endLength * 30 };
    placed.push({
      key: edge.key,
      path: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
      label: { x: round((start.x + 2 * control.x + end.x) / 4), y: round((start.y + 2 * control.y + end.y) / 4) }
    });
  }
  return { width: size, height: size, nodes, edges: placed };
}
