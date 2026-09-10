/* ---------------------------------------------------------------------------
   Mesh field
   A triangulated lattice laid over the page background, invisible at rest.
   The pointer works as a probe: nodes inside its radius are pushed outwards
   with a smooth falloff, every edge lights up in proportion to how far its two
   ends have travelled, and once the pointer moves on the nodes spring back with
   a damped relaxation. So the page is never covered in ornament: only the patch
   under the cursor exists, and it settles behind it like a compliant material.

   One canvas appended to <body> at z-index -1, no dependency and no build step.
   It stays off for reduced motion, off for touch and coarse pointers, and off
   on any page whose <body> carries data-mesh-field="off".
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !window.requestAnimationFrame) return;
  if (body.getAttribute('data-mesh-field') === 'off') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  /* ---- the parameters of the field ---------------------------------------
     Everything the effect feels like is in these numbers. RADIUS and PUSH set
     how wide and how deep the dent is, SPRING and DAMP how it comes back: DAMP
     below ~0.93 settles without a visible bounce, above it the lattice rings
     for a moment after the pointer has left. */
  var SPACING = 54;     /* nominal node pitch, css px */
  var JITTER  = 0.30;   /* per node offset as a fraction of SPACING: an unstructured
                           mesh rather than graph paper, fixed for a given node */
  var RADIUS  = 190;    /* reach of the pointer field, css px */
  var PUSH    = 30;     /* peak displacement at the centre of the field, css px */
  var SWIRL   = 0.28;   /* tangential share of the push: a slight curl, not a vortex */
  var SPRING  = 0.055;  /* pull back towards rest */
  var DAMP    = 0.90;   /* velocity kept per frame */
  var LAG     = 0.20;   /* the field trails the pointer by a little */
  var LEVELS  = 6;      /* quantised opacity steps, one stroke pass each, so a frame
                           costs six draw calls instead of one per edge */
  var EDGE_A  = 0.60;   /* opacity of an edge at full stretch */
  var NODE_A  = 0.85;
  var EDGE_MIN = 0.035; /* below this an edge is not drawn at all */
  var NODE_MIN = 0.22;

  var TAU = Math.PI * 2;
  var R2 = RADIUS * RADIUS;

  /* ---- canvas ------------------------------------------------------------
     z-index -1 paints the canvas above the page background and below every
     block in the flow, but that only holds while the background travels up to
     the root element. If the page paints its own body background it would sit
     on top of the canvas, so move that colour to <html> once, here. */
  var canvas = document.createElement('canvas');
  canvas.className = 'mesh-field';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;display:block;' +
    'pointer-events:none;z-index:-1';

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var pageBg = getComputedStyle(body).backgroundColor;
  if (pageBg && pageBg !== 'transparent' && !/,\s*0\)$/.test(pageBg)) {
    document.documentElement.style.backgroundColor = pageBg;
    body.style.backgroundColor = 'transparent';
  }
  body.insertBefore(canvas, body.firstChild);

  /* the ink of the lattice is the accent of the page, so the effect follows the
     palette instead of carrying one of its own */
  var ink = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim() || '#c4c4c4';

  /* ---- the lattice -------------------------------------------------------- */
  var w = 0, h = 0, dpr = 1, cols = 0, rows = 0, count = 0;
  var rx, ry, ox, oy, vx, vy, ten;

  function hash(a, b) {
    var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function build() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* one ring of nodes past each edge, so the mesh never runs out under a
       pointer sitting in a corner */
    cols = Math.ceil(w / SPACING) + 3;
    rows = Math.ceil(h / SPACING) + 3;
    count = cols * rows;

    rx = new Float32Array(count); ry = new Float32Array(count);
    ox = new Float32Array(count); oy = new Float32Array(count);
    vx = new Float32Array(count); vy = new Float32Array(count);
    ten = new Float32Array(count);

    var j = JITTER * SPACING;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        rx[i] = (c - 1) * SPACING + (hash(c, r) - 0.5) * 2 * j;
        ry[i] = (r - 1) * SPACING + (hash(c + 101, r + 37) - 0.5) * 2 * j;
      }
    }
  }

  /* ---- pointer ------------------------------------------------------------ */
  var px = -9999, py = -9999;   /* the pointer */
  var fx = -9999, fy = -9999;   /* the field, trailing it */
  var live = false;             /* is the pointer over the page */
  var raf = 0, last = 0;

  function wake() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY;
    /* entering the page should not drag the field across it from the last
       position it held, so the first move teleports it */
    if (!live) { live = true; fx = px; fy = py; }
    wake();
  }, { passive: true });

  document.addEventListener('pointerleave', function () { live = false; }, { passive: true });
  window.addEventListener('blur', function () { live = false; });

  /* a click drops a small impulse into the lattice: the dent snaps outwards and
     rings back through the same relaxation the hover already uses */
  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || !count) return;
    var cx = e.clientX, cy = e.clientY;
    var reach = RADIUS * 1.5, reach2 = reach * reach;
    for (var i = 0; i < count; i++) {
      var dx = rx[i] + ox[i] - cx, dy = ry[i] + oy[i] - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 > reach2) continue;
      var d = Math.sqrt(d2) || 0.0001;
      var t = 1 - d / reach;
      var k = 4.2 * t * t / d;
      vx[i] += dx * k; vy[i] += dy * k;
    }
    wake();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { live = false; } else if (raf) { last = performance.now(); }
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { build(); wake(); }, 150);
  }, { passive: true });

  /* ---- the frame ---------------------------------------------------------- */
  var paths = new Array(LEVELS), dots = new Array(LEVELS);
  var edgeAlpha = new Array(LEVELS), nodeAlpha = new Array(LEVELS);
  for (var l = 0; l < LEVELS; l++) {
    var lf = (l + 1) / LEVELS;
    edgeAlpha[l] = EDGE_A * Math.pow(lf, 1.5);
    nodeAlpha[l] = NODE_A * Math.pow(lf, 1.3);
  }

  function edge(i, j) {
    var t = (ten[i] + ten[j]) * 0.5;
    if (t < EDGE_MIN) return;
    var lv = (t * LEVELS) | 0; if (lv > LEVELS - 1) lv = LEVELS - 1;
    var p = paths[lv];
    p.moveTo(rx[i] + ox[i], ry[i] + oy[i]);
    p.lineTo(rx[j] + ox[j], ry[j] + oy[j]);
  }

  function frame(now) {
    var dt = (now - last) / 16.667;
    last = now;
    if (dt > 2.5) dt = 2.5; else if (dt < 0.2) dt = 0.2;

    var lag = LAG * dt; if (lag > 1) lag = 1;
    if (live) { fx += (px - fx) * lag; fy += (py - fy) * lag; }

    var damp = Math.pow(DAMP, dt);
    var spring = SPRING * dt;
    var moving = false;
    var i;

    for (i = 0; i < count; i++) {
      var tgx = 0, tgy = 0;

      if (live) {
        var dx = rx[i] - fx, dy = ry[i] - fy;
        var d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          var d = Math.sqrt(d2) || 0.0001;
          var t = 1 - d / RADIUS;
          var fall = t * t * (3 - 2 * t);      /* smoothstep: no seam at the rim */
          var amp = PUSH * fall / d;
          tgx = dx * amp - dy * amp * SWIRL;
          tgy = dy * amp + dx * amp * SWIRL;
        }
      }

      var nvx = (vx[i] + (tgx - ox[i]) * spring) * damp;
      var nvy = (vy[i] + (tgy - oy[i]) * spring) * damp;
      vx[i] = nvx; vy[i] = nvy;
      var nox = ox[i] + nvx * dt, noy = oy[i] + nvy * dt;
      ox[i] = nox; oy[i] = noy;

      var mag = Math.sqrt(nox * nox + noy * noy);
      ten[i] = mag > PUSH ? 1 : mag / PUSH;
      if (mag > 0.08 || nvx * nvx + nvy * nvy > 0.004) moving = true;
    }

    ctx.clearRect(0, 0, w, h);
    for (i = 0; i < LEVELS; i++) { paths[i] = new Path2D(); dots[i] = new Path2D(); }

    /* the triangulation: for every cell its right and bottom edge plus one
       diagonal, flipped cell by cell so the mesh reads as tessellated rather
       than as a grid with a slash through it */
    for (var r = 0; r < rows; r++) {
      var base = r * cols;
      var down = r + 1 < rows;
      for (var c = 0; c < cols; c++) {
        var a = base + c;
        var right = c + 1 < cols;
        if (right) edge(a, a + 1);
        if (down) edge(a, a + cols);
        if (right && down) {
          if (((c + r) & 1) === 0) edge(a, a + cols + 1);
          else edge(a + 1, a + cols);
        }
      }
    }

    for (i = 0; i < count; i++) {
      var tn = ten[i];
      if (tn < NODE_MIN) continue;
      var lv = (tn * LEVELS) | 0; if (lv > LEVELS - 1) lv = LEVELS - 1;
      var nx = rx[i] + ox[i], ny = ry[i] + oy[i];
      var rad = 1 + tn * 1.3;
      var dp = dots[lv];
      dp.moveTo(nx + rad, ny);
      dp.arc(nx, ny, rad, 0, TAU);
    }

    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    for (i = 0; i < LEVELS; i++) {
      ctx.globalAlpha = edgeAlpha[i];
      ctx.stroke(paths[i]);
    }
    ctx.fillStyle = ink;
    for (i = 0; i < LEVELS; i++) {
      ctx.globalAlpha = nodeAlpha[i];
      ctx.fill(dots[i]);
    }
    ctx.globalAlpha = 1;

    /* nothing left to animate and no pointer on the page: stop the loop
       outright, so an idle tab costs nothing */
    if (!live && !moving) {
      ctx.clearRect(0, 0, w, h);
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  build();
})();
