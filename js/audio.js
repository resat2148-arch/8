'use strict';
// ---------- Synthesized audio (no asset files) ----------
const Sfx = {
  ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
  sfxOn: true, musicOn: true, muted: false, platformMute: false, rainNode: null, musicTimer: null, step: 0,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxOn ? .55 : 0; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = this.musicOn ? .22 : 0; this.music.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
    this.applyMute();
  },
  applyMute() { if (this.master) this.master.gain.value = (this.muted || this.platformMute) ? 0 : 1; },
  setPlatformMute(m) { this.platformMute = m; this.applyMute(); },
  setMuted(m) { this.muted = m; this.applyMute(); },
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? .55 : 0; },
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.value = on ? .22 : 0; },

  tone(f, dur, type, vol, slide, delay, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .2, t + .01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + .05);
  },
  noise(dur, vol, freq, type, delay, q) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
  },
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'rustle': this.noise(.12, .12, 1800 + Math.random() * 1500, 'bandpass', 0, 2); break;
      case 'metal': this.noise(.08, .12, 3000, 'highpass'); this.tone(900 + Math.random() * 400, .12, 'square', .03); break;
      case 'loot': this.tone(520, .08, 'triangle', .15); this.tone(780, .1, 'triangle', .13, 0, .07); break;
      case 'rare': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .25, 'triangle', .14, 0, i * .08)); break;
      case 'cash': this.tone(1318, .08, 'square', .06); this.tone(1760, .18, 'square', .06, 0, .07); this.noise(.05, .08, 5000, 'highpass'); break;
      case 'craft': for (let i = 0; i < 3; i++) { this.noise(.07, .2, 2500, 'bandpass', i * .12, 3); this.tone(300 + i * 60, .1, 'square', .05, 0, i * .12); } this.tone(880, .3, 'triangle', .1, 0, .38); break;
      case 'hurt': this.tone(180, .2, 'sawtooth', .15, 80); this.noise(.1, .15, 600); break;
      case 'bark': this.tone(420, .07, 'square', .08, 260); this.tone(380, .09, 'square', .08, 220, .12); break;
      case 'yelp': this.tone(900, .18, 'triangle', .1, 1500); break;
      case 'swing': this.noise(.15, .15, 900, 'bandpass', 0, .8); break;
      case 'hit': this.noise(.08, .25, 700); this.tone(140, .1, 'square', .08, 70); break;
      case 'level': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, .3, 'square', .06, 0, i * .09)); break;
      case 'click': this.tone(700, .04, 'triangle', .07); break;
      case 'deny': this.tone(200, .15, 'square', .06, 150); break;
      case 'eat': this.noise(.06, .1, 1200, 'bandpass', 0, 2); this.noise(.06, .1, 1100, 'bandpass', .1, 2); break;
      case 'drink': for (let i = 0; i < 3; i++) this.tone(300 + i * 90, .08, 'sine', .08, 500 + i * 90, i * .09); break;
      case 'gate': this.noise(.4, .3, 400); this.tone(90, .5, 'sawtooth', .08, 50); break;
      case 'sleep': [523, 440, 349, 262].forEach((f, i) => this.tone(f, .5, 'sine', .08, 0, i * .2)); break;
      case 'collect': this.tone(660, .06, 'triangle', .1); this.tone(990, .08, 'triangle', .1, 0, .05); break;
    }
  },
  setRain(on) {
    if (!this.ctx) return;
    if (on && !this.rainNode) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = this.ctx.createGain(); g.gain.value = .06;
      s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
      this.rainNode = { s, g };
    } else if (!on && this.rainNode) { try { this.rainNode.s.stop(); } catch (e) { } this.rainNode = null; }
  },
  // Gentle lo-fi generative background loop
  startMusic() {
    const chords = [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [130.8, 196, 246.9, 329.6], [196, 246.9, 293.7, 370]];
    const scale = [440, 523.3, 587.3, 659.3, 784, 880];
    const beat = .62;
    let next = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (next < now) next = now + .05;
      while (next < now + .4) {
        const bar = Math.floor(this.step / 8) % 4, b = this.step % 8;
        const night = window.Game && Game.darkness > .4;
        const ch = chords[bar];
        if (b === 0) ch.forEach(f => this.pad(night ? f / 2 : f, beat * 7.5, next));
        if (b === 0 || b === 4) this.bass(ch[0] / 2, beat * 1.5, next);
        if (Math.random() < (night ? .18 : .32) && b % 2 === 0) this.pluck(scale[Math.floor(Math.random() * scale.length)] * (night ? .5 : 1), next);
        if (!night && (b === 2 || b === 6)) this.hat(next);
        this.step++; next += beat;
      }
    }, 120);
  },
  pad(f, dur, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(.035, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + .1);
  },
  bass(f, dur, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + .05);
  },
  pluck(f, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + .6);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + .7);
  },
  hat(t) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + .05);
    s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random()); s.stop(t + .08);
  },
};
