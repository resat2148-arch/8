'use strict';
// ---------- Boot ----------
(async function boot() {
  loadPrefs();
  applyLang();
  R.init();
  Input.init();
  UI.init();
  await SDK.init();
  SDK.loadingStart();
  const save = loadSave();
  genWorld(save ? save.seed : ((Math.random() * 1e9) | 0));
  const ld = document.getElementById('loading');
  if (ld) ld.remove();
  SDK.loadingStop();
  UI.showTitle();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      update(dt);
      R.frame(dt);
      UI.update(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.addEventListener('beforeunload', () => saveGame());
})();
