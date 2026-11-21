/* ===== HANABI · «Z💘» медленно плывёт вниз, без следа ===== */
(function () {
  if (window.__zRain) return;
  window.__zRain = true;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const c = document.createElement('canvas');
  c.id = 'zrain';
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none';
  document.body.insertBefore(c, document.body.firstChild);
  const ctx = c.getContext('2d');

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const SIZES = [16, 20, 25, 31, 38];          /* мелкие — дальние, крупные — ближние */
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  let W = 0, H = 0, items = [], sprites = [], last = 0, raf = 0;

  /* один спрайт = готовая надпись «Z💘» */
  function makeSprite(size) {
    const w = Math.ceil(size * 2.7 * DPR), h = Math.ceil(size * 1.6 * DPR);
    const o = document.createElement('canvas');
    o.width = w; o.height = h;
    const g = o.getContext('2d');
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = `800 ${size * DPR}px Unbounded,Manrope,sans-serif`;
    g.fillStyle = '#ff9a3c';
    g.shadowColor = 'rgba(255,106,0,.85)';
    g.shadowBlur = 8 * DPR;
    g.fillText('Z', w * .30, h / 2);
    g.shadowBlur = 0;
    g.font = `${size * DPR}px ${EMOJI_FONT}`;
    g.fillText('💘', w * .68, h / 2 + size * DPR * .04);
    return o;
  }

  function spawn(it, anywhere) {
    const k = it.k;
    it.x = Math.random() * W;
    it.y = anywhere ? Math.random() * H : -k.h - Math.random() * H * .3;
    it.v = 12 + Math.random() * 16 + k.depth * 10;      /* px/сек — медленно */
    it.sway = 6 + Math.random() * 14;
    it.ph = Math.random() * Math.PI * 2;
    it.a = .28 + k.depth * .22 + Math.random() * .08;
  }

  function build() {
    W = innerWidth; H = innerHeight;
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    const n = Math.max(6, Math.round(W / (W < 720 ? 55 : 80)));
    items = [];
    for (let i = 0; i < n; i++) {
      const si = Math.min(SIZES.length - 1, Math.floor(Math.pow(Math.random(), 1.3) * SIZES.length));
      const spr = sprites[si];
      const it = { k: { w: spr.width / DPR, h: spr.height / DPR, depth: si / (SIZES.length - 1), spr } };
      spawn(it, true);
      items.push(it);
    }
  }

  function frame(t) {
    const dt = Math.min((t - last) / 1000 || 0, .05); last = t;
    const K = W < 720 ? .75 : 1;                       /* на телефоне чуть тише */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const it of items) {
      it.y += it.v * dt; it.ph += dt * .6;
      if (it.y > H + it.k.h) spawn(it, false);
      /* плавное появление сверху и растворение внизу */
      const edge = Math.min(1, Math.max(0, (it.y + it.k.h) / 120), Math.max(0, (H - it.y) / 140));
      ctx.globalAlpha = it.a * K * edge;
      const x = it.x + Math.sin(it.ph) * it.sway;
      ctx.drawImage(it.k.spr, x - it.k.w / 2, it.y - it.k.h / 2, it.k.w, it.k.h);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    sprites = SIZES.map(makeSprite);
    build();
    if (reduce) { frame(0); cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame);
  }

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (Math.abs(innerWidth - W) > 40 || Math.abs(innerHeight - H) > 120) build(); }, 200);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduce) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
})();
