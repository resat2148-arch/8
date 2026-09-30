'use strict';
// ---------- Core game state & simulation ----------
const SAVE_KEY = 'urbanscrap_save_v1';
const PREF_KEY = 'urbanscrap_prefs';
let S = null;

const Game = {
  state: 'title', paused: false, time: 0, darkness: 0, player: null, dogs: [], particles: [], floaters: [],
  target: null, action: null, attackT: 0, swingT: 0, hurtT: 0, dogSpawnT: 5, saveT: 0, questT: 0, fogT: 0,
  curRegion: 'center', explored: null, hintT: {}, toxicT: 0, dead: false, lastSprint: false, pileNodes: [],
};

function newState() {
  return {
    v: 1, gen: GEN_VERSION, seed: (Math.random() * 1e9) | 0, savedAt: 0,
    totalMin: 7 * 60, lastDay: 1,
    p: { x: BASE_SPAWN.x, y: BASE_SPAWN.y, hp: 100, hunger: 80, thirst: 70, energy: 90 },
    cash: 10, xp: 0, level: 1, perkPts: 0, perks: {},
    inv: { water: 1, bread: 1 }, stash: {},
    tools: {}, gear: { bag: null, cart: null },
    builds: { workbench: 1, stash: 1, campfire: 1 },
    machines: {}, yields: { rainbarrel: 0, garden: 0 },
    nodes: {}, piles: [], explored: '', quest: 0,
    contracts: [], market: null, collection: {}, goals: {},
    stats: {}, status: { sickUntil: 0 },
    weather: 'clear', flags: {}, visited: { center: true },
    adBoost: false, adBoostDay: 0, reviveUsed: 0,
  };
}

// ---------- helpers ----------
const day = () => Math.floor(S.totalMin / 1440) + 1;
const tod = () => S.totalMin % 1440;
const isNight = () => { const t = tod(); return t >= 21 * 60 || t < 5 * 60; };
const perk = k => S.perks[k] || 0;
const setDone = reg => Object.keys(COLLECTIBLES).filter(k => COLLECTIBLES[k].d === reg).every(k => S.collection[k]);
function stat(k, n) { S.stats[k] = (S.stats[k] || 0) + (n === undefined ? 1 : n); }
function maxHp() { return 100 + perk('tough') * 10; }
function capacity() {
  return bagCapOf(S) + (S.gear.cart ? CRAFT[S.gear.cart].cap : 0) + perk('mule') * 5 + (setDone('north') ? 10 : 0);
}
function invWeight() { let w = 0; for (const k in S.inv) w += (ITEMS[k] ? ITEMS[k].w : 0) * S.inv[k]; return w; }
function nearHome() { const p = Game.player; return p && inBase(p.x, p.y, 13); }
function have(k) { return (S.inv[k] || 0) + (nearHome() ? (S.stash[k] || 0) : 0); }
function canAfford(cost, cash) {
  if ((cash || 0) > S.cash) return false;
  for (const k in cost) if (have(k) < cost[k]) return false;
  return true;
}
function take(k, n) {
  let fromStash = nearHome() ? Math.min(n, S.stash[k] || 0) : 0;
  if (fromStash) { S.stash[k] -= fromStash; if (!S.stash[k]) delete S.stash[k]; n -= fromStash; }
  if (n > 0) { S.inv[k] = (S.inv[k] || 0) - n; if (S.inv[k] <= 0) delete S.inv[k]; }
}
function pay(cost, cash) { for (const k in cost) take(k, cost[k]); S.cash -= (cash || 0); }
function addInv(k, n) {
  const w = ITEMS[k].w, free = capacity() - invWeight();
  const fit = w > 0 ? Math.max(0, Math.min(n, Math.floor((free + 1e-6) / w))) : n;
  if (fit > 0) S.inv[k] = (S.inv[k] || 0) + fit;
  return fit;
}
function addStash(k, n) { S.stash[k] = (S.stash[k] || 0) + n; }
function searchSpeed() {
  let m = 1 + (S.gear.gloves ? .2 : 0) + perk('quick') * .1 + (setDone('center') ? .1 : 0);
  if (S.p.energy < 12) m *= .6;
  return m;
}
function machineSpeed(key) {
  const m = S.machines[key]; if (!m) return 0;
  return MACHINE_SPD[m.lvl] * (1 + perk('engineer') * .1) * (S.builds.solar ? 1.3 : 1) * (setDone('east') ? 1.15 : 1) * (S.goals.workshop ? 1.5 : 1);
}
function sellMult() {
  return 1 + perk('haggle') * .04 + (setDone('south') ? .1 : 0) + (S.goals.license ? .15 : 0);
}
function unitPrice(k, remote) {
  const it = ITEMS[k]; if (!it || !it.p) return 0;
  let p = it.p;
  if (S.market && S.market.mult[k]) p *= S.market.mult[k];
  if (S.market && S.market.hot === k) p *= 1.5;
  p *= sellMult();
  if (S.adBoost) p *= 1.5;
  if (remote) p *= .85;
  return Math.max(1, Math.round(p));
}
function bestToolDmg() { let d = 6; for (const k of TOOL_ORDER) if (S.tools[k]) d = Math.max(d, CRAFT[k].dmg); return d; }
function lightRadius() {
  let r = S.gear.headlamp ? 270 : 125;
  if (Game.curRegion === 'west' && !S.gear.headlamp) r = 80;
  return r * (1 + perk('owl') * .12);
}
function xpNeed(l) { return Math.floor(60 * Math.pow(1.32, l - 1)); }
function addXP(n) {
  n = Math.round(n * (setDone('west') ? 1.25 : 1));
  S.xp += n;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level); S.level++; S.perkPts++;
    Sfx.play('level');
    UI.banner('⭐ ' + t('levelUp', S.level), t('perkPoint'));
    if (S.level % 5 === 0) SDK.happytime();
  }
}
function hint(key, text, cooldownSec) {
  const now = Game.time;
  if (Game.hintT[key] && now - Game.hintT[key] < (cooldownSec || 60)) return;
  Game.hintT[key] = now;
  UI.toast(text, 'hint');
}
function floater(x, y, text, col) { Game.floaters.push({ x, y, text, col: col || '#fff', life: 1.6, max: 1.6 }); }
function burst(x, y, col, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = (spd || 60) * (.4 + Math.random());
    Game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: .5 + Math.random() * .4, max: .9, col, size: 2 + Math.random() * 2.5 });
  }
}

// ---------- setup ----------
function startGame(state) {
  S = state;
  if (S.gen !== GEN_VERSION) { S.nodes = {}; S.piles = []; S.gen = GEN_VERSION; }
  if (!World.tiles || World.seed !== S.seed) genWorld(S.seed);
  World.gateOpen.east = !!S.flags.gate_east; World.gateOpen.west = !!S.flags.gate_west; World.gateOpen.south = true;
  World.chunkCache.clear();
  // clean dynamic piles and restore saved ones
  for (const n of Game.pileNodes) removeDynNode(n);
  Game.pileNodes = [];
  for (const pl of S.piles) Game.pileNodes.push(addDynNode({ type: 'pile', x: pl.x, y: pl.y, items: pl.items, reg: regionAt((pl.x / TS) | 0, (pl.y / TS) | 0) }));
  Game.player = { x: S.p.x, y: S.p.y, face: Math.PI / 2, walkT: 0, moving: false };
  if (isSolid(Math.floor(S.p.x / TS), Math.floor(S.p.y / TS))) { Game.player.x = BASE_SPAWN.x; Game.player.y = BASE_SPAWN.y; }
  Game.dogs = []; Game.particles = []; Game.floaters = []; Game.action = null; Game.dead = false;
  Game.explored = new Uint8Array(48 * 48);
  if (S.explored && S.explored.length === 48 * 48) for (let i = 0; i < 48 * 48; i++) Game.explored[i] = S.explored.charCodeAt(i) === 49 ? 1 : 0;
  Game.curRegion = regionAt((Game.player.x / TS) | 0, (Game.player.y / TS) | 0) || 'center';
  if (!S.market) updateMarket();
  if (!S.contracts.length) refreshContracts();
  Game.state = 'play';
  Game.dumpNode = null;
  if (S.event) placeDumpNode();
  Sfx.setRain(S.weather === 'rain');
  offlineProgress();
  revealFog(true);
  UI.onStart();
  dailyBonus();
}
function offlineProgress() {
  if (!S.savedAt) return;
  const realSec = (Date.now() - S.savedAt) / 1000;
  if (realSec < 60) return;
  const gm = Math.min(8 * 60, realSec * MIN_PER_SEC);
  const before = snapshotOut();
  advanceMachines(gm);
  const diff = diffOut(before);
  if (diff.length) UI.toast(t('whileAway') + ' ' + diff.map(([k, n]) => '+' + n + ITEMS[k].i).join(' '), 'good');
}

function saveGame() {
  if (!S || Game.state !== 'play' || Game.dead) return;
  S.p.x = Game.player.x; S.p.y = Game.player.y;
  let s = ''; for (let i = 0; i < Game.explored.length; i++) s += Game.explored[i] ? '1' : '0';
  S.explored = s;
  S.piles = Game.pileNodes.filter(n => Object.keys(n.items).length).map(n => ({ x: n.x, y: n.y, items: n.items }));
  S.savedAt = Date.now();
  SDK.save(SAVE_KEY, JSON.stringify(S));
}
function loadSave() {
  const raw = SDK.load(SAVE_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    const base = newState();
    for (const k in base) if (d[k] === undefined) d[k] = base[k];
    return d;
  } catch (e) { return null; }
}

// ---------- economy ----------
function updateMarket() {
  const prev = S.market ? S.market.mult : {};
  const mult = {};
  const keys = Object.keys(ITEMS).filter(k => ITEMS[k].c === 'raw' || ITEMS[k].c === 'ref');
  for (const k of keys) {
    const p = prev[k] || 1;
    mult[k] = Math.round(clamp(p + (Math.random() - .5) * .3 + (1 - p) * .3, .7, 1.35) * 100) / 100;
  }
  const hotPool = keys.filter(k => k !== 'gold' && k !== 'magnet');
  S.market = { mult, hot: hotPool[Math.floor(Math.random() * hotPool.length)], day: day() };
}
function refreshContracts() {
  const d = day();
  S.contracts = S.contracts.filter(c => c.exp >= d && !c.done);
  const known = Object.keys(ITEMS).filter(k => (ITEMS[k].c === 'raw' || ITEMS[k].c === 'ref') && ((S.stats['got_' + k] || 0) + (S.stats['made_' + k] || 0) > 0));
  const pool = known.length >= 3 ? known : ['plastic', 'paper', 'can', 'glass'];
  let guard = 0;
  while (S.contracts.length < 3 && guard++ < 20) {
    const k = pool[Math.floor(Math.random() * pool.length)];
    if (S.contracts.some(c => c.item === k)) continue;
    const qty = clamp(Math.round((35 + S.level * 14) / ITEMS[k].p), 3, 80);
    const reward = Math.round(qty * ITEMS[k].p * (1.7 + Math.random() * .5));
    S.contracts.push({ item: k, qty, reward, xp: Math.round(reward / 4) + 10, exp: d + 2 });
  }
}
function deliverContract(i) {
  const c = S.contracts[i];
  if (!c || have(c.item) < c.qty) return false;
  take(c.item, c.qty);
  S.cash += c.reward; addXP(c.xp); stat('contracts'); stat('earned', c.reward);
  S.contracts.splice(i, 1);
  Sfx.play('cash');
  UI.toast(t('contractDone', fmtMoney(c.reward)), 'good');
  return true;
}
function sellItem(k, n, remote) {
  const avail = remote ? (S.inv[k] || 0) : have(k);
  n = Math.min(n, avail);
  if (n <= 0) return 0;
  const price = unitPrice(k, remote) * n;
  if (remote) { S.inv[k] -= n; if (!S.inv[k]) delete S.inv[k]; }
  else {
    const fromInv = Math.min(n, S.inv[k] || 0);
    if (fromInv) { S.inv[k] -= fromInv; if (!S.inv[k]) delete S.inv[k]; }
    if (n - fromInv > 0) { S.stash[k] -= n - fromInv; if (!S.stash[k]) delete S.stash[k]; }
  }
  S.cash += price; stat('earned', price); stat('sales');
  addXP(Math.max(1, Math.round(price / 12)));
  if (S.adBoost) S.adBoost = false;
  return price;
}
function buyItem(k, n) {
  const it = ITEMS[k]; const cost = it.buy * n;
  if (S.cash < cost) return false;
  S.cash -= cost;
  const fit = addInv(k, n);
  if (fit < n) addStash(k, n - fit);
  stat('bought', n);
  return true;
}

// ---------- consumption ----------
function consume(k) {
  const it = ITEMS[k];
  if (!it || !it.eat || !(S.inv[k] > 0)) return false;
  S.inv[k]--; if (!S.inv[k]) delete S.inv[k];
  const e = it.eat, p = S.p;
  if (e.hunger) p.hunger = clamp(p.hunger + e.hunger, 0, 100);
  if (e.thirst) p.thirst = clamp(p.thirst + e.thirst, 0, 100);
  if (e.energy) p.energy = clamp(p.energy + e.energy, 0, 100);
  if (e.hp) p.hp = clamp(p.hp + e.hp, 0, maxHp());
  if (it.cure) S.status.sickUntil = 0;
  if (it.sick && Math.random() < it.sick * (1 - perk('stomach') * .3)) getSick();
  Sfx.play(e.thirst > e.hunger || !e.hunger ? 'drink' : 'eat');
  stat('consumed');
  floater(Game.player.x, Game.player.y - 30, it.i, '#fff');
  return true;
}
function getSick() {
  S.status.sickUntil = S.totalMin + 6 * 60;
  UI.toast(t('gotSick'), 'bad');
}
const QUICK = [
  ['stew', 'canned', 'veg', 'bread', 'scraps'],
  ['water', 'dirty'],
  ['bandage', 'medicine'],
  ['energy'],
];
function quickUse(slot) {
  let list = QUICK[slot];
  if (slot === 2 && S.status.sickUntil > S.totalMin) list = ['medicine', 'bandage'];
  for (const k of list) if (S.inv[k] > 0) { consume(k); return; }
  Sfx.play('deny');
  UI.toast(t('noneInBag'), 'bad');
}

// ---------- crafting & building ----------
function craftItem(key) {
  const r = CRAFT[key];
  if (!canAfford(r.cost, r.cash) || ownsCraft(key)) { Sfx.play('deny'); return false; }
  pay(r.cost, r.cash);
  if (r.kind === 'tool') S.tools[key] = 1;
  else if (r.kind === 'gear') S.gear[key] = 1;
  else if (r.kind === 'bag') S.gear.bag = key;
  else if (r.kind === 'cart') S.gear.cart = key;
  stat('crafted');
  addXP(20 + Math.round((r.cash || 0) / 5));
  Sfx.play('craft');
  UI.banner(r.i + ' ' + L(r.n), t('crafted'));
  saveGame();
  return true;
}
function ownsCraft(key) {
  const r = CRAFT[key];
  if (r.kind === 'tool') return !!S.tools[key];
  if (r.kind === 'gear') return !!S.gear[key];
  if (r.kind === 'bag') return S.gear.bag === key || (key === 'backpack' && S.gear.bag === 'hikingpack');
  if (r.kind === 'cart') return S.gear.cart === key || (key === 'cart' && S.gear.cart === 'trike');
  return false;
}
function buildStructure(key) {
  const b = BUILDS[key];
  if (key !== 'bed' && S.builds[key]) return false;
  if (key === 'bed' && S.builds.bed) return false;
  if (!canAfford(b.cost, b.cash)) { Sfx.play('deny'); return false; }
  pay(b.cost, b.cash);
  S.builds[key] = 1;
  if (b.m) S.machines[key] = { lvl: 1, sel: 0, q: 0, prog: 0, out: {} };
  stat('built');
  addXP(30 + Math.round((b.cash || 0) / 4));
  Sfx.play('craft');
  burst(STATION_POS[key][0] * TS, STATION_POS[key][1] * TS, '#f5c542', 24, 90);
  UI.banner(b.i + ' ' + L(b.n), t('built'));
  saveGame();
  return true;
}
function upgradeMachine(key) {
  const m = S.machines[key]; const up = MACHINE_UP[m.lvl];
  if (!up || !canAfford(up.cost, up.cash)) { Sfx.play('deny'); return false; }
  pay(up.cost, up.cash); m.lvl++;
  addXP(40 * m.lvl); Sfx.play('craft');
  UI.toast(t('machineUp', L(BUILDS[key].n), m.lvl), 'good');
  return true;
}
function loadMachine(key, batches) {
  const m = S.machines[key]; const r = BUILDS[key].m[m.sel];
  const cap = 40 * m.lvl - m.q;
  let can = Math.min(batches, cap);
  for (const k in r.in) can = Math.min(can, Math.floor(have(k) / r.in[k]));
  if (can <= 0) { Sfx.play('deny'); return 0; }
  for (const k in r.in) take(k, r.in[k] * can);
  m.q += can;
  Sfx.play('metal');
  return can;
}
function collectMachine(key) {
  const m = S.machines[key]; let total = 0;
  for (const k in m.out) {
    const n = m.out[k]; if (!n) continue;
    addStash(k, n); stat('made_' + k, n); total += n;
    floater(STATION_POS[key][0] * TS, STATION_POS[key][1] * TS - 20 - total, '+' + n + ' ' + ITEMS[k].i, '#9fe870');
  }
  m.out = {};
  if (total) { addXP(Math.ceil(total * .8)); Sfx.play('collect'); }
  return total;
}
function setRecipe(key, i) {
  const m = S.machines[key];
  if (m.q > 0) return false;
  m.sel = i; m.prog = 0; return true;
}
function advanceMachines(dm) {
  for (const key in S.machines) {
    const m = S.machines[key]; if (!m.q) { m.prog = 0; continue; }
    const r = BUILDS[key].m[m.sel];
    m.prog += dm * machineSpeed(key);
    while (m.prog >= r.t && m.q > 0) {
      m.prog -= r.t; m.q--;
      for (const k in r.out) m.out[k] = (m.out[k] || 0) + r.out[k];
      if (r.bonus && Math.random() < r.bonus[1] * (1 + perk('luck') * .2)) m.out[r.bonus[0]] = (m.out[r.bonus[0]] || 0) + 1;
    }
    if (!m.q) m.prog = 0;
  }
}
function snapshotOut() { const o = {}; for (const k in S.machines) for (const i in S.machines[k].out) o[i] = (o[i] || 0) + S.machines[k].out[i]; return o; }
function diffOut(before) {
  const after = snapshotOut(); const res = [];
  for (const k in after) { const d = after[k] - (before[k] || 0); if (d > 0) res.push([k, d]); }
  return res;
}
function fundGoal(id) {
  const g = GOALS.find(x => x.id === id);
  const idx = GOALS.indexOf(g);
  if (S.goals[id] || (idx > 0 && !S.goals[GOALS[idx - 1].id])) return false;
  if (!canAfford(g.cost, g.cash)) { Sfx.play('deny'); return false; }
  pay(g.cost, g.cash); S.goals[id] = 1;
  addXP(100 + g.cash / 20);
  Sfx.play('level'); SDK.happytime();
  UI.banner(g.i + ' ' + L(g.n), t('goalDone'));
  if (id === 'plant') setTimeout(() => UI.victory(), 1200);
  if (id === 'roof') invalidateChunksNear(88, 100);
  saveGame();
  return true;
}
function perkUp(k) {
  if (S.perkPts <= 0 || perk(k) >= PERKS[k].max) return false;
  S.perks[k] = perk(k) + 1; S.perkPts--;
  if (k === 'tough') S.p.hp = Math.min(maxHp(), S.p.hp + 10);
  Sfx.play('collect');
  return true;
}

// ---------- stash ----------
function depositAll(cat) {
  let n = 0;
  for (const k of Object.keys(S.inv)) {
    const c = ITEMS[k].c;
    if (cat === 'mat' ? (c === 'raw' || c === 'ref') : true) { addStash(k, S.inv[k]); n += S.inv[k]; delete S.inv[k]; }
  }
  if (n) Sfx.play('collect');
  return n;
}
function moveItem(k, n, toStash) {
  if (toStash) { n = Math.min(n, S.inv[k] || 0); if (!n) return; S.inv[k] -= n; if (!S.inv[k]) delete S.inv[k]; addStash(k, n); }
  else {
    n = Math.min(n, S.stash[k] || 0); if (!n) return;
    const fit = addInv(k, n);
    if (!fit) { UI.toast(t('bagFull'), 'bad'); Sfx.play('deny'); return; }
    S.stash[k] -= fit; if (!S.stash[k]) delete S.stash[k];
  }
  Sfx.play('click');
}
function dropItem(k, n) {
  n = Math.min(n, S.inv[k] || 0); if (!n) return;
  S.inv[k] -= n; if (!S.inv[k]) delete S.inv[k];
  spawnPile(Game.player.x, Game.player.y + 6, { [k]: n });
}
function spawnPile(x, y, items) {
  // merge into a nearby pile if possible
  for (const n of Game.pileNodes) if (dist2(n.x, n.y, x, y) < 30 * 30) { for (const k in items) n.items[k] = (n.items[k] || 0) + items[k]; return n; }
  const n = addDynNode({ type: 'pile', x, y, items: Object.assign({}, items), reg: regionAt((x / TS) | 0, (y / TS) | 0) });
  Game.pileNodes.push(n);
  return n;
}

// ---------- searching ----------
function nodeLooted(n) {
  if (n.type === 'pile' || NODES[n.type].water) return false;
  const r = S.nodes[n.id];
  if (!r) return false;
  if (r <= S.totalMin) { delete S.nodes[n.id]; return false; }
  return true;
}
function searchTime(n) {
  const d = NODES[n.type];
  return d.t / searchSpeed();
}
function completeSearch(n) {
  const d = NODES[n.type];
  const p = Game.player;
  if (n.type === 'pile') {
    let left = false;
    for (const k of Object.keys(n.items)) {
      const fit = addInv(k, n.items[k]);
      if (fit) floater(n.x, n.y - 20, '+' + fit + ' ' + ITEMS[k].i, '#fff');
      n.items[k] -= fit; if (!n.items[k]) delete n.items[k]; else left = true;
    }
    Sfx.play('loot');
    if (left) UI.toast(t('bagFull'), 'bad');
    else { removeDynNode(n); Game.pileNodes.splice(Game.pileNodes.indexOf(n), 1); }
    return;
  }
  if (n.type === 'dump') {
    let i = 0, left = false;
    for (const k of Object.keys(n.items)) {
      const fit = addInv(k, n.items[k]); stat('got_' + k, fit);
      if (fit) floater(n.x + (i % 2 ? 12 : -12), n.y - 22 - i * 13, '+' + fit + ' ' + ITEMS[k].i, '#ffd76a');
      n.items[k] -= fit; if (!n.items[k]) delete n.items[k]; else left = true; i++;
    }
    Sfx.play('rare');
    if (left) { UI.toast(t('bagFull'), 'bad'); return; }
    if (Math.random() < .25 * (1 + perk('luck') * .2)) {
      const pool = Object.keys(COLLECTIBLES).filter(k => COLLECTIBLES[k].d === n.reg && !S.collection[k]);
      if (pool.length) { const k = pool[Math.floor(Math.random() * pool.length)]; S.collection[k] = 1; stat('collectibles'); addXP(40); UI.collectible(k); }
    }
    addXP(NODES.dump.xp); stat('dumps');
    S.event = null; clearDumpNode();
    burst(n.x, n.y, '#ffd76a', 20, 100);
    return;
  }
  if (d.water) {
    S.p.thirst = clamp(S.p.thirst + 30, 0, 100);
    Sfx.play('drink');
    floater(n.x, n.y - 24, '+30 💧', '#6cc4ff');
    if (Math.random() < .12 * (1 - perk('stomach') * .3)) getSick();
    const fit = addInv('dirty', 1);
    if (fit) floater(n.x, n.y - 40, '+1 ' + ITEMS.dirty.i, '#ccc');
    stat('drank');
    return;
  }
  const luck = 1 + perk('luck') * .2;
  const got = {};
  for (const [k, mn, mx, ch] of d.loot) {
    const c = ch <= .35 ? ch * luck : ch;
    if (Math.random() < c) { const q = mn + Math.floor(Math.random() * (mx - mn + 1)); if (q > 0) got[k] = (got[k] || 0) + q; }
  }
  if (Object.keys(got).length === 0) got[d.loot[0][0]] = Math.max(1, d.loot[0][1]);
  let cash = 0;
  if (d.cash && Math.random() < d.cash[2]) cash = d.cash[0] + Math.floor(Math.random() * (d.cash[1] - d.cash[0] + 1));
  // collectible
  if (Math.random() < .012 * (d.col || 1) * luck) {
    const pool = Object.keys(COLLECTIBLES).filter(k => COLLECTIBLES[k].d === n.reg);
    if (pool.length) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      const c = COLLECTIBLES[k];
      if (!S.collection[k]) {
        S.collection[k] = 1; stat('collectibles');
        Sfx.play('rare'); addXP(40);
        UI.collectible(k);
        if (setDone(c.d)) { UI.banner('🏆 ' + L(SETS[c.d].n), L(SETS[c.d].b)); SDK.happytime(); }
      } else {
        cash += Math.round(c.v / 2);
        UI.toast(t('duplicate', c.i + ' ' + L(c.n), fmtMoney(c.v / 2)), 'good');
      }
    }
  }
  let overflow = null, i = 0;
  for (const k in got) {
    const fit = addInv(k, got[k]);
    stat('got_' + k, got[k]);
    if (fit) floater(n.x + (i % 2 ? 12 : -12), n.y - 22 - i * 13, '+' + fit + ' ' + ITEMS[k].i, ITEMS[k].p >= 20 ? '#ffd76a' : '#fff');
    if (fit < got[k]) { overflow = overflow || {}; overflow[k] = got[k] - fit; }
    if (ITEMS[k].p >= 40) Sfx.play('rare');
    i++;
  }
  if (cash) { S.cash += cash; floater(n.x, n.y - 22 - i * 13, '+' + fmtMoney(cash), '#7dff7a'); Sfx.play('cash'); stat('earned', cash); }
  if (overflow) {
    spawnPile(p.x + (Math.random() - .5) * 20, p.y + 14, overflow);
    UI.toast(t('bagFullDrop'), 'bad');
  }
  S.nodes[n.id] = S.totalMin + d.resp * 60 * (.8 + Math.random() * .4);
  stat('searched'); stat('s_' + n.type);
  addXP(d.xp);
  Sfx.play('loot');
  burst(n.x, n.y, '#b9a27a', 10, 70);
}

// ---------- interactions ----------
function materialKnown(k) { return (S.stats['got_' + k] || 0) + (S.stats['made_' + k] || 0) > 0 || (S.inv[k] || 0) + (S.stash[k] || 0) > 0; }
function blueprintVisible(k) { return Object.keys(BUILDS[k].cost).every(materialKnown); }
function checkBlueprints() {
  for (const k in BUILDS) {
    if (k === 'bed' || S.builds[k] || S.flags['bp_' + k]) continue;
    if (blueprintVisible(k)) { S.flags['bp_' + k] = 1; UI.toast('📐 ' + t('newBlueprint', BUILDS[k].i + ' ' + L(BUILDS[k].n)), 'hint'); }
  }
}
function stationList() {
  const list = [];
  const add = (key, kind) => { const pos = STATION_POS[key]; list.push({ key, kind, x: pos[0] * TS, y: pos[1] * TS }); };
  add('bed', 'bed'); add('stash', 'stash'); add('workbench', 'workbench');
  for (const k in BUILDS) {
    if (k === 'bed') continue;
    if (!S.builds[k]) { if (S.flags['bp_' + k]) add(k, 'blueprint'); }
    else if (BUILDS[k].m) add(k, 'machine');
    else if (k === 'rainbarrel' || k === 'garden') add(k, 'yield');
  }
  if (S.goals.van) add('van', 'van');
  return list;
}
function findTarget() {
  const p = Game.player;
  let best = null, bd = 46 * 46;
  const consider = (o) => { const d = dist2(p.x, p.y, o.x, o.y); if (d < bd) { bd = d; best = o; } };
  for (const n of nodesNear(p.x, p.y, 80)) consider({ kind: 'node', node: n, x: n.x, y: n.y });
  if (inBase(p.x, p.y, 2)) for (const s of stationList()) consider(s);
  consider({ kind: 'dealer', x: DEALER_POS.x, y: DEALER_POS.y });
  consider({ kind: 'shop', x: SHOP_POS.x, y: SHOP_POS.y });
  consider({ kind: 'board', x: BOARD_POS.x, y: BOARD_POS.y });
  for (const id in World.gates) {
    const g = World.gates[id];
    if (!World.gateOpen[id]) consider({ kind: 'gate', id, x: g.x + (id === 'east' ? -20 : id === 'west' ? 20 : 0), y: g.y });
    else if (S.goals.van) consider({ kind: 'vanstop', id, x: GATE_DEFS[id].out.x, y: GATE_DEFS[id].out.y });
  }
  return best;
}
function interact() {
  const tg = Game.target;
  if (!tg || Game.action) return;
  Sfx.init();
  if (tg.kind === 'node') {
    const n = tg.node, d = NODES[n.type];
    if (nodeLooted(n)) { Sfx.play('deny'); hint('looted', t('looted', respawnText(n)), 3); return; }
    if (d.tool && !S.tools[d.tool]) { Sfx.play('deny'); UI.toast(t('needTool', CRAFT[d.tool].i + ' ' + L(CRAFT[d.tool].n)), 'bad'); return; }
    if (n.type !== 'pile' && !d.water && invWeight() >= capacity() - .15) { Sfx.play('deny'); hint('full', t('bagFull'), 3); return; }
    Game.action = { kind: 'search', node: n, t: 0, need: searchTime(n), tick: 0 };
  } else if (tg.kind === 'gate') {
    const g = World.gates[tg.id];
    if (g.req && !S.tools[g.req]) { Sfx.play('deny'); UI.toast(t('gateNeed', CRAFT[g.req].i + ' ' + L(CRAFT[g.req].n)), 'bad'); return; }
    Game.action = { kind: 'gate', id: tg.id, t: 0, need: 4, tick: 0, x: tg.x, y: tg.y };
  } else if (tg.kind === 'vanstop') {
    UI.openPanel('van');
  } else {
    UI.openStation(tg);
  }
}
function respawnText(n) {
  const r = S.nodes[n.id]; if (!r) return '';
  const h = Math.max(1, Math.ceil((r - S.totalMin) / 60));
  return h >= 24 ? Math.ceil(h / 24) + t('dShort') : h + t('hShort');
}
function updateAction(dt) {
  const a = Game.action; if (!a) return;
  const p = Game.player;
  const tx = a.kind === 'search' ? a.node.x : a.x, ty = a.kind === 'search' ? a.node.y : a.y;
  if (dist2(p.x, p.y, tx, ty) > 60 * 60 || p.moving) { Game.action = null; return; }
  a.t += dt;
  a.tick -= dt;
  S.p.energy -= .2 * dt;
  if (a.tick <= 0) {
    a.tick = .3;
    const tool = a.kind === 'gate' || (a.node && NODES[a.node.type].tool);
    Sfx.play(tool ? 'metal' : 'rustle');
    burst(tx + (Math.random() - .5) * 16, ty - 4, tool ? '#ffcc66' : '#a89070', 3, 50);
  }
  p.face = Math.atan2(ty - p.y, tx - p.x);
  if (a.t >= a.need) {
    Game.action = null;
    if (a.kind === 'search') { completeSearch(a.node); Game.lastLootT = Game.time; }
    else if (a.kind === 'gate') openGate(a.id);
  }
}
function openGate(id) {
  S.flags['gate_' + id] = 1; World.gateOpen[id] = true;
  const g = GATE_DEFS[id];
  invalidateChunksNear(g.tiles[1][0], g.tiles[1][1]);
  buildMapCanvas();
  Sfx.play('gate'); SDK.happytime();
  addXP(60);
  UI.banner('🔓 ' + L(DISTRICTS[id].n), t('gateOpened'));
  saveGame();
}
function fastTravel(dest) {
  let pos;
  if (dest === 'base') pos = BASE_SPAWN;
  else if (dest === 'north') pos = { x: 97.5 * TS, y: 58 * TS };
  else pos = GATE_DEFS[dest].out;
  Game.player.x = pos.x; Game.player.y = pos.y;
  S.totalMin += 30;
  Game.dogs = [];
  UI.fade();
  Sfx.play('gate');
}

// ---------- daily illegal dump event ----------
function clearDumpNode() {
  if (Game.dumpNode) { removeDynNode(Game.dumpNode); Game.dumpNode = null; }
}
function placeDumpNode() {
  clearDumpNode();
  const e = S.event; if (!e) return;
  Game.dumpNode = addDynNode({ type: 'dump', x: e.x, y: e.y, items: e.items, reg: e.reg });
}
function spawnDailyDump(lines) {
  const regs = ['center', 'north', 'north', 'south'];
  if (S.flags.gate_east) regs.push('east', 'east');
  if (S.flags.gate_west) regs.push('west', 'west');
  const reg = regs[Math.floor(Math.random() * regs.length)];
  const cands = World.nodes.filter(n => n.reg === reg && typeof n.id === 'number' && !NODES[n.type].door && n.type !== 'car' && n.type !== 'fountain' && !inBase(n.x, n.y, 6));
  for (let tries = 0; tries < 30 && cands.length; tries++) {
    const b = cands[Math.floor(Math.random() * cands.length)];
    const offs = [[30, 0], [-30, 0], [0, 30], [0, -30]];
    for (const [ox, oy] of offs) {
      const x = b.x + ox, y = b.y + oy;
      if (isSolid(Math.floor(x / TS), Math.floor(y / TS)) || tileAt(Math.floor(x / TS), Math.floor(y / TS)) === T.GATE) continue;
      const pool = { center: ['plastic', 'can', 'scrap', 'copper', 'ewaste', 'rubber'], north: ['copper', 'motor', 'scrap', 'battery', 'rubber'], east: ['copper', 'motor', 'scrap', 'battery'], south: ['ewaste', 'battery', 'copper', 'gold'], west: ['magnet', 'ewaste', 'gold', 'copper', 'battery'] }[reg];
      const items = {};
      for (let i = 0; i < 3; i++) { const k = pool[Math.floor(Math.random() * pool.length)]; items[k] = (items[k] || 0) + Math.max(1, Math.round(28 / ITEMS[k].p * (.6 + Math.random() * .8))); }
      S.event = { x, y, reg, items, day: S.lastDay };
      placeDumpNode();
      if (lines) lines.push('🚛 ' + t('dumpEvent', L(DISTRICTS[reg].n)));
      return;
    }
  }
}
function dateKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function dailyBonus() {
  const today = dateKey(new Date());
  const d = S.daily || { last: '', streak: 0 };
  if (!d.last) { S.daily = { last: today, streak: 1 }; return; }
  if (d.last === today) return;
  const yest = dateKey(new Date(Date.now() - 864e5));
  d.streak = d.last === yest ? d.streak + 1 : 1; d.last = today; S.daily = d;
  const k = Math.min(d.streak, 7);
  const cash = 20 * k;
  S.cash += cash;
  const gifts = { water: 2, canned: 1 };
  if (k >= 3) gifts.energy = 1;
  if (k >= 5) gifts.bandage = 2;
  if (k >= 7) gifts.medicine = 1;
  for (const g in gifts) addStash(g, gifts[g]);
  UI.dailyBonus(d.streak, cash, gifts);
}

// ---------- sleep, days, death ----------
function sleep() {
  const t0 = tod();
  let target;
  if (t0 >= 18 * 60) target = S.totalMin - t0 + 1440 + 6 * 60;
  else if (t0 < 6 * 60) target = S.totalMin - t0 + 6 * 60;
  else target = S.totalMin + 180;
  const dm = target - S.totalMin, h = dm / 60, full = dm > 240;
  const before = snapshotOut();
  advanceMachines(dm);
  const st = 1 - perk('stomach') * .12;
  const p = S.p;
  p.hunger = Math.max(5, p.hunger - 5 * st * h * .45);
  p.thirst = Math.max(5, p.thirst - 7 * st * h * .45);
  const cap = S.builds.bed ? 100 : 70;
  p.energy = full ? Math.max(p.energy, cap + (S.goals.roof ? 15 : 0)) : Math.min(100, p.energy + 30);
  p.energy = Math.min(100, p.energy);
  if (p.hunger > 20 && p.thirst > 20) p.hp = Math.min(maxHp(), p.hp + h * 3);
  if (S.status.sickUntil > S.totalMin && full) S.status.sickUntil = 0;
  const oldDay = day();
  S.totalMin = target;
  const report = [];
  const made = diffOut(before);
  if (made.length) report.push('🏭 ' + t('machinesMade') + ' ' + made.map(([k, n]) => '+' + n + ' ' + ITEMS[k].i).join('  '));
  Game.dogs = [];
  stat('slept');
  const newDays = checkDayChange(report);
  saveGame();
  Sfx.play('sleep');
  UI.sleepReport(full, report, oldDay !== day());
  return newDays;
}
function checkDayChange(report) {
  const d = day();
  let n = 0;
  while (S.lastDay < d) { S.lastDay++; onNewDay(report || null); n++; }
  return n;
}
function onNewDay(report) {
  const lines = report || [];
  stat('days');
  // weather
  const r = Math.random();
  S.weather = S.lastDay <= 2 ? (r < .7 ? 'clear' : 'cloudy') : r < .5 ? 'clear' : r < .66 ? 'cloudy' : r < .88 ? 'rain' : 'heat';
  Sfx.setRain(S.weather === 'rain');
  lines.push(WEATHER[S.weather].i + ' ' + t('weatherToday', L(WEATHER[S.weather].n)));
  updateMarket();
  lines.push('🔥 ' + t('hotItem', ITEMS[S.market.hot].i + ' ' + L(ITEMS[S.market.hot].n)));
  refreshContracts();
  spawnDailyDump(lines);
  if (S.builds.rainbarrel) { const w = S.weather === 'rain' ? 4 : 2; S.yields.rainbarrel = Math.min(12, S.yields.rainbarrel + w); lines.push('🛢️ ' + t('barrelFilled', w)); }
  if (S.builds.garden) { S.yields.garden = Math.min(12, S.yields.garden + 2); lines.push('🥕 ' + t('gardenGrew', 2)); }
  if (S.goals.plant) { S.cash += 300; lines.push('♻️ ' + t('plantIncome', fmtMoney(300))); }
  // night thieves
  if (S.lastDay > 3) {
    if (S.builds.lock) { if (Math.random() < .25) lines.push('🔒 ' + t('lockHeld')); }
    else if (Math.random() < .3) {
      const keys = Object.keys(S.stash).filter(k => ITEMS[k].c === 'raw' || ITEMS[k].c === 'ref');
      if (keys.length) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        const lost = Math.max(1, Math.floor(S.stash[k] * (.15 + Math.random() * .15)));
        S.stash[k] -= lost; if (S.stash[k] <= 0) delete S.stash[k];
        lines.push('🦹 ' + t('thief', lost, ITEMS[k].i + ' ' + L(ITEMS[k].n)));
      }
    }
  }
  S.adBoost = false;
  if (!report) UI.toast(t('newDay', S.lastDay) + ' — ' + WEATHER[S.weather].i + ' ' + L(WEATHER[S.weather].n), 'info');
}
function die() {
  if (Game.dead) return;
  Game.dead = true; Game.action = null;
  stat('deaths');
  UI.death();
}
function respawn(keepBag) {
  const lostCash = Math.floor(S.cash * .15);
  if (!keepBag) {
    const items = {}; let any = false;
    for (const k in S.inv) { items[k] = S.inv[k]; any = true; }
    if (any && !inBase(Game.player.x, Game.player.y, 1)) spawnPile(Game.player.x, Game.player.y, items);
    S.inv = {};
    S.cash -= lostCash;
  }
  const t0 = tod();
  S.totalMin += (t0 < 7 * 60 ? 7 * 60 - t0 : 1440 - t0 + 7 * 60);
  const p = S.p;
  p.hp = maxHp() * .5; p.hunger = Math.max(p.hunger, 45); p.thirst = Math.max(p.thirst, 45); p.energy = 60;
  S.status.sickUntil = 0;
  Game.player.x = BASE_SPAWN.x; Game.player.y = BASE_SPAWN.y;
  Game.dogs = []; Game.dead = false;
  checkDayChange(null);
  saveGame();
  return keepBag ? 0 : lostCash;
}

// ---------- dogs ----------
function spawnDog() {
  const p = Game.player;
  for (let tries = 0; tries < 20; tries++) {
    const a = Math.random() * TAU, r = 460 + Math.random() * 200;
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const reg = regionAt(tx, ty);
    if (!reg || isSolid(tx, ty) || inBase(x, y, 3)) continue;
    const tough = DISTRICTS[reg].tier;
    Game.dogs.push({ x, y, face: 0, hp: 36 + tough * 8, max: 36 + tough * 8, state: 'wander', t: 0, bite: 0, wx: Math.cos(a), wy: Math.sin(a), walkT: 0, kb: { x: 0, y: 0 }, col: pick(Math.random, ['#8a6a4a', '#5a4a3a', '#b89a6a', '#3a3530', '#9a8a7a']) });
    return;
  }
}
function updateDogs(dt) {
  const p = Game.player;
  const night = isNight();
  const reg = Game.curRegion;
  let maxDogs = 0;
  if (night) maxDogs = 1 + Math.ceil((DISTRICTS[reg] ? DISTRICTS[reg].tier : 0) / 2);
  else if (reg === 'east' || reg === 'west') maxDogs = 1;
  if (S.weather === 'rain') maxDogs = Math.max(0, maxDogs - 1);
  if (inBase(p.x, p.y, 1)) maxDogs = 0;
  Game.dogSpawnT -= dt;
  if (Game.dogSpawnT <= 0) { Game.dogSpawnT = 12 + Math.random() * 10; if (Game.dogs.length < maxDogs) spawnDog(); }
  const sense = 230 * (1 - perk('owl') * .15) * (night ? 1 : .8);
  for (let i = Game.dogs.length - 1; i >= 0; i--) {
    const d = Game.dogs[i];
    d.t -= dt; d.bite -= dt;
    const dx = p.x - d.x, dy = p.y - d.y, dd = Math.hypot(dx, dy);
    if (dd > 1100) { Game.dogs.splice(i, 1); continue; }
    let vx = 0, vy = 0, spd = 0;
    if (d.state === 'flee') {
      spd = 200; vx = -dx / (dd || 1); vy = -dy / (dd || 1);
      if (d.t <= 0) { Game.dogs.splice(i, 1); continue; }
    } else if (d.state === 'chase') {
      spd = 158; vx = dx / (dd || 1); vy = dy / (dd || 1);
      if (dd > sense * 1.8 || inBase(p.x, p.y, 1)) d.state = 'wander';
      if (dd < 26 && d.bite <= 0 && !Game.dead) {
        d.bite = 1.1;
        const dmg = 5 + (DISTRICTS[reg] ? DISTRICTS[reg].tier : 0) * 1.2;
        S.p.hp -= dmg; Game.hurtT = .4; Sfx.play('hurt');
        floater(p.x, p.y - 30, '-' + Math.round(dmg), '#ff6060');
        burst(p.x, p.y, '#c33', 8, 80);
        hint('dogs', t('hintDogs'), 40);
      }
    } else {
      spd = 45;
      if (d.t <= 0) { d.t = 1.5 + Math.random() * 2; const a = Math.random() * TAU; d.wx = Math.cos(a); d.wy = Math.sin(a); if (Math.random() < .3) { d.wx = 0; d.wy = 0; } }
      vx = d.wx; vy = d.wy;
      if (dd < sense && !inBase(p.x, p.y, 1)) { d.state = 'chase'; Sfx.play('bark'); }
    }
    // avoid base
    if (inBase(d.x + vx * 20, d.y + vy * 20, 2)) { vx = -vx; vy = -vy; if (d.state === 'chase') d.state = 'wander'; }
    const ox = d.x, oy = d.y;
    moveEntity(d, (vx * spd + d.kb.x) * dt, (vy * spd + d.kb.y) * dt, 8);
    d.kb.x *= Math.pow(.02, dt); d.kb.y *= Math.pow(.02, dt);
    if (Math.abs(d.x - ox) + Math.abs(d.y - oy) > .5) { d.face = Math.atan2(d.y - oy, d.x - ox); d.walkT += dt * spd / 20; }
  }
}
function attack() {
  if (Game.attackT > 0 || Game.dead) return;
  Sfx.init();
  Game.attackT = .45; Game.swingT = .25; Game.action = null;
  S.p.energy -= 1.2;
  Sfx.play('swing');
  const p = Game.player; const dmg = bestToolDmg();
  for (const d of Game.dogs) {
    const dx = d.x - p.x, dy = d.y - p.y; const dd = Math.hypot(dx, dy);
    if (dd < 58 && Math.abs(angDiff(Math.atan2(dy, dx), p.face)) < 1.3) {
      d.hp -= dmg; d.kb.x = dx / dd * 380; d.kb.y = dy / dd * 380;
      Sfx.play('hit'); burst(d.x, d.y, '#ddd', 6, 90);
      floater(d.x, d.y - 20, '-' + dmg, '#ffd76a');
      if (d.hp <= d.max * .3 && d.state !== 'flee') {
        d.state = 'flee'; d.t = 3; Sfx.play('yelp'); stat('dogs'); addXP(6);
      } else if (d.state !== 'flee') d.state = 'chase';
    }
  }
}

// ---------- main update ----------
function playerSpeed() {
  let s = 140 * (S.gear.boots ? 1.1 : 1) * (1 + perk('runner') * .04);
  if (S.gear.cart) s *= 1 + CRAFT[S.gear.cart].spd;
  if (S.p.energy < 12) s *= .6;
  if (invWeight() > capacity() * .9) s *= .9;
  return s;
}
function update(dt) {
  Game.time += dt;
  if (Game.state !== 'play' || Game.paused || Game.dead || UI.modalOpen) { updateFx(dt); return; }
  const p = Game.player;
  // --- movement ---
  const mv = Input.moveVec();
  const sprint = Input.sprint() && S.p.energy > 5 && (mv.x || mv.y);
  let spd = playerSpeed() * (sprint ? 1.5 : 1);
  p.moving = !!(mv.x || mv.y);
  if (p.moving) {
    const ox = p.x, oy = p.y;
    moveEntity(p, mv.x * spd * dt, mv.y * spd * dt, 9);
    p.face = Math.atan2(mv.y, mv.x);
    p.walkT += dt * (Math.hypot(p.x - ox, p.y - oy) / dt) / 22;
    if (sprint) S.p.energy -= 1.1 * dt * (1 - perk('runner') * .2);
  }
  // --- interaction ---
  Game.target = findTarget();
  if (Input.consume('interact')) interact();
  if (Input.consume('attack')) attack();
  for (let i = 0; i < 4; i++) if (Input.consume('quick' + i)) quickUse(i);
  updateAction(dt);
  Game.attackT -= dt; Game.swingT -= dt; Game.hurtT -= dt;
  // --- time & survival ---
  const gm = dt * MIN_PER_SEC;
  S.totalMin += gm;
  const h = gm / 60, sp = S.p, st = 1 - perk('stomach') * .12;
  sp.hunger -= 5 * st * h;
  sp.thirst -= 7 * st * h * (S.weather === 'heat' ? 1.6 : 1);
  sp.energy -= 3.5 * h;
  const outside = !inBase(p.x, p.y, 0);
  if (S.weather === 'rain' && outside) sp.energy -= 1.5 * h;
  const sick = S.status.sickUntil > S.totalMin;
  if (sick) { sp.hp -= 3 * h; sp.energy -= 2 * h; }
  if (sp.hunger <= 0) { sp.hunger = 0; sp.hp -= 8 * h; hint('starve', t('hintStarving'), 30); }
  if (sp.thirst <= 0) { sp.thirst = 0; sp.hp -= 10 * h; hint('dehyd', t('hintThirsty'), 30); }
  if (sp.energy <= 0) sp.energy = 0;
  if (sp.hunger > 50 && sp.thirst > 50 && !sick) sp.hp = Math.min(maxHp(), sp.hp + 3 * h);
  if (sp.hunger < 20 && sp.hunger > 0) hint('hungry', t('hintHungry'), 90);
  if (sp.thirst < 20 && sp.thirst > 0) hint('thirsty', t('hintThirst'), 90);
  if (sp.energy < 15) hint('tired', t('hintTired'), 90);
  // toxic
  const reg = regionAt((p.x / TS) | 0, (p.y / TS) | 0);
  if (reg === 'south' && !S.gear.respirator) {
    sp.hp -= 1.4 * dt; Game.toxicT = Math.min(1, Game.toxicT + dt * 2);
    hint('toxic', t('hintToxic'), 20);
  } else Game.toxicT = Math.max(0, Game.toxicT - dt);
  if (sp.hp <= 0) { sp.hp = 0; die(); }
  // regions
  if (reg && reg !== Game.curRegion) {
    Game.curRegion = reg;
    UI.district(reg);
    if (!S.visited[reg]) { S.visited[reg] = true; addXP(40); SDK.happytime(); UI.toast(t('newArea', L(DISTRICTS[reg].n)), 'good'); }
    if (reg === 'west' && !S.gear.headlamp) hint('dark', t('hintDark'), 60);
  }
  // day/night
  checkDayChange(null);
  const tt = tod();
  if (tt > 19.5 * 60 && tt < 20 * 60) hint('dusk', t('hintDusk'), 300);
  // machines
  advanceMachines(gm);
  updateDogs(dt);
  updateFx(dt);
  // fog of war
  Game.fogT -= dt; if (Game.fogT <= 0) { Game.fogT = .3; revealFog(false); }
  // quests
  Game.questT -= dt; if (Game.questT <= 0) { Game.questT = .5; checkQuest(); checkBlueprints(); }
  Game.saveT += dt; if (Game.saveT > 20) { Game.saveT = 0; saveGame(); }
}
function updateFx(dt) {
  for (let i = Game.particles.length - 1; i >= 0; i--) {
    const q = Game.particles[i]; q.life -= dt;
    if (q.life <= 0) { Game.particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt; q.vx *= .96;
  }
  for (let i = Game.floaters.length - 1; i >= 0; i--) {
    const f = Game.floaters[i]; f.life -= dt; f.y -= 26 * dt;
    if (f.life <= 0) Game.floaters.splice(i, 1);
  }
}
function revealFog(all) {
  const p = Game.player;
  const cx = Math.floor(p.x / TS / 4), cy = Math.floor(p.y / TS / 4);
  const r = all ? 3 : 3;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= 48 || y >= 48) continue;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 1) Game.explored[y * 48 + x] = 1;
  }
}
function checkQuest() {
  while (S.quest < QUESTS.length) {
    const q = QUESTS[S.quest];
    const [cur, need] = q.c(S);
    if (cur < need) break;
    S.quest++;
    if (q.r.cash) S.cash += q.r.cash;
    addXP(q.r.xp || 0);
    Sfx.play('level');
    UI.toast('✅ ' + L(q.n) + (q.r.cash ? ' +' + fmtMoney(q.r.cash) : '') + ' +' + q.r.xp + ' XP', 'good');
  }
}
function computeDarkness() {
  const m = tod() / 60;
  let d;
  if (m >= 21 || m < 4.5) d = .86;
  else if (m >= 18) d = (m - 18) / 3 * .86;
  else if (m < 7) d = (1 - (m - 4.5) / 2.5) * .86;
  else d = 0;
  if (S.weather === 'rain') d = Math.max(d, .22);
  else if (S.weather === 'cloudy') d = Math.max(d, .1);
  const p = Game.player;
  const reg = regionAt((p.x / TS) | 0, (p.y / TS) | 0);
  if (reg === 'west') d = Math.max(d, .62);
  return d;
}
