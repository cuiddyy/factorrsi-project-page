export const WIDTH = 1280;
export const HEIGHT = 650;
export const operations = { exploration: 'Exploration', mutation: 'Mutation', crossover: 'Crossover', programmatic_external_seed: 'Seed', unknown: 'Unspecified' };
export const colors = { exploration: '#b66b0a', mutation: '#8053cf', crossover: '#087c92', programmatic_external_seed: '#6b7890', unknown: '#6b7890' };
export function number(value) { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
export function metric(value, digits = 4) { const n = number(value); return n === null ? 'Not recorded' : n.toFixed(digits); }
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function prepare(dataset) {
  const nodes = dataset.nodes.map((n, i) => ({ ...n, label: `F${String(i + 1).padStart(4, '0')}`, children: [] }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = dataset.edges.filter(e => byId.has(e.source) && byId.has(e.target));
  for (const e of edges) byId.get(e.source).children.push(e.target);
  const maxDepth = Math.max(1, ...nodes.map(n => n.depth));
  const maxRound = Math.max(1, dataset.max_round);
  const groups = new Map();
  for (const n of nodes) {
    const key = `${n.round}:${n.depth}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const group of groups.values()) group.forEach((n, i) => {
    const spread = Math.min(33, Math.max(6, group.length * 7));
    const jitter = group.length > 1 ? (i / (group.length - 1) - .5) * spread : (hash(n.id) % 1700 / 100 - 8.5);
    n.x = 64 + n.round / maxRound * (WIDTH - 98);
    n.y = 62 + n.depth / maxDepth * (HEIGHT - 129) + jitter;
  });
  return { ...dataset, nodes, edges, byId, maxDepth, maxRound };
}
export function relatives(graph, id, direction = 'parents') {
  const seen = new Set(); const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current) || !graph.byId.has(current)) continue;
    seen.add(current);
    const node = graph.byId.get(current);
    stack.push(...(direction === 'parents' ? node.parents : node.children));
  }
  return seen;
}
export function visibleGraph(graph, round, selected, focus = false) {
  const ancestors = selected ? relatives(graph, selected, 'parents') : new Set();
  const descendants = selected ? relatives(graph, selected, 'children') : new Set();
  const family = new Set([...ancestors, ...descendants]);
  const nodes = graph.nodes.filter(n => n.round <= round && (!focus || family.has(n.id)));
  const ids = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges, ids, ancestors, descendants, family };
}
