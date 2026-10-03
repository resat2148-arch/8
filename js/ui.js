'use strict';
// ---------- DOM UI: HUD, panels, modals ----------
const $ = id => document.getElementById(id);
const UI = {
  panel: null, tab: null, ctx: {}, hudT: 0, miniT: 0, fogImg: null, sleepCount: 0, modalOpen: false,

  init() {
    $('panel').addEventListener('click', e => {
      if (e.target.id === 'panel') { this.closePanel(); return; }
      const el = e.target.closest('[data-a]'); if (!el) return;
      Sfx.init(); Sfx.play('click');
      this.act(el.dataset.a, el.dataset, e);
    });
    $('modal').addEventListener('click', e => {
      const el = e.target.closest('[data-a]'); if (!el) return;
      Sfx.init(); Sfx.play('click');
      this.act(el.dataset.a, el.dataset, e);
    });
    $('title').addEventListener('click', e => {
      const el = e.target.closest('[data-a]'); if (!el) return;
      Sfx.init(); Sfx.play('click');
      this.act(el.dataset.a, el.dataset, e);
    });
    $('hud').addEventListener('click', e => {
      const el = e.target.closest('[data-a]'); if (!el) return;
      Sfx.init();
      this.act(el.dataset.a, el.dataset, e);
    });
    const hold = (id, on, off) => {
      const b = $(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); Sfx.init(); on(); b.classList.add('down'); }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); off && off(); b.classList.remove('down'); }, { passive: false });
      b.addEventListener('mousedown', e => { e.preventDefault(); Sfx.init(); on(); });
      b.addEventListener('mouseup', () => off && off());
    };
    hold('tAct', () => Input.press('interact'));
    hold('tAtk', () => Input.press('attack'));
    hold('tRun', () => { Input.touchSprint = true; }, () => { Input.touchSprint = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); if (Sfx.ctx) Sfx.ctx.suspend(); } else if (Sfx.ctx && !SDK.adActive) Sfx.ctx.resume(); });
  },

  // ---------- title ----------
  showTitle() {
    Game.state = 'title';
    const save = loadSave();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    const el = $('title'); el.classList.remove('hidden');
    el.innerHTML = `
      <div class="logo"><div class="logo-top">♻ URBAN SCRAP</div><div class="logo-sub">${t('subtitle')}</div></div>
      <p class="tagline">${t('tagline')}</p>
      <div class="title-btns">
        ${save ? `<button class="btn big primary" data-a="continue">▶ ${t('continue')} <small>${t('dayN', Math.floor(save.totalMin / 1440) + 1)} · ${fmtMoney(save.cash)}</small></button>` : ''}
        <button class="btn big ${save ? '' : 'primary'}" data-a="newgame">✚ ${t('newGame')}</button>
        <div class="row">
          <button class="btn" data-a="lang">🌐 ${LANG === 'tr' ? 'English' : 'Türkçe'}</button>
          <button class="btn" data-a="howto">❔ ${t('howTo')}</button>
        </div>
      </div>
      <div class="title-foot">${keyText(t('titleFoot'))}</div>`;
    SDK.gameplayStop();
  },
  onStart() {
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !Input.isTouch);
    document.body.classList.toggle('touch', Input.isTouch);
    this.buildHud();
    this.district(Game.curRegion, true);
    SDK.gameplayStart();
  },
  buildHud() {
    const bar = (id, icon) => `<div class="bar" id="${id}"><span class="bi">${icon}</span><div class="bt"><div class="bf"></div></div><span class="bv"></span></div>`;
    $('stats').innerHTML = bar('bHp', '❤️') + bar('bFood', '🍗') + bar('bWater', '💧') + bar('bEnergy', '⚡') + '<div id="status"></div>';
    const q = ['1', '2', '3', '4'];
    $('quick').innerHTML = q.map((k, i) => `<button class="qs" data-a="quick" data-i="${i}"><span class="qi"></span><span class="qn"></span><span class="qk">${k}</span></button>`).join('');
    $('menu').innerHTML = `
      <button class="mb" data-a="open" data-p="inv" title="I">🎒<span>${t('mBag')}</span></button>
      <button class="mb" data-a="open" data-p="skills" title="K">⭐<span>${t('mSkills')}</span><b id="perkBadge" class="badge hidden"></b></button>
      <button class="mb" data-a="open" data-p="journal" title="J">📓<span>${t('mJournal')}</span></button>
      <button class="mb" data-a="open" data-p="map" title="M">🗺️<span>${t('mMap')}</span></button>
      <button class="mb hidden" id="phoneBtn" data-a="phone">📱<span>${t('mSell')}</span></button>
      <button class="mb" data-a="open" data-p="settings" title="P">⚙️<span>${t('mMenu')}</span></button>`;
    this.hudT = 0;
  },

  // ---------- per-frame HUD ----------
  update(dt) {
    if (Game.state !== 'play' || !S) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = .12;
    const p = S.p;
    const setBar = (id, v, max, col) => {
      const el = $(id); if (!el) return;
      el.querySelector('.bf').style.width = clamp(v / max * 100, 0, 100) + '%';
      el.querySelector('.bf').style.background = col;
      el.querySelector('.bv').textContent = Math.ceil(v);
      el.classList.toggle('warn', v / max < .2);
    };
    setBar('bHp', p.hp, maxHp(), '#e04b3a'); setBar('bFood', p.hunger, 100, '#e0913a');
    setBar('bWater', p.thirst, 100, '#3a9ae0'); setBar('bEnergy', p.energy, 100, '#e0c83a');
    const st = [];
    if (S.status.sickUntil > S.totalMin) st.push(`<span title="${t('sick')}">🤢</span>`);
    if (Game.toxicT > 0) st.push(`<span>☣️</span>`);
    if (S.weather === 'rain' && !inBase(Game.player.x, Game.player.y, 0)) st.push(`<span title="${t('wet')}">💦</span>`);
    if (S.adBoost) st.push(`<span title="+50%">🎬</span>`);
    $('status').innerHTML = st.join('');
    const night = isNight();
    $('clock').innerHTML = `<b>${t('dayN', day())}</b> · ${fmtClock(tod())} ${night ? '🌙' : WEATHER[S.weather].i}`;
    $('cash').textContent = fmtMoney(S.cash);
    const w = invWeight(), cap = capacity();
    $('weight').innerHTML = `🎒 ${fmtNum(w)} / ${cap} kg<div class="wt"><div style="width:${clamp(w / cap * 100, 0, 100)}%;background:${w / cap > .9 ? '#e04b3a' : '#9ad14f'}"></div></div>`;
    // quest tracker
    let tr = '';
    if (S.quest < QUESTS.length) {
      const q = QUESTS[S.quest]; const [c, n] = q.c(S);
      tr = `<div class="tq">📌 ${L(q.n)}${n > 1 ? ` <b>${Math.min(c, n)}/${n}</b>` : ''}${S.quest < 6 && Guide.on() ? `<button class="skip" data-a="skipGuide">${t('skipGuide')} ✕</button>` : ''}</div>`;
    } else tr = `<div class="tq">🏆 ${t('allQuests')}</div>`;
    $('tracker').innerHTML = tr;
    // quick slots
    const qs = document.querySelectorAll('#quick .qs');
    QUICK.forEach((list, i) => {
      const k = list.find(k => S.inv[k] > 0) || list[0];
      const n = list.reduce((a, k) => a + (S.inv[k] || 0), 0);
      qs[i].querySelector('.qi').textContent = ITEMS[k].i;
      qs[i].querySelector('.qn').textContent = n || '';
      qs[i].classList.toggle('empty', !n);
    });
    const pulse = Guide.quickPulse();
    qs.forEach((el, i) => el.classList.toggle('pulse', i === pulse));
    if (Input.isTouch) $('tAct').classList.toggle('ready', !!Game.target && !Game.action);
    const pb = $('perkBadge'); pb.classList.toggle('hidden', !S.perkPts); pb.textContent = S.perkPts;
    $('phoneBtn').classList.toggle('hidden', !S.goals.phone);
    this.miniT -= .12;
    if (this.miniT <= 0) { this.miniT = .25; this.drawMinimap(); }
  },
  fogCanvas() {
    if (!this.fogImg) { this.fogImg = document.createElement('canvas'); this.fogImg.width = 48; this.fogImg.height = 48; }
    const g = this.fogImg.getContext('2d'); const img = g.createImageData(48, 48);
    for (let i = 0; i < 48 * 48; i++) { img.data[i * 4 + 3] = Game.explored[i] ? 0 : 235; img.data[i * 4] = 12; img.data[i * 4 + 1] = 13; img.data[i * 4 + 2] = 16; }
    g.putImageData(img, 0, 0);
    return this.fogImg;
  },
  drawMinimap() {
    const c = $('minimap'); const g = c.getContext('2d');
    const W = c.width, sc = 2.4; const p = Game.player;
    const ptx = p.x / TS, pty = p.y / TS;
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, TAU); g.clip();
    g.imageSmoothingEnabled = false;
    g.setTransform(sc, 0, 0, sc, W / 2 - ptx * sc, W / 2 - pty * sc);
    g.drawImage(World.mapCanvas, 0, 0);
    g.drawImage(this.fogCanvas(), 0, 0, 192, 192);
    this.mapMarkers(g, 1 / sc * 2.2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
    g.strokeStyle = 'rgba(245,197,66,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, TAU); g.stroke();
  },
  mapMarkers(g, s) {
    const dot = (x, y, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r * s, 0, TAU); g.fill(); };
    dot(89.5, 105, '#f5a623', 3.2);
    dot(103, 104, '#7dff7a', 2.6);
    for (const id in World.gates) { const gt = World.gates[id]; dot(gt.x / TS, gt.y / TS, World.gateOpen[id] ? '#9ad14f' : '#e04b3a', 2.4); }
    if (S.event) {
      const ex = S.event.x / TS, ey = S.event.y / TS, r = 4 * s, pulse = 1 + Math.sin(Game.time * 5) * .2;
      g.fillStyle = '#ffd76a'; g.strokeStyle = '#000'; g.lineWidth = .8 * s; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? r * .45 : r) * pulse; g.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); }
      g.closePath(); g.fill(); g.stroke();
    }
    const p = Game.player;
    g.save(); g.translate(p.x / TS, p.y / TS); g.rotate(p.face);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(4 * s, 0); g.lineTo(-3 * s, -3 * s); g.lineTo(-3 * s, 3 * s); g.closePath(); g.fill();
    g.restore();
  },

  // ---------- messages ----------
  toast(msg, type) {
    const el = document.createElement('div'); el.className = 'toast ' + (type || 'info'); el.innerHTML = msg;
    const box = $('toasts'); box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  },
  banner(title, sub) {
    const el = $('banner');
    el.innerHTML = `<div class="bn-t">${title}</div><div class="bn-s">${sub || ''}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  district(reg, labelOnly) {
    const el = $('district'); const D = DISTRICTS[reg]; if (!D) return;
    el.innerHTML = `<span style="color:${D.col}">◆</span> ${L(D.n)}`;
    if (labelOnly) return;
    const big = $('areaName');
    big.innerHTML = `<small>${t('entering')}</small>${L(D.n)}`; big.style.color = D.col;
    big.classList.remove('show'); void big.offsetWidth; big.classList.add('show');
  },
  collectible(k) {
    const c = COLLECTIBLES[k];
    const have = Object.keys(COLLECTIBLES).filter(x => COLLECTIBLES[x].d === c.d && S.collection[x]).length;
    const el = $('collect');
    el.innerHTML = `<div class="cl-h">✨ ${t('newCollectible')} ✨</div><div class="cl-i">${c.i}</div><div class="cl-n">${L(c.n)}</div><div class="cl-s">${L(SETS[c.d].n)} · ${have}/4</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  fade() { const f = $('fade'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
  joyShow(x, y, dx, dy) {
    const j = $('joy'); j.classList.remove('hidden'); j.style.left = x + 'px'; j.style.top = y + 'px';
    $('knob').style.transform = `translate(${dx}px,${dy}px)`;
  },
  joyHide() { $('joy').classList.add('hidden'); },

  // ---------- keyboard ----------
  onKey(e) {
    if (this.modalOpen) { if (e.code === 'Enter' || e.code === 'Space') { const b = $('modal').querySelector('.btn.primary'); if (b) b.click(); } return true; }
    if (Game.state !== 'play') return false;
    if (this.panel) {
      if (e.code === 'Escape' || e.code === 'Tab' || (e.code === 'KeyI' && this.panel === 'inv') || (e.code === 'KeyM' && this.panel === 'map') || (e.code === 'KeyK' && this.panel === 'skills') || (e.code === 'KeyJ' && this.panel === 'journal') || (e.code === 'KeyP' && this.panel === 'settings') || (e.code === 'KeyE' && !e.repeat && this.panel !== 'settings')) { this.closePanel(); return true; }
      return true;
    }
    // P opens the menu (Esc also works, but in fullscreen the browser uses Esc to leave fullscreen)
    const map = { KeyI: 'inv', Tab: 'inv', KeyK: 'skills', KeyJ: 'journal', KeyM: 'map', KeyP: 'settings', Escape: 'settings' };
    if (map[e.code] && !e.repeat) { this.openPanel(map[e.code]); return true; }
    return false;
  },

  // ---------- panels ----------
  openStation(tg) {
    switch (tg.kind) {
      case 'bed': this.openPanel('bed'); break;
      case 'stash': this.openPanel('stash'); break;
      case 'workbench': this.openPanel('craft'); break;
      case 'blueprint': this.openPanel('build', { key: tg.key }); break;
      case 'machine': this.openPanel('machine', { key: tg.key }); break;
      case 'yield': {
        const n = S.yields[tg.key] || 0;
        if (!n) { this.toast(t('nothingYet'), 'info'); return; }
        const k = tg.key === 'garden' ? 'veg' : 'water';
        const fit = addInv(k, n); if (fit < n) addStash(k, n - fit);
        S.yields[tg.key] = 0; Sfx.play('collect');
        floater(tg.x, tg.y - 30, '+' + n + ' ' + ITEMS[k].i, '#9fe870');
        break;
      }
      case 'van': this.openPanel('van'); break;
      case 'dealer': this.openPanel('dealer'); break;
      case 'shop': this.openPanel('shop'); break;
      case 'board': this.openPanel('dealer', { tab: 'contracts' }); break;
    }
  },
  openPanel(name, ctx) {
    if (Game.dead) return;
    this.panel = name; this.ctx = ctx || {}; this.tab = this.ctx.tab || null;
    Game.paused = true; Game.action = null;
    $('panel').classList.remove('hidden');
    SDK.gameplayStop();
    this.render();
  },
  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    $('panel').classList.add('hidden');
    Game.paused = false; Input.clear();
    SDK.gameplayStart();
    saveGame();
  },
  render() {
    if (!this.panel) return;
    const fn = this['p_' + this.panel];
    const r = fn.call(this);
    $('pTitle').innerHTML = r.title;
    $('pTabs').innerHTML = (r.tabs || []).map(([id, label]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-a="tab" data-t="${id}">${label}</button>`).join('');
    $('pTabs').classList.toggle('hidden', !r.tabs);
    const body = $('pBody'); const sc = body.scrollTop;
    body.innerHTML = r.body;
    body.scrollTop = sc;
    if (r.after) r.after();
  },
  costHtml(cost, cash) {
    let h = '';
    for (const k in cost) { const hv = have(k), ok = hv >= cost[k]; h += `<span class="chip ${ok ? 'ok' : 'no'}" title="${esc(L(ITEMS[k].n))}">${ITEMS[k].i} ${Math.min(hv, 999)}/${cost[k]}</span>`; }
    if (cash) h += `<span class="chip ${S.cash >= cash ? 'ok' : 'no'}">💵 ${fmtMoney(cash)}</span>`;
    return h || `<span class="chip ok">${t('free')}</span>`;
  },
  itemName(k) { return `<span class="ii">${ITEMS[k].i}</span><span class="in">${esc(L(ITEMS[k].n))}</span>`; },

  p_inv() {
    const rows = Object.keys(S.inv).sort(catSort).map(k => {
      const it = ITEMS[k];
      return `<div class="row item"><div class="il">${this.itemName(k)}<span class="iq">×${S.inv[k]}</span><span class="iw">${fmtNum(it.w * S.inv[k])} kg</span></div>
        <div class="ib">${it.eat ? `<button class="btn sm primary" data-a="use" data-k="${k}">${t('use')}</button>` : ''}<button class="btn sm" data-a="drop" data-k="${k}">${t('drop')}</button></div></div>`;
    }).join('') || `<div class="empty">${t('bagEmpty')}</div>`;
    const eq = [...Object.keys(CRAFT)].map(k => {
      const own = ownsCraft(k) && (CRAFT[k].kind !== 'bag' || S.gear.bag === k) && (CRAFT[k].kind !== 'cart' || S.gear.cart === k);
      return `<div class="eq ${own ? 'own' : ''}" title="${esc(L(CRAFT[k].n))}: ${esc(L(CRAFT[k].d))}">${CRAFT[k].i}</div>`;
    }).join('');
    return {
      title: `🎒 ${t('backpack')} <small>${fmtNum(invWeight())} / ${capacity()} kg</small>`,
      body: `<div class="sec">${rows}</div><h4>${t('equipment')}</h4><div class="eqgrid">${eq}</div>
        <p class="note">${t('invNote')}</p>`,
    };
  },
  p_stash() {
    const inv = Object.keys(S.inv).sort(catSort).map(k => `<div class="row item"><div class="il">${this.itemName(k)}<span class="iq">×${S.inv[k]}</span></div><div class="ib"><button class="btn sm" data-a="toStash" data-k="${k}" data-n="all">➜</button></div></div>`).join('') || `<div class="empty">${t('bagEmpty')}</div>`;
    const st = Object.keys(S.stash).sort(catSort).map(k => `<div class="row item"><div class="ib"><button class="btn sm" data-a="fromStash" data-k="${k}" data-n="1">⟵1</button><button class="btn sm" data-a="fromStash" data-k="${k}" data-n="all">⟵</button></div><div class="il">${this.itemName(k)}<span class="iq">×${S.stash[k]}</span></div></div>`).join('') || `<div class="empty">${t('stashEmpty')}</div>`;
    return {
      title: `📦 ${t('stash')}`,
      body: `<div class="acts"><button class="btn primary" data-a="depositMat">⬇ ${t('depositMat')}</button><button class="btn" data-a="depositAll">⬇ ${t('depositAll')}</button></div>
      <div class="cols"><div><h4>🎒 ${t('backpack')} <small>${fmtNum(invWeight())}/${capacity()} kg</small></h4>${inv}</div><div><h4>📦 ${t('stash')}</h4>${st}</div></div>
      <p class="note">${t('stashNote')}</p>`,
    };
  },
  p_craft() {
    if (!this.tab) this.tab = 'tools';
    let body = '';
    if (this.tab === 'tools') {
      for (const k in CRAFT) {
        const r = CRAFT[k];
        if (k === 'backpack' && S.gear.bag === 'hikingpack') continue;
        if (k === 'cart' && S.gear.cart === 'trike') continue;
        const own = ownsCraft(k);
        body += this.card(r.i, L(r.n), L(r.d), own ? '' : this.costHtml(r.cost, r.cash), own ? `<span class="done">✓ ${t('owned')}</span>` : `<button class="btn ${canAfford(r.cost, r.cash) ? 'primary' : ''}" data-a="craft" data-k="${k}">${t('craft')}</button>`, own);
      }
    } else {
      body += this.buildCards();
    }
    return { title: `🔨 ${t('workbench')}`, tabs: [['tools', '⛏️ ' + t('tabTools')], ['base', '🏗️ ' + t('tabBase')]], body };
  },
  buildCards(only) {
    let body = '';
    for (const k in BUILDS) {
      if (only && k !== only) continue;
      const b = BUILDS[k]; const own = !!S.builds[k];
      body += this.card(b.i, L(b.n), L(b.d), own ? '' : this.costHtml(b.cost, b.cash), own ? `<span class="done">✓ ${t('builtLbl')}</span>` : `<button class="btn ${canAfford(b.cost, b.cash) ? 'primary' : ''}" data-a="build" data-k="${k}">${t('build')}</button>`, own);
    }
    return body;
  },
  card(icon, name, desc, cost, btn, own) {
    return `<div class="card ${own ? 'own' : ''}"><div class="ci">${icon}</div><div class="cm"><div class="cn">${esc(name)}</div><div class="cd">${esc(desc)}</div><div class="cc">${cost}</div></div><div class="cb">${btn}</div></div>`;
  },
  p_build() {
    const k = this.ctx.key; const b = BUILDS[k];
    return { title: `🏗️ ${t('build')}: ${L(b.n)}`, body: this.buildCards(k) + `<p class="note">${t('buildNote')}</p><div class="acts"><button class="btn" data-a="open" data-p="craft" data-t="base">🔨 ${t('allBlueprints')}</button></div>` };
  },
  p_machine() {
    const key = this.ctx.key, b = BUILDS[key], m = S.machines[key];
    const r = b.m[m.sel];
    const fmt = o => Object.keys(o).map(k => `${o[k]}× ${ITEMS[k].i} ${esc(L(ITEMS[k].n))}`).join(' + ');
    const spd = machineSpeed(key);
    const perBatchSec = r.t / spd / MIN_PER_SEC;
    const recipes = b.m.length > 1 ? `<div class="acts">${b.m.map((rr, i) => `<button class="btn ${i === m.sel ? 'primary' : ''}" data-a="recipe" data-i="${i}" ${m.q && i !== m.sel ? 'disabled' : ''}>${Object.keys(rr.in).map(k => ITEMS[k].i).join('')} ➜ ${Object.keys(rr.out).map(k => ITEMS[k].i).join('')}</button>`).join('')}</div>` : '';
    let maxB = 40 * m.lvl - m.q; for (const k in r.in) maxB = Math.min(maxB, Math.floor(have(k) / r.in[k]));
    let ready = 0; for (const k in m.out) ready += m.out[k];
    const up = MACHINE_UP[m.lvl];
    return {
      title: `${b.i} ${L(b.n)} <small>${t('lvl')} ${m.lvl}</small>`,
      body: `${recipes}
        <div class="recipe"><div>${fmt(r.in)}</div><div class="arrow">➜</div><div>${fmt(r.out)}${r.bonus ? ` <small>(+${Math.round(r.bonus[1] * 100)}% ${ITEMS[r.bonus[0]].i})</small>` : ''}</div></div>
        <div class="mstat"><div>⏱ ${fmtNum(perBatchSec)}s / ${t('batch')}</div><div>📥 ${t('queue')}: <b>${m.q}</b> / ${40 * m.lvl}</div><div>🧮 ${t('canLoad')}: <b>${Math.max(0, maxB)}</b></div></div>
        <div class="pbar"><div style="width:${m.q ? clamp(m.prog / r.t * 100, 0, 100) : 0}%"></div></div>
        <div class="acts"><button class="btn" data-a="load" data-n="1">+1</button><button class="btn" data-a="load" data-n="10">+10</button><button class="btn primary" data-a="load" data-n="999">+${t('max')}</button></div>
        <h4>${t('output')}</h4>
        <div class="out">${Object.keys(m.out).filter(k => m.out[k]).map(k => `<span class="chip ok">${ITEMS[k].i} ×${m.out[k]}</span>`).join('') || `<span class="empty">—</span>`}</div>
        <div class="acts"><button class="btn ${ready ? 'primary' : ''}" data-a="collect" ${ready ? '' : 'disabled'}>✅ ${t('collectToStash')}</button></div>
        ${up ? `<h4>⬆ ${t('upgrade')} → ${t('lvl')} ${m.lvl + 1} <small>(${t('speed')} ×${MACHINE_SPD[m.lvl + 1]})</small></h4><div class="cc">${this.costHtml(up.cost, up.cash)}</div><div class="acts"><button class="btn ${canAfford(up.cost, up.cash) ? 'primary' : ''}" data-a="upgrade">⬆ ${t('upgrade')}</button></div>` : `<p class="note">★ ${t('maxLevel')}</p>`}
        <p class="note">${t('machineNote')}</p>`,
    };
  },
  p_bed() {
    const t0 = tod(); const night = t0 >= 18 * 60 || t0 < 6 * 60;
    return {
      title: `🛏️ ${S.builds.bed ? L(BUILDS.bed.n) : t('cardboardBed')}`,
      body: `<div class="bigmsg">${night ? '🌙' : '☀️'}</div>
        <p>${night ? t('sleepNight') : t('sleepDay')}</p>
        <p class="note">${t('sleepNote', S.builds.bed ? 100 : 70)}</p>
        <div class="acts"><button class="btn big primary" data-a="sleep">💤 ${night ? t('sleepUntil') : t('nap')}</button></div>
        ${S.builds.bed ? '' : `<p class="note">${t('bedUpgrade')}</p>`}`,
    };
  },
  p_dealer() {
    if (!this.tab) this.tab = 'sell';
    const remote = !!this.ctx.remote;
    let body = '';
    if (this.tab === 'sell') {
      const keys = Object.keys(ITEMS).filter(k => ITEMS[k].p > 0 && (remote ? S.inv[k] : have(k)) > 0).sort(catSort);
      let total = 0;
      const rows = keys.map(k => {
        const n = remote ? S.inv[k] : have(k); const pr = unitPrice(k, remote); total += n * pr;
        const m = S.market && S.market.mult[k] ? S.market.mult[k] : 1;
        const trend = S.market && S.market.hot === k ? '<span class="hot">🔥</span>' : m > 1.08 ? '<span class="up">▲</span>' : m < .92 ? '<span class="dn">▼</span>' : '';
        return `<div class="row item"><div class="il">${this.itemName(k)}<span class="iq">×${n}</span></div><div class="pr">${fmtMoney(pr)} ${trend}</div>
          <div class="ib"><button class="btn sm" data-a="sell" data-k="${k}" data-n="1">1</button><button class="btn sm primary" data-a="sell" data-k="${k}" data-n="all">${t('all')} ${fmtMoney(n * pr)}</button></div></div>`;
      }).join('');
      const adUsed = S.adBoostDay === day();
      body = `<div class="dealer-top"><div class="npc">🧔</div><div><b>${remote ? t('phoneSell') : t('rusty')}</b><br><small>${remote ? t('remoteNote') : t('rustySays')}</small></div></div>
        ${S.market ? `<div class="hotbar">🔥 ${t('hotToday')}: ${ITEMS[S.market.hot].i} ${esc(L(ITEMS[S.market.hot].n))} <b>+50%</b></div>` : ''}
        <div class="acts">
          <button class="btn" data-a="sellCat" data-c="raw">${t('sellRaw')}</button>
          <button class="btn" data-a="sellCat" data-c="ref">${t('sellRef')}</button>
          <button class="btn primary" data-a="sellCat" data-c="mat">${t('sellAllMat')} (${fmtMoney(keys.filter(k => ITEMS[k].c === 'raw' || ITEMS[k].c === 'ref').reduce((a, k) => a + (remote ? S.inv[k] : have(k)) * unitPrice(k, remote), 0))})</button>
        </div>
        ${S.adBoost ? `<div class="boost on">🎬 ${t('boostActive')}</div>` : adUsed ? '' : `<button class="btn ad" data-a="adBoost">🎬 ${t('adBoost')}</button>`}
        <div class="sec">${rows || `<div class="empty">${t('nothingToSell')}</div>`}</div>
        <p class="note">${t('sellNote')}</p>`;
    } else {
      body = `<p class="note">${t('contractsNote')}</p>` + S.contracts.map((c, i) => {
        const hv = remote ? (S.inv[c.item] || 0) : have(c.item); const ok = hv >= c.qty;
        const left = c.exp - day();
        return this.card(ITEMS[c.item].i, `${c.qty}× ${L(ITEMS[c.item].n)}`, t('contractReward', fmtMoney(c.reward), c.xp) + ' · ' + (left <= 0 ? t('lastDay') : t('daysLeft', left + 1)),
          `<span class="chip ${ok ? 'ok' : 'no'}">${ITEMS[c.item].i} ${hv}/${c.qty}</span>`,
          `<button class="btn ${ok ? 'primary' : ''}" data-a="deliver" data-i="${i}" ${ok && !remote ? '' : 'disabled'}>${t('deliver')}</button>`);
      }).join('') + (S.contracts.length ? '' : `<div class="empty">${t('noContracts')}</div>`);
    }
    return { title: `💰 ${remote ? t('phoneSell') : t('dealerTitle')} <small>${fmtMoney(S.cash)}</small>`, tabs: [['sell', '💵 ' + t('tabSell')], ['contracts', '📋 ' + t('tabContracts') + ` (${S.contracts.length})`]], body };
  },
  p_shop() {
    const rows = SHOP_ITEMS.map(k => {
      const it = ITEMS[k]; const e = it.eat;
      const eff = [e.hunger ? `🍗+${e.hunger}` : '', e.thirst > 0 ? `💧+${e.thirst}` : '', e.energy ? `⚡+${e.energy}` : '', e.hp ? `❤️+${e.hp}` : '', it.cure ? '🤢✕' : ''].filter(Boolean).join(' ');
      return `<div class="row item"><div class="il">${this.itemName(k)}<span class="iw">${eff}</span></div><div class="pr">${fmtMoney(it.buy)}</div>
        <div class="ib"><button class="btn sm ${S.cash >= it.buy ? 'primary' : ''}" data-a="buy" data-k="${k}" data-n="1">+1</button><button class="btn sm" data-a="buy" data-k="${k}" data-n="5">+5</button></div></div>`;
    }).join('');
    return { title: `🏪 ${t('shopTitle')} <small>${fmtMoney(S.cash)}</small>`, body: `<div class="dealer-top"><div class="npc">👩‍🦱</div><div><b>${t('shopkeeper')}</b><br><small>${t('shopSays')}</small></div></div><div class="sec">${rows}</div><p class="note">${t('shopNote')}</p>` };
  },
  p_skills() {
    const need = xpNeed(S.level);
    const rows = Object.keys(PERKS).map(k => {
      const pk = PERKS[k], r = perk(k);
      const pips = Array.from({ length: pk.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
      return this.card(pk.i, L(pk.n), L(pk.d), `<span class="pips">${pips}</span>`, r >= pk.max ? `<span class="done">MAX</span>` : `<button class="btn ${S.perkPts ? 'primary' : ''}" data-a="perk" data-k="${k}" ${S.perkPts ? '' : 'disabled'}>+</button>`, r >= pk.max);
    }).join('');
    return {
      title: `⭐ ${t('skills')}`,
      body: `<div class="lvl"><div class="lv">${t('level')} <b>${S.level}</b></div><div class="pbar"><div style="width:${S.xp / need * 100}%"></div></div><small>${Math.floor(S.xp)} / ${need} XP · ${t('perkPts')}: <b>${S.perkPts}</b></small></div>${rows}`,
    };
  },
  p_journal() {
    if (!this.tab) this.tab = 'quests';
    let body = '';
    if (this.tab === 'quests') {
      body = QUESTS.map((q, i) => {
        const done = i < S.quest, cur = i === S.quest;
        if (i > S.quest + 2) return '';
        const [c, n] = q.c(S);
        return `<div class="quest ${done ? 'done' : cur ? 'cur' : 'next'}"><span>${done ? '✅' : cur ? '📌' : '🔒'}</span><div>${esc(L(q.n))}${cur && n > 1 ? ` <b>${Math.min(c, n)}/${n}</b>` : ''}<small>${q.r.cash ? '💵 ' + fmtMoney(q.r.cash) + ' · ' : ''}✨ ${q.r.xp} XP</small></div></div>`;
      }).join('') + `<p class="note">${t('questCount', S.quest, QUESTS.length)}</p>`;
    } else if (this.tab === 'goals') {
      body = `<p class="note">${t('goalsNote')}</p>` + GOALS.map((g, i) => {
        const done = !!S.goals[g.id], locked = i > 0 && !S.goals[GOALS[i - 1].id];
        return this.card(g.i, L(g.n), '🎁 ' + L(g.b), done || locked ? '' : this.costHtml(g.cost, g.cash),
          done ? `<span class="done">✓</span>` : locked ? `<span class="lock">🔒</span>` : `<button class="btn ${canAfford(g.cost, g.cash) ? 'primary' : ''}" data-a="goal" data-k="${g.id}">${t('fund')}</button>`, done);
      }).join('') + (nearHome() ? '' : `<p class="note">${t('goalsAway')}</p>`);
    } else if (this.tab === 'collection') {
      body = Object.keys(SETS).map(reg => {
        const ks = Object.keys(COLLECTIBLES).filter(k => COLLECTIBLES[k].d === reg);
        const n = ks.filter(k => S.collection[k]).length;
        return `<div class="set ${n === 4 ? 'done' : ''}"><div class="sh"><b>${L(SETS[reg].n)}</b> <small>${L(DISTRICTS[reg].n)} · ${n}/4</small><span class="sb">🎁 ${L(SETS[reg].b)}</span></div>
          <div class="sg">${ks.map(k => S.collection[k] ? `<div class="ce own" title="${esc(L(COLLECTIBLES[k].n))}">${COLLECTIBLES[k].i}<small>${esc(L(COLLECTIBLES[k].n))}</small></div>` : `<div class="ce">❔<small>???</small></div>`).join('')}</div></div>`;
      }).join('') + `<p class="note">${t('colNote')}</p>`;
    } else {
      const s = S.stats;
      const rows = [['📅', t('stDays'), day()], ['🔍', t('stSearched'), s.searched || 0], ['💵', t('stEarned'), fmtMoney(s.earned || 0)], ['🔨', t('stCrafted'), (s.crafted || 0) + (s.built || 0)],
        ['📋', t('stContracts'), s.contracts || 0], ['🐕', t('stDogs'), s.dogs || 0], ['✨', t('stCol'), Object.keys(S.collection).length + '/20'], ['💀', t('stDeaths'), s.deaths || 0]];
      body = `<div class="stats">${rows.map(r => `<div><span>${r[0]}</span><small>${r[1]}</small><b>${r[2]}</b></div>`).join('')}</div>`;
    }
    return { title: `📓 ${t('journal')}`, tabs: [['quests', '📌 ' + t('tabQuests')], ['goals', '🏠 ' + t('tabGoals')], ['collection', '✨ ' + t('tabCol')], ['stats', '📊 ' + t('tabStats')]], body };
  },
  p_map() {
    return {
      title: `🗺️ ${t('cityMap')}`,
      body: `<div class="mapwrap"><canvas id="bigmap" width="576" height="576"></canvas></div>
        <div class="legend"><span><i style="background:#f5a623"></i>${t('lgBase')}</span><span><i style="background:#7dff7a"></i>${t('lgDealer')}</span><span><i style="background:#e04b3a"></i>${t('lgLocked')}</span><span><i style="background:#9ad14f"></i>${t('lgOpen')}</span><span>⭐ ${t('lgDump')}</span></div>`,
      after: () => this.drawBigMap(),
    };
  },
  drawBigMap() {
    const c = $('bigmap'); if (!c) return; const g = c.getContext('2d'); const sc = 3;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, 576, 576);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.drawImage(World.mapCanvas, 0, 0); g.drawImage(this.fogCanvas(), 0, 0, 192, 192);
    this.mapMarkers(g, 1.4);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.textAlign = 'center'; g.font = 'bold 15px system-ui';
    const labels = { center: [96, 96], north: [96, 32], east: [160, 96], south: [96, 160], west: [32, 96] };
    for (const r in labels) {
      const [x, y] = labels[r]; const D = DISTRICTS[r];
      const seen = Game.explored[Math.floor(y / 4) * 48 + Math.floor(x / 4)] || S.visited[r];
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)';
      const txt = seen ? L(D.n) : '???';
      g.strokeText(txt, x * sc, y * sc - 20); g.fillStyle = D.col; g.fillText(txt, x * sc, y * sc - 20);
      g.font = '11px system-ui'; g.fillStyle = '#ccc';
      const req = r === 'east' ? '✂️' : r === 'south' ? '😷' : r === 'west' ? '💿 🔦' : '';
      if (req) { g.strokeText(req, x * sc, y * sc - 4); g.fillText(req, x * sc, y * sc - 4); }
      g.font = 'bold 15px system-ui';
    }
  },
  p_settings() {
    return {
      title: `⚙️ ${t('menu')}`,
      body: `<div class="acts col">
        <button class="btn big primary" data-a="close">▶ ${t('resume')}</button>
        <button class="btn" data-a="toggleSfx">${Sfx.sfxOn ? '🔊' : '🔈'} ${t('sfx')}: ${Sfx.sfxOn ? t('on') : t('off')}</button>
        <button class="btn" data-a="toggleMusic">${Sfx.musicOn ? '🎵' : '🔇'} ${t('music')}: ${Sfx.musicOn ? t('on') : t('off')}</button>
        <button class="btn" data-a="lang">🌐 ${LANG === 'tr' ? 'English' : 'Türkçe'}</button>
        <button class="btn" data-a="toggleGuide">🧭 ${t('guide')}: ${S.flags.noGuide ? t('off') : t('on')}</button>
        <button class="btn" data-a="saveNow">💾 ${t('saveNow')}</button>
        <button class="btn" data-a="howto">❔ ${t('howTo')}</button>
        <button class="btn" data-a="toTitle">🏠 ${t('mainMenu')}</button>
      </div>`,
    };
  },
  p_van() {
    const dests = [['base', '🏠 ' + t('lgBase')], ['north', '🌳 ' + L(DISTRICTS.north.n)]];
    for (const id of ['east', 'south', 'west']) if (World.gateOpen[id]) dests.push([id, '🚏 ' + L(DISTRICTS[id].n)]);
    return { title: `🚐 ${t('vanTravel')}`, body: `<p class="note">${t('vanNote')}</p><div class="acts col">${dests.map(([id, n]) => `<button class="btn" data-a="travel" data-k="${id}">${n}</button>`).join('')}</div>` };
  },
  howtoHtml() {
    return `<div class="howto">${keyText(t('howtoBody'))}${Input.isTouch ? '<br>' + t('howtoTouch') : ''}</div>`;
  },

  // ---------- actions ----------
  act(a, d) {
    const n = d.n === 'all' ? 99999 : parseInt(d.n || '1', 10);
    switch (a) {
      case 'close': this.closePanel(); return;
      case 'tab': this.tab = d.t; break;
      case 'open': if (this.panel) { this.panel = d.p; this.ctx = {}; this.tab = d.t || null; this.render(); } else this.openPanel(d.p, { tab: d.t }); return;
      case 'phone': this.openPanel('dealer', { remote: true }); return;
      case 'quick': if (Game.state === 'play' && !Game.paused && !Game.dead) quickUse(+d.i); return;
      case 'use': consume(d.k); break;
      case 'drop': dropItem(d.k, S.inv[d.k]); break;
      case 'toStash': moveItem(d.k, n, true); break;
      case 'fromStash': moveItem(d.k, n, false); break;
      case 'depositMat': if (!depositAll('mat')) this.toast(t('nothingToDeposit'), 'info'); break;
      case 'depositAll': depositAll('all'); break;
      case 'craft': craftItem(d.k); break;
      case 'build': if (buildStructure(d.k) && this.panel === 'build') { this.closePanel(); return; } break;
      case 'recipe': setRecipe(this.ctx.key, +d.i); break;
      case 'load': loadMachine(this.ctx.key, n); break;
      case 'collect': collectMachine(this.ctx.key); break;
      case 'upgrade': upgradeMachine(this.ctx.key); break;
      case 'sleep': this.closePanel(); UI.fade(); setTimeout(() => sleep(), 350); return;
      case 'sell': { const got = sellItem(d.k, n, !!this.ctx.remote); if (got) { Sfx.play('cash'); this.toast('+' + fmtMoney(got), 'good'); } break; }
      case 'sellCat': {
        let tot = 0; const boost = S.adBoost;
        for (const k of Object.keys(ITEMS)) { const c = ITEMS[k].c; if (d.c === 'mat' ? (c === 'raw' || c === 'ref') : c === d.c) { S.adBoost = boost; tot += sellItem(k, 99999, !!this.ctx.remote); } }
        S.adBoost = tot ? false : boost;
        if (tot) { Sfx.play('cash'); this.toast('+' + fmtMoney(tot), 'good'); } else Sfx.play('deny');
        break;
      }
      case 'adBoost':
        SDK.rewarded(ok => { if (ok) { S.adBoost = true; S.adBoostDay = day(); this.toast(t('boostActive'), 'good'); } else this.toast(t('adFail'), 'bad'); this.render(); });
        return;
      case 'deliver': deliverContract(+d.i); break;
      case 'buy': if (!buyItem(d.k, n)) { Sfx.play('deny'); this.toast(t('noMoney'), 'bad'); } else Sfx.play('cash'); break;
      case 'perk': perkUp(d.k); break;
      case 'goal': fundGoal(d.k); break;
      case 'travel': this.closePanel(); fastTravel(d.k); return;
      case 'skipGuide': S.flags.noGuide = 1; Guide.target = null; this.toast(t('guideOffHint'), 'info'); return;
      case 'toggleGuide': S.flags.noGuide = S.flags.noGuide ? 0 : 1; Guide.t = 0; break;
      case 'toggleSfx': Sfx.setSfx(!Sfx.sfxOn); savePrefs(); break;
      case 'toggleMusic': Sfx.setMusic(!Sfx.musicOn); savePrefs(); break;
      case 'lang': LANG = LANG === 'tr' ? 'en' : 'tr'; savePrefs(); applyLang(); if (Game.state === 'title') { this.showTitle(); return; } this.buildHud(); this.district(Game.curRegion); break;
      case 'saveNow': saveGame(); this.toast('💾 ' + t('saved'), 'good'); break;
      case 'howto': this.modal(`<h2>❔ ${t('howTo')}</h2>${this.howtoHtml()}<div class="acts"><button class="btn primary" data-a="modalClose">OK</button></div>`); return;
      case 'toTitle': saveGame(); this.closePanel(); this.showTitle(); return;
      // title & modals
      case 'continue': { const s = loadSave(); if (s) startGame(s); return; }
      case 'newgame':
        if (loadSave()) { this.modal(`<h2>⚠️ ${t('newGame')}</h2><p>${t('overwrite')}</p><div class="acts"><button class="btn" data-a="modalClose">${t('cancel')}</button><button class="btn primary" data-a="reallyNew">${t('startOver')}</button></div>`); return; }
        this.newGame(); return;
      case 'reallyNew': this.modalClose(); SDK.remove(SAVE_KEY); this.newGame(); return;
      case 'beginGame': this.modalClose(); this.newGame(); return;
      case 'modalClose': this.modalClose(); return;
      case 'wake': {
        this.modalClose(); SDK.gameplayStop();
        const lost = respawn(false);
        // passing out is a natural break: offer a midgame ad before play resumes
        Game.paused = true;
        SDK.midgame(() => { Game.paused = false; UI.fade(); this.toast(t('wokeUp', fmtMoney(lost)), 'bad'); SDK.gameplayStart(); });
        return;
      }
      case 'reviveAd':
        SDK.rewarded(ok => { this.modalClose(); UI.fade(); if (ok) { S.reviveUsed = day(); respawn(true); this.toast(t('keptBag'), 'good'); } else { const lost = respawn(false); this.toast(t('adFail') + ' ' + t('wokeUp', fmtMoney(lost)), 'bad'); } SDK.gameplayStart(); });
        return;
      case 'startDay': this.modalClose(); SDK.gameplayStart(); return;
    }
    this.render();
  },

  // ---------- modals ----------
  modal(html) {
    SDK.gameplayStop();
    const m = $('modal'); m.innerHTML = `<div class="mbox">${html}</div>`; m.classList.remove('hidden'); this.modalOpen = true;
  },
  modalClose() {
    $('modal').classList.add('hidden'); this.modalOpen = false; Input.clear();
    if (Game.state === 'play' && !this.panel && !Game.dead) SDK.gameplayStart();
  },
  // New players land directly in gameplay; onboarding happens in the world (Guide)
  newGame() {
    startGame(newState()); saveGame();
    this.banner('♻ URBAN SCRAP', t('welcomeSub'));
  },
  sleepReport(full, lines, newDay) {
    SDK.gameplayStop();
    Game.paused = true;
    const show = () => { Game.paused = false; this.modal(`<h2>${full ? '🌅 ' + t('dayN', day()) : '😴 ' + t('napDone')}</h2>
      <div class="report">${lines.length ? lines.map(l => `<div>${l}</div>`).join('') : `<div>${t('quietNight')}</div>`}</div>
      <div class="acts"><button class="btn big primary" data-a="startDay">${full ? t('startDay') : t('continue')}</button></div>`); };
    // a full night's sleep is the game's natural break for a midgame ad (the SDK paces frequency)
    if (full) { SDK.midgame(show); return; }
    show();
  },
  death() {
    SDK.gameplayStop();
    const canAd = S.reviveUsed !== day();
    this.modal(`<h2>💀 ${t('passedOut')}</h2><p>${t('deathText')}</p>
      <div class="acts col"><button class="btn primary" data-a="wake">🛏️ ${t('wakeUp')}</button>
      ${canAd ? `<button class="btn ad" data-a="reviveAd">🎬 ${t('reviveAd')}</button>` : ''}</div>`);
  },
  dailyBonus(streak, cash, gifts) {
    const dots = Array.from({ length: 7 }, (_, i) => `<i class="${i < Math.min(streak, 7) ? 'on' : ''}">${i + 1}</i>`).join('');
    const g = Object.keys(gifts).map(k => `<span class="chip ok">${ITEMS[k].i} ×${gifts[k]}</span>`).join(' ');
    this.modal(`<h2>🎁 ${t('dailyTitle')}</h2><div class="streak">${dots}</div><p>${t('dailyStreak', streak)}</p>
      <div class="out"><span class="chip ok">💵 ${fmtMoney(cash)}</span> ${g}</div><p class="note">${t('dailyText')}</p>
      <div class="acts"><button class="btn big primary" data-a="modalClose">${t('claim')}</button></div>`);
    Sfx.play('cash');
  },
  victory() {
    this.modal(`<h2>♻️ ${t('victoryTitle')}</h2><div class="bigmsg">🏭</div><p>${t('victoryText', day(), fmtMoney(S.stats.earned || 0))}</p><div class="acts"><button class="btn big primary" data-a="modalClose">${t('keepPlaying')}</button></div>`);
  },
};
// Replace [[KeyX]] tokens with the label of that physical key in the player's layout
function keyText(s) { return s.replace(/\[\[(\w+)\]\]/g, (_, c) => keyLabel(c)); }
function catSort(a, b) {
  const o = { raw: 0, ref: 1, food: 2, med: 3 };
  return (o[ITEMS[a].c] - o[ITEMS[b].c]) || (ITEMS[b].p - ITEMS[a].p);
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ lang: LANG, sfx: Sfx.sfxOn, music: Sfx.musicOn })); } catch (e) { }
}
function loadPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (e) { }
  if (p) { LANG = p.lang || LANG; Sfx.sfxOn = p.sfx !== false; Sfx.musicOn = p.music !== false; }
  else LANG = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
function applyLang() {
  document.documentElement.lang = LANG;
  const ph = $('pClose'); if (ph) ph.title = t('close');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}
