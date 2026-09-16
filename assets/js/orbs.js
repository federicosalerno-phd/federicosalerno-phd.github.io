/* ---------------------------------------------------------------------------
   Orbs
   The mark in the margin of each row of the home is a disc twelve pixels
   across with a fluid inside it: water, a plasma, an ember, an aurora, a
   spark. This file is the fluid. Everything that moves in the disc is a
   fragment shader, drawn into a small <canvas> that is placed inside the .orb
   element of every row and composited with it -- scaled by the hover growth,
   carried across the screen by a page transition -- the way any layer is.

   WHY A SHADER AND NOT CSS. The previous marks were flat shapes on CSS
   keyframes: a level rising and falling, a disc opening, a quarter turning,
   two bands crossing, a filament passing. They were honest about the cost
   (transform and opacity, nothing else) and they were what a shape can be at
   twelve pixels, which is a shape. Federico's word for them was "formine", and
   the complaint under it is fair: a liquid is not a thing that goes up and
   comes back, it is a field that never repeats. A field that never repeats is
   noise, and the cheapest place to evaluate noise at ninety-six pixels square,
   sixty times a second, five times over, is the GPU -- where it is also the
   only place it costs the page nothing, because a WebGL canvas is its own
   compositor layer and the frame it shows is uploaded, never painted.

   WHAT IS IN THE SHADER. One fragment program for all five, chosen by u_kind:
   a value noise on a hashed lattice, four octaves of it (fbm), and a domain
   warp -- the coordinates fed to the noise are themselves displaced by another
   noise, which is what turns bands into folds and blobs into currents. Water
   is that field with bright ridges lifted out of it (the caustic net: where the
   noise crosses its own middle, raised to a power so the net is thin). Plasma
   is a sum of sines whose phases are bent by the noise, with a heart that
   pulses on a three-second sine. Ember is the same field scrolling upwards,
   mapped through a heat ramp -- dark tint, tint, amber, near-white -- with a
   flicker that is itself a noise in time, so it breathes and never stutters,
   and sparks that are the rare high points of a finer noise. Aurora is two
   ridged fields in two hues flowing opposite ways under two slow warps, their
   crests lit white. Spark is ridged noise raised to a high power -- the thin
   bright branches -- over a diffuse glow of the same field, moving and breaking
   continuously, brightened by two eased pulses of unequal period so the beat
   never settles.

   WHAT MUST NOT HAPPEN, in order. (1) Nothing strobes: every time term is a
   coefficient between a fifth and eight tenths of a second per unit, the
   ember's flicker and the spark's pulses are smoothsteps of sines with rises
   of a fifth of a second or longer, and no value anywhere is a step of time.
   (2) Nothing pauses: at every instant something in every disc is on the
   move, because the fields scroll and the warps drift and none of that ever
   arrives anywhere. (3) Nothing seams: the noise lattice is hashed modulo 256,
   so a coordinate that has grown for an hour hashes exactly as it did at the
   start and there is no period to close, no loop to restart. The clock is
   not wrapped, for the same reason: a wrap is a jump.

   THE ARRANGEMENT WITH THE PAGE. The canvases are children of the .orb
   elements, class orb-cv, one WebGL context each, created with
   preserveDrawingBuffer:true so that assets/js/hatch.js can copy their pixels
   with drawImage at any moment -- the page transition clones the row it is
   leaving from, or the row it is coming home to, and a cloned <canvas> is
   blank. When the html element carries hatch-busy the loop stops where it is
   and the last frame stays on screen (that is what preserveDrawingBuffer
   buys, and it is also the one thing on these pages that must not tick per
   frame on the main thread while a clip-path is animating there, see
   mesh-field.js); it starts again on the hatch:end event. The FIRST frame is
   not part of that bargain: it is drawn at boot whatever the page is doing,
   because on the way home hatch.js builds its halves out of this document's
   row and copies whatever is on the row's canvases, and a row with nothing on
   them yet is a copy with nothing in it. The moment that frame is on the
   canvases the window event orbs:first says so, and hatch.js listens for it
   when it got to the row first. The loop also stops when the tab is hidden and
   when the list has scrolled out of view, and under prefers-reduced-motion it
   draws one frame at a fixed time and stops for good: a still disc with a
   texture in it, not a flat one. When the canvases run, html gets the class
   orbs-gl, and the stylesheet of the page uses it to hide the CSS layers and
   the flat fill of the fallback. Where WebGL is missing this file leaves
   before touching the DOM, and the marks are the flat shapes they were.
   Nothing here reads anything of hatch's but a class name and an event, the
   same two things mesh-field.js reads, and it says one thing back.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (!window.requestAnimationFrame) return;

  /* ---- tunables ------------------------------------------------------------ */
  var KINDS  = { water: 0, breath: 1, ember: 2, aurora: 3, spark: 4 };
  /* the second hue of each disc, as a rotation of the row's own colour. Aurora
     is the one that asks for it by name (two veils, thirty degrees apart);
     for the others it is a second tone of the same colour -- the depth of the
     water, the far end of the plasma bands, the warm side of the ember, the
     cold side of a bolt -- and a rotation keeps it in the family, where a mix
     with black or white would merely be the same colour darker */
  var HUE2   = { water: -12, breath: 35, ember: 18, aurora: 30, spark: -25 };
  var OVER   = 4;      /* backing pixels per css pixel. The disc is drawn four
                          times larger than it is shown and the compositor
                          scales it down: at this size the rim is the whole
                          drawing, and a rim antialiased in a 48 px buffer and
                          minified is smoother than anything drawn at 12 */
  var MAX_PX = 96;     /* the buffer never grows past this, whatever the dpr:
                          96 is 12 px at OVER 4 on a 2x screen, and past it a
                          3x phone is spending fragments on pixels it cannot show */
  var SPEED  = 1.0;    /* one knob over every clock in the shader. 1 is the
                          pace the coefficients were tuned at; 0.7 is calmer,
                          1.4 is agitated, and the pulses of the spark and the
                          heart of the plasma scale with it */
  var STILL  = 11.0;   /* the second the still frame is taken at under reduced
                          motion: an instant chosen by eye, where all five
                          discs have something in them */
  var MAX_DT = 50;     /* ms: a frame that arrives late (a tab coming back, a
                          stall) advances the clock by this and no more, so
                          the fluid never leaps to catch up */
  var AA     = 1.0;    /* css px of anti-aliasing across the rim of the disc */

  var docEl = document.documentElement;
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function still() { return !!(calm && calm.matches); }
  function busy() { return docEl.classList.contains('hatch-busy'); }

  /* preserveDrawingBuffer is not optional: hatch.js reads these pixels with
     drawImage whenever it needs them, and a buffer that is cleared after
     compositing reads back as nothing. antialias off because the rim is
     antialiased by the shader itself and the rest of the picture is a field
     with no edges in it; premultiplied because that is what the shader
     writes, and what the compositor expects when it lays the disc over the
     band. Low power: five of these must not wake a discrete GPU */
  var ATTRS = {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  };

  /* ---- shaders -----------------------------------------------------------
     One triangle that covers the clip volume, so the vertex stage is nothing
     and the whole picture is the fragment program. Every effect takes the
     point p in the disc (-1..1, y up, so that "rising" means what it says on
     the screen) and the time, and returns a colour; main picks the effect by
     u_kind, clamps, cuts the disc out with a one-pixel smoothstep on the
     radius and writes it premultiplied. Outside the disc the canvas is
     transparent, which is what lets the .orb under it be transparent too. */
  var VS = [
    'attribute vec2 a_p;',
    'void main() { gl_Position = vec4(a_p, 0.0, 1.0); }'
  ].join('\n');

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform float u_time;',
    'uniform vec2  u_res;',
    'uniform float u_aa;',
    'uniform vec3  u_color;',
    'uniform vec3  u_color2;',
    'uniform float u_kind;',
    /* the hash is taken on the lattice point modulo 256: the noise is then
       periodic in 256 units, which nobody will ever see -- a disc is about
       five units across -- and the numbers going into the hash never grow,
       however long the page has been open. Without that, a coordinate that
       has been scrolling for an hour is a large number with a small
       fractional part, and a hash of a large number is where the sparkle
       comes from on every GPU that ever showed one */
    'float hash(vec2 p) {',
    '  p = mod(p, 256.0);',
    '  vec3 q = fract(vec3(p.xyx) * 0.1031);',
    '  q += dot(q, q.yzx + 33.33);',
    '  return fract((q.x + q.y) * q.z);',
    '}',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    /* four octaves, each rotated so the lattice of one never lines up with
       the lattice of the next; the sum is normalised back to 0..1 */
    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);',
    '  for (int i = 0; i < 4; i++) {',
    '    v += a * noise(p);',
    '    p = r * p * 2.03 + vec2(17.1, 9.3);',
    '    a *= 0.5;',
    '  }',
    '  return v * 1.0667;',
    '}',
    /* 1 where the field crosses its own middle, 0 at its extremes: the
       crest line of a wave, the spine of a bolt, the fold of a veil */
    'float ridge(float n) { return 1.0 - abs(n * 2.0 - 1.0); }',

    /* water: a warped field for the body, two nets of caustics over it running
       opposite ways -- the second finer and sharper, so the two interlace
       instead of doubling -- and a reflex up and to the left that breathes
       on a nine-tenths sine, the sheen of a surface under a lamp */
    'vec3 fxWater(vec2 p, float t) {',
    '  vec2 q = p * 2.3;',
    '  vec2 w = vec2(fbm(q + vec2(0.0, t * 0.34)),',
    '                fbm(q + vec2(5.2, 1.3) - vec2(t * 0.27, 0.0)));',
    '  float n  = fbm(q + 2.2 * w + vec2(t * 0.22, -t * 0.16));',
    '  float n2 = fbm(q * 1.6 - 1.8 * w.yx + vec2(-t * 0.19, t * 0.31) + vec2(3.1, 7.7));',
    '  float c1 = pow(ridge(n), 6.0);',
    '  float c2 = pow(ridge(n2), 9.0);',
    '  vec3 col = mix(u_color * 0.5, mix(u_color, u_color2, 0.5) * 1.05, n);',
    '  col += vec3(1.0) * (c1 * 0.85 + c2 * 0.55);',
    '  vec2 d = p - vec2(-0.35, 0.4);',
    '  col += vec3(1.0) * exp(-dot(d, d) * 4.5) * (0.22 + 0.16 * sin(t * 0.9));',
    '  return col;',
    '}',

    /* plasma: four sines -- two along the axes, one along a direction that
       turns with time, one radial from a centre that wanders -- with their
       phases bent by the noise so the bands fold. Their sum is folded once
       more into bands that breathe, each band lit at its crest, and the
       heart in the middle pulses at 2pi/3, once every three seconds */
    'vec3 fxPlasma(vec2 p, float t) {',
    '  vec2 q = p * 1.7;',
    '  float wv = fbm(q * 1.4 + vec2(t * 0.28, -t * 0.21));',
    '  float a = sin(q.x * 2.6 + t * 0.7 + wv * 2.4);',
    '  float b = sin(q.y * 2.3 - t * 0.55 + wv * 1.8);',
    '  float ca = cos(t * 0.23);',
    '  float sa = sin(t * 0.23);',
    '  float c = sin((q.x * ca + q.y * sa) * 3.1 + t * 0.42);',
    '  vec2 o = vec2(sin(t * 0.5), cos(t * 0.37)) * 0.55;',
    '  float d = sin(length(q + o) * 4.2 - t * 0.8);',
    '  float v = (a + b + c + d) * 0.25;',
    '  float band = 0.5 + 0.5 * sin(v * 3.14159 + t * 0.45);',
    '  vec3 col = mix(u_color * 0.8, u_color2, band);',
    '  col += vec3(1.0, 0.97, 0.92) * pow(band, 6.0) * 0.4;',
    '  float heart = exp(-dot(p, p) * 3.2) * (0.5 + 0.5 * sin(t * 2.0944));',
    '  col += vec3(1.0) * heart * 0.6;',
    '  return col;',
    '}',

    /* ember: the field scrolls upward, warped so it licks rather than
       slides; the heat is the field plus a core low in the disc, times a
       flicker that is a noise in time (0.88..1.12, features about a second
       long: a coal breathing, never a bulb stuttering); the ramp goes dark
       tint, tint, amber, near-white; the rim is cooled; and the sparks are
       the rare high points of a much finer noise, rising faster than the
       field they sit in, allowed only where the field is already warm */
    'vec3 fxEmber(vec2 p, float t) {',
    '  vec2 q = vec2(p.x * 2.4, p.y * 2.0 - t * 0.55);',
    '  vec2 w = vec2(fbm(q * 1.3 + vec2(t * 0.2, 0.0)),',
    '                fbm(q * 1.3 + vec2(3.7, 0.0) - vec2(0.0, t * 0.17)));',
    '  float n = fbm(q + 1.3 * w);',
    '  float r = length(p);',
    '  vec2 e = p * vec2(1.0, 0.8) - vec2(0.0, -0.15);',
    '  float core = exp(-dot(e, e) * 2.4);',
    '  float fl = 0.88 + 0.24 * noise(vec2(t * 1.4, p.y * 1.5 + 2.0));',
    '  float heat = clamp((n * 1.35 - 0.28 + core * 0.55) * fl, 0.0, 1.0);',
    '  vec3 amber = mix(u_color2, vec3(1.0, 0.72, 0.36), 0.55);',
    '  vec3 col = mix(u_color * 0.32, u_color, smoothstep(0.0, 0.42, heat));',
    '  col = mix(col, amber, smoothstep(0.38, 0.74, heat));',
    '  col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.72, 1.0, heat));',
    '  col *= 1.0 - 0.42 * smoothstep(0.5, 1.0, r);',
    '  float sp = noise(q * 6.5 + w * 3.0 + vec2(0.0, -t * 1.1));',
    '  float sk = smoothstep(0.84, 0.96, sp) * smoothstep(0.25, 0.6, n);',
    '  col += vec3(1.0, 0.88, 0.62) * sk * 0.85;',
    '  return col;',
    '}',

    /* aurora: two veils, the row's hue and the hue thirty degrees on, each a
       ridged field stretched twice as tall as wide (curtains hang) and flowing
       its own way under its own slow warp; a dark mix of the two for the sky
       behind, the veils laid over it additively, and the crests of both lit
       white where the ridge is sharpest */
    'vec3 fxAurora(vec2 p, float t) {',
    '  vec2 q = p * 1.8;',
    '  vec2 w1 = vec2(fbm(q * 0.9 + vec2(t * 0.17, 0.0)),',
    '                 fbm(q * 0.9 + vec2(4.1, 0.0) - vec2(0.0, t * 0.14)));',
    '  vec2 w2 = vec2(fbm(q * 0.9 - vec2(t * 0.15, 0.0) + vec2(8.3, 0.0)),',
    '                 fbm(q * 0.9 + vec2(2.7, 0.0) + vec2(0.0, t * 0.12)));',
    '  float v1 = fbm(q * vec2(1.0, 2.1) + 1.7 * w1 + vec2(t * 0.44, 0.0));',
    '  float v2 = fbm(q * vec2(1.0, 1.9) - 1.7 * w2 - vec2(t * 0.37, 0.0) + vec2(5.0, 0.0));',
    '  float c1 = pow(ridge(v1), 3.0);',
    '  float c2 = pow(ridge(v2), 3.0);',
    '  vec3 col = mix(u_color, u_color2, 0.5) * 0.3;',
    '  col += u_color * c1 * 0.95 + u_color2 * c2 * 0.9;',
    '  col += vec3(1.0) * (pow(c1, 5.0) + pow(c2, 5.0)) * 0.42;',
    '  return col;',
    '}',

    /* spark: two ridged fields, warped hard and moving fast, raised to the
       sixteenth and twentieth power -- that is what makes a ridge a bolt: a
       line a pixel wide that forks where the field forks and breaks where it
       dips -- over a glow that is the same ridges at the third and fourth
       power, so the branches sit in their own haze. Two eased pulses of
       unequal period (0.7 s and 1.1 s) brighten the bolts; each rises over
       about a fifth of a second and never drops below the sum's floor, so
       the disc flares and settles, flares and settles, and never blinks */
    'vec3 fxSpark(vec2 p, float t) {',
    '  vec2 q = p * 2.1;',
    '  vec2 w = vec2(fbm(q * 1.1 + vec2(t * 0.6, 0.0)),',
    '                fbm(q * 1.1 + vec2(7.7, 0.0) - vec2(0.0, t * 0.5)));',
    '  float n  = fbm(q + 2.6 * w + vec2(t * 0.3, -t * 0.2));',
    '  float n2 = fbm(q * 1.9 - 2.1 * w.yx + vec2(-t * 0.45, t * 0.35) + vec2(3.3, 0.0));',
    '  float r1 = ridge(n);',
    '  float r2 = ridge(n2);',
    '  float bolt = pow(r1, 16.0) * 1.1 + pow(r2, 20.0) * 0.8;',
    '  float glow = pow(r1, 3.0) * 0.32 + pow(r2, 4.0) * 0.12;',
    '  float pulse = 0.55 + 0.25 * smoothstep(-0.2, 1.0, sin(t * 8.98)) + 0.2 * smoothstep(-0.3, 1.0, sin(t * 5.71 + 1.0));',
    '  vec3 col = u_color * 0.3 + u_color * glow * 1.3;',
    '  col += mix(u_color2, vec3(1.0), 0.78) * bolt * pulse;',
    '  col += vec3(1.0) * exp(-dot(p, p) * 4.0) * 0.14 * pulse;',
    '  return col;',
    '}',

    'void main() {',
    '  vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / u_res.x;',
    '  float t = u_time;',
    '  vec3 col;',
    '  if (u_kind < 0.5) col = fxWater(p, t);',
    '  else if (u_kind < 1.5) col = fxPlasma(p, t);',
    '  else if (u_kind < 2.5) col = fxEmber(p, t);',
    '  else if (u_kind < 3.5) col = fxAurora(p, t);',
    '  else col = fxSpark(p, t);',
    '  col = clamp(col, 0.0, 1.0);',
    /* the rim: the disc is pulled in by a little over half the feather so
       the outer edge of the smoothstep ends inside the buffer on every side,
       and the .orb clip that sits over it never has an edge of its own to show */
    '  float R = 1.0 - u_aa * 0.55;',
    '  float m = 1.0 - smoothstep(R - u_aa * 0.5, R + u_aa * 0.5, length(p));',
    '  gl_FragColor = vec4(col * m, m);',
    '}'
  ].join('\n');

  /* ---- colour ------------------------------------------------------------
     The colour of each disc is the row's own --orb, read off the element as
     the page resolved it. It arrives as the custom property (a hex) or, if
     that is ever not there, as the resting background of the fallback disc,
     which is the same colour in rgb(). */
  function parseColour(v) {
    v = (v || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(v);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function css(c) {
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  /* the same colour with its hue turned by deg, lightness and saturation kept:
     through HSL, because a rotation is one line there and a matrix on rgb
     drifts in lightness */
  function rotate(c, deg) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, d = max - min, h = 0, s = 0;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    h = (h + deg / 360 + 1) % 1;
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  /* ---- the orbs ------------------------------------------------------------
     The temperament of a disc is the data-orb of the row it belongs to, found
     by walking up. A .orb inside a hatch half -- the clone of a row that a page
     transition is still carrying -- is not ours: it is on its way out, and its
     canvas, if it has one, is filled by hatch.js */
  function kindOf(el) {
    var n = el.parentNode;
    while (n && n.nodeType === 1) {
      if (n.classList && n.classList.contains('hatch-half')) return null;
      if (n.hasAttribute && n.hasAttribute('data-orb')) return n.getAttribute('data-orb');
      n = n.parentNode;
    }
    return null;
  }

  var orbs = [];        /* { el, kind, canvas, gl, prog, u, dead, col, phase } */
  var cssSize = 12;     /* css px of the disc at rest */
  var px = 0;           /* backing px of every canvas */
  var acc = 0;          /* seconds of fluid time so far: it stops when the loop stops */
  var last = 0, raf = 0;
  var inView = true, stillOk = false, refit = false;

  function size() {
    var dpr = window.devicePixelRatio || 1;
    return Math.max(16, Math.min(MAX_PX, Math.round(cssSize * OVER * dpr)));
  }

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }

  /* everything a context needs, done once and again after a context restore:
     program, the one triangle, the uniforms that never change. The program
     stays in use for the life of the context; a frame is one uniform and one
     draw call */
  function setup(o) {
    var gl = o.gl;
    var v = shader(gl, gl.VERTEX_SHADER, VS), f = shader(gl, gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'a_p');
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return false; }
    o.prog = p;
    o.u = {};
    var names = ['u_time', 'u_res', 'u_aa', 'u_color', 'u_color2', 'u_kind'];
    for (var i = 0; i < names.length; i++) o.u[names[i]] = gl.getUniformLocation(p, names[i]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);          /* the shader writes every pixel, premultiplied: nothing to blend with */
    gl.useProgram(p);
    gl.uniform3f(o.u.u_color, o.col[0] / 255, o.col[1] / 255, o.col[2] / 255);
    gl.uniform3f(o.u.u_color2, o.col2[0] / 255, o.col2[1] / 255, o.col2[2] / 255);
    gl.uniform1f(o.u.u_kind, KINDS[o.kind]);
    fit(o);
    return true;
  }

  /* the backing store and what depends on it: the resolution and the width
     of the rim's feather, which is AA css pixels expressed in the -1..1 of
     the disc (two units across cssSize css pixels) */
  function fit(o) {
    o.canvas.width = px;
    o.canvas.height = px;
    o.gl.viewport(0, 0, px, px);
    o.gl.uniform2f(o.u.u_res, px, px);
    o.gl.uniform1f(o.u.u_aa, 2.0 * AA / cssSize);
  }
  /* after a resize: a window dragged onto a screen of another density, or a
     zoom. Setting a canvas's width clears it, so this is only ever done in the
     same breath as a draw -- from the loop, or from the still frame -- and
     never while the loop is stopped, where a blank disc would sit until the
     next wake */
  function applyFit() {
    refit = false;
    cssSize = orbs[0].el.clientWidth || cssSize;
    var want = size();
    if (want === px) return;
    px = want;
    for (var k = 0; k < orbs.length; k++) if (!orbs[k].dead) fit(orbs[k]);
  }

  function draw(o, t) {
    o.gl.uniform1f(o.u.u_time, t + o.phase);
    o.gl.drawArrays(o.gl.TRIANGLES, 0, 3);
  }
  function drawAll(t) {
    for (var i = 0; i < orbs.length; i++) if (!orbs[i].dead) draw(orbs[i], t);
  }
  function anyAlive() {
    for (var i = 0; i < orbs.length; i++) if (!orbs[i].dead) return true;
    return false;
  }

  /* ---- the loop ------------------------------------------------------------
     One requestAnimationFrame for the five. It runs while the tab is visible,
     the list is in view, no page transition is on and motion is not reduced;
     the moment any of those is false it stops where it is, and every event
     that can make them true again calls wake(). The clock is the sum of the
     frames that were actually drawn, capped per frame, so a disc that was
     frozen picks up from the frame it froze on rather than jumping to where
     it would have been: the stop and the start are both invisible. */
  function running() {
    return !document.hidden && inView && !busy() && !still();
  }
  /* reduced motion: one frame, drawn once and kept, redrawn only when the
     buffer has been resized or the preference has just changed */
  function drawStill() {
    if (stillOk) return;
    if (refit) applyFit();
    drawAll(STILL);
    stillOk = true;
  }
  function frame(now) {
    raf = 0;
    if (!running()) {
      last = 0;
      /* the preference can flip while the loop is up: the frame that finds it
         so is the one that leaves the still picture, not the last moving one */
      if (still()) drawStill();
      return;
    }
    if (refit) applyFit();
    if (last) {
      var dt = now - last;
      if (dt > MAX_DT) dt = MAX_DT;
      acc += dt / 1000 * SPEED;
    }
    last = now;
    drawAll(acc);
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf || !anyAlive()) return;
    if (still()) { drawStill(); return; }
    if (!running()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    var i, o, el, gl, canvas, v;
    cssSize = orbs[0].el.clientWidth || cssSize;
    px = size();
    for (i = 0; i < orbs.length; i++) {
      o = orbs[i];
      el = o.el;
      /* the colour, read before anything is hidden: the fallback's background
         is the same --orb resolved, in case the property itself is out of reach */
      v = null;
      try {
        var cs = getComputedStyle(el);
        v = parseColour(cs.getPropertyValue('--orb')) || parseColour(cs.backgroundColor);
      } catch (err) {}
      o.col = v || [128, 128, 128];
      o.col2 = rotate(o.col, HUE2[o.kind]);
      o.phase = i * 41.7;   /* the five never share a clock, so nothing in one echoes another */
      canvas = document.createElement('canvas');
      canvas.className = 'orb-cv';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = px;
      canvas.height = px;
      gl = canvas.getContext('webgl', ATTRS) || canvas.getContext('experimental-webgl', ATTRS);
      if (!gl) {
        /* no WebGL on the first one means no WebGL: leave before the DOM is
           touched and the CSS marks stand. On a later one it means the
           browser has run out of contexts, and that disc keeps its flat
           colour inline, where the orbs-gl rule cannot reach it */
        if (i === 0) { orbs = []; return; }
        o.dead = true;
        el.style.background = css(o.col);
        continue;
      }
      o.canvas = canvas;
      o.gl = gl;
      el.appendChild(canvas);
      if (!setup(o)) {
        el.removeChild(canvas);
        o.canvas = null; o.gl = null;
        if (i === 0) { orbs = []; return; }
        o.dead = true;
        el.style.background = css(o.col);
        continue;
      }
      (function (o) {
        /* a lost context is a blank canvas over a transparent disc, which is
           no disc at all: the flat colour goes back on inline until the
           context comes back, and then the fluid resumes from its clock */
        o.canvas.addEventListener('webglcontextlost', function (e) {
          e.preventDefault();
          o.dead = true;
          o.el.style.background = css(o.col);
        });
        o.canvas.addEventListener('webglcontextrestored', function () {
          if (!setup(o)) return;
          o.dead = false;
          o.el.style.background = '';
          stillOk = false;
          wake();
        });
      })(o);
    }
    if (!anyAlive()) return;

    /* the first frame, before the fallback is switched off: both happen in
       this task, so there is no paint with neither in it, but the order
       costs nothing and reads right */
    if (still()) { drawAll(STILL); stillOk = true; }
    else drawAll(0);
    docEl.classList.add('orbs-gl');
    /* and the word hatch.js may be waiting for: every canvas that is alive has
       a frame on it now. After the class and in the same task, so that the
       fallback going off the copies in the halves and the pixels going on
       them cannot be separated by a paint; whether anyone is listening is
       hatch's business and not this file's */
    try { window.dispatchEvent(new Event('orbs:first')); } catch (err) {}

    /* ---- what stops the loop and what starts it ---------------------------- */
    if (window.IntersectionObserver) {
      var seen = [];
      var io = new IntersectionObserver(function (entries) {
        for (var k = 0; k < entries.length; k++) {
          var idx = seen.indexOf(entries[k].target);
          if (idx >= 0) orbs[idx].seen = entries[k].isIntersecting;
        }
        var any = false;
        for (var j = 0; j < orbs.length; j++) if (orbs[j].seen) any = true;
        inView = any;
        wake();
      }, { rootMargin: '32px' });
      for (i = 0; i < orbs.length; i++) {
        orbs[i].seen = true;
        seen.push(orbs[i].el);
        io.observe(orbs[i].el);
      }
    }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    /* the other half of the pact with hatch.js: busy() is read at the top of
       every frame, so the loop stops itself within a frame of the class going
       up; this is what brings it back when the class comes off */
    window.addEventListener('hatch:end', wake);
    if (calm) {
      var onCalm = function () { stillOk = false; wake(); };
      if (calm.addEventListener) calm.addEventListener('change', onCalm);
      else if (calm.addListener) calm.addListener(onCalm);
    }
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        /* noted, and acted on by the next frame that draws: see applyFit */
        refit = true;
        stillOk = false;
        wake();
      }, 150);
    }, { passive: true });

    wake();
  }

  function boot() {
    var els = document.querySelectorAll('.orb');
    for (var i = 0; i < els.length; i++) {
      var kind = kindOf(els[i]);
      if (kind === null || KINDS[kind] === undefined) continue;
      orbs.push({ el: els[i], kind: kind, canvas: null, gl: null, prog: null, u: null,
                  dead: false, col: null, col2: null, phase: 0, seen: true });
    }
    if (!orbs.length) return;   /* a page without orbs is a page this file does nothing to */
    /* hatch-busy or not. This used to wait for hatch:end when the page was
       arriving inside a hatch, the way the lattice does, and the wait was a
       bug on the way home: hatch.js builds the halves at pagereveal out of
       THIS document's row and copies the row's canvases into them, and a row
       that had no canvas yet gave it a copy carrying the flat fallback, which
       turned into the fluid in the frame the halves came off -- a jump, in
       the one frame being watched. So the canvases, the first frame and
       orbs-gl come in at boot and orbs:first says so; what stands aside for
       the hatch is the loop, which wake() refuses to start while the flag is
       up and hatch:end brings back with the clock exactly where it was (acc
       only moves between two frames that were both drawn, and last is zeroed
       at every stop). The five contexts and shader compiles land on the main
       thread once: before the first frame when this script runs before the
       reveal, on the first frames of the close when it runs after */
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
