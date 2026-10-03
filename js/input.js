'use strict';
// ---------- Keyboard + touch input ----------
const Input = {
  keys: {}, pressed: {}, isTouch: false, layout: null,
  joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, touchSprint: false,

  init() {
    // show key labels in the player's own keyboard layout (e.g. ZQSD on AZERTY); bindings use physical keys
    try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { this.layout = m; }).catch(() => { }); } catch (e) { }
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
    window.addEventListener('keydown', e => {
      Sfx.init();
      const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];
      if (block.includes(e.code)) e.preventDefault();
      if (UI.onKey(e)) { e.preventDefault(); return; }
      this.keys[e.code] = true;
      if (e.repeat) return;
      const map = { KeyE: 'interact', Enter: 'interact', Space: 'attack', KeyF: 'attack', Digit1: 'quick0', Digit2: 'quick1', Digit3: 'quick2', Digit4: 'quick3' };
      if (map[e.code]) this.pressed[map[e.code]] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.joyEnd(); });
    // touch joystick on the canvas
    const cv = document.getElementById('game');
    cv.addEventListener('touchstart', e => {
      Sfx.init();
      for (const tc of e.changedTouches) {
        if (this.joy.id === null && tc.clientX < window.innerWidth * .55) {
          this.joy.id = tc.identifier; this.joy.ox = tc.clientX; this.joy.oy = tc.clientY; this.joy.x = 0; this.joy.y = 0;
          UI.joyShow(tc.clientX, tc.clientY, 0, 0);
        }
      }
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      for (const tc of e.changedTouches) if (tc.identifier === this.joy.id) {
        let dx = tc.clientX - this.joy.ox, dy = tc.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy), max = 52;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        this.joy.x = dx / max; this.joy.y = dy / max;
        UI.joyShow(this.joy.ox, this.joy.oy, dx, dy);
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => { for (const tc of e.changedTouches) if (tc.identifier === this.joy.id) this.joyEnd(); };
    cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
    cv.addEventListener('mousedown', e => { Sfx.init(); if (e.button === 0 && !this.isTouch && Game.state === 'play') this.pressed.attack = true; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },
  joyEnd() { this.joy.id = null; this.joy.x = 0; this.joy.y = 0; UI.joyHide(); },
  moveVec() {
    let x = 0, y = 0; const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (this.joy.id !== null) { const m = Math.hypot(this.joy.x, this.joy.y); if (m > .18) { x += this.joy.x; y += this.joy.y; } }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  },
  sprint() { return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.touchSprint || (this.joy.id !== null && Math.hypot(this.joy.x, this.joy.y) > .97 && this.touchSprint)); },
  consume(a) { if (this.pressed[a]) { delete this.pressed[a]; return true; } return false; },
  press(a) { this.pressed[a] = true; },
  clear() { this.pressed = {}; this.keys = {}; },
};
