'use strict';
// ---------- Rendering ----------
const R = {
  cv: null, g: null, lc: null, lg: null, vig: null, w: 0, h: 0, dpr: 1, zoom: 1, cam: { x: BASE_SPAWN.x, y: BASE_SPAWN.y }, rain: [], chunkScale: 1,
  cartPos: null, titleT: 0,

  init() {
    this.cv = document.getElementById('game');
    this.g = this.cv.getContext('2d');
    this.lc = document.createElement('canvas');
    this.lg = this.lc.getContext('2d');
    for (let i = 0; i < 220; i++) this.rain.push({ x: Math.random(), y: Math.random(), l: 8 + Math.random() * 10, s: .8 + Math.random() * .5 });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.zoom = clamp(Math.min(this.w / (22 * TS), this.h / (13 * TS)), .6, 2.2);
    if (this.w < 700) this.zoom = clamp(Math.max(this.zoom, Math.min(this.w, this.h) / (13 * TS)), .6, 1.6);
    this.lc.width = Math.ceil(this.w / 2); this.lc.height = Math.ceil(this.h / 2);
    const s = clamp(Math.ceil(this.dpr * this.zoom * 2) / 2, 1, 2.5);
    if (s !== this.chunkScale) { this.chunkScale = s; World.chunkCache.clear(); }
    // vignette
    this.vig = document.createElement('canvas'); this.vig.width = 256; this.vig.height = 256;
    const v = this.vig.getContext('2d');
    const gr = v.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    v.fillStyle = gr; v.fillRect(0, 0, 256, 256);
  },
  toScreen(x, y) { return [(x - this.cam.x) * this.zoom + this.w / 2, (y - this.cam.y) * this.zoom + this.h / 2]; },

  frame(dt) {
    const g = this.g, z = this.zoom;
    if (!World.tiles) { g.fillStyle = '#15161a'; g.fillRect(0, 0, this.cv.width, this.cv.height); return; }
    // camera
    if (this.camLock) { /* camera framed manually (promo captures) */ }
    else if (Game.state === 'play' && Game.player) {
      const k = 1 - Math.pow(.0008, dt);
      this.cam.x = lerp(this.cam.x, Game.player.x, k); this.cam.y = lerp(this.cam.y, Game.player.y, k);
      if (Math.abs(this.cam.x - Game.player.x) > 600 || Math.abs(this.cam.y - Game.player.y) > 600) { this.cam.x = Game.player.x; this.cam.y = Game.player.y; }
    } else {
      this.titleT += dt;
      this.cam.x = BASE_SPAWN.x + Math.cos(this.titleT * .06) * 260 + 60; this.cam.y = BASE_SPAWN.y - 60 + Math.sin(this.titleT * .08) * 180;
    }
    const camX = Math.round(this.cam.x * z) / z, camY = Math.round(this.cam.y * z) / z;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#1b1c20'; g.fillRect(0, 0, this.w, this.h);
    g.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - camX * z), this.dpr * (this.h / 2 - camY * z));
    const vw = this.w / z, vh = this.h / z;
    const x0 = camX - vw / 2, y0 = camY - vh / 2, x1 = camX + vw / 2, y1 = camY + vh / 2;
    // chunks
    const size = CHT * TS;
    const used = new Set();
    let built = 0;
    const ncx = MW / CHT, ncy = MH / CHT;
    for (let cy = Math.floor(y0 / size); cy <= Math.floor(y1 / size); cy++) for (let cx = Math.floor(x0 / size); cx <= Math.floor(x1 / size); cx++) {
      if (cx < 0 || cy < 0 || cx >= ncx || cy >= ncy) continue;
      const key = cx + ',' + cy; used.add(key);
      let c = World.chunkCache.get(key);
      if (!c) { c = renderChunk(cx, cy, this.chunkScale); World.chunkCache.set(key, c); built++; }
      else { World.chunkCache.delete(key); World.chunkCache.set(key, c); }
      g.drawImage(c, cx * size, cy * size, size, size);
    }
    // prefetch one neighbouring chunk per idle frame to avoid hitches while walking
    if (!built) {
      outer: for (let cy = Math.floor(y0 / size) - 1; cy <= Math.floor(y1 / size) + 1; cy++) for (let cx = Math.floor(x0 / size) - 1; cx <= Math.floor(x1 / size) + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= ncx || cy >= ncy) continue;
        const key = cx + ',' + cy; used.add(key);
        if (!World.chunkCache.has(key)) { World.chunkCache.set(key, renderChunk(cx, cy, this.chunkScale)); break outer; }
      }
    }
    const maxChunks = this.chunkScale > 2 ? 24 : this.chunkScale > 1.5 ? 32 : 40;
    while (World.chunkCache.size > maxChunks) { const k = World.chunkCache.keys().next().value; if (used.has(k)) break; World.chunkCache.delete(k); }

    // drawables
    const t = Game.time;
    const items = [];
    const inView = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
    for (const n of nodesNear(camX, camY, Math.max(vw, vh) / 2 + 60)) if (inView(n.x, n.y, 60)) items.push([n.y, 0, n]);
    if (S && inView(BASE_SPAWN.x, BASE_SPAWN.y, 400)) {
      for (const s of stationList()) items.push([s.y, 1, s]);
      items.push([STATION_POS.campfire[1] * TS, 2, null]);
      if (S.builds.lock) items.push([104 * TS, 3, null]);
    }
    if (inView(DEALER_POS.x, DEALER_POS.y, 300)) {
      items.push([DEALER_POS.y, 4, 'dealer']); items.push([SHOP_POS.y, 4, 'shop']); items.push([BOARD_POS.y, 4, 'board']);
      items.push([101.5 * TS, 5, null]);
    }
    for (const l of World.lights) if (inView(l.x, l.y, 40)) items.push([l.y, 6, l]);
    if (Game.state === 'play') {
      for (const d of Game.dogs) items.push([d.y, 7, d]);
      if (Game.player) items.push([Game.player.y, 8, Game.player]);
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, k, o] of items) {
      if (k === 0) drawNode(g, o, S ? nodeLooted(o) : false, t);
      else if (k === 1) drawStation(g, o, t);
      else if (k === 2) drawCampfire(g, STATION_POS.campfire[0] * TS, STATION_POS.campfire[1] * TS, t);
      else if (k === 3) drawLockGate(g);
      else if (k === 4) drawNPC(g, o, t);
      else if (k === 5) drawDealerYard(g);
      else if (k === 6) drawLamp(g, o);
      else if (k === 7) drawDog(g, o, t);
      else if (k === 8) this.drawPlayer(g, o, t, dt);
    }
    if (Game.state === 'play' && !Game.paused) Guide.drawWorld(g, t);
    // particles
    for (const q of Game.particles) { g.globalAlpha = clamp(q.life / q.max, 0, 1); g.fillStyle = q.col; g.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
    g.globalAlpha = 1;
    // target highlight + progress
    if (Game.state === 'play' && !Game.paused) this.drawTarget(g, t);

    // ---- screen space ----
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    Game.darkness = S ? computeDarkness() : 0;
    if (S && S.weather === 'rain') this.drawRain(g, dt);
    if (Game.darkness > .01) this.drawLights(g, camX, camY, t);
    if (Game.state === 'play') { this.drawPrompt(g); Guide.drawScreen(g, this.w, this.h); }
    // floaters (screen space for crisp text)
    g.textAlign = 'center'; g.font = 'bold 15px system-ui, sans-serif';
    for (const f of Game.floaters) {
      const [sx, sy] = this.toScreen(f.x, f.y);
      g.globalAlpha = clamp(f.life / f.max * 1.6, 0, 1);
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.text, sx, sy); g.fillStyle = f.col; g.fillText(f.text, sx, sy);
    }
    g.globalAlpha = 1;
    // vignette & status overlays
    g.globalAlpha = .45; g.drawImage(this.vig, 0, 0, this.w, this.h); g.globalAlpha = 1;
    if (Game.state === 'play' && S) {
      const low = S.p.hp < 25 ? (.25 + Math.sin(t * 5) * .12) : 0;
      const hurt = Math.max(0, Game.hurtT) * 1.2;
      if (low + hurt > 0) { g.globalAlpha = clamp(low + hurt, 0, .8); g.fillStyle = '#a00'; g.globalCompositeOperation = 'source-over'; g.drawImage(this.tint('#b00000'), 0, 0, this.w, this.h); g.globalAlpha = 1; }
      if (Game.toxicT > 0) { g.globalAlpha = Game.toxicT * .55; g.drawImage(this.tint('#6aa000'), 0, 0, this.w, this.h); g.globalAlpha = 1; }
      if (Game.curRegion === 'south' && S.gear.respirator) { g.fillStyle = 'rgba(120,160,40,.08)'; g.fillRect(0, 0, this.w, this.h); }
    }
  },
  tintCache: {},
  tint(col) {
    if (this.tintCache[col]) return this.tintCache[col];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const v = c.getContext('2d');
    const gr = v.createRadialGradient(128, 128, 50, 128, 128, 182);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col);
    v.fillStyle = gr; v.fillRect(0, 0, 256, 256);
    return (this.tintCache[col] = c);
  },
  drawRain(g, dt) {
    g.strokeStyle = 'rgba(170,190,220,.35)'; g.lineWidth = 1.2; g.beginPath();
    for (const r of this.rain) {
      r.y += dt * 1.1 * r.s; r.x += dt * .15 * r.s;
      if (r.y > 1) { r.y -= 1; r.x = Math.random(); }
      if (r.x > 1) r.x -= 1;
      const x = r.x * this.w, y = r.y * this.h;
      g.moveTo(x, y); g.lineTo(x - r.l * .25, y - r.l);
    }
    g.stroke();
    g.fillStyle = 'rgba(40,60,90,.12)'; g.fillRect(0, 0, this.w, this.h);
  },
  drawLights(g, camX, camY, t) {
    const lg = this.lg, lw = this.lc.width, lh = this.lc.height, z = this.zoom * .5;
    const d = Game.darkness;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, lw, lh);
    const m = tod() / 60;
    const dusk = (m > 17 && m < 21) ? 1 - Math.abs(m - 19) / 2 : 0;
    lg.fillStyle = dusk > 0 && d < .7 ? `rgba(${40 + dusk * 50},${22 + dusk * 10},${50},${d})` : `rgba(6,9,24,${d})`;
    lg.fillRect(0, 0, lw, lh);
    lg.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const sx = (x - camX) * z + lw / 2, sy = (y - camY) * z + lh / 2, sr = r * z;
      if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) return;
      const gr = lg.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(.55, `rgba(0,0,0,${a * .6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    };
    const glows = [];
    if (Game.state === 'play' && Game.player) {
      const p = Game.player, r = lightRadius();
      hole(p.x, p.y, r, 1);
      if (S.gear.headlamp) hole(p.x + Math.cos(p.face) * 110, p.y + Math.sin(p.face) * 110, 170, .9);
    }
    const nightish = d > .3;
    for (const l of World.lights) {
      if (l.broken) continue;
      const fl = hash2(Math.floor(t * 8), l.f * 100 | 0, 3) < .08 && l.f < 3 ? .3 : 1;
      hole(l.x, l.y - 6, 150, .95 * fl);
      if (nightish) glows.push([l.x, l.y - 6, 70, 'rgba(255,200,110,', .16 * fl]);
    }
    const cf = STATION_POS.campfire;
    const flick = .9 + Math.sin(t * 13) * .05 + Math.sin(t * 7.3) * .05;
    hole(cf[0] * TS, cf[1] * TS - 10, 200 * flick, 1);
    glows.push([cf[0] * TS, cf[1] * TS - 10, 110 * flick, 'rgba(255,140,40,', .28]);
    if (S && S.builds.solar) { hole(89.5 * TS, 105 * TS, 300, .9); glows.push([89.5 * TS, 105 * TS, 180, 'rgba(200,230,255,', .06]); }
    hole(101 * TS, 103 * TS, 170, .95); glows.push([101 * TS, 103 * TS, 80, 'rgba(255,210,140,', .15]);
    hole(101 * TS, 108.5 * TS, 140, .95);
    if (S && S.machines.smelter && S.machines.smelter.q) { const p = STATION_POS.smelter; hole(p[0] * TS, p[1] * TS, 90, .8); glows.push([p[0] * TS, p[1] * TS - 6, 50, 'rgba(255,110,30,', .35]); }
    if (S && S.machines.stove && S.machines.stove.q) { const p = STATION_POS.stove; hole(p[0] * TS, p[1] * TS, 70, .7); }
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(this.lc, 0, 0, this.w, this.h);
    // warm additive glows
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, a] of glows) {
      const [sx, sy] = this.toScreen(x, y); const sr = r * this.zoom;
      if (sx < -sr || sy < -sr || sx > this.w + sr || sy > this.h + sr) continue;
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gr.addColorStop(0, c + (a * d) + ')'); gr.addColorStop(1, c + '0)');
      g.fillStyle = gr; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    g.globalCompositeOperation = 'source-over';
  },

  drawPlayer(g, p, t, dt) {
    // trailing cart
    if (S.gear.cart) {
      const tx = p.x - Math.cos(p.face) * 24, ty = p.y - Math.sin(p.face) * 24;
      if (!this.cartPos) this.cartPos = { x: tx, y: ty, a: p.face };
      const k = 1 - Math.pow(.001, dt);
      this.cartPos.x = lerp(this.cartPos.x, tx, k); this.cartPos.y = lerp(this.cartPos.y, ty, k);
      this.cartPos.a = Math.atan2(p.y - this.cartPos.y, p.x - this.cartPos.x);
      drawCart(g, this.cartPos.x, this.cartPos.y, this.cartPos.a, S.gear.cart === 'trike');
    }
    const bagSize = S.gear.bag === 'hikingpack' ? 1.35 : S.gear.bag === 'backpack' ? 1.15 : .85;
    const bagCol = S.gear.bag === 'hikingpack' ? '#b5542f' : S.gear.bag === 'backpack' ? '#4a6d8c' : '#e8e8e0';
    drawPerson(g, p.x, p.y, p.face, p.moving ? p.walkT : 0, {
      body: '#5b6b3a', body2: '#465430', skin: '#e0b48c', hat: '#2d3440', bag: bagCol, bagSize,
      mask: S.gear.respirator && Game.curRegion === 'south', lamp: !!S.gear.headlamp,
    });
    // swing arc
    if (Game.swingT > 0) {
      const k = 1 - Game.swingT / .25;
      g.strokeStyle = `rgba(255,255,255,${.7 * (1 - k)})`; g.lineWidth = 4; g.beginPath();
      g.arc(p.x, p.y - 8, 34, p.face - 1.2 + k * 1.2, p.face + k * 1.2); g.stroke();
    }
    // search progress ring on player
    const a = Game.action;
    if (a) {
      const k = clamp(a.t / a.need, 0, 1);
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(p.x, p.y - 40, 11, 0, TAU); g.stroke();
      g.strokeStyle = '#f5c542'; g.beginPath(); g.arc(p.x, p.y - 40, 11, -Math.PI / 2, -Math.PI / 2 + k * TAU); g.stroke();
    }
  },
  drawTarget(g, t) {
    const tg = Game.target; if (!tg || R.clean) return;
    const pulse = 1 + Math.sin(t * 6) * .08;
    g.strokeStyle = 'rgba(255,215,100,.75)'; g.lineWidth = 2; g.setLineDash([5, 4]);
    g.beginPath(); g.ellipse(tg.x, tg.y + 2, 22 * pulse, 11 * pulse, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  },
  drawPrompt(g) {
    const tg = Game.target; if (!tg || Game.paused || Game.action) return;
    if (tg.kind === 'node' && Game.time - (Game.lastLootT || -9) < 1.8 && nodeLooted(tg.node)) return;
    let [txt, bad] = promptFor(tg);
    if (!txt) return;
    const key = txt.startsWith(KEY_MARK); if (key) txt = txt.slice(1);
    const [sx, sy] = this.toScreen(tg.x, tg.y - 44);
    g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const kw = key ? 30 : 0;
    const w = g.measureText(txt).width + 18 + kw;
    g.fillStyle = bad ? 'rgba(90,20,20,.88)' : 'rgba(18,20,26,.85)';
    roundRect(g, sx - w / 2, sy - 16, w, 28, 8); g.fill();
    g.strokeStyle = bad ? 'rgba(255,110,110,.6)' : 'rgba(245,197,66,.55)'; g.lineWidth = 1; g.stroke();
    if (key) {
      const kx = sx - w / 2 + 18;
      if (Input.isTouch) { g.font = '16px system-ui'; g.fillText('✋', kx, sy - 1); }
      else { g.save(); g.scale(.8, .8); g.font = 'bold 15px system-ui, sans-serif'; drawKeycap(g, kx / .8, (sy - 2) / .8, keyLabel('KeyE'), 28); g.restore(); }
      g.font = 'bold 13px system-ui, sans-serif';
    }
    g.fillStyle = bad ? '#ffb0b0' : '#fff'; g.fillText(txt, sx + kw / 2, sy - 1);
    g.textBaseline = 'alphabetic';
  },
};

const KEY_MARK = '\u2063';
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function promptFor(tg) {
  const E = KEY_MARK; // drawn as a keycap (or a hand on touch) by drawPrompt
  switch (tg.kind) {
    case 'node': {
      const n = tg.node, d = NODES[n.type];
      if (n.type === 'pile') return [E + t('pickUp')];
      if (d.water) return [E + t('drinkFrom', L(d.n))];
      if (nodeLooted(n)) return [L(d.n) + ' · ' + t('emptyFor', respawnText(n)), true];
      if (d.tool && !S.tools[d.tool]) return ['🔒 ' + L(d.n) + ' · ' + CRAFT[d.tool].i + ' ' + L(CRAFT[d.tool].n), true];
      return [E + t('search') + ' ' + L(d.n)];
    }
    case 'bed': return [E + (S.builds.bed ? L(BUILDS.bed.n) : t('cardboardBed'))];
    case 'stash': return [E + t('stash')];
    case 'workbench': return [E + t('workbench')];
    case 'blueprint': return [E + t('build') + ' ' + BUILDS[tg.key].i + ' ' + L(BUILDS[tg.key].n)];
    case 'machine': {
      const m = S.machines[tg.key]; let ready = 0; for (const k in m.out) ready += m.out[k];
      return [E + L(BUILDS[tg.key].n) + (ready ? ' · ✅ ' + ready : m.q ? ' · ⏳ ' + m.q : '')];
    }
    case 'yield': return [E + L(BUILDS[tg.key].n) + ' · ' + (S.yields[tg.key] || 0) + ' ' + (tg.key === 'garden' ? ITEMS.veg.i : ITEMS.water.i)];
    case 'van': case 'vanstop': return [E + t('vanTravel')];
    case 'dealer': return [E + t('dealerPrompt')];
    case 'shop': return [E + t('shopPrompt')];
    case 'board': return [E + t('boardPrompt')];
    case 'gate': {
      const g = World.gates[tg.id];
      if (g.req && !S.tools[g.req]) return ['🔒 ' + t('gateLocked') + ' · ' + CRAFT[g.req].i + ' ' + L(CRAFT[g.req].n), true];
      return [E + (tg.id === 'west' ? t('cutBarricade') : t('cutLock'))];
    }
  }
  return [''];
}

// ---------- characters ----------
function drawPerson(g, x, y, face, walk, o) {
  const sw = Math.sin(walk * 1.0) * 5;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + 7, 11, 5, 0, 0, TAU); g.fill();
  g.save(); g.translate(x, y - 6);
  const fx = Math.cos(face), fy = Math.sin(face);
  // legs
  g.fillStyle = '#2e2f35';
  g.fillRect(-6, 5 + (fy > 0 ? sw * .3 : -sw * .3), 5, 8); g.fillRect(1, 5 - (fy > 0 ? sw * .3 : -sw * .3), 5, 8);
  // backpack behind (when facing down it's hidden behind body)
  const drawBag = () => {
    if (!o.bag) return;
    g.fillStyle = o.bag; const bs = o.bagSize || 1;
    g.save(); g.translate(-fx * 7, -fy * 5 - 2);
    roundRect(g, -8 * bs, -8 * bs, 16 * bs, 15 * bs, 4); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-8 * bs, 2 * bs, 16 * bs, 3); g.restore();
  };
  if (fy <= 0.2) {} else drawBag();
  // body
  g.fillStyle = o.body; roundRect(g, -9, -8, 18, 16, 6); g.fill();
  g.fillStyle = o.body2; g.fillRect(-9, 2, 18, 5);
  // arms
  g.fillStyle = o.body2;
  g.fillRect(-12, -5 + sw * .4, 4, 11); g.fillRect(8, -5 - sw * .4, 4, 11);
  g.fillStyle = o.skin; g.fillRect(-12, 5 + sw * .4, 4, 3); g.fillRect(8, 5 - sw * .4, 4, 3);
  if (fy <= 0.2) drawBag();
  // head
  g.fillStyle = o.skin; g.beginPath(); g.arc(0, -13, 7, 0, TAU); g.fill();
  g.fillStyle = o.hat; g.beginPath(); g.arc(0, -14.5, 7.2, Math.PI * 1.02, Math.PI * 1.98); g.fill();
  g.fillRect(-7, -16, 14, 3);
  if (fy > -0.3) {
    // face
    g.fillStyle = '#222'; g.fillRect(-3 + fx * 2, -13, 2, 2); g.fillRect(2 + fx * 2, -13, 2, 2);
    if (o.mask) { g.fillStyle = '#556'; g.fillRect(-4 + fx * 2, -10, 8, 4); g.fillStyle = '#9ad14f'; g.fillRect(-1 + fx * 2, -9, 2, 2); }
  }
  if (o.lamp) { g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(fx * 5, -17 + (fy < 0 ? -1 : 0), 2.2, 0, TAU); g.fill(); }
  if (o.apron) { g.fillStyle = o.apron; g.fillRect(-6, -4, 12, 11); }
  g.restore();
}
function drawNPC(g, kind, t) {
  if (kind === 'board') {
    const x = BOARD_POS.x, y = BOARD_POS.y;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 16, y - 2, 34, 6);
    g.fillStyle = '#5b3e24'; g.fillRect(x - 13, y - 8, 3, 10); g.fillRect(x + 10, y - 8, 3, 10);
    g.fillStyle = '#6b4a2e'; g.fillRect(x - 17, y - 34, 34, 26);
    g.fillStyle = '#c9a36a'; g.fillRect(x - 14, y - 31, 28, 20);
    const cols = ['#fff', '#ffe98a', '#bde0ff'];
    for (let i = 0; i < 3; i++) { g.fillStyle = cols[i]; g.save(); g.translate(x - 9 + i * 9, y - 22); g.rotate((i - 1) * .12); g.fillRect(-4, -6, 8, 11); g.fillStyle = '#c33'; g.fillRect(-1, -6, 2, 2); g.restore(); }
    return;
  }
  const pos = kind === 'dealer' ? DEALER_POS : SHOP_POS;
  const bob = Math.sin(t * 2 + (kind === 'dealer' ? 0 : 2)) * .6;
  if (kind === 'dealer') drawPerson(g, pos.x, pos.y + bob, Math.PI, 0, { body: '#8a5a3a', body2: '#6a4028', skin: '#c99670', hat: '#b33', apron: '#3f4a55' });
  else drawPerson(g, pos.x, pos.y + bob, Math.PI, 0, { body: '#3a6a8a', body2: '#2a4a62', skin: '#e2b894', hat: '#333' });
  // counter / scale
  if (kind === 'dealer') {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(pos.x - 24, pos.y + 8, 22, 6);
    g.fillStyle = '#5c6066'; g.fillRect(pos.x - 26, pos.y - 4, 20, 12); g.fillStyle = '#8a9096'; g.fillRect(pos.x - 25, pos.y - 6, 18, 4);
    g.fillStyle = '#1d1f22'; g.fillRect(pos.x - 22, pos.y - 1, 12, 5); g.fillStyle = '#7dff7a'; g.fillRect(pos.x - 21, pos.y, 6, 3);
  } else {
    g.fillStyle = '#7a5a3a'; g.fillRect(pos.x - 28, pos.y - 2, 18, 12);
    g.fillStyle = '#e04b3a'; g.beginPath(); g.arc(pos.x - 24, pos.y - 4, 3, 0, TAU); g.fill();
    g.fillStyle = '#f5c542'; g.beginPath(); g.arc(pos.x - 18, pos.y - 4, 3, 0, TAU); g.fill();
    g.fillStyle = '#6cc4ff'; g.fillRect(pos.x - 15, pos.y - 9, 4, 7);
  }
}
function drawDealerYard(g) {
  // decorative scrap piles & a container
  const piles = [[108, 105.8], [102, 99.8], [109.5, 110.4]];
  for (const [tx, ty] of piles) {
    const x = tx * TS, y = ty * TS;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 4, 26, 9, 0, 0, TAU); g.fill();
    const cols = ['#7a6a5a', '#8a8f96', '#6b4a3a', '#9a7a4a', '#5a5f66'];
    for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 5]; g.save(); g.translate(x + Math.sin(i * 2.3) * 18, y - 4 - (i % 4) * 3 + Math.cos(i * 1.7) * 4); g.rotate(i); g.fillRect(-6, -3, 12, 6); g.restore(); }
  }
}
function drawDog(g, d, t) {
  g.save(); g.translate(d.x, d.y);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 6, 14, 5, 0, 0, TAU); g.fill();
  const flip = Math.cos(d.face) < 0 ? -1 : 1;
  g.scale(flip, 1);
  const leg = Math.sin(d.walkT * 2) * 3;
  g.fillStyle = shade(d.col, -.3);
  g.fillRect(-9, 0 + leg * .5, 3, 7); g.fillRect(6, 0 - leg * .5, 3, 7); g.fillRect(-5, 0 - leg * .5, 3, 6); g.fillRect(3, 0 + leg * .5, 3, 6);
  g.fillStyle = d.col; roundRect(g, -12, -8, 22, 10, 5); g.fill();
  g.beginPath(); g.moveTo(-12, -6); g.lineTo(-18, -12 + Math.sin(t * 12) * 2); g.lineTo(-11, -3); g.fill();
  g.beginPath(); g.arc(11, -9, 6, 0, TAU); g.fill();
  g.fillRect(12, -9, 8, 5);
  g.fillStyle = shade(d.col, -.35); g.beginPath(); g.moveTo(8, -13); g.lineTo(10, -19); g.lineTo(13, -13); g.fill();
  g.fillStyle = d.state === 'chase' ? '#ff4a3a' : '#111'; g.fillRect(12, -11, 2, 2);
  g.fillStyle = '#111'; g.fillRect(19, -8, 2, 2);
  if (d.state === 'chase') { g.fillStyle = '#fff'; g.fillRect(16, -5, 3, 2); }
  g.restore();
  if (d.hp < d.max) {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(d.x - 14, d.y - 26, 28, 4);
    g.fillStyle = '#e04b3a'; g.fillRect(d.x - 14, d.y - 26, 28 * clamp(d.hp / d.max, 0, 1), 4);
  }
}
function drawCart(g, x, y, a, trike) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-14, -9, 28, 20);
  if (trike) {
    g.fillStyle = '#222'; g.fillRect(-14, -12, 8, 4); g.fillRect(-14, 8, 8, 4); g.fillRect(10, -2, 8, 4);
    g.fillStyle = '#2f7d4f'; g.fillRect(-16, -10, 20, 20); g.fillStyle = '#8a6a44'; g.fillRect(-14, -8, 16, 16);
    g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 0); g.lineTo(14, 0); g.stroke();
  } else {
    g.strokeStyle = '#b8bec4'; g.lineWidth = 1.5;
    g.strokeRect(-13, -9, 22, 18);
    for (let i = -9; i < 9; i += 4) { g.beginPath(); g.moveTo(-13, i); g.lineTo(9, i); g.stroke(); }
    g.beginPath(); g.moveTo(9, -9); g.lineTo(14, -9); g.lineTo(14, 9); g.lineTo(9, 9); g.stroke();
    g.fillStyle = '#8a6a44'; g.fillRect(-11, -6, 8, 6); g.fillStyle = '#3d6ea5'; g.fillRect(-4, 0, 7, 6);
  }
  g.restore();
}
function drawLamp(g, l) {
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(l.x + 2, l.y + 2, 5, 3, 0, 0, TAU); g.fill();
  g.fillStyle = '#3a3d42'; g.beginPath(); g.arc(l.x, l.y, 3.5, 0, TAU); g.fill();
  g.fillStyle = '#4a4d52'; g.fillRect(l.x - 1.5, l.y - 26, 3, 26);
  g.fillStyle = l.broken ? '#555' : (Game.darkness > .3 ? '#ffe7a0' : '#ccc');
  g.fillRect(l.x - 4, l.y - 29, 10, 4);
}

// ---------- base stations ----------
function drawStation(g, s, t) {
  const x = s.x, y = s.y;
  if (s.kind === 'blueprint') {
    g.save(); g.globalAlpha = .75;
    g.strokeStyle = 'rgba(120,190,255,.8)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    roundRect(g, x - 17, y - 22, 34, 28, 5); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(80,140,220,.12)'; g.fill();
    g.globalAlpha = .55; g.font = '16px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(BUILDS[s.key].i, x, y - 3);
    g.globalAlpha = .9; g.fillStyle = '#9cd0ff'; g.font = 'bold 11px system-ui'; g.fillText('+', x + 12, y - 12);
    g.restore(); return;
  }
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 2, y + 4, 18, 7, 0, 0, TAU); g.fill();
  switch (s.key) {
    case 'bed':
      if (S.builds.bed) {
        g.fillStyle = '#5a4030'; g.fillRect(x - 20, y - 12, 40, 20);
        g.fillStyle = '#e8e4da'; g.fillRect(x - 18, y - 13, 36, 18);
        g.fillStyle = '#3f6ea0'; g.fillRect(x - 6, y - 13, 24, 18); g.fillStyle = '#35608c'; g.fillRect(x - 6, y - 5, 24, 3);
        g.fillStyle = '#fff'; roundRect(g, x - 16, y - 10, 9, 12, 3); g.fill();
      } else {
        g.fillStyle = '#b08a5a'; g.fillRect(x - 19, y - 11, 38, 18); g.strokeStyle = 'rgba(0,0,0,.2)'; g.strokeRect(x - 19, y - 11, 19, 18);
        g.fillStyle = '#7a4a5a'; g.fillRect(x - 4, y - 11, 22, 15);
      }
      break;
    case 'stash':
      g.fillStyle = '#6b4a2e'; g.fillRect(x - 16, y - 20, 32, 22);
      g.fillStyle = '#7d5836'; g.fillRect(x - 16, y - 24, 32, 7);
      g.fillStyle = '#4a4d52'; g.fillRect(x - 12, y - 24, 3, 26); g.fillRect(x + 9, y - 24, 3, 26);
      g.fillStyle = '#d6b25a'; g.fillRect(x - 3, y - 17, 6, 6);
      break;
    case 'workbench':
      g.fillStyle = '#4a3322'; g.fillRect(x - 19, y - 6, 4, 10); g.fillRect(x + 15, y - 6, 4, 10);
      g.fillStyle = '#8a6a44'; g.fillRect(x - 21, y - 20, 42, 16); g.fillStyle = '#9d7a50'; g.fillRect(x - 21, y - 20, 42, 4);
      g.fillStyle = '#5c6066'; g.fillRect(x + 8, y - 24, 10, 8); g.fillStyle = '#9aa0a6'; g.fillRect(x - 14, y - 16, 12, 3);
      g.fillStyle = '#c33'; g.fillRect(x - 4, y - 18, 3, 9); g.fillStyle = '#777'; g.fillRect(x - 8, y - 19, 11, 3);
      break;
    case 'rainbarrel': {
      g.fillStyle = '#2f6fb0'; g.fillRect(x - 11, y - 22, 22, 24); g.fillStyle = '#3b82c8'; g.beginPath(); g.ellipse(x, y - 22, 11, 5, 0, 0, TAU); g.fill();
      const lvl = clamp((S.yields.rainbarrel || 0) / 12, 0, 1);
      g.fillStyle = '#1a3a5a'; g.beginPath(); g.ellipse(x, y - 22, 8, 3.5, 0, 0, TAU); g.fill();
      if (lvl > 0) { g.fillStyle = '#6cc4ff'; g.beginPath(); g.ellipse(x, y - 22, 8 * lvl + 2, 3 * lvl + 1, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#244f7c'; g.fillRect(x - 11, y - 14, 22, 2); g.fillRect(x - 11, y - 5, 22, 2);
      break;
    }
    case 'garden': {
      g.fillStyle = '#6b4a2e'; g.fillRect(x - 24, y - 14, 48, 20); g.fillStyle = '#4a3322'; g.fillRect(x - 21, y - 11, 42, 14);
      const n = S.yields.garden || 0;
      for (let i = 0; i < 6; i++) {
        const px = x - 17 + i * 7, gr = i < n ? 1 : .45;
        g.fillStyle = '#4f9a3a'; g.beginPath(); g.ellipse(px, y - 6, 3 * gr + 1, 5 * gr + 1, 0, 0, TAU); g.fill();
        if (i < n) { g.fillStyle = '#e6782a'; g.fillRect(px - 1, y - 2, 3, 4); }
      }
      break;
    }
    case 'solar':
      for (let i = 0; i < 2; i++) {
        g.fillStyle = '#9aa0a6'; g.fillRect(x - 20 + i * 21, y - 4, 2, 8);
        g.fillStyle = '#1f3a6a'; g.fillRect(x - 21 + i * 21, y - 22, 19, 18);
        g.strokeStyle = 'rgba(160,200,255,.45)'; g.lineWidth = 1;
        for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(x - 21 + i * 21 + k * 6.3, y - 22); g.lineTo(x - 21 + i * 21 + k * 6.3, y - 4); g.stroke(); }
        g.beginPath(); g.moveTo(x - 21 + i * 21, y - 13); g.lineTo(x - 2 + i * 21, y - 13); g.stroke();
      }
      break;
    case 'van': drawVan(g, x, y); break;
    default: drawMachine(g, s.key, x, y, t);
  }
}
function drawMachine(g, key, x, y, t) {
  const m = S.machines[key];
  const on = m && m.q > 0;
  const sh = on ? Math.sin(t * 40) * .6 : 0;
  g.save(); g.translate(x + sh, y);
  const box = (c, w, h) => { g.fillStyle = shade(c, -.3); g.fillRect(-w / 2, -h + 4, w, h - 4); g.fillStyle = c; g.fillRect(-w / 2, -h, w, h - 6); g.fillStyle = shade(c, .18); g.fillRect(-w / 2, -h, w, 3); };
  switch (key) {
    case 'shredder': box('#5f7a5a', 28, 24); g.fillStyle = '#3a3d42'; g.beginPath(); g.moveTo(-12, -24); g.lineTo(12, -24); g.lineTo(8, -16); g.lineTo(-8, -16); g.fill(); break;
    case 'crusher': box('#3d6ea5', 28, 24); g.fillStyle = '#777'; g.beginPath(); g.arc(0, -13, 7, 0, TAU); g.fill(); g.fillStyle = '#555'; g.fillRect(-7, -14, 14, 2); break;
    case 'baler': box('#d6a72a', 26, 28); g.fillStyle = '#3a3d42'; g.fillRect(-9, -22, 18, 12); g.fillStyle = '#b08a5a'; g.fillRect(-7, -14, 14, 4); break;
    case 'smelter': {
      g.fillStyle = '#7a3a2a'; g.fillRect(-15, -26, 30, 26);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
      for (let r = 0; r < 5; r++) { g.beginPath(); g.moveTo(-15, -26 + r * 5); g.lineTo(15, -26 + r * 5); g.stroke(); }
      g.fillStyle = '#555'; g.fillRect(6, -36, 7, 12);
      g.fillStyle = on ? `rgb(255,${120 + Math.sin(t * 9) * 40},30)` : '#2a1a14';
      g.beginPath(); g.arc(0, -8, 7, Math.PI, 0); g.fill(); g.fillRect(-7, -8, 14, 6);
      if (on && Math.random() < .2) Game.particles.push({ x: x + 9, y: y - 36, vx: (Math.random() - .5) * 10, vy: -30, life: 1, max: 1, col: 'rgba(120,120,120,.6)', size: 4 });
      break;
    }
    case 'tirecutter': box('#3a3d42', 28, 22); g.strokeStyle = '#c0c4c8'; g.lineWidth = 2; g.beginPath(); g.arc(0, -12, 6, t * (on ? 12 : 0), t * (on ? 12 : 0) + 5); g.stroke(); break;
    case 'stripper': box('#a53a3a', 24, 20); g.fillStyle = '#c87533'; g.beginPath(); g.arc(0, -11, 5, 0, TAU); g.fill(); g.fillStyle = '#6b3a2a'; g.beginPath(); g.arc(0, -11, 2, 0, TAU); g.fill(); break;
    case 'filter':
      g.fillStyle = '#9aa0a6'; g.fillRect(-10, -28, 20, 28); g.fillStyle = '#6cc4ff'; g.fillRect(-7, -22, 14, 16); g.fillStyle = '#c0c4c8'; g.beginPath(); g.ellipse(0, -28, 10, 4, 0, 0, TAU); g.fill();
      g.fillStyle = '#777'; g.fillRect(10, -8, 8, 3); break;
    case 'stove':
      box('#4a4d52', 26, 20); g.fillStyle = '#6b6f75'; g.beginPath(); g.ellipse(0, -20, 9, 4, 0, 0, TAU); g.fill();
      if (on && Math.random() < .15) Game.particles.push({ x: x, y: y - 24, vx: (Math.random() - .5) * 8, vy: -25, life: 1, max: 1, col: 'rgba(230,230,230,.5)', size: 3 });
      break;
    case 'ebench':
      g.fillStyle = '#4a3322'; g.fillRect(-18, -4, 4, 8); g.fillRect(14, -4, 4, 8);
      g.fillStyle = '#7a6a5a'; g.fillRect(-20, -18, 40, 14);
      g.fillStyle = '#2f7d4f'; g.fillRect(-12, -16, 14, 9); g.fillStyle = '#d6b25a'; g.fillRect(-10, -14, 2, 2); g.fillRect(-4, -12, 2, 2);
      g.fillStyle = '#333'; g.fillRect(6, -26, 2, 12); g.fillStyle = '#ffe98a'; g.fillRect(4, -28, 8, 4); break;
  }
  if (on) { g.fillStyle = Math.sin(t * 8) > 0 ? '#7dff7a' : '#2f7d2f'; g.fillRect(10, -4, 3, 3); }
  g.restore();
  if (!m || R.clean) return;
  // progress bar & output bubble
  const r = BUILDS[key].m[m.sel];
  if (m.q > 0) {
    const k = clamp(m.prog / r.t, 0, 1);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 14, y + 6, 28, 4);
    g.fillStyle = '#f5c542'; g.fillRect(x - 14, y + 6, 28 * k, 4);
  }
  let ready = 0; for (const k in m.out) ready += m.out[k];
  if (ready) {
    const by = y - 40 + Math.sin(t * 3) * 2;
    g.fillStyle = 'rgba(30,110,50,.92)'; roundRect(g, x - 16, by - 11, 32, 18, 8); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText('✓' + ready, x, by + 2);
  }
}
function drawCampfire(g, x, y, t) {
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 2, y + 3, 14, 6, 0, 0, TAU); g.fill();
  g.fillStyle = '#6a3a22'; g.fillRect(x - 10, y - 18, 20, 20);
  g.fillStyle = '#7d4a2a'; g.fillRect(x - 10, y - 10, 20, 2);
  g.fillStyle = '#2a1a14'; g.beginPath(); g.ellipse(x, y - 18, 10, 4, 0, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) {
    const h = 10 + Math.sin(t * 10 + i * 1.7) * 4 + (i === 2 ? 6 : 0);
    const fx = x - 8 + i * 4;
    g.fillStyle = i % 2 ? '#ffb030' : '#ff6a20';
    g.beginPath(); g.moveTo(fx - 3, y - 18); g.lineTo(fx, y - 18 - h); g.lineTo(fx + 3, y - 18); g.fill();
  }
  g.fillStyle = '#ffe98a'; g.beginPath(); g.moveTo(x - 2, y - 18); g.lineTo(x, y - 26 - Math.sin(t * 13) * 3); g.lineTo(x + 2, y - 18); g.fill();
  if (Math.random() < .08) Game.particles.push({ x: x + (Math.random() - .5) * 10, y: y - 24, vx: (Math.random() - .5) * 20, vy: -60, life: .8, max: .8, col: '#ffb030', size: 2 });
}
function drawLockGate(g) {
  const x = 95 * TS, y = 104 * TS;
  g.fillStyle = '#5c6066'; g.fillRect(x + 22, y - 10, 6, 10);
  g.strokeStyle = '#8a9096'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x + 24, y - 8 + i * 4); g.lineTo(x + 24 + 30, y - 8 + i * 4 + 8); g.stroke(); }
  g.fillStyle = '#d6b25a'; g.fillRect(x + 18, y + 4, 8, 7); g.strokeStyle = '#8a7a50'; g.beginPath(); g.arc(x + 22, y + 4, 3, Math.PI, 0); g.stroke();
}
function drawVan(g, x, y) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-30, -10, 64, 28);
  g.fillStyle = '#222'; g.fillRect(-24, -16, 10, 4); g.fillRect(14, -16, 10, 4); g.fillRect(-24, 12, 10, 4); g.fillRect(14, 12, 10, 4);
  g.fillStyle = '#e8e4da'; roundRect(g, -30, -14, 60, 28, 6); g.fill();
  g.fillStyle = '#2f7d4f'; g.fillRect(-30, -2, 60, 5);
  g.fillStyle = '#6fa0c0'; g.fillRect(18, -11, 9, 22);
  g.fillStyle = '#2f7d4f'; g.font = 'bold 8px system-ui'; g.textAlign = 'center'; g.fillText('♻ URBAN SCRAP', -4, -5);
  g.restore();
}

// ---------- scavenge nodes ----------
function drawNode(g, n, looted, t) {
  g.save(); g.translate(n.x, n.y);
  const h = hash2(typeof n.id === 'number' ? n.id : 7, 3, 11);
  if (looted) g.globalAlpha = .42;
  const sh = (w, hh) => { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(2, 3, w, hh || w * .4, 0, 0, TAU); g.fill(); };
  const rect = (c, x, y, w, hh) => { g.fillStyle = c; g.fillRect(x, y, w, hh); };
  switch (n.type) {
    case 'trashbag': {
      sh(13);
      const c = h < .6 ? '#1f2226' : h < .8 ? '#2d4a2d' : '#2a3a5a';
      if (!looted) { g.fillStyle = shade(c, .1); g.beginPath(); g.ellipse(8, -4, 8, 7, 0, 0, TAU); g.fill(); }
      g.fillStyle = c; g.beginPath(); g.ellipse(-2, -7, 11, 10, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-2, -17, 3.5, 3, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.ellipse(-6, -10, 3, 5, -.4, 0, TAU); g.fill();
      if (looted) { g.strokeStyle = '#666'; g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -4); g.lineTo(2, -12); g.stroke(); }
      break;
    }
    case 'dumpster': {
      sh(22, 8);
      const c = h < .5 ? '#2f6b3a' : h < .8 ? '#3d5a8a' : '#8a4a2a';
      rect(shade(c, -.3), -20, -8, 40, 12); rect(c, -20, -24, 40, 18);
      rect(shade(c, .15), -21, -28, 42, 5);
      if (!looted) { const cols = ['#d9d9d9', '#b08a5a', '#c94b4b', '#222', '#4b7bc9']; for (let i = 0; i < 6; i++) rect(cols[i % 5], -15 + i * 5, -31 - (i % 3) * 2, 5, 4); }
      rect('rgba(0,0,0,.25)', -16, -20, 32, 2); rect('#222', -18, 3, 5, 3); rect('#222', 13, 3, 5, 3);
      break;
    }
    case 'cardboard':
      sh(14); rect('#9a7548', -14, -12, 16, 14); rect('#b08a5a', -12, -22, 14, 11); rect('#a8825a', 0, -10, 13, 12);
      if (!looted) { rect('#d8c49a', -12, -18, 14, 2); rect('#d8c49a', 0, -5, 13, 2); }
      break;
    case 'canpile': {
      sh(12);
      const cols = ['#c8452f', '#b8bec4', '#3d6ea5', '#2f7d4f', '#d6a72a'];
      const n2 = looted ? 2 : 7;
      for (let i = 0; i < n2; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.ellipse(-8 + (i % 4) * 5, -4 - Math.floor(i / 4) * 5, 3, 4, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-9 + (i % 4) * 5, -6 - Math.floor(i / 4) * 5, 1, 3); }
      break;
    }
    case 'bottles':
      sh(13); rect('#3d6ea5', -13, -14, 26, 16); rect('#2c5585', -13, -2, 26, 3);
      if (!looted) for (let i = 0; i < 6; i++) { g.fillStyle = i % 3 === 1 ? '#8a5a2a' : '#3a8a3a'; g.beginPath(); g.arc(-8 + (i % 3) * 8, -10 + Math.floor(i / 3) * 6, 3, 0, TAU); g.fill(); }
      break;
    case 'vending':
      sh(14); rect('#8a2a1f', -13, -38, 26, 40); rect('#c8452f', -13, -40, 26, 36);
      rect('#1a2a3a', -10, -36, 14, 24);
      if (!looted) for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.fillStyle = ['#ffd76a', '#6cc4ff', '#7dff7a', '#ff8a6a'][(r + c) % 4]; g.fillRect(-9 + c * 4.5, -34 + r * 6, 3, 4); }
      else { g.strokeStyle = '#aaa'; g.lineWidth = 1; g.beginPath(); g.moveTo(-10, -36); g.lineTo(0, -24); g.lineTo(-6, -12); g.stroke(); }
      rect('#222', 6, -30, 4, 8); rect('#111', -9, -9, 18, 4);
      break;
    case 'bike':
      sh(16, 5); g.strokeStyle = '#222'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(-10, -6, 7, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(10, -6, 7, 5, .4, 0, TAU); g.stroke();
      g.strokeStyle = '#a5532a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, -6); g.lineTo(-2, -14); g.lineTo(8, -14); g.lineTo(10, -6); g.moveTo(-2, -14); g.lineTo(0, -6); g.lineTo(-10, -6); g.stroke();
      break;
    case 'fountain':
      if (n.tap) {
        sh(8); g.fillStyle = 'rgba(80,140,200,.5)'; g.beginPath(); g.ellipse(0, 2, 10, 4, 0, 0, TAU); g.fill();
        rect('#6b7278', -3, -20, 6, 20); rect('#8a9096', -3, -22, 10, 4); g.fillStyle = '#6cc4ff'; g.fillRect(5, -18 + (t * 40 % 14), 2, 3);
      } else {
        sh(26, 10); g.fillStyle = '#8a8680'; g.beginPath(); g.ellipse(0, -4, 26, 16, 0, 0, TAU); g.fill();
        g.fillStyle = '#3b7ab0'; g.beginPath(); g.ellipse(0, -5, 21, 12, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(200,230,255,.5)'; g.lineWidth = 1;
        for (let i = 0; i < 2; i++) { const r = ((t * 12 + i * 10) % 20); g.beginPath(); g.ellipse(0, -5, r, r * .55, 0, 0, TAU); g.stroke(); }
        rect('#a09a90', -3, -20, 6, 15); g.fillStyle = '#9fd4ff'; g.beginPath(); g.arc(0, -22, 3 + Math.sin(t * 6), 0, TAU); g.fill();
      }
      break;
    case 'fridge':
      sh(13); rect('#b0b0a8', -12, -36, 24, 38); rect('#dcdcd2', -12, -38, 24, 34); rect('rgba(0,0,0,.2)', -12, -24, 24, 1.5);
      rect('#888', 7, -34, 2, 7); rect('#888', 7, -21, 2, 10);
      if (h < .6) { g.fillStyle = 'rgba(140,80,30,.45)'; g.beginPath(); g.arc(-5, -10, 3, 0, TAU); g.fill(); }
      break;
    case 'washer':
      sh(14); rect('#b0b0a8', -13, -26, 26, 28); rect('#e0e0d8', -13, -28, 26, 24); rect('#999', -13, -28, 26, 5);
      g.fillStyle = '#556'; g.beginPath(); g.arc(0, -14, 7, 0, TAU); g.fill(); g.strokeStyle = '#aaa'; g.lineWidth = 2; g.stroke();
      break;
    case 'tv':
      sh(14); rect('#1d1d1f', -14, -22, 28, 22); rect(looted ? '#333' : '#4a5566', -11, -19, 20, 15);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(-9, -17, 6, 4);
      g.strokeStyle = '#555'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-2, -22); g.lineTo(-8, -30); g.moveTo(2, -22); g.lineTo(8, -31); g.stroke();
      break;
    case 'yardbox':
      sh(14); rect('#9a7548', -14, -14, 28, 16); rect('#c9a36a', -16, -18, 8, 5); rect('#c9a36a', 8, -18, 8, 5);
      if (!looted) { rect('#c94b4b', -10, -18, 6, 6); rect('#4b7bc9', -2, -20, 5, 7); rect('#e8d46a', 4, -17, 5, 4); g.fillStyle = '#fff'; g.font = '8px system-ui'; g.textAlign = 'center'; g.fillText('$', -6, -12); }
      break;
    case 'car': {
      g.rotate(n.rot || 0); if (n.flip) g.scale(-1, 1);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-26, -10, 56, 26);
      const c = ['#7a3a2a', '#3a4a5a', '#6a6a3a', '#5a3a5a', '#8a7a6a'][Math.floor(h * 5)];
      rect('#151515', -20, -15, 10, 4); rect('#151515', 12, -15, 10, 4); rect('#151515', -20, 11, 10, 4); rect('#151515', 12, 11, 10, 3);
      g.fillStyle = c; roundRect(g, -27, -13, 54, 26, 6); g.fill();
      g.fillStyle = shade(c, -.25); roundRect(g, -14, -10, 26, 20, 4); g.fill();
      rect('#2a3440', 10, -10, 6, 20); rect('#2a3440', -16, -9, 4, 18);
      g.fillStyle = 'rgba(160,80,30,.45)'; g.beginPath(); g.arc(-20 + h * 30, -4, 4, 0, TAU); g.fill();
      if (!looted) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(11, -8); g.lineTo(15, 2); g.lineTo(12, 8); g.stroke(); }
      else { rect('#333', 18, -11, 9, 22); }
      break;
    }
    case 'house': case 'shop': case 'atm': {
      if (n.type === 'house') {
        rect('#4a2e1e', -10, -24, 20, 24);
        if (!looted) { g.strokeStyle = '#9a7a4a'; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, -20); g.lineTo(10, -8); g.moveTo(10, -20); g.lineTo(-10, -8); g.stroke(); }
        else rect('#111', -8, -22, 16, 22);
        g.fillStyle = 'rgba(200,60,60,.8)'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.fillText('X', 0, -2);
      } else if (n.type === 'shop') {
        rect('#5a5f66', -16, -26, 32, 26);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
        for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(-16, -24 + i * 3.5); g.lineTo(16, -24 + i * 3.5); g.stroke(); }
        if (looted) rect('#111', -14, -10, 28, 10);
        rect('#c8452f', -18, -30, 36, 6);
      } else {
        rect('#4a5a6a', -12, -28, 24, 28); rect('#1a2a3a', -8, -24, 16, 9);
        g.fillStyle = looted ? '#333' : '#6cc4ff'; g.fillRect(-6, -22, 12, 5);
        for (let i = 0; i < 6; i++) rect('#9aa0a6', -6 + (i % 3) * 5, -12 + Math.floor(i / 3) * 4, 3, 2);
        rect('#111', -6, -4, 12, 2);
      }
      break;
    }
    case 'pipes':
      sh(18, 6);
      for (let i = 0; i < 3; i++) { const yy = -6 - i * 6, xx = (i % 2) * 4 - 2; rect(i === 1 ? '#8a5a3a' : '#7a7f86', -16 + xx, yy - 3, 30, 6); g.fillStyle = '#3a3d42'; g.beginPath(); g.ellipse(14 + xx, yy, 2, 3, 0, 0, TAU); g.fill(); }
      break;
    case 'drums':
      sh(16);
      for (let i = 0; i < (looted ? 1 : 3); i++) { const dx = [-7, 7, 0][i], dy = [0, 0, -9][i]; const c = ['#2f5f9a', '#a53a2a', '#6a7a3a'][i]; g.fillStyle = shade(c, -.3); g.fillRect(dx - 7, dy - 12, 14, 12); g.fillStyle = c; g.beginPath(); g.ellipse(dx, dy - 12, 7, 4, 0, 0, TAU); g.fill(); g.strokeStyle = shade(c, .3); g.lineWidth = 1; g.stroke(); }
      break;
    case 'cable':
      sh(15); g.fillStyle = '#7a5a3a'; g.beginPath(); g.ellipse(0, -8, 15, 12, 0, 0, TAU); g.fill();
      if (!looted) { g.fillStyle = '#c87533'; g.beginPath(); g.ellipse(0, -8, 11, 8.5, 0, 0, TAU); g.fill(); g.strokeStyle = '#a55a22'; g.lineWidth = 1; for (let i = 3; i < 11; i += 2) { g.beginPath(); g.ellipse(0, -8, i, i * .77, 0, 0, TAU); g.stroke(); } }
      g.fillStyle = '#4a3322'; g.beginPath(); g.ellipse(0, -8, 3, 2.5, 0, 0, TAU); g.fill();
      break;
    case 'forklift':
      sh(20, 8); rect('#222', -14, -4, 8, 5); rect('#222', 8, -4, 8, 5);
      rect('#d6a72a', -16, -24, 30, 22); rect('#b08a1a', -16, -6, 30, 4); rect('#333', -10, -20, 14, 10);
      rect('#777', 14, -30, 3, 28); rect('#999', 17, -6, 12, 3); rect('#999', 17, -12, 12, 3);
      break;
    case 'crate':
      sh(14); rect('#8a6a44', -13, -24, 26, 26); rect('#6b4a2e', -13, -24, 26, 3); rect('#6b4a2e', -13, -1, 26, 3); rect('#6b4a2e', -13, -24, 3, 26); rect('#6b4a2e', 10, -24, 3, 26);
      g.fillStyle = 'rgba(30,30,30,.6)'; g.font = 'bold 7px system-ui'; g.textAlign = 'center'; g.fillText(looted ? '' : 'MOTOR', 0, -9);
      break;
    case 'transformer':
      sh(18); rect('#6b7278', -16, -30, 32, 32); rect('#8a9096', -16, -32, 32, 5);
      for (let i = 0; i < 5; i++) rect('#5c6066', -14 + i * 6, -24, 3, 20);
      g.fillStyle = '#f5c542'; g.beginPath(); g.moveTo(0, -22); g.lineTo(7, -10); g.lineTo(-7, -10); g.fill(); g.fillStyle = '#111'; g.font = 'bold 8px system-ui'; g.textAlign = 'center'; g.fillText('⚡', 0, -12);
      break;
    case 'heap': {
      sh(20, 8); g.fillStyle = '#3a3a2a'; g.beginPath(); g.ellipse(0, -4, 20, 11, 0, 0, TAU); g.fill();
      const cols = ['#2f7d4f', '#1d1d1f', '#9aa0a6', '#3d6ea5', '#d6a72a', '#c8452f'];
      for (let i = 0; i < (looted ? 3 : 12); i++) { g.fillStyle = cols[i % 6]; g.save(); g.translate(Math.sin(i * 2.1 + h * 5) * 13, -6 + Math.cos(i * 1.3) * 5 - (i % 3) * 2); g.rotate(i + h); g.fillRect(-4, -2.5, 8, 5); if (i % 6 === 0) { g.fillStyle = '#d6b25a'; g.fillRect(-2, -1, 1, 1); g.fillRect(1, 0, 1, 1); } g.restore(); }
      break;
    }
    case 'crt':
      sh(16); rect('#bdb49a', -16, -14, 18, 16); rect('#333', -13, -11, 12, 10);
      rect('#a8a08a', -2, -26, 18, 16); rect(looted ? '#222' : '#445', 1, -23, 12, 10);
      break;
    case 'batteries':
      sh(14);
      for (let i = 0; i < (looted ? 1 : 5); i++) { const bx = -12 + (i % 3) * 9, by = -8 - Math.floor(i / 3) * 8; rect('#1d1d1f', bx, by, 8, 7); rect('#c8452f', bx + 1, by - 2, 2, 2); rect('#666', bx + 5, by - 2, 2, 2); }
      break;
    case 'server':
      sh(13); rect('#111316', -12, -40, 24, 42); rect('#1d2026', -10, -38, 20, 36);
      for (let i = 0; i < 7; i++) { rect('#2a2e36', -9, -36 + i * 5, 18, 4); if (!looted) { g.fillStyle = Math.sin(t * 4 + i * 1.7 + h * 9) > .2 ? '#7dff7a' : '#1f5f1f'; g.fillRect(6, -35 + i * 5, 2, 2); } }
      break;
    case 'office':
      sh(18, 7); rect('#4a3322', -18, -6, 4, 8); rect('#4a3322', 14, -6, 4, 8); rect('#7a5a3a', -20, -18, 40, 14);
      if (!looted) { rect('#222', -8, -30, 16, 12); rect('#3a4a5a', -6, -28, 12, 8); rect('#eee', 8, -16, 8, 6); rect('#ddd', 9, -18, 8, 6); }
      break;
    case 'hdd':
      sh(14);
      for (let i = 0; i < (looted ? 2 : 7); i++) { g.save(); g.translate(-9 + (i % 4) * 6, -4 - Math.floor(i / 4) * 6); g.rotate((i - 3) * .15); rect('#8a9096', -4, -3, 9, 6); rect('#5c6066', -1, -1, 3, 3); g.restore(); }
      break;
    case 'dump': {
      sh(26, 10);
      g.fillStyle = '#4a4238'; g.beginPath(); g.ellipse(0, -6, 26, 14, 0, 0, TAU); g.fill();
      const cols = ['#8a9096', '#c87533', '#2f7d4f', '#3d6ea5', '#d6a72a', '#1d1d1f', '#a53a2a'];
      for (let i = 0; i < 18; i++) { g.fillStyle = cols[i % 7]; g.save(); g.translate(Math.sin(i * 2.4) * 19, -8 + Math.cos(i * 1.9) * 7 - (i % 3) * 3); g.rotate(i * 1.3); g.fillRect(-5, -3, 10, 6); g.restore(); }
      const sp = (t * 2) % 1;
      g.fillStyle = `rgba(255,230,120,${1 - sp})`; g.font = '14px system-ui'; g.textAlign = 'center'; g.fillText('✨', Math.sin(t) * 10, -26 - sp * 10);
      g.fillStyle = '#ffd76a'; g.font = 'bold 16px system-ui'; g.fillText('★', 0, -34 + Math.sin(t * 3) * 3);
      break;
    }
    case 'pile': {
      sh(12); g.fillStyle = '#8a6a44'; g.beginPath(); g.ellipse(0, -6, 11, 9, 0, 0, TAU); g.fill();
      g.fillStyle = '#6b4a2e'; g.beginPath(); g.ellipse(0, -14, 4, 3, 0, 0, TAU); g.fill();
      const k = Object.keys(n.items)[0];
      if (k) { g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText(ITEMS[k].i, 0, -20 + Math.sin(t * 3) * 2); }
      break;
    }
  }
  g.restore();
}
