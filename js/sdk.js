'use strict';
// ---------- CrazyGames SDK v3 wrapper (game works fine without it) ----------
const SDK = {
  ready: false, env: 'none', playing: false, adActive: false,
  get api() { return (window.CrazyGames && window.CrazyGames.SDK) || null; },

  async init() {
    try {
      if (this.api) {
        await Promise.race([this.api.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
        this.ready = true;
        this.env = this.api.environment || 'unknown';
        if (this.env === 'disabled') this.ready = false;
      }
    } catch (e) { this.ready = false; }
  },
  call(fn) { if (!this.ready) return; try { fn(this.api); } catch (e) { /* ignore */ } },
  loadingStart() { this.call(a => a.game.loadingStart()); },
  loadingStop() { this.call(a => a.game.loadingStop()); },
  gameplayStart() { if (this.playing) return; this.playing = true; this.call(a => a.game.gameplayStart()); },
  gameplayStop() { if (!this.playing) return; this.playing = false; this.call(a => a.game.gameplayStop()); },
  happytime() { this.call(a => a.game.happytime()); },

  _ad(type, done) {
    let finished = false;
    const end = ok => { if (finished) return; finished = true; this.adActive = false; Sfx.setMuted(false); done(ok); };
    try {
      this.api.ad.requestAd(type, {
        adStarted: () => { this.adActive = true; Sfx.setMuted(true); },
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch (e) { end(false); }
  },
  midgame(cb) {
    if (!this.ready) { cb(); return; }
    this._ad('midgame', () => cb());
  },
  // onDone(granted:boolean)
  rewarded(onDone) {
    if (!this.ready) { onDone(true); return; } // offline / local build: grant for free
    this._ad('rewarded', ok => onDone(ok));
  },

  // Persistence: write to both local storage and CrazyGames cloud data
  save(key, str) {
    try { localStorage.setItem(key, str); } catch (e) { }
    this.call(a => a.data && a.data.setItem(key, str));
  },
  load(key) {
    let a = null, b = null;
    try { a = localStorage.getItem(key); } catch (e) { }
    this.call(api => { if (api.data) b = api.data.getItem(key); });
    if (!a) return b; if (!b) return a;
    try { return (JSON.parse(a).savedAt || 0) >= (JSON.parse(b).savedAt || 0) ? a : b; } catch (e) { return a; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { }
    this.call(a => a.data && a.data.removeItem(key));
  },
};
