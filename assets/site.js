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

    // The Matterhorn as seen from Zermatt: summit leaning left, steep left face, long right ridge
    // with the shoulder, lower ridges either side. x in mountain widths from the summit, h in peak heights.
    const MATTER = [[-3.4, .03], [-3, .09], [-2.6, .14], [-2.3, .11], [-1.95, .18], [-1.6, .15], [-1.3, .21], [-1, .2],
      [-.78, .26], [-.62, .36], [-.5, .47], [-.42, .5], [-.33, .62], [-.24, .76], [-.18, .86], [-.145, .93], [-.125, .975],
      [-.1, 1], [-.05, .995], [0, .975], [.05, .955], [.1, .93], [.2, .85], [.3, .775], [.44, .76], [.52, .71], [.68, .58],
      [.9, .45], [1.15, .33], [1.4, .25], [1.6, .27], [1.85, .2], [2.2, .17], [2.6, .23], [3, .16], [3.5, .08], [4.2, .03]];
    function matterhorn(xu) {
      if (xu <= MATTER[0][0]) return MATTER[0][1];
      for (let i = 1; i < MATTER.length; i++) {
        const [x1, h1] = MATTER[i];
        if (xu <= x1) { const [x0, h0] = MATTER[i - 1]; return h0 + (h1 - h0) * (xu - x0) / (x1 - x0); }
      }
      return MATTER[MATTER.length - 1][1];
    }

    // Dunes on the left (in pixels, so they keep their shape on every screen), the Matterhorn massif on the right.
    function ridgeY(x) {
      const u = x / W;
      const arc = Math.pow(u - sunU, 2) * Math.min(H, W) * 0.2;
      const xs = x + (W > 700 ? 0 : 140);
      const z = xs / 68;
      const amp = Math.min(H, W * 1.05);
      const dune = (Math.sin(z + .6) + .38 * Math.sin(2 * z + 1.1) + .5 * Math.sin(xs / 225 + 2)) * amp * 0.021;
      const peak = Math.min(H * .3, W * .42);
      const mx = W * (W > 700 ? .79 : .7), unit = peak * .6;
      const hm = matterhorn((x - mx) / unit);
      const rough = (Math.sin(x * .23) * .5 + Math.sin(x * .61 + 1.3) * .3 + Math.sin(x * 1.7) * .12) * peak * .012 * (hm > .15 ? 1 : .4);
      const k = smooth(sunU - 0.06, sunU + 0.16, u);
      return H * baseFrac + arc - (dune * (1 - k) + (hm * peak + rough) * k);
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
      // canvas._p is set by the scroll engine: hero = how far it has scrolled away, outro = how far it has arrived
      const sp = canvas._p || 0;
      const sy = dusk
        ? base + 6 + (1 - sp) * 70 + py * 6
        : base + (1 - rise) * 46 - 4 - sp * H * .16 + py * 6;
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
      const k = (.55 + .45 * rise) * flick * (dusk ? .35 + .65 * sp : 1 + sp * .35);
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

  /* ---------------------------------------------------------------- Colour maths: blend in OKLab so blue to ivory stays clean */
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
  const delin = (c) => (c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055);
  function toOk(hex) {
    const [r, g, b] = hexRgb(hex).map(lin);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s];
  }
  function fromOk([L, a, b]) {
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (L - .0894841775 * a - 1.2914855480 * b) ** 3;
    const lr = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s].map((c) => clamp(c));
    return { rgb: lr.map((c) => Math.round(delin(c) * 255)), lum: .2126 * lr[0] + .7152 * lr[1] + .0722 * lr[2] };
  }
  // Two saturated colours blend around the hue wheel (OKLCh), so lilac to olive does not dip through grey.
  // If either side is nearly neutral (ivory, cream, night), a straight OKLab blend looks cleaner.
  function mix(a, b, t) {
    const ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
    if (ca < .04 || cb < .04) return a.map((v, i) => v + (b[i] - v) * t);
    const ha = Math.atan2(a[2], a[1]);
    let dh = Math.atan2(b[2], b[1]) - ha;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    const h = ha + dh * t, C = ca + (cb - ca) * t;
    return [a[0] + (b[0] - a[0]) * t, C * Math.cos(h), C * Math.sin(h)];
  }
  const mixN = (cols, f) => { const i = clamp(Math.floor(f), 0, cols.length - 1); return mix(cols[i], cols[Math.min(i + 1, cols.length - 1)], clamp(f - i)); };
  const sstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const eOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const eIn = (t) => Math.pow(clamp(t), 2);
  const eInOut = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ---------------------------------------------------------------- The scroll engine.
     Everything that moves with scroll reads one smoothed scroll value, so wheel steps glide. */
  const root = document.documentElement;
  const backdrop = $('.backdrop');
  const hud = $('.hud');
  const hudFile = $('.hud-file');
  const hudHash = $('.hud-hash');
  const hudLabel = $('.hud-label');
  const rail = $('.rail');
  const hero = $('#top'), hello = $('#hello'), intro = $('#projects'), stage = $('#stage'), contact = $('#contact');
  const projects = $$('.stage .project');
  const heroSky = $('.hero .sky'), outroSky = $('.outro .sky');
  const words = $$('.w', hello);
  const stageMQ = matchMedia('(min-width: 900px) and (min-height: 620px)');
  const HOLD = 1, TRANS = .85, UNITS = projects.length * HOLD + (projects.length - 1) * TRANS;
  const logical = [hero, hello, intro, ...projects, $('#record'), $('#leadership'), $('#toolbox'), contact];
  const exitSel = { hello: ['.pin-stage'], projects: ['.col'], stage: ['.stage-sticky'], ews: ['.project-inner'], gitbox: ['.project-inner'], margin: ['.project-inner'], record: ['.col', '.eth-art', '.bench-wrap'], leadership: ['.lead-inner'], toolbox: ['.tool-inner'] };
  projects.forEach((p) => { p._parts = $$('.project-text > *', p); p._obj = $('.obj', p); p._ok = toOk(p.dataset.bg); });
  const stageCols = projects.map((p) => p._ok);

  // rim dots on the shared plate, so the turntable visibly turns
  const rimG = $('.rim');
  const rimDots = [];
  if (rimG) for (let i = 0; i < 10; i++) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rimG.appendChild(c); rimDots.push(c);
  }

  // Abu Dhabi grows as "Abu Dhabi" lights up; a plane leaves when "Zurich" does
  const adB = $$('.ad-b'), adSun = $('.ad-sun'), adPlane = $('.ad-plane');
  const widx = (re) => Math.max(0, words.findIndex((w) => re.test(w.textContent)));
  const pWord = (i) => .06 + .7 * (i + .5) / Math.max(1, words.length);
  const pAbu = pWord(widx(/^Abu/)), pZur = pWord(widx(/^Zurich/));
  const eBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function applySkyline(p) {
    const g = reduce ? 1 : clamp((p - (pAbu - .1)) / .2);
    adB.forEach((b, k) => {
      const sc = Math.max(0, eBack(g * 1.9 - k * .09));
      b.style.transform = `scale(1,${sc.toFixed(3)})`;
      b.style.opacity = sc > .01 ? '1' : '0';
    });
    if (adSun) { adSun.style.transform = `translate(0,${((1 - g) * 90).toFixed(1)}px)`; adSun.style.opacity = g.toFixed(3); }
    if (adPlane) {
      const z = reduce ? 0 : clamp((p - (pZur - .05)) / .22), u = eIn(z);
      const P0 = [432, 470], P1 = [560, 462], P2 = [730, 140];
      const x = (1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0];
      const y = (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1];
      const dx = 2 * (1 - u) * (P1[0] - P0[0]) + 2 * u * (P2[0] - P1[0]);
      const dy = 2 * (1 - u) * (P1[1] - P0[1]) + 2 * u * (P2[1] - P1[1]);
      adPlane.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)})`);
      adPlane.style.opacity = (Math.min(g, 1) * (1 - sstep((z - .72) / .28))).toFixed(3);
    }
  }
  // the red Polybahn climbs to ETH as the record section scrolls in
  const ethArt = $('.eth-art'), polyCar = $('.poly-car');
  let ethTop = 0;
  function applyPolybahn(S) {
    if (!polyCar) return;
    const t = reduce ? 1 : eInOut(clamp((S + vh - ethTop) / (vh * .8)));
    const s0 = .1 + .78 * t;
    polyCar.setAttribute('transform', `translate(${(100 + 86 * s0).toFixed(1)} ${(528 - 58 * s0).toFixed(1)}) rotate(-33.8)`);
  }

  let vh = innerHeight, segs = [], staged = false, stageTop = 0, stageRange = 1, helloTop = 0, helloH = 1, heroH = 1, contactTop = 0;
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;

  function clearStage() {
    projects.forEach((p) => { p._parts.forEach((el) => { el.style.opacity = ''; el.style.transform = ''; }); p._obj.style.cssText = ''; });
  }
  function measure() {
    vh = innerHeight;
    const want = stageMQ.matches && !reduce;
    if (want !== staged) { staged = want; root.classList.toggle('staged', staged); if (!staged) clearStage(); }
    $$('.pin-stage, .col, .eth-art, .stage-sticky, .project-inner, .bench-wrap, .lead-inner, .tool-inner').forEach((w) => { w.style.opacity = ''; w.style.transform = ''; });
    const list = [hero, hello, intro, ...(staged ? [stage] : projects), $('#record'), $('#leadership'), $('#toolbox'), contact];
    segs = list.map((el) => {
      const sel = exitSel[el.id] || [];
      const wraps = sel.flatMap((q) => $$(q, el).filter((w) => w.closest('section, .stage') === el || el === stage));
      return { el, top: docTop(el), h: el.offsetHeight, ok: el === stage ? null : toOk(el.dataset.bg), wraps, last: -1 };
    });
    stageTop = docTop(stage); stageRange = Math.max(1, stage.offsetHeight - vh);
    helloTop = docTop(hello); helloH = hello.offsetHeight;
    heroH = hero.offsetHeight; contactTop = docTop(contact);
    ethTop = ethArt ? docTop(ethArt) : 0;
  }

  function targetY(id) {
    if (id === 'top' || id === '') return 0;
    const el = document.getElementById(id);
    if (!el) return null;
    const k = projects.indexOf(el);
    if (staged && k >= 0) return stageTop + ((k * (HOLD + TRANS) + HOLD / 2) / UNITS) * stageRange;
    return docTop(el);
  }

  // continuous project index: holds on each project, eased turns between them, plus a spin-in as the stage arrives
  function stageF(S) {
    let u = clamp((S - stageTop) / stageRange) * UNITS, f = 0;
    for (let k = 0; k < projects.length; k++) {
      if (u <= HOLD) { f = k; break; }
      u -= HOLD;
      if (k === projects.length - 1) { f = k; break; }
      if (u <= TRANS) { f = k + eInOut(u / TRANS); break; }
      u -= TRANS;
    }
    const arriving = stageTop - S;
    if (arriving > 0) f -= .62 * clamp(arriving / (vh * .85));
    return f;
  }

  function applyStage(f) {
    projects.forEach((p, k) => {
      const x = clamp(f - k, -1, 1);
      p._parts.forEach((el, j) => {
        let o, y;
        if (x >= 0) { const e = eIn((x - j * .06) / .3); o = 1 - e; y = -e * 46; }
        else { const a = eOut((x + .52 - j * .07) / .32); o = a; y = (1 - a) * 60; }
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      });
      // turntable: the current object sits front and centre, the others turn away to the back
      const th = x * Math.PI / 2, Z = Math.cos(th);
      const X = -Math.sin(th) * 38, Y = -(1 - Z) * 16, sc = .58 + .42 * Z;
      const o = clamp((Z - .08) / .5);
      const ob = p._obj;
      ob.style.transform = `translate3d(${X.toFixed(2)}%,${Y.toFixed(2)}%,0) rotate(${(-x * 9).toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      ob.style.opacity = o.toFixed(3);
      ob.style.zIndex = String(1 + Math.round(Z * 10));
    });
    const turn = f * Math.PI / 2;
    rimDots.forEach((c, i) => {
      const a = i * (Math.PI * 2 / rimDots.length) + turn;
      const front = Math.sin(a);
      c.setAttribute('cx', (300 + 226 * Math.cos(a)).toFixed(1));
      c.setAttribute('cy', (481 + 40 * front).toFixed(1));
      c.setAttribute('r', (2.2 + 1.2 * (front + 1) / 2).toFixed(2));
    });
  }

  let tone = '', activeEl = null, overIndex = false, pillAlt = false;
  const PINK = toOk('#ffb3cd');
  function render(S) {
    const mid = S + vh * .5;
    const f = staged ? stageF(S) : 0;

    // 1) backdrop colour: the section's own colour, blended across each boundary
    let i = segs.findIndex((s) => mid < s.top + s.h);
    if (i < 0) i = segs.length - 1;
    const sg = segs[i], w = vh * .6;
    const cStart = (s) => (s.el === stage ? stageCols[0] : s.ok);
    const cEnd = (s) => (s.el === stage ? stageCols[stageCols.length - 1] : s.ok);
    let c = sg.el === stage ? mixN(stageCols, Math.max(0, f)) : sg.ok;
    if (i < segs.length - 1 && mid > sg.top + sg.h - w / 2) c = mix(cEnd(sg), cStart(segs[i + 1]), sstep((mid - (sg.top + sg.h - w / 2)) / w));
    else if (i > 0 && mid < sg.top + w / 2) c = mix(cEnd(segs[i - 1]), cStart(sg), sstep((mid - (sg.top - w / 2)) / w));
    const col = fromOk(c);
    const rgbStr = `rgb(${col.rgb.join(',')})`;
    backdrop.style.backgroundColor = rgbStr;
    root.style.setProperty('--bgc', rgbStr);
    // the pink index pill switches to cream while the page itself is pink
    const pinkD = Math.hypot(c[0] - PINK[0], c[1] - PINK[1], c[2] - PINK[2]);
    const alt = pinkD < .08;
    if (alt !== pillAlt) { pillAlt = alt; hud.classList.toggle('pill-alt', alt); }
    const t = col.lum < .3 ? 'light' : 'dark';
    if (t !== tone) { tone = t; rail.dataset.tone = t; if (!overIndex) hud.dataset.tone = t; }

    // 2) hero drifts away, the sun keeps rising
    const hp = clamp(S / heroH);
    hero.style.setProperty('--hp', hp.toFixed(4));
    if (heroSky) heroSky._p = hp;

    // 3) hello: words light up while the stage is pinned
    const p = clamp((S - helloTop) / Math.max(1, helloH - vh));
    hello.style.setProperty('--p', p.toFixed(4));
    const shown = reduce ? words.length : Math.round(clamp((p - .06) / .7) * words.length);
    words.forEach((wd, k) => wd.classList.toggle('on', k < shown));
    applySkyline(p);
    applyPolybahn(S);

    // 4) projects turntable
    if (staged) applyStage(f);

    // 5) content fades out as it leaves through the top, so sections hand over instead of cutting
    segs.forEach((s) => {
      if (!s.wraps.length || reduce) return;
      const b = s.top + s.h - S;
      const e = eIn((vh * .62 - b) / (vh * .55));
      if (Math.abs(e - s.last) < .002) return;
      s.last = e;
      s.wraps.forEach((wr) => {
        wr.style.opacity = e ? (1 - e).toFixed(3) : '';
        wr.style.transform = e ? `translate3d(0,${(-e * 6).toFixed(2)}vh,0)` : '';
      });
    });

    // 6) night falls into the closing section and the sun comes up again
    const q = clamp((S + vh - contactTop) / vh);
    contact.style.setProperty('--op', (.1 + .9 * sstep(q)).toFixed(3));
    if (outroSky) outroSky._p = sstep(q);

    // 7) top bar label and left rail
    let act = sg.el;
    if (sg.el === stage) act = projects[clamp(Math.round(f), 0, projects.length - 1)];
    if (act !== activeEl) {
      activeEl = act;
      hudHash.textContent = act.dataset.hash || '';
      hudLabel.textContent = act.dataset.label || '';
      hudFile.classList.toggle('on', !!act.dataset.label);
      ticks.forEach((tk, k) => tk.classList.toggle('on', logical[k] === act));
    }
  }

  // rail ticks, one per logical section
  const ticks = logical.map((s) => {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.innerHTML = `<span>${s.dataset.name || ''}</span>`;
    a.setAttribute('aria-label', s.dataset.name || s.id);
    rail.appendChild(a);
    return a;
  });

  // smoothing loop: S eases toward the real scroll position, frame-rate independent
  let S = scrollY, T = scrollY, looping = false, last = 0;
  function loop(now) {
    const dt = Math.min(64, now - last || 16.7); last = now;
    S += (T - S) * (1 - Math.pow(1 - .15, dt / 16.7));
    if (Math.abs(T - S) < .35) S = T;
    render(S);
    if (S !== T) requestAnimationFrame(loop); else looping = false;
  }
  function kick() {
    T = scrollY;
    if (reduce) { S = T; render(S); return; }
    if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  function relayout() { measure(); S = T = scrollY; render(S); }
  window.addEventListener('scroll', kick, { passive: true });
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(relayout); });
  if ('ResizeObserver' in window) {
    let ro = 0, lastH = 0;
    new ResizeObserver(() => { const h = document.body.scrollHeight; if (h === lastH) return; lastH = h; cancelAnimationFrame(ro); ro = requestAnimationFrame(relayout); }).observe(document.body);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  window.addEventListener('load', relayout);
  stageMQ.addEventListener && stageMQ.addEventListener('change', relayout);
  measure();
  if (location.hash) {
    const y = targetY(decodeURIComponent(location.hash.slice(1)));
    if (y != null) { window.scrollTo({ top: y, behavior: 'instant' }); }
  }
  S = T = scrollY;
  render(S);

  /* ---------------------------------------------------------------- In-page links go through targetY, so stage projects land right */
  function go(id) {
    const y = targetY(id);
    if (y == null) return false;
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', id === 'top' ? location.pathname : `#${id}`);
    return true;
  }

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
    overIndex = true;
    hud.dataset.tone = 'dark';
    $('a', index).focus({ preventScroll: true });
  }
  function closeIndex(restore = true) {
    index.classList.remove('open');
    index.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('index-open');
    overIndex = false;
    hud.dataset.tone = tone;
    if (restore && lastFocus) lastFocus.focus({ preventScroll: true });
  }
  pill.addEventListener('click', () => (index.hidden ? openIndex() : closeIndex()));
  index.addEventListener('click', (e) => { if (e.target === index) closeIndex(); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!index.hidden) closeIndex(false);
    if (go(id)) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (index.hidden) return;
    if (e.key === 'Escape') closeIndex();
    if (e.key === 'Tab') {
      const f = [pill, ...$$('a', index)];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------------------------------------------------------- 400+ counts up when it arrives */
  const count = $('.count');
  if (count && !reduce && 'IntersectionObserver' in window) {
    count.style.minWidth = `${count.offsetWidth}px`;
    count.textContent = '0';
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1500;
      const step = (now) => {
        const k = clamp((now - t0) / dur);
        count.textContent = String(Math.round(400 * (1 - Math.pow(2, -10 * k))));
        if (k < 1) requestAnimationFrame(step); else count.textContent = '400';
      };
      requestAnimationFrame(step);
    }, { threshold: .5 });
    io.observe(count);
  }

  /* ---------------------------------------------------------------- Orange cursor dot */
  const dot = $('.cursor');
  if (matchMedia('(pointer: fine)').matches && !reduce) {
    let x = -100, y = -100, cx = -100, cy = -100, on = false;
    window.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; cx = x; cy = y; dot.classList.add('live'); dloop(); }
      dot.classList.toggle('big', !!e.target.closest('a, button'));
    }, { passive: true });
    document.addEventListener('pointerleave', () => { dot.classList.remove('live'); on = false; });
    function dloop() {
      cx += (x - cx) * .2; cy += (y - cy) * .2;
      dot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      if (on) requestAnimationFrame(dloop);
    }
  }

  /* ---------------------------------------------------------------- Respect reduced motion inside the SVG objects */
  if (reduce) $$('svg').forEach((s) => s.pauseAnimations && s.pauseAnimations());
})();
