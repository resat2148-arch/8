'use strict';
// ---------- In-game onboarding: objective arrow + keycap overlays (no text walls) ----------
const ITEM_SOURCES = {
  plastic: ['trashbag', 'dumpster'], paper: ['cardboard', 'dumpster'], can: ['canpile', 'dumpster'], glass: ['bottles', 'dumpster'],
  scrap: ['dumpster', 'fridge', 'washer', 'drums', 'pipes', 'car', 'vending'], copper: ['cable', 'fridge', 'tv', 'crt'],
  rubber: ['washer', 'bike', 'car', 'yardbox'], ewaste: ['heap', 'tv', 'office'], battery: ['batteries', 'car', 'forklift', 'yardbox'],
  motor: ['crate', 'washer', 'fridge', 'forklift'], magnet: ['hdd', 'server'],
};
const REFINED_BY = { pellets: 'shredder', bale: 'baler', alu: 'smelter', steel: 'smelter', cullet: 'crusher', cuingot: 'stripper', crumb: 'tirecutter', components: 'ebench', lithium: 'ebench' };
const BASE_EXITS = [{ x: 95.6 * TS, y: 105.5 * TS }, { x: 89.5 * TS, y: 111.6 * TS }];

const Guide = {
  target: null, t: 0, moved: 0, lastX: 0, lastY: 0, atkT: 0, runT: 0,
  on() { return !!S && !S.flags.noGuide; },
  reset() { this.target = null; this.t = 0; this.moved = 0; this.lastX = 0; this.atkT = 0; this.runT = 0; },
  update(dt) {
    const p = Game.player;
    if (this.lastX) { const d = Math.hypot(p.x - this.lastX, p.y - this.lastY); if (d < 60) this.moved += d; }
    this.lastX = p.x; this.lastY = p.y;
    if (!S.flags.tutMove && this.moved > 160) S.flags.tutMove = 1;
    if (S.flags.tutMove && !S.flags.tutRun && this.moved > TS * 40) { S.flags.tutRun = 1; this.runT = 4.5; }
    if (!S.flags.tutAtk && Game.dogs.some(d => d.state === 'chase')) { S.flags.tutAtk = 1; this.atkT = 5; }
    this.atkT -= dt; this.runT -= dt;
    this.t -= dt;
    if (this.t <= 0) { this.t = .25; this.target = this.on() ? viaExit(objectiveTarget()) : null; }
  },
  // quick-bar slot that deserves attention (index) or -1
  quickPulse() {
    if (!S || S.flags.noGuide) return -1;
    const q = QUESTS[S.quest];
    const hasAny = i => QUICK[i].some(k => S.inv[k] > 0);
    if ((q && q.id === 'eat') || S.p.hunger < 30) { if (hasAny(0)) return 0; }
    if ((q && q.id === 'eat') || S.p.thirst < 30) { if (hasAny(1)) return 1; }
    if (S.p.hp < 40 && hasAny(2)) return 2;
    return -1;
  },
};

// ---------- objective resolution ----------
const stationT = k => ({ x: STATION_POS[k][0] * TS, y: STATION_POS[k][1] * TS });
const DEALER_T = () => ({ x: DEALER_POS.x, y: DEALER_POS.y });
const totalOf = k => (S.inv[k] || 0) + (S.stash[k] || 0);
function nearestNodeOf(types) {
  if (!types || !types.length) return null;
  const p = Game.player; let best = null, bd = Infinity;
  for (const n of World.nodes) {
    if (!types.includes(n.type) || typeof n.id !== 'number' || nodeLooted(n)) continue;
    const d = NODES[n.type];
    if (d.tool && !S.tools[d.tool]) continue;
    if ((n.reg === 'east' && !World.gateOpen.east) || (n.reg === 'west' && !World.gateOpen.west)) continue;
    if (n.reg === 'south' && !S.gear.respirator) continue;
    const dd = dist2(n.x, n.y, p.x, p.y);
    if (dd < bd) { bd = dd; best = n; }
  }
  return best ? { x: best.x, y: best.y } : null;
}
// Where to go next to afford `cost` + `cash`; null when affordable
function needTarget(cost, cash) {
  for (const k in cost) if (totalOf(k) < cost[k]) {
    const m = REFINED_BY[k];
    if (!m) return nearestNodeOf(ITEM_SOURCES[k]);
    if (!S.builds[m]) return buildTarget(m);
    const mm = S.machines[m], rec = BUILDS[m].m.find(r => r.out[k]);
    if ((mm.out[k] || 0) > 0 || (mm.q > 0 && mm.sel === BUILDS[m].m.indexOf(rec))) return stationT(m);
    const raw = Object.keys(rec.in)[0];
    return totalOf(raw) >= rec.in[raw] ? stationT(m) : (nearestNodeOf(ITEM_SOURCES[raw]) || stationT(m));
  }
  if (cash && S.cash < cash) return DEALER_T();
  return null;
}
function craftTarget(k) { return ownsCraft(k) ? null : (needTarget(CRAFT[k].cost, CRAFT[k].cash) || stationT('workbench')); }
function buildTarget(k) {
  if (S.builds[k]) return stationT(k);
  return needTarget(BUILDS[k].cost, BUILDS[k].cash) || (S.flags['bp_' + k] ? stationT(k) : stationT('workbench'));
}
function machineTarget(m, item) {
  if (!S.builds[m]) return buildTarget(m);
  return needTarget({ [item]: totalOf(item) + 1 }) || stationT(m);
}
function objectiveTarget() {
  const p = Game.player;
  if (invWeight() >= capacity() * .95 && !inBase(p.x, p.y, 0)) return stationT('stash');
  const q = QUESTS[S.quest]; if (!q) return null;
  switch (q.id) {
    case 'search': return nearestNodeOf(['trashbag']);
    case 'plastic': return nearestNodeOf(['trashbag', 'dumpster']);
    case 'sell': return Object.keys(S.inv).some(k => ITEMS[k].p > 0 && (ITEMS[k].c === 'raw' || ITEMS[k].c === 'ref')) || Object.keys(S.stash).length ? DEALER_T() : nearestNodeOf(['trashbag', 'dumpster']);
    case 'eat': return Object.keys(S.inv).some(k => ITEMS[k].eat) ? null : { x: SHOP_POS.x, y: SHOP_POS.y };
    case 'scrap': return nearestNodeOf(['dumpster']);
    case 'crowbar': case 'wrench': case 'backpack': case 'cutters': case 'respirator': case 'headlamp': case 'grinder':
      return craftTarget(q.id === 'backpack' ? 'backpack' : q.id);
    case 'vending': return nearestNodeOf(['vending']);
    case 'shredder': case 'smelter': case 'tirecutter': case 'ebench': return buildTarget(q.id);
    case 'pellets': return machineTarget('shredder', 'pellets');
    case 'steel': return machineTarget('smelter', 'steel');
    case 'copper': return machineTarget('stripper', 'cuingot');
    case 'sleep': { const m = tod(); return m >= 18 * 60 || m < 6 * 60 ? stationT('bed') : null; }
    case 'north': return { x: 97.5 * TS, y: 58 * TS };
    case 'house': return nearestNodeOf(['house']);
    case 'gateE': return S.tools.cutters ? { x: World.gates.east.x - 20, y: World.gates.east.y } : craftTarget('cutters');
    case 'south': return { x: 97.5 * TS, y: 133 * TS };
    case 'gateW': return S.tools.grinder ? { x: World.gates.west.x + 20, y: World.gates.west.y } : craftTarget('grinder');
    case 'atm': return nearestNodeOf(['atm']);
  }
  return null;
}
// The base is walled: route through the nearest exit when crossing its wall
function viaExit(tg) {
  if (!tg) return null;
  const p = Game.player;
  const pin = inBase(p.x, p.y, 0), tin = inBase(tg.x, tg.y, 0);
  if (pin === tin) return tg;
  let best = null, bd = Infinity;
  for (const e of BASE_EXITS) { const d = Math.hypot(e.x - p.x, e.y - p.y) + Math.hypot(tg.x - e.x, tg.y - e.y); if (d < bd) { bd = d; best = e; } }
  return Math.hypot(best.x - p.x, best.y - p.y) > 36 ? { x: best.x, y: best.y, wp: true } : tg;
}

// ---------- drawing ----------
function keyLabel(code) {
  if (code === 'Space') return LANG === 'tr' ? 'Boşluk' : 'Space';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Digit')) return code.slice(5);
  const m = Input.layout && Input.layout.get(code);
  return m ? m.toUpperCase() : code.replace('Key', '');
}
function drawKeycap(g, x, y, label, w) {
  w = w || Math.max(30, g.measureText(label).width + 16);
  const h = 30;
  g.fillStyle = 'rgba(0,0,0,.45)'; roundRect(g, x - w / 2, y - h / 2 + 3, w, h, 6); g.fill();
  g.fillStyle = '#d9dbe0'; roundRect(g, x - w / 2, y - h / 2, w, h - 2, 6); g.fill();
  g.fillStyle = '#f4f5f7'; roundRect(g, x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 8, 4); g.fill();
  g.fillStyle = '#23252c'; g.fillText(label, x, y + 1);
  return w;
}
function drawCaption(g, x, y, text) {
  g.font = 'bold 13px system-ui, sans-serif';
  g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(text, x, y); g.fillStyle = '#fff'; g.fillText(text, x, y);
}
Guide.drawWorld = function (g, t) {
  const tg = this.target; if (!tg) return;
  const p = Game.player;
  if (!tg.wp && Game.target && dist2(Game.target.x, Game.target.y, tg.x, tg.y) < 30 * 30) return; // the prompt takes over
  const b = Math.sin(t * 5) * 5, y = tg.y - 52 + b;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(tg.x, tg.y + 4, 14, 6, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(245,197,66,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(tg.x, tg.y + 2, 16 + Math.sin(t * 5) * 2, 8, 0, 0, TAU); g.stroke();
  g.fillStyle = '#f5c542'; g.strokeStyle = '#3a2203'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(tg.x - 12, y - 10); g.lineTo(tg.x + 12, y - 10); g.lineTo(tg.x, y + 6); g.closePath(); g.fill(); g.stroke();
  g.fillRect(tg.x - 5, y - 22, 10, 13); g.strokeRect(tg.x - 5, y - 22, 10, 13);
  g.restore();
  void p;
};
Guide.drawScreen = function (g, w, h) {
  if (!S || Game.paused) return;
  const p = Game.player;
  const [px, py] = R.toScreen(p.x, p.y);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 14px system-ui, sans-serif';
  // off-screen objective: arrow on the screen edge
  const tg = this.target;
  if (tg) {
    const [sx, sy] = R.toScreen(tg.x, tg.y);
    const m = 60;
    if (sx < m || sy < m || sx > w - m || sy > h - m) {
      // intersect the ray player→target with an inset screen rectangle (kept clear of HUD corners)
      const a = Math.atan2(sy - py, sx - px), dx = Math.cos(a), dy = Math.sin(a);
      const L0 = 70, R0 = w - 70, T0 = 130, B0 = h - 100;
      const tx = dx > 1e-6 ? (R0 - px) / dx : dx < -1e-6 ? (L0 - px) / dx : Infinity;
      const ty = dy > 1e-6 ? (B0 - py) / dy : dy < -1e-6 ? (T0 - py) / dy : Infinity;
      const k = Math.max(0, Math.min(tx, ty));
      const bx = clamp(px + dx * k, L0, R0), by = clamp(py + dy * k, T0, B0);
      g.save(); g.translate(bx, by); g.rotate(a);
      g.fillStyle = '#f5c542'; g.strokeStyle = '#3a2203'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(22, 0); g.lineTo(-10, -16); g.lineTo(-4, 0); g.lineTo(-10, 16); g.closePath(); g.fill(); g.stroke();
      g.restore();
      const dm = Math.round(Math.hypot(tg.x - p.x, tg.y - p.y) / TS);
      drawCaption(g, bx - Math.cos(a) * 30, by - Math.sin(a) * 30 + 2, dm + 'm');
      g.font = 'bold 14px system-ui, sans-serif';
    }
  }
  // movement keys until the player has walked a bit
  if (this.on() && !S.flags.tutMove && !UI.modalOpen) {
    if (Input.isTouch) {
      const jx = 110, jy = h - 150, k = (Game.time * .8) % 1;
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(jx, jy, 52, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(245,197,66,.6)'; g.beginPath(); g.arc(jx + Math.sin(k * TAU) * 32, jy - Math.abs(Math.cos(k * TAU)) * 20, 22, 0, TAU); g.fill();
      g.font = '26px system-ui'; g.fillText('👆', jx + Math.sin(k * TAU) * 32 + 8, jy - Math.abs(Math.cos(k * TAU)) * 20 + 22);
      drawCaption(g, jx, jy + 72, t('kMove'));
    } else {
      const y0 = py + 62; g.font = 'bold 14px system-ui, sans-serif';
      drawKeycap(g, px, y0, keyLabel('KeyW'), 32);
      drawKeycap(g, px - 36, y0 + 34, keyLabel('KeyA'), 32); drawKeycap(g, px, y0 + 34, keyLabel('KeyS'), 32); drawKeycap(g, px + 36, y0 + 34, keyLabel('KeyD'), 32);
      drawCaption(g, px, y0 + 66, t('kMove'));
    }
  }
  const pop = (code, icon, cap, tt) => {
    const y0 = py + 64 + (1 - Math.min(1, tt)) * 10;
    g.globalAlpha = Math.min(1, tt * 2); g.font = 'bold 14px system-ui, sans-serif';
    if (Input.isTouch) { g.font = '26px system-ui'; g.fillText(icon, px, y0); } else drawKeycap(g, px, y0, keyLabel(code));
    drawCaption(g, px, y0 + 28, cap); g.globalAlpha = 1;
  };
  if (this.atkT > 0) pop('Space', '👊', t('kAttack'), this.atkT);
  else if (this.runT > 0) pop('ShiftLeft', '🏃', t('kRun'), this.runT);
  g.textBaseline = 'alphabetic';
};
