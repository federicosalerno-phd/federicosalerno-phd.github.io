/* ---------------------------------------------------------------------------
   Lattice
   A triangulated sheet lying over the page background, invisible at rest and
   lifted under the pointer.

   One scalar field, the height z of the sheet, and nothing simulated: z is a
   fixed bump, PEAK high and RADIUS wide, evaluated on the GPU for every node
   from a single filtered pointer position, so nothing in it can shake. The
   pointer is smoothed with a time-based exponential, the bump is a closed
   formula of that one point, and when the pointer is still the next frame is
   the same frame: the loop stops and the last one stays on screen. From z the
   vertex shader derives the relief (a weak perspective, a slide down the
   flank) and the light (alpha, width and the grey to TINT to near-white colour
   of every edge and node), all of it continuous. The lattice is built once as
   two vertex buffers, a frame is two draw calls and three uniforms, and an
   idle page costs nothing at all.

   One canvas appended to <body> at z-index -1, no dependency and no build
   step. Off for reduced motion, off for coarse pointers, off on a <body> that
   carries data-mesh-field="off", and off where WebGL is not there.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !window.requestAnimationFrame) return;
  if (body.getAttribute('data-mesh-field') === 'off') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  /* ---- colour ------------------------------------------------------------
     The page has no hue: near-black ground, light grey rows, grey text. The
     tint is a cool, slightly desaturated cyan-blue. On #111 a cool colour reads
     as light rather than as paint, which is what a lit sheet should be; it is
     the hue of screens and of imaging, the subject of the site, without being
     a brand; and it keeps well clear of the warm side, so the neutral rows keep
     their neutrality next to it. Saturation is held down so the crest, which
     goes to near-white, still reads as the brightest thing on the page. */
  var TINT     = '#5fb0d6';
  var TINT_MIX = 0.75;   /* how far the middle of the ramp goes from neutral
                            grey towards TINT: 0 is a grey sheet, 1 is the tint */

  /* ---- the sheet ---------------------------------------------------------- */
  var PITCH   = 50;      /* node pitch, css px: rows sit PITCH*sqrt(3)/2 apart,
                            every other one shifted by half a pitch */
  var JITTER  = 0.22;    /* per node offset as a share of PITCH, fixed for a
                            node: a tessellated surface rather than graph paper */
  var RADIUS  = 200;     /* reach of the pointer, css px */
  var PEAK    = 40;      /* height of the sheet right under the pointer, css px */
  var Z0      = 28;      /* the height read as full brightness: below PEAK on
                            purpose, so the middle of the bump saturates and the
                            patch has a solid core instead of a soft blur */
  var FLANK   = 0.45;    /* extra brightness for an edge that bends, per unit of
                            its rise over Z0: the flanks read brighter than the
                            flat top, which is where the relief is */
  var DEPTH   = 1200;    /* camera distance for the perspective, css px: a lifted
                            node grows away from the viewport centre */
  var SLIDE   = 40;      /* css px a node slides down the flank per unit of slope;
                            at the steepest point, 1.5*PEAK/RADIUS, about 12 px */

  /* ---- the pointer ---------------------------------------------------------
     No springs. The bump sits on a filtered copy of the pointer that closes an
     exponential fraction of the gap every millisecond, so it follows without
     overshoot, never depends on how fast the pointer went, and is still the
     instant the pointer is. */
  var POINTER_TAU = 85;  /* ms, time constant of the pointer filter: the bump
                            covers 63% of a jump in this time, 95% in three */
  var FADE_IN     = 120; /* ms, the bump rising when the pointer arrives */
  var FADE_OUT    = 380; /* ms, the bump sinking when the pointer leaves the
                            page or the window */
  var SNAP        = 0.05;/* css px: closer than this the filtered pointer is set
                            on its target, so the loop is allowed to stop */

  /* ---- the light ---------------------------------------------------------- */
  var LINE_MIN   = 0.75, LINE_MAX = 1.8;  /* edge width, css px, rim to crest */
  var ALPHA_MAX  = 0.85;                  /* alpha of an edge at the crest */
  var EDGE_IN    = 0.03, EDGE_FULL = 0.55;/* brightness at which an edge starts
                            to show and at which its alpha is full: a clean rim
                            that ends, not a trail that fades for ever */
  var MID_AT     = 0.55;                  /* where on the brightness ramp the
                            colour is TINT: grey below it, near-white above */
  var NODE_MIN   = 0.8, NODE_MAX = 2.0;   /* node radius, css px, rim to crest */
  var NODE_ALPHA = 0.95;
  var NODE_IN    = 0.25, NODE_FULL = 0.8; /* nodes show later than edges, so
                            only the lit core of the patch gets its dots */
  var VEIL       = 0.5;                   /* what survives inside the reading
                            column: the sheet is held down where the text is
                            and left whole in the margins */
  var VEIL_RAMP  = 100;                   /* css px over which the veil fades,
                            from 20 px inside the column edge to 80 px outside */
  var FEATHER    = 0.75;                  /* device px of anti-aliasing on each
                            side of an edge or a node */

  /* ---- canvas ------------------------------------------------------------
     z-index -1 paints the canvas above the page background and below every
     block in the flow, but only while the background travels up to the root
     element. If the page paints its own body background it would sit on top of
     the canvas, so move that colour to <html> once, here. */
  var canvas = document.createElement('canvas');
  canvas.className = 'lattice-field';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;display:block;' +
    'pointer-events:none;z-index:-1';

  var attrs = {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, preserveDrawingBuffer: false,
    powerPreference: 'low-power'
  };
  var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  if (!gl) return;

  /* ---- ink ---------------------------------------------------------------
     Three stops read off the page palette: the accent held down for the rim,
     the tint (or, with TINT_MIX at 0, a plain mid grey) for the flank, the text
     colour for the crest, faintly cooled towards the tint so the white and the
     colour belong to the same light. */
  var root = getComputedStyle(document.documentElement);
  var measure = parseFloat(root.getPropertyValue('--measure')) || 720;
  var bgRGB = parse(root.getPropertyValue('--bg'), [17, 17, 17]);
  var textRGB = parse(root.getPropertyValue('--text'), [237, 237, 237]);
  var accentRGB = parse(root.getPropertyValue('--accent'), [196, 196, 196]);
  var tintRGB = parse(TINT, [95, 176, 214]);
  var lowRGB = mix(accentRGB, bgRGB, 0.45);
  var midRGB = mix(mix(lowRGB, textRGB, 0.55), tintRGB, TINT_MIX);
  var highRGB = mix(textRGB, tintRGB, 0.12 * TINT_MIX);

  function parse(v, fallback) {
    var m = /#([0-9a-f]{6})/i.exec((v || '').trim());
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  /* ---- shaders -----------------------------------------------------------
     Every per-node number lives here. The tunables above are baked in as
     constants, the pointer and the envelope arrive as uniforms, and the
     geometry never changes after build(). lift() is the whole of the effect:
     rest position in, projected position and height out. */
  function fl(v) { var s = String(v); return /[.e]/.test(s) ? s : s + '.0'; }
  var defs = [
    ['RADIUS', RADIUS], ['PEAK', PEAK], ['Z0', Z0], ['FLANK', FLANK],
    ['DEPTH', DEPTH], ['SLIDE', SLIDE], ['LINE_MIN', LINE_MIN], ['LINE_MAX', LINE_MAX],
    ['ALPHA_MAX', ALPHA_MAX], ['EDGE_IN', EDGE_IN], ['EDGE_FULL', EDGE_FULL],
    ['MID_AT', MID_AT], ['NODE_MIN', NODE_MIN], ['NODE_MAX', NODE_MAX],
    ['NODE_ALPHA', NODE_ALPHA], ['NODE_IN', NODE_IN], ['NODE_FULL', NODE_FULL],
    ['VEIL', VEIL]
  ].map(function (d) { return '#define ' + d[0] + ' ' + fl(d[1]); }).join('\n') + '\n';

  var VERT_PRELUDE = defs + [
    'precision highp float;',
    'uniform vec2 u_res;',
    'uniform vec2 u_centre;',
    'uniform vec2 u_ptr;',
    'uniform float u_amp;',
    'uniform vec2 u_column;',
    'uniform mediump float u_feather;',
    'uniform float u_dpr;',
    'uniform vec3 u_low;',
    'uniform vec3 u_mid;',
    'uniform vec3 u_high;',
    /* the bump: a smoothstep of the distance to the pointer, scaled by the
       envelope. Its slope is analytic, so the slide costs nothing extra. */
    'vec3 lift(vec2 p) {',
    '  vec2 d = p - u_ptr;',
    '  float r = length(d);',
    '  float u = clamp(1.0 - r / RADIUS, 0.0, 1.0);',
    '  float z = PEAK * u_amp * u * u * (3.0 - 2.0 * u);',
    '  float g = PEAK * u_amp * 6.0 * u * (1.0 - u) / RADIUS;',
    '  vec2 q = u_centre + (p - u_centre) * (DEPTH / (DEPTH - z)) + d * (SLIDE * g / max(r, 0.5));',
    '  return vec3(q, z);',
    '}',
    'float veil(float x) {',
    '  return mix(VEIL, 1.0, smoothstep(u_column.x, u_column.y, abs(x - u_centre.x)));',
    '}',
    'vec3 ramp(float t) {',
    '  vec3 c = mix(u_low, u_mid, smoothstep(0.0, MID_AT, t));',
    '  return mix(c, u_high, smoothstep(MID_AT, 1.0, t));',
    '}',
    'vec4 clip(vec2 p) {',
    '  return vec4(p / u_res * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);',
    '}'
  ].join('\n') + '\n';

  var FRAG_PRELUDE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform mediump float u_feather;'
  ].join('\n') + '\n';

  /* an edge is a quad, six vertices each carrying both endpoints and which
     corner it is. Width is one number per edge, colour and alpha run along it,
     and an edge that has nothing to show collapses to nothing, so at rest the
     GPU rasterises not a single fragment. */
  var LINE_VS = VERT_PRELUDE + [
    'attribute vec2 a_a;',
    'attribute vec2 a_b;',
    'attribute vec2 a_corner;',
    'varying mediump vec2 v_lc;',
    'varying mediump float v_len;',
    'varying mediump float v_hw;',
    'varying mediump vec4 v_col;',
    'void main() {',
    '  vec3 A = lift(a_a);',
    '  vec3 B = lift(a_b);',
    '  vec2 d = B.xy - A.xy;',
    '  float len = length(d);',
    '  vec2 dir = d / max(len, 0.001);',
    '  vec2 n = vec2(-dir.y, dir.x);',
    '  float e = a_corner.x;',
    '  float s = a_corner.y;',
    '  float tA = min(A.z, Z0) / Z0;',
    '  float tB = min(B.z, Z0) / Z0;',
    '  float bend = abs(A.z - B.z) / Z0 * FLANK;',
    '  float tEdge = clamp((tA + tB) * 0.5 + bend, 0.0, 1.0);',
    '  float tHere = clamp(mix(tA, tB, e) + bend, 0.0, 1.0);',
    '  float hw = mix(LINE_MIN, LINE_MAX, tEdge) * 0.5;',
    '  float ext = (hw + u_feather) * step(EDGE_IN, max(tA, tB) + bend);',
    '  float along = e * 2.0 - 1.0;',
    '  vec2 p = mix(A.xy, B.xy, e) + dir * (along * ext) + n * (s * ext);',
    '  v_lc = vec2(e * len + along * ext, s * ext);',
    '  v_len = len;',
    '  v_hw = hw;',
    '  float alpha = ALPHA_MAX * smoothstep(EDGE_IN, EDGE_FULL, tHere) * veil((a_a.x + a_b.x) * 0.5);',
    '  v_col = vec4(ramp(tHere), alpha);',
    '  gl_Position = clip(p);',
    '}'
  ].join('\n');

  /* round caps: the distance is taken to the segment, not to the line */
  var LINE_FS = FRAG_PRELUDE + [
    'varying mediump vec2 v_lc;',
    'varying mediump float v_len;',
    'varying mediump float v_hw;',
    'varying mediump vec4 v_col;',
    'void main() {',
    '  float over = max(max(-v_lc.x, v_lc.x - v_len), 0.0);',
    '  float dist = length(vec2(over, v_lc.y));',
    '  float cov = 1.0 - smoothstep(v_hw - u_feather, v_hw + u_feather, dist);',
    '  float a = v_col.a * cov;',
    '  gl_FragColor = vec4(v_col.rgb * a, a);',
    '}'
  ].join('\n');

  var POINT_VS = VERT_PRELUDE + [
    'attribute vec2 a_p;',
    'varying mediump vec4 v_col;',
    'varying mediump float v_r;',
    'void main() {',
    '  vec3 P = lift(a_p);',
    '  float t = min(P.z, Z0) / Z0;',
    '  float r = mix(NODE_MIN, NODE_MAX, t);',
    '  float alpha = NODE_ALPHA * smoothstep(NODE_IN, NODE_FULL, t) * veil(a_p.x);',
    '  v_col = vec4(mix(ramp(t), u_high, 0.35), alpha);',
    '  v_r = r;',
    '  gl_PointSize = (r + u_feather) * 2.0 * u_dpr * step(NODE_IN, t);',
    '  gl_Position = clip(P.xy);',
    '}'
  ].join('\n');

  var POINT_FS = FRAG_PRELUDE + [
    'varying mediump vec4 v_col;',
    'varying mediump float v_r;',
    'void main() {',
    '  float dist = length(gl_PointCoord - 0.5) * 2.0 * (v_r + u_feather);',
    '  float cov = 1.0 - smoothstep(v_r - u_feather, v_r + u_feather, dist);',
    '  float a = v_col.a * cov;',
    '  gl_FragColor = vec4(v_col.rgb * a, a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }
  function program(vs, fs, attribs) {
    var v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    for (var i = 0; i < attribs.length; i++) gl.bindAttribLocation(p, i, attribs[i]);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
    return p;
  }
  var UNIFORMS = ['u_res', 'u_centre', 'u_ptr', 'u_amp', 'u_column', 'u_feather',
                  'u_dpr', 'u_low', 'u_mid', 'u_high'];
  function uniforms(p) {
    var u = {};
    for (var i = 0; i < UNIFORMS.length; i++) u[UNIFORMS[i]] = gl.getUniformLocation(p, UNIFORMS[i]);
    return u;
  }

  var lineProg, pointProg, lineU, pointU, lineBuf, pointBuf;

  function setup() {
    lineProg = program(LINE_VS, LINE_FS, ['a_a', 'a_b', 'a_corner']);
    pointProg = program(POINT_VS, POINT_FS, ['a_p']);
    if (!lineProg || !pointProg) return false;
    lineU = uniforms(lineProg);
    pointU = uniforms(pointProg);
    lineBuf = gl.createBuffer();
    pointBuf = gl.createBuffer();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   /* premultiplied over */
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  if (!setup()) return;

  var pageBg = getComputedStyle(body).backgroundColor;
  if (pageBg && pageBg !== 'transparent' && !/,\s*0\)$/.test(pageBg)) {
    document.documentElement.style.backgroundColor = pageBg;
    body.style.backgroundColor = 'transparent';
  }
  body.insertBefore(canvas, body.firstChild);

  /* ---- the sheet ---------------------------------------------------------- */
  var w = 0, h = 0, dpr = 1, lineVerts = 0, nodeCount = 0;
  var CORNERS = [0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1];   /* (end, side) x 6 */

  function hash(a, b) {
    var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function build() {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    /* a triangular lattice: every other row shifted by half a pitch, so each
       node has one neighbour to the right and two below, and the triangles
       come out of the layout itself, no diagonal to flip. One ring of nodes
       past each edge, so the sheet never runs out under a pointer in a corner. */
    var rowH = PITCH * Math.sqrt(3) * 0.5;
    var cols = Math.ceil(w / PITCH) + 3;
    var rows = Math.ceil(h / rowH) + 3;
    nodeCount = cols * rows;
    var nodes = new Float32Array(nodeCount * 2);
    var j = JITTER * PITCH;
    var r, c, i;
    for (r = 0; r < rows; r++) {
      var shift = (r & 1) ? PITCH * 0.5 : 0;
      for (c = 0; c < cols; c++) {
        i = (r * cols + c) * 2;
        nodes[i] = (c - 1) * PITCH + shift + (hash(c, r) - 0.5) * 2 * j;
        nodes[i + 1] = (r - 1) * rowH + (hash(c + 101, r + 37) - 0.5) * 2 * j;
      }
    }

    var data = new Float32Array(nodeCount * 3 * 36);   /* at most three edges a node */
    var o = 0;
    function edge(a, b) {
      var ax = nodes[a * 2], ay = nodes[a * 2 + 1], bx = nodes[b * 2], by = nodes[b * 2 + 1];
      for (var q = 0; q < 12; q += 2) {
        data[o++] = ax; data[o++] = ay;
        data[o++] = bx; data[o++] = by;
        data[o++] = CORNERS[q]; data[o++] = CORNERS[q + 1];
      }
    }
    for (r = 0; r < rows; r++) {
      var down = r + 1 < rows, odd = r & 1;
      for (c = 0; c < cols; c++) {
        var a = r * cols + c;
        if (c + 1 < cols) edge(a, a + 1);
        if (!down) continue;
        var b = a + cols;
        edge(a, b);
        if (odd) { if (c + 1 < cols) edge(a, b + 1); }
        else { if (c > 0) edge(a, b - 1); }
      }
    }
    lineVerts = o / 6;

    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.STATIC_DRAW);

    /* everything that does not move: set once per build, for both programs */
    var half = measure * 0.5;
    var progs = [lineProg, pointProg], us = [lineU, pointU];
    for (i = 0; i < 2; i++) {
      var u = us[i];
      gl.useProgram(progs[i]);
      gl.uniform2f(u.u_res, w, h);
      gl.uniform2f(u.u_centre, w * 0.5, h * 0.5);
      gl.uniform2f(u.u_column, half - VEIL_RAMP * 0.2, half + VEIL_RAMP * 0.8);
      gl.uniform1f(u.u_feather, FEATHER / dpr);
      gl.uniform1f(u.u_dpr, dpr);
      gl.uniform3f(u.u_low, lowRGB[0] / 255, lowRGB[1] / 255, lowRGB[2] / 255);
      gl.uniform3f(u.u_mid, midRGB[0] / 255, midRGB[1] / 255, midRGB[2] / 255);
      gl.uniform3f(u.u_high, highRGB[0] / 255, highRGB[1] / 255, highRGB[2] / 255);
    }
  }

  /* ---- the frame ---------------------------------------------------------- */
  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (amp === 0) return;

    gl.useProgram(lineProg);
    gl.uniform2f(lineU.u_ptr, px, py);
    gl.uniform1f(lineU.u_amp, amp);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);
    gl.drawArrays(gl.TRIANGLES, 0, lineVerts);

    gl.useProgram(pointProg);
    gl.uniform2f(pointU.u_ptr, px, py);
    gl.uniform1f(pointU.u_amp, amp);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.POINTS, 0, nodeCount);
  }

  /* ---- pointer -----------------------------------------------------------
     tx,ty is where the pointer is, px,py where the bump is, amp whether the
     sheet is up at all. The loop runs only while one of the three is still
     on its way; the moment all are where they should be it stops, and the
     frame on screen is, by construction, the frame that would come next. */
  var tx = 0, ty = 0, px = 0, py = 0, amp = 0;
  var live = false, dead = false, raf = 0, last = 0;

  function wake() {
    if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function leave() {
    if (live) { live = false; wake(); }
  }

  function frame(now) {
    raf = 0;
    var dt = now - last;
    last = now;
    if (dt < 1) dt = 1; else if (dt > 50) dt = 50;

    var dx = tx - px, dy = ty - py;
    if (dx * dx + dy * dy <= SNAP * SNAP) { px = tx; py = ty; }
    else {
      var k = 1 - Math.exp(-dt / POINTER_TAU);
      px += dx * k; py += dy * k;
    }

    var goal = live ? 1 : 0;
    var da = goal - amp;
    if (da < 0.01 && da > -0.01) amp = goal;   /* below the first visible edge either way */
    else amp += da * (1 - Math.exp(-dt / (live ? FADE_IN : FADE_OUT)));

    draw();

    if (px === tx && py === ty && amp === goal) return;   /* still: stop, keep the frame */
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    tx = e.clientX; ty = e.clientY;
    if (!live) {
      live = true;
      /* arriving on a flat sheet the bump appears in place; arriving while
         the last one is still sinking it travels there instead of jumping,
         unless it is farther than its own reach: a bump crossing the page in
         a quarter of a second is a streak, so that one is cut where it is
         and a new one rises under the pointer */
      var ex = tx - px, ey = ty - py;
      if (amp < 0.02 || ex * ex + ey * ey > RADIUS * RADIUS) { px = tx; py = ty; amp = 0; }
    }
    wake();
  }, { passive: true });

  document.addEventListener('pointerout', function (e) {
    if (!e.relatedTarget) leave();   /* out of the window, not just out of an element */
  }, { passive: true });
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) leave();
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (!dead) { build(); wake(); } }, 150);
  }, { passive: true });

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    dead = true;
    canvas.style.visibility = 'hidden';   /* whatever was on screen must not stay */
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  canvas.addEventListener('webglcontextrestored', function () {
    if (setup()) { dead = false; canvas.style.visibility = ''; build(); wake(); }
  });

  build();
})();
