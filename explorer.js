import { WIDTH, HEIGHT, colors, operations, prepare, visibleGraph, relatives, metric, number } from './graph-core.js?v=20260911-3';
const root = document.querySelector('#lineage-explorer');
const NS = 'http://www.w3.org/2000/svg';
const state = { index: 0, round: 250, playing: false, speed: 2, selected: null, focus: false, scale: 1, cx: WIDTH / 2, cy: HEIGHT / 2, frame: 0, lastTime: 0 };
let graphs = [], graph, nodeElements, edgeElements, progressLine, svg, tooltip;
const $ = id => document.getElementById(id);
function element(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
function stop() { state.playing = false; cancelAnimationFrame(state.frame); if ($('play')) { $('play').textContent = '▶ Play evolution'; $('play').setAttribute('aria-pressed', 'false'); } }
function updateCamera() {
  const w = WIDTH / state.scale, h = HEIGHT / state.scale;
  state.cx = Math.max(w / 2 - 30, Math.min(WIDTH + 30 - w / 2, state.cx));
  state.cy = Math.max(h / 2 - 20, Math.min(HEIGHT + 20 - h / 2, state.cy));
  svg.setAttribute('viewBox', `${state.cx - w / 2} ${state.cy - h / 2} ${w} ${h}`);
  $('zoom-value').textContent = `${Math.round(state.scale * 100)}%`;
  const box = svg.getBoundingClientRect();
  const ratio = Math.min(box.width / WIDTH, box.height / HEIGHT);
  if (ratio > 0) for (const text of svg.querySelectorAll('.graph-grid text')) text.style.fontSize = `${13 / ratio / state.scale}px`;
}
function resetCamera() { state.scale = 1; state.cx = WIDTH / 2; state.cy = HEIGHT / 2; updateCamera(); }
function zoom(factor) {
  const selected = graph.byId.get(state.selected);
  if (selected && state.scale === 1 && factor > 1) { state.cx = selected.x; state.cy = selected.y; }
  state.scale = Math.min(5, Math.max(1, state.scale * factor)); updateCamera();
}
function buildScene() {
  svg.replaceChildren(); nodeElements = new Map(); edgeElements = [];
  svg.append(element('title', { id: 'graph-title' }, `${graph.name}: recorded factor lineage through round ${graph.maxRound}`));
  svg.append(element('desc', { id: 'graph-description' }, 'Horizontal position shows search round. Vertical position shows generation depth. Color shows exploration, mutation, or crossover. Select a factor to highlight ancestors and descendants. A factor selector below the graph provides a keyboard alternative.'));
  const defs = element('defs');
  const marker = element('marker', { id: 'arrow', viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
  marker.append(element('path', { d: 'M0 0 L6 3 L0 6 Z', fill: '#617b9e' })); defs.append(marker); svg.append(defs);
  const grid = element('g', { class: 'graph-grid', 'aria-hidden': 'true' });
  for (let r = 0; r <= graph.maxRound; r += 25) {
    const x = 64 + r / graph.maxRound * (WIDTH - 98);
    grid.append(element('line', { x1: x, y1: 33, x2: x, y2: HEIGHT - 37 }));
    grid.append(element('text', { x, y: HEIGHT - 14, 'text-anchor': 'middle' }, String(r)));
  }
  for (let d = 0; d <= graph.maxDepth; d++) {
    const y = 62 + d / graph.maxDepth * (HEIGHT - 129);
    grid.append(element('line', { x1: 46, y1: y, x2: WIDTH - 23, y2: y, class: 'depth-guide' }));
    grid.append(element('text', { x: 25, y: y + 4, 'text-anchor': 'middle' }, String(d)));
  }
  grid.append(element('text', { x: 15, y: 19, class: 'axis-label' }, 'Depth'));
  grid.append(element('text', { x: WIDTH - 20, y: 19, 'text-anchor': 'end', class: 'axis-label' }, 'Search round →'));
  svg.append(grid);
  progressLine = element('line', { y1: 30, y2: HEIGHT - 37, class: 'progress-line', 'aria-hidden': 'true' }); svg.append(progressLine);
  const paths = element('g', { class: 'edge-layer', 'aria-hidden': 'true' });
  for (const edge of graph.edges) {
    const a = graph.byId.get(edge.source), b = graph.byId.get(edge.target);
    const bend = Math.max(12, (b.x - a.x) * .48);
    const path = element('path', { d: `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`, fill: 'none', stroke: colors[edge.operation] || '#6b7890', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
    path.style.setProperty('--trace-length', String(Math.hypot(b.x - a.x, b.y - a.y) * 1.7 + 80));
    paths.append(path); edgeElements.push([edge, path]);
  }
  svg.append(paths);
  const nodes = element('g', { class: 'node-layer' });
  for (const node of graph.nodes) {
    const g = element('g', { transform: `translate(${node.x},${node.y})`, class: 'factor-node', 'data-id': node.id, role: 'button', tabindex: '-1', 'aria-label': `${node.label}, ${operations[node.operation] || 'Seed'}, round ${node.round}, ${node.encoder}. ${node.name}` });
    g.append(element('circle', { r: 10, fill: 'transparent', class: 'hit-target' }));
    g.append(element('circle', { r: 5, fill: 'none', stroke: colors[node.operation] || '#6b7890', 'stroke-width': 1.5, class: 'node-halo', 'aria-hidden': 'true' }));
    g.append(element('circle', { r: 4.5, fill: colors[node.operation] || '#6b7890', stroke: '#fff', 'stroke-width': .9, class: 'node-dot' }));
    g.append(element('title', {}, `${node.label} · ${node.name}\n${node.encoder} · round ${node.round} · depth ${node.depth}`));
    g.addEventListener('click', () => selectNode(node.id));
    g.addEventListener('pointerenter', e => showTooltip(node, e));
    g.addEventListener('pointermove', e => positionTooltip(e));
    g.addEventListener('pointerleave', () => tooltip.hidden = true);
    g.addEventListener('focus', () => { g.classList.add('keyboard-focus'); });
    g.addEventListener('blur', () => g.classList.remove('keyboard-focus'));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); const visible = visibleGraph(graph, state.round, state.selected, state.focus).nodes;
        const delta = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1;
        const next = visible[(visible.findIndex(n => n.id === node.id) + delta + visible.length) % visible.length];
        if (next) { g.setAttribute('tabindex', '-1'); const target = nodeElements.get(next.id); target.setAttribute('tabindex', '0'); target.focus(); }
      }
    });
    nodeElements.set(node.id, g); nodes.append(g);
  }
  svg.append(nodes);
  resetCamera(); updateFrame(); updateOptions();
}
function showTooltip(n, e) { tooltip.textContent = `${n.label} · ${operations[n.operation] || 'Seed'}\n${n.name || n.encoder}\nRound ${n.round} · ${n.encoder} · depth ${n.depth}`; tooltip.hidden = false; positionTooltip(e); }
function positionTooltip(e) { const box = $('graph-wrap').getBoundingClientRect(); tooltip.style.left = `${Math.max(8, Math.min(e.clientX - box.left + 14, box.width - 270))}px`; tooltip.style.top = `${Math.max(8, Math.min(e.clientY - box.top + 14, box.height - 90))}px`; }
function updateFrame() {
  const view = visibleGraph(graph, state.round, state.selected, state.focus);
  progressLine.setAttribute('x1', 64 + state.round / graph.maxRound * (WIDTH - 98)); progressLine.setAttribute('x2', progressLine.getAttribute('x1'));
  for (const n of graph.nodes) {
    const el = nodeElements.get(n.id); const visible = view.ids.has(n.id);
    el.style.display = visible ? '' : 'none';
    el.style.opacity = state.selected && !view.family.has(n.id) ? '.15' : '1';
    el.classList.toggle('selected', n.id === state.selected);
    el.classList.toggle('new-factor', state.playing && n.round <= state.round && state.round - n.round < Math.ceil(state.speed * 2));
    el.setAttribute('aria-pressed', String(n.id === state.selected));
    el.setAttribute('tabindex', visible && n.id === (state.selected || view.nodes[0]?.id) ? '0' : '-1');
  }
  for (const [edge, path] of edgeElements) {
    const visible = view.ids.has(edge.source) && view.ids.has(edge.target);
    const related = view.family.has(edge.source) && view.family.has(edge.target);
    path.style.display = visible ? '' : 'none';
    const birth = graph.byId.get(edge.target).round;
    path.classList.toggle('edge-birth', state.playing && visible && state.round - birth < Math.ceil(state.speed * 2));
    path.style.opacity = state.selected ? (related ? '.85' : '.035') : '.22';
    path.setAttribute('stroke-width', state.selected && related ? '1.65' : '1');
    if (state.selected && related) path.setAttribute('marker-end', 'url(#arrow)'); else path.removeAttribute('marker-end');
  }
  $('round-range').value = state.round; $('round-output').textContent = `${state.round} / ${graph.maxRound}`;
  $('visible-count').textContent = `${view.nodes.length.toLocaleString('en-US')} factors`;
  $('edge-count').textContent = `${view.edges.length.toLocaleString('en-US')} parent links`;
  $('depth-count').textContent = `Depth ${Math.max(0, ...view.nodes.map(n => n.depth))}`;
  $('new-count').textContent = `+${view.nodes.filter(n => n.round === state.round).length} this round`;
  $('focus-family').disabled = !state.selected;
  $('focus-family').setAttribute('aria-pressed', String(state.focus));
  $('focus-family').textContent = state.focus ? 'Show entire population' : 'Focus this lineage';
  $('factor-search').disabled = state.playing;
  $('factor-select').disabled = state.playing;
  if (state.playing) $('search-count').textContent = 'Pause to choose a factor';
  if (!state.playing) updateOptions();
}
function addDetail(tag, text, cls, target = $('factor-detail')) { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; target.append(el); return el; }
function renderDetail() {
  const panel = $('factor-detail'); panel.replaceChildren();
  const n = graph.byId.get(state.selected);
  if (!n) {
    addDetail('p', 'Factor inspector', 'eyebrow'); addDetail('h3', 'Follow a mechanism.');
    addDetail('p', 'Select a point in the graph or choose a factor below it. Explore its condition, temporal input, validation scores, and recorded parents.', 'detail-muted');
    const tip = addDetail('div', '', 'inspector-tip'); addDetail('b', 'Reading the graph', '', tip); addDetail('p', 'Left to right: search round.\nTop to bottom: generation depth.\nLinks connect parents to children.', '', tip);
    return;
  }
  addDetail('p', `${n.label} / ${operations[n.operation] || 'Seed'}`, 'eyebrow');
  addDetail('h3', n.name || 'Unnamed factor', 'factor-title');
  addDetail('p', `Round ${n.round} · Depth ${n.depth} · ${n.encoder}`, 'factor-meta');
  addDetail('h4', 'Executable condition'); addDetail('pre', n.condition, 'condition-code');
  if (n.hypothesis) { addDetail('h4', 'Hypothesis'); addDetail('p', n.hypothesis, 'hypothesis-text'); }
  addDetail('h4', 'Temporal input');
  addDetail('p', `End offset: ${number(n.abs_steps_pred) === null ? 'not recorded' : n.abs_steps_pred} · Range: ${number(n.time_range_steps) === null ? 'not recorded' : `${n.time_range_steps} steps`}`, 'detail-muted');
  addDetail('h4', 'Validation · early stopping');
  const metrics = addDetail('div', '', 'detail-metrics');
  for (const name of ['IC', 'ICIR', 'RankIC']) { const item = addDetail('div', '', '', metrics); addDetail('span', name, '', item); addDetail('b', metric(n.valid?.[name]), '', item); }
  addDetail('p', `Condition coverage: ${number(n.coverage) === null ? 'not recorded' : `${(n.coverage * 100).toFixed(1)}%`}`, 'coverage-note');
  addDetail('h4', `Recorded parents · ${n.parents.length}`);
  if (!n.parents.length) addDetail('p', 'No recorded parent. This factor starts a new lineage.', 'detail-muted');
  for (const id of n.parents) {
    const parent = graph.byId.get(id); const button = addDetail('button', parent ? `${parent.label} · ${parent.encoder} · round ${parent.round} ↗` : 'Parent metadata unavailable', 'parent-button');
    button.type = 'button'; button.disabled = !parent; if (parent) button.addEventListener('click', () => selectNode(id));
  }
  addDetail('p', `${relatives(graph, n.id, 'parents').size - 1} ancestors · ${relatives(graph, n.id, 'children').size - 1} descendants`, 'coverage-note');
  if (n.restored_ancestor) addDetail('p', 'Ancestor recovered from a saved training-state record.', 'coverage-note');
  const more = addDetail('details', '', 'record-details'); addDetail('summary', 'Full record identifier', '', more); addDetail('code', n.id, '', more);
}
function selectNode(id) {
  stop(); if (!graph.byId.has(id)) return;
  state.selected = id; state.round = Math.max(state.round, graph.byId.get(id).round);
  $('factor-search').value = ''; updateFrame(); renderDetail(); $('factor-select').value = id;
  $('selection-status').textContent = `Selected ${graph.byId.get(id).label}, ${graph.byId.get(id).name}.`;
}
function updateOptions() {
  const query = $('factor-search').value.trim().toLowerCase(); const select = $('factor-select'); select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a visible factor…'; select.append(placeholder);
  let count = 0;
  const shown = visibleGraph(graph, state.round, state.selected, state.focus);
  for (const n of shown.nodes) {
    if (query && !`${n.label} ${n.name} ${n.condition} ${n.encoder}`.toLowerCase().includes(query)) continue;
    const option = document.createElement('option'); option.value = n.id; option.textContent = `${n.label} · R${n.round} · ${n.encoder} · ${n.name || 'Unnamed'}`; select.append(option); count++;
  }
  select.value = state.selected || ''; $('search-count').textContent = `${count} matches`;
}
function play() {
  if (state.playing) { stop(); updateFrame(); return; }
  state.selected = null; state.focus = false; renderDetail();
  if (state.round >= graph.maxRound) state.round = 0;
  resetCamera(); state.playing = true; state.lastTime = 0; $('play').textContent = 'Ⅱ Pause evolution'; $('play').setAttribute('aria-pressed', 'true'); updateFrame();
  function tick(now) {
    if (!state.playing) return;
    if (!state.lastTime) state.lastTime = now;
    if (now - state.lastTime >= 400 / state.speed) {
      const advance = Math.max(1, Math.floor((now - state.lastTime) / (400 / state.speed)));
      state.round = Math.min(graph.maxRound, state.round + advance); state.lastTime = now; updateFrame();
      if (state.round >= graph.maxRound) { stop(); updateFrame(); return; }
    }
    state.frame = requestAnimationFrame(tick);
  }
  state.frame = requestAnimationFrame(tick);
}
function loadDataset(index) {
  stop(); state.index = index; graph = graphs[index]; state.round = graph.maxRound; state.selected = null; state.focus = false;
  $('round-range').max = graph.maxRound; $('factor-search').value = '';
  document.querySelectorAll('.dataset-tab').forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  buildScene(); renderDetail();
  const a = graph.audit;
  $('audit-note').textContent = a.missing_parents ? `${a.missing_parents} unavailable parent records; only verified links are drawn.` : `All recorded parents resolved · ${a.restored_ancestors || 0} recovered ancestor records`;
}
function attachEvents() {
  $('play').addEventListener('click', play);
  $('restart').addEventListener('click', () => { stop(); state.round = 0; state.selected = null; state.focus = false; resetCamera(); renderDetail(); updateFrame(); });
  $('round-range').addEventListener('input', e => { stop(); state.round = Number(e.target.value); if (graph.byId.get(state.selected)?.round > state.round) { state.selected = null; state.focus = false; renderDetail(); } updateFrame(); });
  $('speed').addEventListener('change', e => state.speed = Number(e.target.value));
  $('focus-family').addEventListener('click', () => { state.focus = !state.focus; updateFrame(); });
  $('clear-selection').addEventListener('click', () => { state.selected = null; state.focus = false; updateFrame(); renderDetail(); });
  $('factor-search').addEventListener('input', updateOptions);
  $('factor-select').addEventListener('change', e => { if (e.target.value) selectNode(e.target.value); });
  $('zoom-in').addEventListener('click', () => zoom(1.45)); $('zoom-out').addEventListener('click', () => zoom(1 / 1.45)); $('zoom-reset').addEventListener('click', resetCamera);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); updateFrame(); } });
  let drag = null;
  svg.addEventListener('pointerdown', e => { if (e.target.closest('.factor-node') || e.button !== 0 || state.scale === 1) return; drag = { x: e.clientX, y: e.clientY, cx: state.cx, cy: state.cy }; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); });
  svg.addEventListener('pointermove', e => { if (!drag) return; const rect = svg.getBoundingClientRect(); const unit = Math.max(WIDTH / rect.width, HEIGHT / rect.height) / state.scale; state.cx = drag.cx - (e.clientX - drag.x) * unit; state.cy = drag.cy - (e.clientY - drag.y) * unit; updateCamera(); });
  for (const event of ['pointerup', 'pointercancel']) svg.addEventListener(event, () => { drag = null; svg.classList.remove('dragging'); });
  svg.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); } }, { passive: false });
}
async function init() {
  try {
    const response = await fetch('./lineage.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`Data response ${response.status}`);
    const data = await response.json(); graphs = data.datasets.map(prepare); if (!graphs.length) throw new Error('No datasets');
    root.innerHTML = `<div class="explorer-header"><div class="dataset-tabs" role="group" aria-label="Lineage dataset"></div><span class="snapshot-label">RSI on · rounds 0–250</span></div>
    <div class="playback-bar"><button id="play" class="play-button" type="button" aria-pressed="false">▶ Play evolution</button><button id="restart" type="button" class="icon-button" aria-label="Return to round zero" title="Return to round zero">↶</button><label for="round-range" class="sr-only">Search round</label><input id="round-range" type="range" min="0" max="250" value="250"><output id="round-output" for="round-range">250 / 250</output><label for="speed" class="sr-only">Playback speed</label><select id="speed" title="Playback speed"><option value="1">1× speed</option><option value="2" selected>2× speed</option><option value="4">4× speed</option></select></div>
    <div class="explorer-body"><div class="graph-column"><div class="graph-summary"><span id="visible-count"></span><span id="edge-count"></span><span id="depth-count"></span><span id="new-count"></span></div><div id="graph-wrap" class="graph-wrap"><svg id="lineage-svg" viewBox="0 0 1280 650" role="group" aria-labelledby="graph-title graph-description"></svg><div id="graph-tooltip" class="graph-tooltip" hidden></div><div class="zoom-controls"><button id="zoom-out" type="button" aria-label="Zoom out">−</button><span id="zoom-value">100%</span><button id="zoom-in" type="button" aria-label="Zoom in">+</button><button id="zoom-reset" type="button" aria-label="Fit the full graph">Fit</button></div></div><div class="graph-legend"><span><i style="background:#b66b0a"></i>Exploration</span><span><i style="background:#8053cf"></i>Mutation</span><span><i style="background:#087c92"></i>Crossover</span><span><i style="background:#6b7890"></i>Seed</span></div><div class="factor-picker"><label for="factor-search">Find a factor</label><input id="factor-search" type="search" placeholder="Name, encoder, or condition"><span id="search-count" aria-live="polite"></span><label for="factor-select" class="sr-only">Choose a visible factor</label><select id="factor-select"></select></div><p class="graph-help">Plays once when this figure comes into view. Pause to inspect a factor. Zoom in, then drag to pan; the selector also supports keyboard navigation.</p></div><aside class="inspector"><div id="factor-detail"></div><div class="inspector-actions"><button id="focus-family" type="button" class="button" disabled>Focus this lineage</button><button id="clear-selection" type="button">Clear selection</button></div></aside></div><div class="explorer-footer"><span id="audit-note"></span><span>Edges = recorded ancestry</span></div><p id="selection-status" class="sr-only" aria-live="polite"></p>`;
    const tabs = root.querySelector('.dataset-tabs'); graphs.forEach((g, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dataset-tab'; b.textContent = g.name; b.setAttribute('aria-pressed', String(i === 0)); b.addEventListener('click', () => { loadDataset(i); if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play(); }); tabs.append(b); });
    svg = $('lineage-svg'); tooltip = $('graph-tooltip'); attachEvents(); loadDataset(0);
    new ResizeObserver(updateCamera).observe(svg);
    // Demonstrate the recorded evolution once when the figure is actually visible.
    // Manual interaction takes precedence over this automatic first playback.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let interacted = false;
      root.addEventListener('pointerdown', () => { interacted = true; }, { once: true });
      root.addEventListener('keydown', () => { interacted = true; }, { once: true });
      const firstPlayback = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting) || document.hidden) return;
        firstPlayback.disconnect();
        if (!interacted) play();
      }, { threshold: .15 });
      firstPlayback.observe(root);
    }
  } catch (error) {
    root.replaceChildren(); const message = document.createElement('p'); message.className = 'data-status'; message.textContent = 'The interactive data could not be loaded. Please refresh, or download the lineage data from Research resources.'; root.append(message); console.error('Lineage initialization failed', error);
  }
}
init();
