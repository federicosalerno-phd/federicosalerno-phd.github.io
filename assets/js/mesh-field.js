/* ---------------------------------------------------------------------------
   Mesh field
   A triangulated sheet lying over the page background, invisible at rest.

   The whole effect is one scalar field: z, the height of each node above the
   page. The pointer pushes z up under itself, every node is coupled to its four
   neighbours, so the bulge does not stay where it was made but travels outwards
   as a wave, and a weak pull back to the plane keeps the sheet from ringing for
   ever. Everything you see is read off that single field:

     - height        -> a weak perspective, so a lifted node grows towards you
     - slope         -> nodes slide down the flank, the sheet stretches where it
                        bends and stays put where it is flat
     - height, again -> how bright and how thick an edge is drawn, so the page
                        stays black except for the patch being touched

   Fixed timestep, so the motion is identical at 60, 120 and 144 Hz, and the
   pointer is sampled through the path it really took, coalesced events and all,
   rather than the straight line between two frames.

   One canvas appended to <body> at z-index -1, no dependency and no build step.
   Off for reduced motion, off for coarse pointers, off on a <body> that carries
   data-mesh-field="off", and the loop stops outright once the sheet is flat.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !window.requestAnimationFrame) return;
  if (body.getAttribute('data-mesh-field') === 'off') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  /* ---- the parameters ----------------------------------------------------
     The three that set the character of the sheet are TENSION, STIFF and DAMP.
     TENSION is how fast a ripple travels, STIFF how hard the sheet is pulled
     flat (and so how quickly the bulge under a still cursor settles), DAMP how
     long it rings on the way. They are quoted per simulation step, not per
     frame, so they mean the same thing on any display. */
  var SPACING  = 52;     /* node pitch, css px */
  var JITTER   = 0.26;   /* per node offset as a share of SPACING: a tessellated
                            surface rather than graph paper, fixed for a node */
  var RADIUS   = 178;    /* reach of the pointer, css px */
  var PEAK     = 34;     /* height of the sheet right under the pointer, css px */
  var GRIP     = 0.075;  /* how quickly it is drawn to that height. A held height,
                            not a constant push: a push would keep pouring energy
                            into the sheet and the ripples would never stop
                            spreading, this settles and then only the pointer
                            moving away makes a new wave */
  var TENSION  = 0.038;  /* coupling to the four neighbours: the wave speed */
  var STIFF    = 0.030;  /* pull back to the plane */
  var DAMP     = 0.930;  /* velocity kept per step */
  var Z0       = 30;     /* reference height: the scale everything is read against */
  var DEPTH    = 760;    /* camera distance for the perspective, css px */
  var SLIDE    = 0.60;   /* how far a node slides down its own slope */
  var STRETCH  = 0.55;   /* how much the bulge elongates along the movement */
  var FADE_IN  = 0.055;  /* the field arrives and leaves on a ramp, never a cut */
  var FADE_OUT = 0.030;

  var LEVELS   = 8;      /* quantised steps of brightness: one draw call each,
                            so a frame costs eight strokes, not one per edge */
  var EDGE_MIN = 0.075;   /* below this an edge is not drawn at all */
  var NODE_MIN = 0.34;
  var FACE_A   = 0.030;  /* the faintest wash inside the most tilted triangles:
                            enough to read as a surface, not as a fill */
  var VEIL     = 0.42;   /* how much of the sheet survives inside the reading
                            column. The page is one narrow column of text on a
                            wide dark field: at full strength the lattice runs
                            behind the words and makes them work for their
                            legibility, so it is held down where the column is
                            and left whole in the margins, where there is nothing
                            to read and the effect has room */
  var LINE_MIN = 0.7, LINE_MAX = 1.35;
  var ALPHA_MIN = 0.09, ALPHA_MAX = 0.66;

  var STEP = 1000 / 120; /* fixed timestep, ms */
  var MAX_STEPS = 5;

  var TAU = Math.PI * 2;

  /* ---- canvas ------------------------------------------------------------
     z-index -1 paints the canvas above the page background and below every
     block in the flow, but only while the background travels up to the root
     element. If the page paints its own body background it would sit on top of
     the canvas, so move that colour to <html> once, here. */
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

  /* ---- ink ---------------------------------------------------------------
     No hue of its own: the sheet is lit in the greys the page already uses,
     from the accent held well down for the far edges up to the text colour at
     the crest. Read from the custom properties, so a change of palette carries
     over without touching this file. */
  var root = getComputedStyle(document.documentElement);
  var measure = parseFloat(root.getPropertyValue('--measure')) || 720;
  var lowRGB = mix(parse(root.getPropertyValue('--accent'), [196, 196, 196]), [17, 17, 17], 0.52);
  var highRGB = parse(root.getPropertyValue('--text'), [237, 237, 237]);

  function parse(v, fallback) {
    var m = /#([0-9a-f]{6})/i.exec((v || '').trim());
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function css(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  var shade = new Array(LEVELS), alpha = new Array(LEVELS), width = new Array(LEVELS);
  for (var l = 0; l < LEVELS; l++) {
    var f = (l + 0.5) / LEVELS;
    shade[l] = css(mix(lowRGB, highRGB, Math.pow(f, 0.75)));
    alpha[l] = ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * Math.pow(f, 1.45);
    width[l] = LINE_MIN + (LINE_MAX - LINE_MIN) * f;
  }
  var highCSS = css(highRGB);

  /* ---- the sheet ---------------------------------------------------------- */
  var w = 0, h = 0, cx = 0, cy = 0, dpr = 1, cols = 0, rows = 0, count = 0;
  var rx, ry;            /* rest position on the page */
  var z, zr, vz;         /* height, its read-only copy for the step, velocity */
  var sx, sy, tn;        /* projected position and normalised height, per frame */
  var veil;              /* per column, so it costs nothing at draw time */

  function hash(a, b) {
    var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function build() {
    w = window.innerWidth;
    h = window.innerHeight;
    cx = w * 0.5; cy = h * 0.5;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* the outermost ring of nodes sits off screen and is pinned at zero, so a
       ripple reaching the edge is absorbed instead of bouncing back in */
    cols = Math.ceil(w / SPACING) + 3;
    rows = Math.ceil(h / SPACING) + 3;
    count = cols * rows;

    rx = new Float32Array(count); ry = new Float32Array(count);
    z = new Float32Array(count); zr = new Float32Array(count); vz = new Float32Array(count);
    sx = new Float32Array(count); sy = new Float32Array(count); tn = new Float32Array(count);

    var j = JITTER * SPACING;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        rx[i] = (c - 1) * SPACING + (hash(c, r) - 0.5) * 2 * j;
        ry[i] = (r - 1) * SPACING + (hash(c + 101, r + 37) - 0.5) * 2 * j;
      }
    }

    /* the reading column, faded out over 110 px so its edge is never a seam */
    veil = new Float32Array(cols);
    var inner = measure * 0.5 - 40, outer = measure * 0.5 + 70;
    for (var q = 0; q < cols; q++) {
      var ax = Math.abs(rx[q] - cx);
      var t = (ax - inner) / (outer - inner);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      veil[q] = VEIL + (1 - VEIL) * t * t * (3 - 2 * t);
    }
  }

  /* ---- pointer -----------------------------------------------------------
     The field walks the path the pointer really took: every move drops its
     coalesced samples into a queue, and each simulation step advances the field
     a fixed distance towards the next one. A fast flick therefore leaves a
     continuous wake that follows the curve, not the chord across it. */
  var trail = [];
  var fx = -9999, fy = -9999;    /* the field */
  var pfx = fx, pfy = fy;        /* where it was one step ago */
  var live = false, presence = 0;
  var raf = 0, last = 0, acc = 0;

  function wake() {
    if (!raf) { last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    /* a synthetic move, and some browsers on a real one, hand back an empty
       list: fall back to the event itself rather than losing the sample */
    var pts = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    if (!pts.length) pts = [e];
    if (!live) {
      /* entering the page must not drag the field across it from wherever it
         was left: the first sample teleports */
      live = true;
      fx = pfx = e.clientX; fy = pfy = e.clientY;
      trail.length = 0;
    }
    for (var k = 0; k < pts.length; k++) trail.push(pts[k].clientX, pts[k].clientY);
    if (trail.length > 64) trail.splice(0, trail.length - 64);
    wake();
  }, { passive: true });

  document.addEventListener('pointerleave', function () { live = false; }, { passive: true });
  window.addEventListener('blur', function () { live = false; });

  /* a click drops a single ring into the sheet: the same wave the pointer
     makes, given all at once, so it leaves as a widening circle */
  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || !count) return;
    var ex = e.clientX, ey = e.clientY, reach = RADIUS * 1.15, reach2 = reach * reach;
    for (var i = 0; i < count; i++) {
      var dx = rx[i] - ex, dy = ry[i] - ey;
      var d2 = dx * dx + dy * dy;
      if (d2 > reach2) continue;
      var t = 1 - Math.sqrt(d2) / reach;
      vz[i] += 5.5 * t * t * (3 - 2 * t);
    }
    wake();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { live = false; } else if (raf) { last = performance.now(); acc = 0; }
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { build(); wake(); }, 150);
  }, { passive: true });

  /* ---- one step of the sheet ---------------------------------------------- */
  function simulate() {
    presence += ((live ? 1 : 0) - presence) * (live ? FADE_IN : FADE_OUT);

    pfx = fx; pfy = fy;
    if (trail.length) {
      var tx = trail[0], ty = trail[1];
      var dx = tx - fx, dy = ty - fy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var reach = Math.max(d * 0.30, 1.6);      /* eases into a sample, never jumps */
      if (d <= reach) { fx = tx; fy = ty; trail.splice(0, 2); }
      else { fx += dx / d * reach; fy += dy / d * reach; }
    }

    /* the bulge elongates along the direction of travel and rounds off again
       when the pointer stops: a wake, not a disc dragged about */
    var mx = fx - pfx, my = fy - pfy;
    var speed = Math.sqrt(mx * mx + my * my);
    var stretch = 1, ux = 1, uy = 0;
    if (speed > 0.05) {
      ux = mx / speed; uy = my / speed;
      stretch = 1 + Math.min(speed / 7, STRETCH);
    }

    var driving = presence > 0.003;
    var box = RADIUS * stretch + SPACING;

    zr.set(z);
    var energy = 0;

    for (var r = 1; r < rows - 1; r++) {
      var base = r * cols;
      for (var c = 1; c < cols - 1; c++) {
        var i = base + c;
        var here = zr[i];
        var f = TENSION * (zr[i - 1] + zr[i + 1] + zr[i - cols] + zr[i + cols] - 4 * here)
              - STIFF * here;

        if (driving) {
          var dx2 = rx[i] - fx, dy2 = ry[i] - fy;
          if (dx2 < box && dx2 > -box && dy2 < box && dy2 > -box) {
            var along = (dx2 * ux + dy2 * uy) / stretch;
            var perp = -dx2 * uy + dy2 * ux;
            var dd = Math.sqrt(along * along + perp * perp);
            if (dd < RADIUS) {
              var t = 1 - dd / RADIUS;
              var zt = PEAK * presence * t * t * (3 - 2 * t);
              f += GRIP * (zt - here);
            }
          }
        }

        var v = (vz[i] + f) * DAMP;
        vz[i] = v;
        var nz = here + v;
        z[i] = nz;
        energy += nz * nz + v * v * 40;
      }
    }
    return energy;
  }

  /* ---- one frame ---------------------------------------------------------- */
  var paths = new Array(LEVELS), dots = new Array(LEVELS), faces = new Array(LEVELS);

  function edge(i, j) {
    var ti = tn[i], tj = tn[j];
    var t = (ti + tj) * 0.5 + Math.abs(z[i] - z[j]) / Z0 * 0.55;   /* the flanks, where
                                                the sheet bends, read brightest */
    if (t < EDGE_MIN) return;
    if (t > 1) t = 1;
    var lv = (t * LEVELS) | 0; if (lv > LEVELS - 1) lv = LEVELS - 1;
    var p = paths[lv];
    p.moveTo(sx[i], sy[i]);
    p.lineTo(sx[j], sy[j]);
  }

  function face(i, j, k) {
    var t = (tn[i] + tn[j] + tn[k]) / 3;
    if (t < 0.40) return;
    var lv = (t * LEVELS) | 0; if (lv > LEVELS - 1) lv = LEVELS - 1;
    var p = faces[lv];
    p.moveTo(sx[i], sy[i]);
    p.lineTo(sx[j], sy[j]);
    p.lineTo(sx[k], sy[k]);
    p.closePath();
  }

  function draw() {
    var i, r, c;

    /* project: height grows a node towards the viewer, slope slides it down the
       flank, and the two together are the whole of the relief */
    for (r = 0; r < rows; r++) {
      var base = r * cols;
      var inR = r > 0 && r < rows - 1;
      for (c = 0; c < cols; c++) {
        i = base + c;
        var zz = z[i];
        var sc = DEPTH / (DEPTH - zz);
        var gx = 0, gy = 0;
        if (c > 0 && c < cols - 1) gx = (z[i + 1] - z[i - 1]) * 0.5;
        if (inR) gy = (z[i + cols] - z[i - cols]) * 0.5;
        sx[i] = cx + (rx[i] - cx) * sc - SLIDE * gx;
        sy[i] = cy + (ry[i] - cy) * sc - SLIDE * gy;
        var m = zz < 0 ? -zz : zz;
        tn[i] = (m > Z0 ? 1 : m / Z0) * veil[c];
      }
    }

    ctx.clearRect(0, 0, w, h);
    for (i = 0; i < LEVELS; i++) {
      paths[i] = new Path2D(); dots[i] = new Path2D(); faces[i] = new Path2D();
    }

    /* the triangulation: each cell gives its right and bottom edge plus one
       diagonal, flipped cell by cell so the sheet reads as tessellated rather
       than as a grid with a slash through it */
    for (r = 0; r < rows; r++) {
      var b = r * cols;
      var down = r + 1 < rows;
      for (c = 0; c < cols; c++) {
        var a = b + c;
        var right = c + 1 < cols;
        if (right) edge(a, a + 1);
        if (down) edge(a, a + cols);
        if (right && down) {
          var d = a + cols, e = a + cols + 1;
          if (((c + r) & 1) === 0) {
            edge(a, e); face(a, a + 1, e); face(a, e, d);
          } else {
            edge(a + 1, d); face(a, a + 1, d); face(a + 1, e, d);
          }
        }
      }
    }

    for (i = 0; i < count; i++) {
      var t = tn[i];
      if (t < NODE_MIN) continue;
      var lv = (t * LEVELS) | 0; if (lv > LEVELS - 1) lv = LEVELS - 1;
      var rad = 0.8 + t * 1.5;
      var dp = dots[lv];
      dp.moveTo(sx[i] + rad, sy[i]);
      dp.arc(sx[i], sy[i], rad, 0, TAU);
    }

    for (i = 0; i < LEVELS; i++) {
      var fa = FACE_A * ((i + 1) / LEVELS);
      if (fa > 0.004) {
        ctx.globalAlpha = fa;
        ctx.fillStyle = shade[i];
        ctx.fill(faces[i]);
      }
      ctx.globalAlpha = alpha[i];
      ctx.strokeStyle = shade[i];
      ctx.lineWidth = width[i];
      ctx.stroke(paths[i]);
    }
    ctx.fillStyle = highCSS;
    for (i = 0; i < LEVELS; i++) {
      ctx.globalAlpha = Math.min(1, alpha[i] * 1.25);
      ctx.fill(dots[i]);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    var elapsed = now - last;
    last = now;
    if (elapsed > 200) elapsed = 200;    /* a tab coming back into view */
    acc += elapsed;

    var steps = 0, energy = 0;
    while (acc >= STEP && steps < MAX_STEPS) { energy = simulate(); acc -= STEP; steps++; }
    if (steps === MAX_STEPS) acc = 0;
    if (!steps) energy = 1;              /* nothing simulated: assume alive */

    draw();

    /* flat sheet, no pointer on the page: stop the loop outright, so an idle
       tab costs nothing at all */
    if (!live && presence < 0.01 && energy < 0.02) {
      ctx.clearRect(0, 0, w, h);
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  build();
})();
