// Generates CrazyGames promo assets from the real game.
//   python3 -m http.server 8765        (in the repo root)
//   NODE_PATH=$(npm root -g) node promo/capture.js [outDir] [all|covers]
// Needs playwright (with chromium) and an ffmpeg with libx264 in $FFMPEG (or on PATH).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const URL = 'http://localhost:8765/index.html';
const OUT = path.resolve(process.argv[2] || path.join(__dirname));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;
fs.mkdirSync(OUT, { recursive: true });

// ---------- in-page helpers (scene setup + scripted shots) ----------
const PAGE_HELPERS = `
hint = function () {};
window.__setup = function (lang) {
  try { localStorage.clear(); } catch (e) {}
  LANG = lang; applyLang();
  const st = newState(); st.seed = 424242; st.daily = { last: dateKey(new Date()), streak: 3 };
  startGame(st); UI.modalClose();
  S.cash = 2480; S.level = 14; S.xp = 120;
  for (const k of TOOL_ORDER) S.tools[k] = 1;
  Object.assign(S.gear, { bag: 'hikingpack', cart: 'trike', gloves: 1, boots: 1, respirator: 1, headlamp: 1 });
  for (const k in BUILDS) { S.builds[k] = 1; S.flags['bp_' + k] = 1; if (BUILDS[k].m) S.machines[k] = { lvl: 2, sel: 0, q: 20, prog: 4, out: {} }; }
  S.yields.garden = 5; S.yields.rainbarrel = 6;
  S.flags.gate_east = 1; S.flags.gate_west = 1; World.gateOpen.east = true; World.gateOpen.west = true;
  World.chunkCache.clear(); buildMapCanvas();
  S.quest = QUESTS.findIndex(q => q.id === 'atm'); S.visited = { center: true, north: true, east: true, south: true, west: true };
  for (let i = 0; i < 48 * 48; i++) Game.explored[i] = 1;
  S.inv = { copper: 14, scrap: 12, ewaste: 6, plastic: 18 };
  S.stash = { steel: 18, alu: 9, pellets: 26, cuingot: 7, components: 4 };
  S.p.hunger = 72; S.p.thirst = 64; S.p.energy = 81;
  S.weather = 'clear'; S.event = null; clearDumpNode();
  S.collection = { coin: 1, duck: 1, comic: 1, robot: 1, vinyl: 1, medal: 1 };
};
window.__zoom = function (z, cs) { R.zoom = z; R.chunkScale = cs; World.chunkCache.clear(); };
const setTime = h => { S.totalMin = Math.floor(S.totalMin / 1440) * 1440 + Math.round(h * 60); };
const place = (x, y, face) => { const p = Game.player; p.x = x; p.y = y; p.face = face; R.cam.x = x; R.cam.y = y; R.cartPos = null; };
const reset = () => {
  R.clean = false;
  Input.keys = {}; Input.pressed = {}; Game.action = null; Game.dogs = []; Game.particles = []; Game.floaters = [];
  S.nodes = {}; S.p.hp = maxHp(); Game.paused = false; Game.hurtT = 0;
  document.getElementById('toasts').innerHTML = ''; document.getElementById('areaName').classList.remove('show');
  document.getElementById('collect').classList.remove('show'); document.getElementById('banner').classList.remove('show');
};
const nearestNode = (type, x, y, reg) => {
  let best = null, bd = 1e18;
  for (const n of World.nodes) if (n.type === type && (!reg || n.reg === reg) && typeof n.id === 'number') {
    const d = dist2(n.x, n.y, x, y);
    if (d < bd && !isSolid(Math.floor(n.x / TS), Math.floor((n.y + 24) / TS))) { bd = d; best = n; }
  }
  return best;
};
const makeDog = (x, y) => {
  const tier = DISTRICTS[regionAt(Math.floor(x / TS), Math.floor(y / TS))].tier;
  const d = { x, y, face: Math.PI, hp: 36 + tier * 8, max: 36 + tier * 8, state: 'chase', t: 0, bite: .6, wx: 0, wy: 0, walkT: 0, kb: { x: 0, y: 0 }, col: '#8a6a4a' };
  d.hp = d.max = 110; Game.dogs.push(d); return d;
};
const setRegion = r => { Game.curRegion = r; document.getElementById('district').innerHTML = '<span style="color:' + DISTRICTS[r].col + '">◆</span> ' + L(DISTRICTS[r].n); };
const fastSearch = need => { if (Game.action) Game.action.need = need; };
window.__shots = {
  // 1. scavenging a dumpster in the Backstreets
  search(i) {
    if (i === 0) { reset(); setTime(10.3); const n = nearestNode('dumpster', 89 * TS, 118 * TS); window.__n = n; place(n.x - 120, n.y + 24, 0); Input.keys = { KeyD: true }; }
    if (i === 22) { Input.keys = {}; Game.player.x = window.__n.x; }
    if (i === 24) Input.press('interact');
    if (i === 26) fastSearch(1.5);
    if (i === 78) Input.keys = { KeyS: true, KeyD: true };
  },
  // 2. base at dusk: machines running, collecting smelted steel
  base(i) {
    if (i === 0) { reset(); R.clean = true; setTime(19.15); place(93.2 * TS, 107.4 * TS, Math.PI); Input.keys = { KeyA: true }; for (const k in S.machines) { S.machines[k].out = {}; S.machines[k].q = 3; S.machines[k].prog = Math.random() * 5; } }
    if (i === 52) Input.keys = {};
    if (i === 58) { S.machines.smelter.out = { steel: 12 }; S.machines.stripper.out = { cuingot: 6 }; collectMachine('smelter'); }
    if (i === 70) collectMachine('stripper');
  },
  // 3. selling to Rusty
  dealer(i) {
    if (i === 0) { reset(); setTime(16.4); place(97.6 * TS, 103.6 * TS, 0); Input.keys = { KeyD: true }; }
    if (i === 32) Input.keys = { KeyW: true };
    if (i === 40) Input.keys = {};
    if (i === 46) {
      const before = S.cash;
      for (const k of ['copper', 'ewaste', 'plastic', 'scrap']) sellItem(k, 999, false);
      S.cash = before + 1240;
      floater(DEALER_POS.x, DEALER_POS.y - 34, '+' + fmtMoney(1240), '#7dff7a'); burst(DEALER_POS.x, DEALER_POS.y - 20, '#7dff7a', 18, 90);
      UI.toast('+' + fmtMoney(1240), 'good');
    }
  },
  // 4. night in the industrial zone, fending off a stray dog with the headlamp on
  night(i) {
    if (i === 0) {
      // under a working street lamp so the fight is readable at night
      reset(); setTime(22.2); place(132.2 * TS, 98.4 * TS, 0); setRegion('east');
      for (const l of World.lights) if (Math.abs(l.x - 131 * TS) < 40 && Math.abs(l.y - 99 * TS) < 40) l.broken = false;
      makeDog(Game.player.x + 170, Game.player.y - 10).col = '#b89a6a';
    }
    if (i === 30) makeDog(Game.player.x + 190, Game.player.y + 26).col = '#9a8a7a';
    const p = Game.player;
    for (const d of Game.dogs) if (d.state === 'chase' && Math.hypot(d.x - p.x, d.y - p.y) < 60 && i % 13 === 0) { p.face = Math.atan2(d.y - p.y, d.x - p.x); Input.press('attack'); }
    S.p.hp = Math.max(S.p.hp, 70);
  },
  // 5. E-Waste Dump with a respirator, finding a collectible
  ewaste(i) {
    if (i === 0) { reset(); setTime(13.2); const n = nearestNode('heap', 97 * TS, 140 * TS, 'south'); place(n.x, n.y + 24, -Math.PI / 2); setRegion('south'); }
    if (i === 6) Input.press('interact');
    if (i === 8) fastSearch(1.5);
    if (i === 56) { S.collection.cartridge = 1; Sfx.play('rare'); UI.collectible('cartridge'); }
  },
  // 6. riding the cargo trike into the Old Suburbs
  north(i) {
    if (i === 0) { reset(); setTime(8.4); place(97.5 * TS, 67.5 * TS, -Math.PI / 2); Game.curRegion = 'center'; Input.keys = { KeyW: true }; }
  },
};
window.__cover = function (kind) {
  reset(); setTime(21.4); R.clean = true; S.builds.solar = 0; S.flags.bp_solar = 0;
  place(90.6 * TS, 105.9 * TS, Math.PI * .6);
  makeDog(97.4 * TS, 105.3 * TS); makeDog(98.6 * TS, 103.2 * TS).col = '#5a4a3a';
  for (const k in S.machines) { S.machines[k].q = 10; S.machines[k].out = {}; }
  for (let i = 0; i < 40; i++) updateFx(0.02);
  Game.paused = true;
  document.getElementById('hud').style.display = 'none';
  const c = document.createElement('div'); c.id = 'coverTitle'; c.className = kind;
  c.innerHTML = '<div class="ct1">URBAN SCRAP</div><div class="ct2">SURVIVOR</div>';
  document.body.appendChild(c);
  const off = { landscape: [92.6, 104.2], portrait: [93.4, 104.0], square: [93.2, 104.6] }[kind];
  R.camLock = true; R.cam.x = off[0] * TS; R.cam.y = off[1] * TS;
  Game.player.x = 90.6 * TS; Game.player.y = 105.9 * TS;
};
`;
const COVER_CSS = `
#coverTitle { position: fixed; left: 0; right: 0; text-align: center; z-index: 40; pointer-events: none; font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif; }
#coverTitle .ct1 { font-weight: 900; color: #f7c948; letter-spacing: .04em; transform: rotate(-2deg);
  text-shadow: 0 .06em 0 #8a5208, 0 .1em 0 #5c3604, 0 .16em .3em rgba(0,0,0,.85), 0 0 1.2em rgba(0,0,0,.6); -webkit-text-stroke: .012em #3a2203; }
#coverTitle .ct2 { color: #fff; font-weight: 800; letter-spacing: .5em; padding-left: .5em; text-shadow: 0 .12em .4em rgba(0,0,0,.95); margin-top: .35em; }
#coverTitle.landscape { top: 7%; } #coverTitle.landscape .ct1 { font-size: 150px; } #coverTitle.landscape .ct2 { font-size: 44px; }
#coverTitle.portrait { top: 9%; } #coverTitle.portrait .ct1 { font-size: 92px; line-height: .95; } #coverTitle.portrait .ct2 { font-size: 32px; }
#coverTitle.square { top: 8%; } #coverTitle.square .ct1 { font-size: 78px; } #coverTitle.square .ct2 { font-size: 26px; }
`;

async function openGame(browser, viewport, dpr) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.route('https://sdk.crazygames.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.clock.install();
  await page.goto(URL);
  await page.clock.runFor(1500);
  await page.addScriptTag({ content: PAGE_HELPERS });
  await page.addStyleTag({ content: COVER_CSS });
  await page.evaluate(() => window.__setup('en'));
  await page.clock.runFor(200);
  return { ctx, page };
}

async function covers(browser) {
  const specs = [
    ['landscape', { width: 1920, height: 1080 }, 1, 3.4, 3, [1920, 1080]],
    ['portrait', { width: 720, height: 1080 }, 1.5, 2.2, 3, [800, 1200]],
    ['square', { width: 600, height: 600 }, 2, 1.85, 3, [800, 800]],
  ];
  for (const [kind, vp, dpr, zoom, cs, [w, h]] of specs) {
    const { ctx, page } = await openGame(browser, vp, dpr);
    await page.evaluate(([z, c]) => window.__zoom(z, c), [zoom, cs]);
    await page.evaluate(k => window.__cover(k), kind);
    await page.clock.runFor(600);
    const raw = path.join(OUT, `cover-${kind}-raw.png`);
    await page.screenshot({ path: raw });
    const final = path.join(OUT, `cover-${kind}-${w}x${h}.png`);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${w}:${h}:flags=lanczos`, final]);
    if (kind === 'landscape' || kind === 'portrait') fs.renameSync(raw, path.join(OUT, `.cover-${kind}-video.png`)); else fs.unlinkSync(raw);
    console.log('cover', final);
    await ctx.close();
  }
}

const SHOTS = [['search', 96], ['base', 96], ['dealer', 84], ['night', 96], ['ewaste', 90], ['north', 78]];
const STILLS = { search: 62, base: 64, dealer: 52, night: 58, ewaste: 70, north: 50 };

async function video(browser, kind) {
  const land = kind === 'landscape';
  const { ctx, page } = await openGame(browser, land ? { width: 1920, height: 1080 } : { width: 720, height: 1080 }, land ? 1 : 1.5);
  await page.evaluate(([z, c]) => window.__zoom(z, c), land ? [3.5, 3] : [2.3, 3]);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  const dir = path.join(OUT, `.frames-${kind}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let f = 0, t0 = Date.now();
  for (const [name, n] of SHOTS) {
    for (let i = 0; i < n; i++) {
      await page.evaluate(([s, k]) => window.__shots[s](k), [name, i]);
      await page.clock.runFor(1000 / FPS);
      const file = path.join(dir, `f${String(f).padStart(4, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      if (land && STILLS[name] === i) await page.screenshot({ path: path.join(OUT, `screenshot-${Object.keys(STILLS).indexOf(name) + 1}-${name}.png`) });
      f++;
      // keep CSS animations (banners, popups) in step with the virtual clock
      if (f % 15 === 0) { const ms = (Date.now() - t0) / f; await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / FPS) / ms) }); }
    }
  }
  await ctx.close();
  const [W, H] = land ? [1920, 1080] : [1080, 1620];
  const out = path.join(OUT, `preview-${kind}-${W}x${H}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', '1', '-i', path.join(OUT, `.cover-${kind}-video.png`),
    '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'),
    '-filter_complex', `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[a];[1:v]scale=${W}:${H},setsar=1,format=yuv420p[b];[a][b]concat=n=2:v=1[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-movflags', '+faststart', out]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('video', out, (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
}

(async () => {
  const mode = process.argv[3] || 'all';   // all | covers | video
  const browser = await chromium.launch();
  await covers(browser);
  if (mode !== 'covers') { await video(browser, 'landscape'); await video(browser, 'portrait'); }
  for (const k of ['landscape', 'portrait']) fs.rmSync(path.join(OUT, `.cover-${k}-video.png`), { force: true });
  await browser.close();
})();
