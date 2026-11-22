/* Amir König — site behaviour. No dependencies. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- Night sky with a glowing ridge.
     Dunes on the left, Alps on the right, a sun rising where they meet: Abu Dhabi to Zurich. */
  function Sky(canvas) {
    const ctx = canvas.getContext('2d');
    const baseFrac = parseFloat(canvas.dataset.base || '.62');
    const sunU = parseFloat(canvas.dataset.sun || '.5');
    const dusk = canvas.dataset.variant === 'dusk';
    let W = 0, H = 0, dpr = 1, layer = null, stars = [], rays = [], grain = null;
    let running = false, raf = 0, start = performance.now();
    let px = 0, py = 0, tx = 0, ty = 0, rs = 1;

    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(dusk ? 97 : 31);

    // Feature sizes are in pixels, so dunes and peaks keep their shape from phone to desktop.
    function ridgeY(x) {
      const u = x / W;
      const amp = Math.min(H, W * 1.05);
      const arc = Math.pow(u - sunU, 2) * Math.min(H, W) * 0.2;
      const xs = x + (W > 700 ? 0 : 140);
      const z = xs / 68;
      const dune = (Math.sin(z + .6) + .38 * Math.sin(2 * z + 1.1) + .5 * Math.sin(xs / 225 + 2)) * amp * 0.021;
      const a = xs / 225;
      let alps = Math.pow(1 - Math.abs(Math.sin(a + .9)), 1.5) * 0.125;
      alps += Math.pow(1 - Math.abs(Math.sin(a * 2.7 + 2.1)), 1.3) * 0.045;
      alps += (1 - Math.abs(Math.sin(a * 7.3 + .4))) * 0.009;
      const k = smooth(sunU - 0.06, sunU + 0.16, u);
      return H * baseFrac + arc - (dune * (1 - k) + (alps - 0.012) * amp * k);
    }

    function build() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);

      const path = new Path2D();
      path.moveTo(-30, ridgeY(-30));
      for (let x = -30; x <= W + 30; x += 3) path.lineTo(x, ridgeY(x));
      const land = new Path2D(path);
      land.lineTo(W + 30, H + 60); land.lineTo(-30, H + 60); land.closePath();

      // 1) glow along the ridge, additive, fading away from the sun
      const glow = document.createElement('canvas');
      glow.width = canvas.width; glow.height = canvas.height;
      const g = glow.getContext('2d');
      g.scale(dpr, dpr);
      g.globalCompositeOperation = 'lighter';
      g.lineJoin = 'round'; g.lineCap = 'round';
      const passes = dusk
        ? [[80, 'rgba(255,90,40,.08)', 110, 'rgba(255,80,40,.8)'], [26, 'rgba(160,80,255,.18)', 40, 'rgba(150,90,255,.85)'], [7, 'rgba(255,160,110,.45)', 16, 'rgba(255,120,70,.9)'], [2, 'rgba(255,236,220,.9)', 5, 'rgba(255,240,230,1)']]
        : [[84, 'rgba(70,50,255,.09)', 120, 'rgba(90,60,255,.85)'], [28, 'rgba(110,95,255,.22)', 42, 'rgba(120,100,255,.9)'], [8, 'rgba(255,150,110,.42)', 18, 'rgba(255,120,70,.9)'], [2.2, 'rgba(255,238,224,.95)', 6, 'rgba(255,240,230,1)']];
      const gs = clamp(W / 1400, .42, 1);
      rs = clamp(W / 1400, .5, 1);
      for (const [w, c, b, sc] of passes) {
        g.lineWidth = Math.max(1.4, w * gs); g.strokeStyle = c; g.shadowBlur = b * gs * dpr; g.shadowColor = sc; g.stroke(path);
      }
      g.shadowBlur = 0;
      g.globalCompositeOperation = 'destination-in';
      const sx = W * sunU, sy = ridgeY(sx);
      const mask = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.8);
      mask.addColorStop(0, 'rgba(0,0,0,1)');
      mask.addColorStop(0.35, 'rgba(0,0,0,.7)');
      mask.addColorStop(1, 'rgba(0,0,0,.14)');
      g.fillStyle = mask; g.fillRect(0, 0, W, H);

      // 2) land silhouette, then the glow on top, then darken deeper ground
      layer = document.createElement('canvas');
      layer.width = canvas.width; layer.height = canvas.height;
      const l = layer.getContext('2d');
      l.scale(dpr, dpr);
      l.fillStyle = '#090908'; l.fill(land);
      l.globalCompositeOperation = 'lighter';
      l.drawImage(glow, 0, 0, W, H);
      l.globalCompositeOperation = 'source-over';
      l.save(); l.translate(0, 34);
      l.shadowBlur = 46 * dpr; l.shadowColor = '#090908'; l.fillStyle = '#090908'; l.fill(land);
      l.restore();

      // stars, rays and film grain
      stars = [];
      const n = Math.round((W * H) / 9000);
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * H;
        if (y > ridgeY(x) - 30) continue;
        stars.push({ x, y, r: rnd() < .12 ? 1.6 : 1, a: .12 + rnd() * .5, f: .4 + rnd() * 1.6, p: rnd() * 6.28 });
      }
      rays = Array.from({ length: 22 }, (_, i) => ({ a: (i / 22) * Math.PI * 2 + rnd() * .2, len: 50 + rnd() * 170, w: .6 + rnd() * 1.1, f: .6 + rnd() * 1.5 }));
      grain = document.createElement('canvas');
      grain.width = grain.height = 160;
      const gc = grain.getContext('2d');
      const img = gc.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rnd() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 15;
      }
      gc.putImageData(img, 0, 0);
      grain = ctx.createPattern(grain, 'repeat');
    }

    function frame(now) {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0f0f0e'; ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        ctx.globalAlpha = s.a * (.55 + .45 * Math.sin(t * s.f + s.p));
        ctx.fillStyle = '#faf9f5';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      px += (tx - px) * .04; py += (ty - py) * .04;
      const rise = reduce ? 1 : 1 - Math.pow(1 - clamp(t / 3.2), 3);
      const sx = W * sunU + px * 16;
      const base = ridgeY(W * sunU);
      const sy = base + (dusk ? 6 : (1 - rise) * 46 - 4) + py * 6;
      const flick = .92 + .08 * Math.sin(t * 2.3) * Math.sin(t * 1.1 + 1);
      const R = Math.min(W, H);

      // sun behind the ridge
      ctx.globalCompositeOperation = 'lighter';
      let gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * .42);
      gr.addColorStop(0, `rgba(255,150,90,${.26 * flick})`);
      gr.addColorStop(.4, 'rgba(255,110,60,.07)');
      gr.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 70);
      gr.addColorStop(0, 'rgba(255,250,240,1)');
      gr.addColorStop(.18, `rgba(255,226,190,${.85 * flick})`);
      gr.addColorStop(1, 'rgba(255,170,110,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, 70, 0, Math.PI * 2); ctx.fill();

      // the ground covers the lower half of the sun
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0, W, H);

      // starburst over everything
      ctx.globalCompositeOperation = 'lighter';
      const k = (.55 + .45 * rise) * flick;
      for (const r of rays) {
        const a = r.a + t * .015;
        const len = r.len * rs * (.8 + .2 * Math.sin(t * r.f + r.a * 3)) * k;
        const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
        const lg = ctx.createLinearGradient(sx, sy, ex, ey);
        lg.addColorStop(0, 'rgba(255,232,205,.55)');
        lg.addColorStop(1, 'rgba(255,200,160,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = r.w;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // a wide, thin lens streak
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, .035);
      gr = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .32);
      gr.addColorStop(0, `rgba(255,236,220,${.5 * k})`);
      gr.addColorStop(1, 'rgba(255,200,170,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, W * .32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
      gr.addColorStop(0, `rgba(255,255,255,${.95 * k})`);
      gr.addColorStop(1, 'rgba(255,240,225,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();

      // film grain
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate((Math.random() * 160) | 0, (Math.random() * 160) | 0);
      ctx.fillStyle = grain; ctx.fillRect(-160, -160, W + 320, H + 320);
      ctx.restore();

      if (running) raf = requestAnimationFrame(frame);
    }

    function play() { if (!running && !reduce) { running = true; raf = requestAnimationFrame(frame); } }
    function pause() { running = false; cancelAnimationFrame(raf); }

    build();
    frame(reduce ? start + 10000 : performance.now());
    if (!reduce) {
      new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause())).observe(canvas);
      document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
      window.addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
    }
    let rt = 0, lastW = innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        // mobile browsers resize on scroll as the toolbar hides; only rebuild on real width changes
        if (Math.abs(innerWidth - lastW) < 2 && Math.abs(canvas.getBoundingClientRect().height - H) < 120) return;
        lastW = innerWidth; build(); if (!running) frame(start + 10000);
      }, 150);
    });
  }
  $$('canvas.sky').forEach((c) => { try { Sky(c); } catch (e) { /* the page still reads fine without the sky */ } });

  /* ---------------------------------------------------------------- Split "data-words" paragraphs into word spans */
  $$('[data-words]').forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) walk(child);
      });
    };
    walk(el);
  });

  /* ---------------------------------------------------------------- Pinned scenes: progress 0..1 while the stage is stuck */
  const pins = $$('.pin');
  function updatePins() {
    for (const p of pins) {
      const r = p.getBoundingClientRect();
      const total = r.height - innerHeight;
      const prog = total > 0 ? clamp(-r.top / total) : 1;
      p.style.setProperty('--p', prog.toFixed(4));
      const words = p._words || (p._words = $$('.w', p));
      const shown = reduce ? words.length : Math.round(clamp((prog - .06) / .7) * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < shown));
    }
  }
  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { updatePins(); ticking = false; }); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updatePins();

  /* ---------------------------------------------------------------- Reveal on enter, with a small stagger per group */
  const groups = new Map();
  $$('.rv').forEach((el) => {
    const key = el.parentElement;
    const i = groups.get(key) || 0;
    groups.set(key, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 8) * 0.07}s`);
  });
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('.rv').forEach((el) => io.observe(el));
  } else {
    $$('.rv').forEach((el) => el.classList.add('in'));
  }

  /* ---------------------------------------------------------------- HUD: current section label, text tone, left rail */
  const hud = $('.hud');
  const hudFile = $('.hud-file');
  const hudHash = $('.hud-hash');
  const hudLabel = $('.hud-label');
  const rail = $('.rail');
  const sections = $$('main > section');
  const ticks = sections.map((s) => {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.innerHTML = `<span>${s.dataset.name || ''}</span>`;
    a.setAttribute('aria-label', s.dataset.name || s.id);
    rail.appendChild(a);
    return a;
  });
  function setActive(s) {
    const tone = s.dataset.tone || 'light';
    hud.dataset.tone = tone;
    rail.dataset.tone = tone;
    const label = s.dataset.label || '';
    hudHash.textContent = s.dataset.hash || '';
    hudLabel.textContent = label;
    hudFile.classList.toggle('on', !!label);
    ticks.forEach((t, i) => t.classList.toggle('on', sections[i] === s));
  }
  // the section under the top bar sets its colours; a centre band picks the label
  function pickByLine(y) {
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) return s; }
    return sections[0];
  }
  let hudTick = false;
  function updateHud() {
    const topS = pickByLine(30);
    const midS = pickByLine(innerHeight * .45);
    setActive(midS);
    hud.dataset.tone = topS.dataset.tone || 'light';
    hudTick = false;
  }
  window.addEventListener('scroll', () => { if (!hudTick) { hudTick = true; requestAnimationFrame(updateHud); } }, { passive: true });
  updateHud();

  /* ---------------------------------------------------------------- Index overlay */
  const pill = $('.pill');
  const index = $('#index');
  let lastFocus = null;
  function openIndex() {
    lastFocus = document.activeElement;
    index.hidden = false;
    requestAnimationFrame(() => index.classList.add('open'));
    pill.setAttribute('aria-expanded', 'true');
    document.body.classList.add('index-open');
    hud.dataset.tone = 'dark';
    hud.classList.add('over-index');
    $('a', index).focus({ preventScroll: true });
  }
  function closeIndex(restore = true) {
    index.classList.remove('open');
    index.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('index-open');
    hud.classList.remove('over-index');
    updateHud();
    if (restore && lastFocus) lastFocus.focus({ preventScroll: true });
  }
  pill.addEventListener('click', () => (index.hidden ? openIndex() : closeIndex()));
  index.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) {
      e.preventDefault();
      closeIndex(false);
      const target = $(a.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
        history.replaceState(null, '', a.getAttribute('href'));
      }
    } else if (e.target === index) closeIndex();
  });
  document.addEventListener('keydown', (e) => {
    if (index.hidden) return;
    if (e.key === 'Escape') closeIndex();
    if (e.key === 'Tab') {
      // keep focus inside the deck and the toggle
      const f = [pill, ...$$('a', index)];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------------------------------------------------------- Orange cursor dot */
  const dot = $('.cursor');
  if (matchMedia('(pointer: fine)').matches && !reduce) {
    let x = -100, y = -100, cx = -100, cy = -100, on = false;
    window.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; cx = x; cy = y; dot.classList.add('live'); loop(); }
      dot.classList.toggle('big', !!e.target.closest('a, button'));
    }, { passive: true });
    document.addEventListener('pointerleave', () => { dot.classList.remove('live'); on = false; });
    function loop() {
      cx += (x - cx) * .2; cy += (y - cy) * .2;
      dot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      if (on) requestAnimationFrame(loop);
    }
  }

  /* ---------------------------------------------------------------- Respect reduced motion inside the SVG objects */
  if (reduce) $$('svg').forEach((s) => s.pauseAnimations && s.pauseAnimations());
})();
