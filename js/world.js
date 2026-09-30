'use strict';
// ---------- World generation, collision and ground rendering ----------
const TS = 32, MW = 192, MH = 192, CHT = 16;
const GEN_VERSION = 4;
const T = { HIGH: 0, ROAD: 1, SIDE: 2, LOT: 3, GRASS: 4, BLD: 5, FENCE: 6, GATE: 7, BASE: 8, TOXIC: 9, RUBBLE: 10, GRAVEL: 11, PLAZA: 12 };
const REGION_IDS = ['center', 'north', 'east', 'south', 'west'];

// Fixed layout anchors (tile coords)
const BASE_RECT = { x0: 84, y0: 100, x1: 94, y1: 110 };        // walkable base floor (inclusive)
const BASE_SPAWN = { x: 89.5 * TS, y: 106.5 * TS };
const DEALER_POS = { x: 103.5 * TS, y: 102.2 * TS };
const SHOP_POS = { x: 103.5 * TS, y: 108.2 * TS };
const BOARD_POS = { x: 101.5 * TS, y: 105.3 * TS };
const GATE_DEFS = {
  east:  { tiles: [[127, 96], [127, 97], [127, 98]], req: 'cutters', dir: 'v', out: { x: 131 * TS, y: 97.5 * TS }, in: { x: 124.5 * TS, y: 97.5 * TS } },
  south: { tiles: [[96, 127], [97, 127], [98, 127]], req: null, dir: 'h', out: { x: 97.5 * TS, y: 131 * TS }, in: { x: 97.5 * TS, y: 124.5 * TS } },
  west:  { tiles: [[63, 96], [63, 97], [63, 98]], req: 'grinder', dir: 'v', out: { x: 60 * TS, y: 97.5 * TS }, in: { x: 67.5 * TS, y: 97.5 * TS } },
};
// Station layout inside the base (tile centers)
const STATION_POS = {
  bed:        [85.6, 101.4], stash:    [88.0, 101.4], workbench: [90.5, 101.4], rainbarrel: [93.2, 101.2],
  shredder:   [85.6, 104.6], crusher:  [88.0, 104.6], baler:     [90.5, 104.6], campfire:   [92.9, 105.4],
  smelter:    [85.6, 107.4], tirecutter: [88.0, 107.4], stripper: [90.5, 107.4], filter:    [93.4, 108.0],
  ebench:     [85.6, 109.9], stove:    [88.0, 109.9], garden:    [90.8, 110.0], solar:      [93.4, 110.2],
  lock:       [95.5, 104.2], van:      [99.2, 112.0],
};

function regionAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return null;
  const cx = tx >= 64 && tx < 128, cy = ty >= 64 && ty < 128;
  if (cx && cy) return 'center';
  if (cx && ty < 64) return 'north';
  if (cx && ty >= 128) return 'south';
  if (cy && tx >= 128) return 'east';
  if (cy && tx < 64) return 'west';
  return null;
}

const World = {
  seed: 1, tiles: null, bmask: null, buildings: [], nodes: [], lights: [], trees: [], gates: {},
  gateOpen: { east: false, south: true, west: false }, grid: null, chunkCache: new Map(), mapCanvas: null,
};

const ROOF_COLS = {
  center: ['#8c5a4a', '#6d6f73', '#7b6a55', '#5e6b73', '#8a7f6a', '#6f5f6b'],
  north: ['#9c4a3a', '#7a4b35', '#5c6e7d', '#8a6b3e', '#6b5a7a', '#a0583f'],
  east: ['#5d6770', '#6f7b85', '#4f5a52', '#7d6f5a', '#61686b'],
  south: ['#7a5a3a', '#6a6a55', '#6b4f3a'],
  west: ['#3f4550', '#4a4550', '#50463f', '#3a4a4a', '#474c57'],
  high: ['#2e3138', '#34373f', '#2a2d33', '#383a42'],
};

function genWorld(seed) {
  World.seed = seed;
  const rng = mulberry32(seed);
  const tiles = World.tiles = new Uint8Array(MW * MH).fill(T.HIGH);
  World.bmask = new Uint8Array(MW * MH);
  World.buildings = []; World.nodes = []; World.lights = []; World.trees = [];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) tiles[y * MW + x] = v; };
  const addB = (x, y, w, h, reg, kind) => {
    const b = { x, y, w, h, reg, kind, col: pick(rng, ROOF_COLS[kind === 'high' ? 'high' : reg]), s: Math.floor(rng() * 1e9) };
    World.buildings.push(b);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { set(xx, yy, T.BLD); World.bmask[yy * MW + xx] = 1; }
    return b;
  };

  // --- blocks ---
  const special = { '5,5': 'plaza', '5,6': 'base', '6,6': 'dealer' };
  for (let by = 0; by < 12; by++) for (let bx = 0; bx < 12; bx++) {
    const a = bx * 16, b = by * 16;
    const reg = regionAt(a + 8, b + 8);
    if (!reg) { addB(a, b, 16, 16, 'high', 'high'); continue; }
    const sideT = reg === 'east' ? T.GRAVEL : reg === 'south' ? T.LOT : T.SIDE;
    const inT = { center: T.LOT, north: T.GRASS, east: T.GRAVEL, south: T.TOXIC, west: T.RUBBLE }[reg];
    for (let oy = 0; oy < 16; oy++) for (let ox = 0; ox < 16; ox++) {
      let v;
      if (ox < 3 || oy < 3) v = T.ROAD;
      else if (ox === 3 || ox === 15 || oy === 3 || oy === 15) v = sideT;
      else v = inT;
      set(a + ox, b + oy, v);
    }
    const sp = special[bx + ',' + by];
    if (sp) { genSpecial(sp, a, b, addB, set, rng); continue; }
    // alleys at offset 9
    const alleyT = reg === 'north' ? T.GRASS : reg === 'south' ? T.TOXIC : reg === 'west' ? T.RUBBLE : reg === 'east' ? T.GRAVEL : T.LOT;
    for (let i = 4; i <= 14; i++) { set(a + 9, b + i, alleyT); set(a + i, b + 9, alleyT); }
    const Q = [[4, 4], [10, 4], [4, 10], [10, 10]];
    if (reg === 'center') {
      for (const [qx, qy] of Q) {
        const r = rng();
        if (r < .35) addB(a + qx, b + qy, 5, 5, reg, 'generic');
        else if (r < .6) addB(a + qx, b + qy, 5, 3, reg, 'generic');
        else if (r < .75) addB(a + qx, b + qy, 3, 5, reg, 'generic');
      }
    } else if (reg === 'north') {
      for (const [qx, qy] of Q) {
        if (rng() < .8) {
          const w = rng() < .5 ? 4 : 3, h = 3;
          addB(a + qx + (rng() < .5 ? 0 : 5 - w), b + qy, w, h, reg, 'house');
        }
        if (rng() < .7) World.trees.push({ x: (a + qx + rint(rng, 0, 4) + .5) * TS, y: (b + qy + 3.5 + rng()) * TS, r: 10 + rng() * 8, s: rng() });
      }
    } else if (reg === 'east') {
      const r = rng();
      if (r < .35) addB(a + 4, b + 4, 5, 11, reg, 'warehouse');
      else if (r < .7) addB(a + 4, b + 4, 11, 5, reg, 'warehouse');
      else addB(a + 4, b + 4, 5, 5, reg, 'warehouse');
      for (const [qx, qy] of Q) if (rng() < .3 && tiles[(b + qy) * MW + a + qx] !== T.BLD) addB(a + qx, b + qy, 4, 3, reg, 'warehouse');
    } else if (reg === 'south') {
      for (const [qx, qy] of Q) if (rng() < .2) addB(a + qx + 1, b + qy, 3, 2, reg, 'shed');
    } else if (reg === 'west') {
      for (const [qx, qy] of Q) {
        const r = rng();
        if (r < .5) addB(a + qx, b + qy, 5, 5, reg, 'tower');
        else if (r < .85) addB(a + qx, b + qy, 5, 4, reg, 'tower');
      }
    }
  }

  // --- fences & gates ---
  for (let y = 64; y < 128; y++) { set(127, y, T.FENCE); set(63, y, T.FENCE); }
  for (let x = 64; x < 128; x++) set(x, 127, T.FENCE);
  World.gates = {};
  for (const id in GATE_DEFS) {
    const g = GATE_DEFS[id];
    for (const [x, y] of g.tiles) set(x, y, T.GATE);
    const [mx, my] = g.tiles[1];
    World.gates[id] = { id, req: g.req, x: (mx + .5) * TS, y: (my + .5) * TS, dir: g.dir };
  }

  // --- reachability cleanup ---
  const reach = new Uint8Array(MW * MH);
  const stack = [Math.floor(BASE_SPAWN.y / TS) * MW + Math.floor(BASE_SPAWN.x / TS)];
  const walk = v => v !== T.HIGH && v !== T.BLD && v !== T.FENCE;
  while (stack.length) {
    const i = stack.pop();
    if (reach[i]) continue;
    reach[i] = 1;
    const x = i % MW, y = (i / MW) | 0;
    if (x > 0 && !reach[i - 1] && walk(tiles[i - 1])) stack.push(i - 1);
    if (x < MW - 1 && !reach[i + 1] && walk(tiles[i + 1])) stack.push(i + 1);
    if (y > 0 && !reach[i - MW] && walk(tiles[i - MW])) stack.push(i - MW);
    if (y < MH - 1 && !reach[i + MW] && walk(tiles[i + MW])) stack.push(i + MW);
  }
  for (let i = 0; i < tiles.length; i++) if (!reach[i] && walk(tiles[i])) tiles[i] = T.BLD;

  // --- nodes ---
  const used = [];
  const free = (px, py, d) => { for (const u of used) if (dist2(u[0], u[1], px, py) < d * d) return false; return true; };
  const addNode = (type, px, py, extra) => {
    const n = Object.assign({ id: World.nodes.length, type, x: px, y: py, reg: regionAt((px / TS) | 0, (py / TS) | 0) }, extra || {});
    World.nodes.push(n); used.push([px, py]); return n;
  };
  const isWalk = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && reach[y * MW + x] && walk(tiles[y * MW + x]) && tiles[y * MW + x] !== T.GATE;
  // plaza fountain
  addNode('fountain', 89.5 * TS, 89.5 * TS);
  // a few easy pickings right across the street from the base (tutorial)
  addNode('trashbag', 86.5 * TS, 115.5 * TS); addNode('dumpster', 89.6 * TS, 115.6 * TS);
  addNode('trashbag', 92.4 * TS, 115.5 * TS); addNode('cardboard', 94.5 * TS, 115.4 * TS);
  for (let by = 0; by < 12; by++) for (let bx = 0; bx < 12; bx++) {
    const a = bx * 16, b = by * 16, reg = regionAt(a + 8, b + 8);
    if (!reg || special[bx + ',' + by]) continue;
    const D = DISTRICTS[reg];
    const count = rint(rng, D.perBlock[0], D.perBlock[1]);
    // door nodes
    if (D.doors) {
      for (let k = 0; k < D.doors.length; k += 2) {
        let want = D.doors[k + 1]; want = Math.floor(want) + (rng() < want % 1 ? 1 : 0);
        for (let n = 0; n < want; n++) for (let tries = 0; tries < 40; tries++) {
          const x = a + rint(rng, 4, 14), y = b + rint(rng, 4, 15);
          if (isWalk(x, y) && tiles[(y - 1) * MW + x] === T.BLD && World.bmask[(y - 1) * MW + x] && free((x + .5) * TS, y * TS + 8, 60)) {
            addNode(D.doors[k], (x + .5) * TS, y * TS + 9); break;
          }
        }
      }
    }
    for (let n = 0; n < count; n++) {
      const type = weightedPick(rng, D.nodes);
      for (let tries = 0; tries < 30; tries++) {
        const x = a + rint(rng, 3, 15), y = b + rint(rng, 3, 15);
        if (!isWalk(x, y)) continue;
        const px = (x + .5) * TS + (rng() - .5) * 10, py = (y + .5) * TS + (rng() - .5) * 10;
        if (!free(px, py, 46)) continue;
        addNode(type, px, py); break;
      }
    }
    if (reg === 'north' && rng() < .25) {
      for (let tries = 0; tries < 20; tries++) {
        const x = a + rint(rng, 4, 14), y = b + rint(rng, 4, 14);
        if (isWalk(x, y) && free((x + .5) * TS, (y + .5) * TS, 50)) { addNode('fountain', (x + .5) * TS, (y + .5) * TS, { tap: true }); break; }
      }
    }
    // parked wrecks on the road
    if (rng() < D.cars) {
      const vert = rng() < .5;
      const lane = rng() < .5 ? 0 : 2;
      const along = rint(rng, 5, 13);
      const x = vert ? a + lane : a + along, y = vert ? b + along : b + lane;
      if (isWalk(x, y)) {
        const px = vert ? (x + .5) * TS : (x + .5) * TS, py = (y + .5) * TS;
        if (free(px, py, 60)) addNode('car', px, py, { rot: vert ? Math.PI / 2 : 0, flip: rng() < .5 });
      }
    }
    // street light
    const lx = a + 3, ly = b + 3;
    if (isWalk(lx, ly)) World.lights.push({ x: lx * TS + 6, y: ly * TS + 6, broken: rng() < D.broken, f: rng() * 10 });
  }
  // extra lights near base
  World.lights.push({ x: 99 * TS + 6, y: 99 * TS + 6, broken: false, f: 0 });
  World.lights.push({ x: 99 * TS + 6, y: 111 * TS + 26, broken: false, f: 2 });

  // spatial buckets for nodes
  World.grid = new Array(12 * 12).fill(null).map(() => []);
  for (const n of World.nodes) World.grid[bucketOf(n.x, n.y)].push(n);
  World.chunkCache.clear();
  buildMapCanvas();
}

function genSpecial(sp, a, b, addB, set, rng) {
  if (sp === 'plaza') {
    for (let y = b + 4; y <= b + 14; y++) for (let x = a + 4; x <= a + 14; x++) set(x, y, T.PLAZA);
    for (const [x, y] of [[a + 4, b + 4], [a + 12, b + 4], [a + 4, b + 12], [a + 12, b + 12]])
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) set(x + xx, y + yy, T.GRASS);
    for (const [x, y] of [[5.5, 5.5], [13.5, 5.5], [5.5, 13.5], [13.5, 13.5], [6.8, 4.8], [12.2, 13.8]])
      World.trees.push({ x: (a + x) * TS, y: (b + y) * TS, r: 13 + rng() * 6, s: rng() });
  } else if (sp === 'base') {
    for (let y = b + 4; y <= b + 14; y++) for (let x = a + 4; x <= a + 14; x++) set(x, y, T.BASE);
    for (let i = 3; i <= 15; i++) { set(a + i, b + 3, T.FENCE); set(a + i, b + 15, T.FENCE); set(a + 3, b + i, T.FENCE); set(a + 15, b + i, T.FENCE); }
    for (let y = 104; y <= 106; y++) set(95, y, T.BASE);
    for (let x = 88; x <= 90; x++) set(x, 111, T.BASE);
  } else if (sp === 'dealer') {
    for (let y = b + 4; y <= b + 14; y++) for (let x = a + 4; x <= a + 14; x++) set(x, y, T.GRAVEL);
    addB(105, 99, 6, 6, 'center', 'dealer');
    addB(105, 107, 6, 4, 'center', 'kiosk');
  }
}

const bucketOf = (px, py) => clamp(Math.floor(py / TS / 16), 0, 11) * 12 + clamp(Math.floor(px / TS / 16), 0, 11);
function nodesNear(px, py, rad) {
  const out = [];
  const x0 = clamp(Math.floor((px - rad) / TS / 16), 0, 11), x1 = clamp(Math.floor((px + rad) / TS / 16), 0, 11);
  const y0 = clamp(Math.floor((py - rad) / TS / 16), 0, 11), y1 = clamp(Math.floor((py + rad) / TS / 16), 0, 11);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const n of World.grid[y * 12 + x]) out.push(n);
  return out;
}
function addDynNode(n) { n.id = 'd' + Date.now() + Math.floor(Math.random() * 1e6); World.nodes.push(n); World.grid[bucketOf(n.x, n.y)].push(n); return n; }
function removeDynNode(n) {
  const b = World.grid[bucketOf(n.x, n.y)]; const i = b.indexOf(n); if (i >= 0) b.splice(i, 1);
  const j = World.nodes.indexOf(n); if (j >= 0) World.nodes.splice(j, 1);
}

function tileAt(tx, ty) { return (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? T.HIGH : World.tiles[ty * MW + tx]; }
function gateIdAt(tx, ty) {
  for (const id in GATE_DEFS) for (const [x, y] of GATE_DEFS[id].tiles) if (x === tx && y === ty) return id;
  return null;
}
function isSolid(tx, ty) {
  const t = tileAt(tx, ty);
  if (t === T.HIGH || t === T.BLD || t === T.FENCE) return true;
  if (t === T.GATE) return !World.gateOpen[gateIdAt(tx, ty)];
  return false;
}
// Axis-separated box collision. Entity: {x,y}; half-size hs
function moveEntity(e, dx, dy, hs) {
  if (dx) {
    e.x += dx;
    const y0 = Math.floor((e.y - hs) / TS), y1 = Math.floor((e.y + hs - .01) / TS);
    if (dx > 0) { const tx = Math.floor((e.x + hs) / TS); for (let ty = y0; ty <= y1; ty++) if (isSolid(tx, ty)) { e.x = tx * TS - hs - .01; break; } }
    else { const tx = Math.floor((e.x - hs) / TS); for (let ty = y0; ty <= y1; ty++) if (isSolid(tx, ty)) { e.x = (tx + 1) * TS + hs + .01; break; } }
  }
  if (dy) {
    e.y += dy;
    const x0 = Math.floor((e.x - hs) / TS), x1 = Math.floor((e.x + hs - .01) / TS);
    if (dy > 0) { const ty = Math.floor((e.y + hs) / TS); for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) { e.y = ty * TS - hs - .01; break; } }
    else { const ty = Math.floor((e.y - hs) / TS); for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) { e.y = (ty + 1) * TS + hs + .01; break; } }
  }
}
function inBase(px, py, pad) {
  pad = pad || 0;
  return px > (BASE_RECT.x0 - pad) * TS && px < (BASE_RECT.x1 + 1 + pad) * TS && py > (BASE_RECT.y0 - pad) * TS && py < (BASE_RECT.y1 + 1 + pad) * TS;
}

// ---------- Ground rendering ----------
const GROUND = {
  [T.ROAD]: '#3b3e44', [T.SIDE]: '#8e8b85', [T.LOT]: '#6f6252', [T.GRASS]: '#4f6b3a', [T.BASE]: '#77746c',
  [T.TOXIC]: '#55553a', [T.RUBBLE]: '#56524d', [T.GRAVEL]: '#6d6c66', [T.PLAZA]: '#a09a8e', [T.FENCE]: '#8e8b85', [T.GATE]: '#3b3e44',
};

function renderChunk(cx, cy, scale) {
  const c = document.createElement('canvas');
  const size = CHT * TS;
  c.width = c.height = Math.ceil(size * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(-cx * size, -cy * size);
  const x0 = cx * CHT, y0 = cy * CHT;
  for (let ty = y0; ty < y0 + CHT; ty++) for (let tx = x0; tx < x0 + CHT; tx++) drawTile(g, tx, ty);
  // shadows then buildings
  const bs = World.buildings.filter(b => b.x < x0 + CHT && b.x + b.w > x0 && b.y < y0 + CHT && b.y + b.h > y0);
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (const b of bs) if (b.kind !== 'high') g.fillRect(b.x * TS + 7, b.y * TS + 7, b.w * TS, b.h * TS);
  for (const b of bs) drawBuilding(g, b);
  // generic leftover solid tiles
  for (let ty = y0; ty < y0 + CHT; ty++) for (let tx = x0; tx < x0 + CHT; tx++) {
    const t = World.tiles[ty * MW + tx];
    if (t === T.BLD && !World.bmask[ty * MW + tx]) {
      g.fillStyle = '#4d4a47'; g.fillRect(tx * TS, ty * TS, TS, TS);
      g.fillStyle = '#5a5652'; g.fillRect(tx * TS + 3, ty * TS + 3, TS - 6, TS - 6);
    }
  }
  for (const tr of World.trees) if (tr.x >= x0 * TS - 20 && tr.x < (x0 + CHT) * TS + 20 && tr.y >= y0 * TS - 20 && tr.y < (y0 + CHT) * TS + 20) drawTree(g, tr);
  for (let ty = y0; ty < y0 + CHT; ty++) for (let tx = x0; tx < x0 + CHT; tx++) {
    const t = World.tiles[ty * MW + tx];
    if (t === T.FENCE) drawFence(g, tx, ty);
    else if (t === T.GATE) drawGate(g, tx, ty);
  }
  return c;
}

function drawTile(g, tx, ty) {
  const t = World.tiles[ty * MW + tx];
  const x = tx * TS, y = ty * TS;
  const reg = regionAt(tx, ty);
  if (t === T.HIGH || t === T.BLD) { g.fillStyle = '#26282d'; g.fillRect(x, y, TS, TS); return; }
  let col = GROUND[t] || '#555';
  if (reg === 'west' && t !== T.GATE) col = shade(col, -.18);
  g.fillStyle = col; g.fillRect(x, y, TS, TS);
  const h = (k) => hash2(tx, ty, k + World.seed);
  const ox = tx % 16, oy = ty % 16;
  if (t === T.ROAD || t === T.GATE) {
    for (let i = 0; i < 6; i++) { g.fillStyle = h(i) < .5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; g.fillRect(x + h(i + 10) * 30, y + h(i + 20) * 30, 2, 2); }
    if (t === T.ROAD) {
      const urban = reg === 'center' || reg === 'west' || reg === 'north';
      if (ox < 3 && oy >= 3) {
        if (ox === 1 && oy % 2 === 0) { g.fillStyle = 'rgba(214,190,90,.55)'; g.fillRect(x + TS / 2 - 1.5, y + 6, 3, 20); }
        if (urban && oy === 3) for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(230,230,230,.5)'; g.fillRect(x + 2 + i * 8, y + 4, 4, 24); }
      } else if (oy < 3 && ox >= 3) {
        if (oy === 1 && ox % 2 === 0) { g.fillStyle = 'rgba(214,190,90,.55)'; g.fillRect(x + 6, y + TS / 2 - 1.5, 20, 3); }
        if (urban && ox === 3) for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(230,230,230,.5)'; g.fillRect(x + 4, y + 2 + i * 8, 24, 4); }
      }
      if (h(40) < .02) { g.fillStyle = '#2c2e33'; g.beginPath(); g.arc(x + 16, y + 16, 7, 0, TAU); g.fill(); g.strokeStyle = '#4a4d53'; g.lineWidth = 1; g.stroke(); }
      if (h(41) < .05) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 8 + h(42) * 16, y + 8 + h(43) * 16, 6 + h(44) * 5, 4 + h(45) * 3, h(46) * 3, 0, TAU); g.fill(); }
      if (h(47) < .04) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + h(48) * 32, y); g.lineTo(x + 16, y + 16); g.lineTo(x + h(49) * 32, y + 32); g.stroke(); }
    }
  } else if (t === T.SIDE || t === T.FENCE) {
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
    g.strokeRect(x + .5, y + .5, 15, 15); g.strokeRect(x + 16.5, y + .5, 15, 15); g.strokeRect(x + .5, y + 16.5, 15, 15); g.strokeRect(x + 16.5, y + 16.5, 15, 15);
    if (h(3) < .15) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x + (h(4) < .5 ? 0 : 16), y + (h(5) < .5 ? 0 : 16), 16, 16); }
    if (h(6) < .08) drawWeed(g, x + h(7) * 28 + 2, y + h(8) * 28 + 2);
    // curb
    g.fillStyle = 'rgba(255,255,255,.18)';
    if (tileAt(tx - 1, ty) === T.ROAD) g.fillRect(x, y, 3, TS);
    if (tileAt(tx + 1, ty) === T.ROAD) g.fillRect(x + TS - 3, y, 3, TS);
    if (tileAt(tx, ty - 1) === T.ROAD) g.fillRect(x, y, TS, 3);
    if (tileAt(tx, ty + 1) === T.ROAD) g.fillRect(x, y + TS - 3, TS, 3);
  } else if (t === T.LOT || t === T.GRAVEL) {
    for (let i = 0; i < 10; i++) { g.fillStyle = h(i) < .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)'; g.fillRect(x + h(i + 10) * 30, y + h(i + 20) * 30, 2, 2); }
    if (h(30) < .12) drawWeed(g, x + h(31) * 26 + 3, y + h(32) * 26 + 3);
    if (h(33) < .05) { g.fillStyle = 'rgba(30,20,10,.3)'; g.beginPath(); g.ellipse(x + 16, y + 16, 9, 6, h(34) * 3, 0, TAU); g.fill(); }
    if (h(35) < .06) drawLitter(g, x, y, h);
  } else if (t === T.GRASS) {
    for (let i = 0; i < 7; i++) { g.fillStyle = h(i) < .5 ? '#5a7a42' : '#466133'; g.fillRect(x + h(i + 10) * 29, y + h(i + 20) * 28, 3, 4); }
    if (h(36) < .05) { g.fillStyle = ['#e8d46a', '#d86a6a', '#e0e0e0'][Math.floor(h(37) * 3)]; g.fillRect(x + h(38) * 26 + 3, y + h(39) * 26 + 3, 3, 3); }
  } else if (t === T.BASE) {
    if (ty <= 101 && tx <= 91) {
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, y, TS, TS);
      if (ty === 100) {
        const roof = typeof S !== 'undefined' && S && S.goals && S.goals.roof;
        g.fillStyle = roof ? '#7d858c' : '#3a6aa0'; g.fillRect(x, y - 2, TS, 12);
        g.fillStyle = roof ? '#9aa2a8' : '#4a7ab0'; g.fillRect(x, y - 2, TS, 3);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + 10, TS, 3);
        if (roof) { g.fillStyle = 'rgba(0,0,0,.2)'; for (let i = 4; i < TS; i += 6) g.fillRect(x + i, y - 2, 1, 12); }
        else if (tx % 3 === 0) { g.strokeStyle = '#c9b48a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, y + 10); g.lineTo(x + 2, y + 20); g.stroke(); }
      }
    }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, TS - 1, TS - 1);
    if (h(3) < .2) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(x + h(4) * 32, y + h(5) * 32); g.lineTo(x + h(6) * 32, y + h(7) * 32); g.stroke(); }
    if (h(8) < .1) { g.fillStyle = 'rgba(20,20,20,.18)'; g.beginPath(); g.ellipse(x + 16, y + 16, 8, 5, 0, 0, TAU); g.fill(); }
  } else if (t === T.TOXIC) {
    for (let i = 0; i < 8; i++) { g.fillStyle = h(i) < .5 ? 'rgba(160,200,60,.08)' : 'rgba(0,0,0,.14)'; g.fillRect(x + h(i + 10) * 30, y + h(i + 20) * 30, 3, 2); }
    if (h(30) < .14) { g.fillStyle = 'rgba(140,200,40,.35)'; g.beginPath(); g.ellipse(x + 16, y + 16, 6 + h(31) * 8, 4 + h(32) * 5, h(33) * 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(220,255,120,.25)'; g.fillRect(x + 12, y + 13, 3, 2); }
    if (h(34) < .1) drawLitter(g, x, y, h);
  } else if (t === T.RUBBLE) {
    for (let i = 0; i < 5; i++) { g.fillStyle = h(i) < .5 ? '#6a655f' : '#45423e'; const s = 3 + h(i + 5) * 6; g.fillRect(x + h(i + 10) * (TS - s), y + h(i + 20) * (TS - s), s, s * .7); }
    if (h(30) < .1) drawLitter(g, x, y, h);
  } else if (t === T.PLAZA) {
    g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x, y + i * 8 + .5); g.lineTo(x + TS, y + i * 8 + .5); g.stroke(); }
    for (let i = 0; i < 4; i++) { const off = (i % 2) * 8; g.beginPath(); g.moveTo(x + off + 4, y + i * 8); g.lineTo(x + off + 4, y + i * 8 + 8); g.moveTo(x + off + 20, y + i * 8); g.lineTo(x + off + 20, y + i * 8 + 8); g.stroke(); }
  }
}
function drawWeed(g, x, y) {
  g.strokeStyle = '#5d7d3c'; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(x, y + 5); g.lineTo(x - 3, y); g.moveTo(x, y + 5); g.lineTo(x + 1, y - 1); g.moveTo(x, y + 5); g.lineTo(x + 4, y + 1); g.stroke();
}
function drawLitter(g, x, y, h) {
  const cols = ['#d9d9d9', '#c94b4b', '#4b7bc9', '#d9c24b', '#8a6a4a'];
  for (let i = 0; i < 3; i++) { g.fillStyle = cols[Math.floor(h(50 + i) * cols.length)]; g.save(); g.translate(x + 4 + h(53 + i) * 24, y + 4 + h(56 + i) * 24); g.rotate(h(59 + i) * 3); g.fillRect(-2, -1, 5, 3); g.restore(); }
}
function drawTree(g, tr) {
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(tr.x + 6, tr.y + 7, tr.r, tr.r * .8, 0, 0, TAU); g.fill();
  g.fillStyle = '#5b3e24'; g.fillRect(tr.x - 2, tr.y - 2, 4, 8);
  const c1 = tr.s < .5 ? '#3f6b2e' : '#4b7a33';
  g.fillStyle = shade(c1, -.2); g.beginPath(); g.arc(tr.x, tr.y - 4, tr.r, 0, TAU); g.fill();
  g.fillStyle = c1; g.beginPath(); g.arc(tr.x - tr.r * .25, tr.y - tr.r * .45, tr.r * .75, 0, TAU); g.fill();
  g.fillStyle = shade(c1, .15); g.beginPath(); g.arc(tr.x - tr.r * .4, tr.y - tr.r * .65, tr.r * .35, 0, TAU); g.fill();
}
function drawFence(g, tx, ty) {
  const x = tx * TS, y = ty * TS;
  const vert = tileAt(tx, ty - 1) === T.FENCE || tileAt(tx, ty + 1) === T.FENCE || tileAt(tx, ty - 1) === T.GATE || tileAt(tx, ty + 1) === T.GATE;
  const horiz = tileAt(tx - 1, ty) === T.FENCE || tileAt(tx + 1, ty) === T.FENCE || tileAt(tx - 1, ty) === T.GATE || tileAt(tx + 1, ty) === T.GATE;
  const inBaseRing = tx >= 83 && tx <= 95 && ty >= 99 && ty <= 111;
  g.save();
  if (inBaseRing) {
    // corrugated sheet wall around the base
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 4, y + 4, TS, TS);
    const c = ((tx + ty) % 3 === 0) ? '#7a6048' : ((tx + ty) % 3 === 1 ? '#6b7278' : '#7d7258');
    g.fillStyle = c; g.fillRect(x + (horiz && !vert ? 0 : 6), y + (vert && !horiz ? 0 : 6), (horiz && !vert) ? TS : (vert && !horiz ? 20 : TS - 6), (vert && !horiz) ? TS : (horiz && !vert ? 20 : TS - 6));
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) { g.beginPath(); if (vert && !horiz) { g.moveTo(x + 6, y + i * 4 + 2); g.lineTo(x + 26, y + i * 4 + 2); } else { g.moveTo(x + i * 4 + 2, y + 6); g.lineTo(x + i * 4 + 2, y + 26); } g.stroke(); }
  } else {
    g.strokeStyle = 'rgba(190,195,200,.55)'; g.lineWidth = 1;
    if (vert || !horiz) {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 17, y + 3, 4, TS);
      for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(x + 13, y + i * 6); g.lineTo(x + 19, y + i * 6 + 6); g.moveTo(x + 19, y + i * 6); g.lineTo(x + 13, y + i * 6 + 6); g.stroke(); }
      g.fillStyle = '#9aa0a6'; g.fillRect(x + 13, y + 1, 6, 5); g.fillRect(x + 15, y, 2, TS);
    }
    if (horiz) {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 3, y + 17, TS, 4);
      for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(x + i * 6, y + 13); g.lineTo(x + i * 6 + 6, y + 19); g.moveTo(x + i * 6, y + 19); g.lineTo(x + i * 6 + 6, y + 13); g.stroke(); }
      g.fillStyle = '#9aa0a6'; g.fillRect(x, y + 15, TS, 2); g.fillRect(x + 1, y + 13, 5, 6);
    }
  }
  g.restore();
}
function drawGate(g, tx, ty) {
  const id = gateIdAt(tx, ty);
  const open = World.gateOpen[id];
  const x = tx * TS, y = ty * TS;
  const def = GATE_DEFS[id];
  const idx = def.tiles.findIndex(p => p[0] === tx && p[1] === ty);
  if (id === 'west') {
    if (!open) {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 6, y + 4, 26, 30);
      g.fillStyle = '#9b988f'; g.fillRect(x + 4, y + 2, 22, 28);
      g.fillStyle = '#b5b1a7'; g.fillRect(x + 6, y + 4, 18, 8);
      g.fillStyle = '#c8452f'; g.fillRect(x + 4, y + 16, 22, 4);
      g.fillStyle = '#6a665f'; for (let i = 0; i < 4; i++) g.fillRect(x + hash2(tx, i, 7) * 26, y + hash2(ty, i, 9) * 28, 5, 4);
    } else {
      g.fillStyle = '#6a665f'; for (let i = 0; i < 6; i++) g.fillRect(x + hash2(tx, i, 7) * 26, y + hash2(ty, i, 9) * 28, 5, 4);
    }
    return;
  }
  if (def.dir === 'v') {
    if (!open) {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 16, y + 3, 6, TS);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#1d1d1d' : '#e6b422'; g.fillRect(x + 12, y + i * 8, 7, 8); }
      if (idx === 1) { g.fillStyle = '#c9a227'; g.fillRect(x + 8, y + 12, 14, 10); g.strokeStyle = '#8a7a50'; g.lineWidth = 2; g.beginPath(); g.arc(x + 15, y + 12, 5, Math.PI, 0); g.stroke(); }
    } else {
      g.fillStyle = '#9aa0a6'; if (idx === 0) g.fillRect(x + 12, y, 7, 6); if (idx === 2) g.fillRect(x + 12, y + 26, 7, 6);
    }
  } else {
    g.fillStyle = '#9aa0a6'; if (idx === 0) g.fillRect(x, y + 12, 6, 8); if (idx === 2) g.fillRect(x + 26, y + 12, 6, 8);
    if (idx === 1 && id === 'south') {
      g.fillStyle = '#e6b422'; g.beginPath(); g.moveTo(x + 16, y - 10); g.lineTo(x + 26, y + 6); g.lineTo(x + 6, y + 6); g.closePath(); g.fill();
      g.fillStyle = '#1d1d1d'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('☣', x + 16, y + 5);
    }
  }
}

function drawBuilding(g, b) {
  const px = b.x * TS, py = b.y * TS, w = b.w * TS, h = b.h * TS;
  const r = mulberry32(b.s);
  if (b.kind === 'high') {
    g.fillStyle = b.col; g.fillRect(px, py, w, h);
    g.fillStyle = shade(b.col, -.25); g.fillRect(px + 10, py + 10, w - 20, h - 20);
    g.fillStyle = b.col; g.fillRect(px + 16, py + 16, w - 32, h - 32);
    for (let i = 0; i < 6; i++) { g.fillStyle = shade(b.col, .12); const s = 18 + r() * 30; g.fillRect(px + 30 + r() * (w - 90), py + 30 + r() * (h - 90), s, s * (.6 + r() * .6)); }
    if (r() < .4) { g.strokeStyle = 'rgba(230,200,60,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(px + w / 2, py + h / 2, 40, 0, TAU); g.stroke(); g.fillStyle = 'rgba(230,200,60,.35)'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', px + w / 2, py + h / 2); }
    return;
  }
  const face = Math.min(14, h * .3);
  const col = b.col;
  // front face with windows
  g.fillStyle = shade(col, -.42); g.fillRect(px, py + h - face, w, face);
  if (b.kind !== 'shed') {
    for (let wx = px + 5; wx < px + w - 8; wx += 11) {
      const lit = r() < .12;
      g.fillStyle = lit ? 'rgba(255,220,130,.6)' : 'rgba(20,28,36,.85)'; g.fillRect(wx, py + h - face + 3, 6, face - 6);
    }
  }
  // roof
  const rh = h - face;
  g.fillStyle = col; g.fillRect(px, py, w, rh);
  g.fillStyle = shade(col, .15); g.fillRect(px, py, w, 3); g.fillRect(px, py, 3, rh);
  g.fillStyle = shade(col, -.2); g.fillRect(px, py + rh - 3, w, 3); g.fillRect(px + w - 3, py, 3, rh);
  if (b.kind === 'house') {
    g.fillStyle = shade(col, -.12); g.fillRect(px + 3, py + rh / 2, w - 6, rh / 2 - 3);
    g.strokeStyle = shade(col, .25); g.lineWidth = 2; g.beginPath(); g.moveTo(px + 4, py + rh / 2); g.lineTo(px + w - 4, py + rh / 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
    for (let yy = py + 7; yy < py + rh - 3; yy += 6) { g.beginPath(); g.moveTo(px + 3, yy); g.lineTo(px + w - 3, yy); g.stroke(); }
    g.fillStyle = '#6b4a3a'; g.fillRect(px + w * (.2 + r() * .5), py + 4, 8, 10);
    if (r() < .5) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + 8 + r() * (w - 24), py + rh / 2 + 4, 10, 7); }
  } else if (b.kind === 'warehouse' || b.kind === 'shed') {
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;
    for (let xx = px + 6; xx < px + w - 3; xx += 6) { g.beginPath(); g.moveTo(xx, py + 3); g.lineTo(xx, py + rh - 3); g.stroke(); }
    if (b.kind === 'shed') { g.fillStyle = 'rgba(150,80,30,.35)'; for (let i = 0; i < 4; i++) g.fillRect(px + r() * (w - 12), py + r() * (rh - 10), 12, 8); }
    else for (let i = 0; i < Math.floor(w / 60); i++) { g.fillStyle = 'rgba(160,200,220,.45)'; g.fillRect(px + 20 + i * 60, py + rh / 2 - 12, 24, 24); }
  } else {
    // flat roof: AC units, vents, tanks
    g.strokeStyle = shade(col, -.25); g.lineWidth = 2; g.strokeRect(px + 6, py + 6, w - 12, rh - 12);
    const n = 1 + Math.floor(r() * (w * h / 9000));
    for (let i = 0; i < n; i++) {
      const ax = px + 12 + r() * (w - 36), ay = py + 12 + r() * (rh - 34);
      const k = r();
      if (k < .5) { g.fillStyle = '#9aa0a6'; g.fillRect(ax, ay, 16, 14); g.fillStyle = '#5b6066'; g.beginPath(); g.arc(ax + 8, ay + 7, 5, 0, TAU); g.fill(); }
      else if (k < .75) { g.fillStyle = '#7b7f84'; g.beginPath(); g.arc(ax + 8, ay + 8, 8, 0, TAU); g.fill(); g.fillStyle = '#5b5f64'; g.beginPath(); g.arc(ax + 8, ay + 8, 4, 0, TAU); g.fill(); }
      else { g.fillStyle = shade(col, -.3); g.fillRect(ax, ay, 12, 12); g.fillStyle = shade(col, .2); g.fillRect(ax + 2, ay + 2, 8, 3); }
    }
    if (b.kind === 'tower' && r() < .35) { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(px + w * .3 + r() * w * .4, py + rh * .5, 14, 10, r() * 3, 0, TAU); g.fill(); }
    if (b.kind === 'dealer') {
      g.fillStyle = '#c8452f'; g.fillRect(px + 10, py + 14, w - 20, 26);
      g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText("RUSTY'S", px + w / 2, py + 22); g.font = 'bold 10px sans-serif'; g.fillText('SCRAP • HURDA', px + w / 2, py + 34);
      g.textBaseline = 'alphabetic';
    }
    if (b.kind === 'kiosk') {
      g.fillStyle = '#2f7d4f'; g.fillRect(px + 10, py + 10, w - 20, 22);
      g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CORNER SHOP', px + w / 2, py + 21); g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(230,80,60,.9)'; for (let i = 0; i < 6; i++) g.fillRect(px + 12 + i * ((w - 24) / 6), py + rh - 8, (w - 24) / 12, 8);
    }
  }
}

// Minimap source: 1px per tile
function buildMapCanvas() {
  const c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const g = c.getContext('2d'); const img = g.createImageData(MW, MH);
  const cols = {
    [T.HIGH]: [30, 32, 36], [T.BLD]: [70, 72, 78], [T.ROAD]: [58, 60, 66], [T.SIDE]: [120, 118, 112], [T.LOT]: [110, 96, 78],
    [T.GRASS]: [79, 107, 58], [T.FENCE]: [170, 170, 170], [T.GATE]: [230, 180, 40], [T.BASE]: [210, 150, 60], [T.TOXIC]: [110, 130, 50],
    [T.RUBBLE]: [80, 78, 74], [T.GRAVEL]: [105, 104, 98], [T.PLAZA]: [150, 145, 135],
  };
  for (let i = 0; i < MW * MH; i++) {
    const cc = cols[World.tiles[i]] || [0, 0, 0];
    img.data[i * 4] = cc[0]; img.data[i * 4 + 1] = cc[1]; img.data[i * 4 + 2] = cc[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  World.mapCanvas = c;
}
function invalidateChunksNear(tx, ty) {
  const cx = Math.floor(tx / CHT), cy = Math.floor(ty / CHT);
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) World.chunkCache.delete(x + ',' + y);
}
