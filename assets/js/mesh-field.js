/* ---------------------------------------------------------------------------
   Lattice
   A triangulated sheet lying over the page background, lit around the pointer
   and nowhere else: the lattice fades up over HALO, a radius wide enough that
   the page never looks wallpapered, and is gone well before the far corner.

   What the pointer does is pick out its own triangle. The face the cursor is
   actually inside is found on the CPU, by the barycentric test, and handed to
   the shader as one uniform: it alone is filled at HOT_A and in the tint, a
   clear step above anything around it. Every other face takes the value of one
   smooth falloff at its centroid, quantised into STEPS levels, so the rings
   around the hot one light up as discrete grades rather than as a gradient.
   Because that value is constant across a face, the patch is bounded by the
   edges of the lattice and reads as facets, never as a disc. The same
   falloff lights the edges and the nodes, grows each face a little about its
   own centre, and lifts the sheet by PEAK, which is small on purpose: a few
   pixels of perspective and of slide, enough for the lattice to bend under the
   cursor, never enough to read as a bubble.

   Nothing in the picture can flicker. A face changes grade through a short
   ramp rather than a jump, the hot face is held until the cursor is properly
   inside another one and the one it leaves fades out instead of going dark,
   and every value on screen is a function of the pointer position alone: hold
   the mouse still and the next frame is bit for bit the frame before it, which
   is why the loop is allowed to stop.

   Nothing is simulated and nothing trails. The falloff is a closed formula of
   the pointer position as it stands at the top of the frame, so the lit facet
   is under the cursor and not behind it, and when the pointer is still the next
   frame is the same frame: the loop stops and the last one stays on screen. The lattice is built
   once as three vertex buffers, a frame is three draw calls, and an idle page
   costs nothing at all.

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
  var JITTER  = 0.36;    /* per node offset as a share of PITCH, fixed for a
                            node. High on purpose: at 0.2 the triangles are all
                            the same triangle and the thing reads as wallpaper,
                            at 0.36 the faces vary in size and in shape the way
                            an unstructured mesh does. Much past 0.4 they start
                            to go slivery */
  var RADIUS  = 155;     /* reach of the pointer, css px: about five rings of
                            triangles, so the ladder of facets has room to
                            descend and still ends short of the reading column */
  var PEAK    = 9;       /* height of the sheet under the pointer, css px. Small
                            on purpose: this is the whole difference between a
                            sheet that bends and a bubble that slides about */
  var FLANK   = 0.35;    /* extra brightness for an edge whose two ends are at
                            different heights: the bend reads, the flat does not */
  var DEPTH   = 1200;    /* camera distance for the perspective, css px: a lifted
                            node grows away from the viewport centre */
  var SLIDE   = 16;      /* css px a node slides down the flank per unit of slope */

  /* ---- the faces ---------------------------------------------------------
     One flat value per triangle, taken at its centroid, is what makes the patch
     read as picked-out facets instead of a glow: the face under the pointer is
     filled, its neighbours less, and the outline of the whole thing is made of
     lattice edges, so nothing about it is circular. FACE_POW decides how
     quickly that ladder descends. FACE_A is deliberately tiny; above about 0.2
     the fill stops being a hint and starts being a shape. */
  var FACE_A   = 0.13;   /* alpha of a lit face at the foot of the hot one */
  var FACE_POW = 2.0;    /* how steeply the fill falls away to the next rings */
  var HOT_A    = 0.40;   /* alpha of the one face the cursor is inside. Three
                            times its neighbours and in the tint rather than in
                            grey: the point is that you can see which triangle
                            you are on, not that the area is brighter */
  var STEPS    = 5;      /* grades the falloff is quantised into, so the faces
                            light up in discrete steps out from the hot one */
  var GRADE    = 0.60;   /* the share of a grade that is flat. The rest is a ramp
                            into the next one: a hard step would make any face
                            sitting on a threshold blink as the hand shakes by a
                            pixel, and a blink is exactly what must not happen.
                            At 0.6 the plateaux still read as discrete rings */
  var HOT_HYST = 6;      /* css px the cursor must be inside a new face, measured
                            on the centroids, before the hot one changes hands.
                            Without it a cursor resting on an edge would flip the
                            two faces back and forth */
  var HOT_FADE = 70;     /* ms the face just left takes to go out. The new one
                            lights up at once, with no ramp at all: the rise is
                            where inertia would be felt, the fall is not */
  var GROW     = 0.16;   /* how much a face swells about its own centroid: at
                            the pointer its fill stands a couple of pixels outside
                            its own edges, which is what makes the facet read as
                            picked up rather than merely lit */
  var JAG      = 0.34;   /* the spread of the per face threshold. The falloff is
                            radial, so without this the outer faces all give out
                            at the same distance and the patch, facets and all,
                            still has the silhouette of a disc. Each face gets a
                            fixed share of its own, hashed from its centroid, so
                            the boundary breaks along the lattice instead. Being
                            a function of the centroid alone it is the same in
                            every frame: it cannot introduce a flicker. */

  /* ---- the pointer ---------------------------------------------------------
     No springs and no smoothing: the patch is drawn where the pointer is, full
     stop. A filter here is the one thing that cannot be hidden, because the eye
     has the system cursor next to it as a reference and reads any gap at all as
     drag: at 1000 px/s a time constant of 85 ms leaves the facet 85 px behind
     the arrow. The only lag left is the frame itself. */
  var POINTER_TAU = 0;   /* ms. Zero pins the patch to the pointer. Anything
                            above it is inertia, deliberately: 40 is a hint of
                            weight, 85 is a visible trail */
  var FADE_IN     = 90;  /* ms, the patch rising when the pointer arrives */
  var FADE_OUT    = 380; /* ms, the bump sinking when the pointer leaves the
                            page or the window */
  var SNAP        = 0.05;/* css px: closer than this the filtered pointer is set
                            on its target, so the loop is allowed to stop */

  /* ---- the light ---------------------------------------------------------- */
  var LINE_MIN   = 0.7, LINE_MAX = 1.15;  /* edge width, css px, rim to crest */
  var REST_A     = 0.075;                 /* alpha of the unlit lattice at the
                            pointer. About six levels above #111 in the margins
                            and half that behind the text: a structure you notice
                            only once you look for it */
  var HALO       = 820;                   /* css px over which that lattice fades
                            away from the pointer. Wide and slow on purpose: the
                            mesh should feel like it extends past what you can
                            see, not like a lamp carried around the page */
  var ALPHA_MAX  = 0.62;                  /* alpha of an edge at the crest */
  var EDGE_IN    = 0.02, EDGE_FULL = 0.80;/* brightness at which an edge starts
                            to show and at which its alpha is full: a clean rim
                            that ends, not a trail that fades for ever */
  var MID_AT     = 0.50;                  /* where on the brightness ramp the
                            colour is TINT: grey below it, near-white above */
  var NODE_MIN   = 0.7, NODE_MAX = 1.5;   /* node radius, css px, rim to crest */
  var NODE_ALPHA = 0.70;
  var NODE_IN    = 0.30, NODE_FULL = 0.9; /* nodes show later than edges, so
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
    ['RADIUS', RADIUS], ['PEAK', PEAK], ['FLANK', FLANK],
    ['FACE_A', FACE_A], ['FACE_POW', FACE_POW], ['GROW', GROW], ['REST_A', REST_A],
    ['JAG', JAG], ['HOT_A', HOT_A], ['STEPS', STEPS], ['HALO', HALO],
    ['GRADE', GRADE],
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
    'uniform vec2 u_hot;',
    'uniform vec2 u_was;',
    'uniform float u_wasf;',
    /* fall() is the effect: one smoothstep of the distance to the pointer,
       scaled by the envelope, 1 under the cursor and 0 at RADIUS. Everything
       else reads it. lift() takes it, turns it into a few pixels of height, and
       returns the projected point with the value carried in z, so nothing
       downstream has to know whether the light came from height or distance. */
    'float fall(vec2 p) {',
    '  float u = clamp(1.0 - length(p - u_ptr) / RADIUS, 0.0, 1.0);',
    '  return u * u * (3.0 - 2.0 * u) * u_amp;',
    '}',
    'vec3 lift(vec2 p) {',
    '  vec2 d = p - u_ptr;',
    '  float r = length(d);',
    '  float u = clamp(1.0 - r / RADIUS, 0.0, 1.0);',
    '  float f = u * u * (3.0 - 2.0 * u) * u_amp;',
    '  float z = PEAK * f;',
    '  float g = PEAK * u_amp * 6.0 * u * (1.0 - u) / RADIUS;',
    '  vec2 q = u_centre + (p - u_centre) * (DEPTH / (DEPTH - z)) + d * (SLIDE * g / max(r, 0.5));',
    '  return vec3(q, f);',
    '}',
    /* the lattice itself: present around the pointer, gone by HALO */
    'float halo(vec2 p) {',
    '  float u = clamp(1.0 - length(p - u_ptr) / HALO, 0.0, 1.0);',
    '  return u * u * (3.0 - 2.0 * u) * u_amp;',
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
    '  float tA = A.z;',
    '  float tB = B.z;',
    '  float bend = abs(A.z - B.z) * FLANK;',
    '  float tEdge = clamp((tA + tB) * 0.5 + bend, 0.0, 1.0);',
    '  float tHere = clamp(mix(tA, tB, e) + bend, 0.0, 1.0);',
    '  float lit = ALPHA_MAX * smoothstep(EDGE_IN, EDGE_FULL, tHere);',
    '  float alpha = max(REST_A * halo(mix(a_a, a_b, 0.5)), lit) * veil((a_a.x + a_b.x) * 0.5);',
    '  float hw = mix(LINE_MIN, LINE_MAX, tEdge) * 0.5;',
    '  float ext = (hw + u_feather) * step(0.0015, alpha);',
    '  float along = e * 2.0 - 1.0;',
    '  vec2 p = mix(A.xy, B.xy, e) + dir * (along * ext) + n * (s * ext);',
    '  v_lc = vec2(e * len + along * ext, s * ext);',
    '  v_len = len;',
    '  v_hw = hw;',
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

  /* a face is three vertices carrying their own rest position and, all three,
     the centroid of their triangle: the corners bend with the sheet while the
     fill stays flat across the face, which is what makes the facets read. */
  var FACE_VS = VERT_PRELUDE + [
    'attribute vec2 a_p;',
    'attribute vec2 a_c;',
    'varying mediump vec4 v_col;',
    'void main() {',
    '  float k = fract(sin(dot(a_c, vec2(127.1, 311.7))) * 43758.5453);',
    '  float t = clamp(fall(a_c) * (1.0 - JAG * 0.5 + JAG * k), 0.0, 1.0);',
    /* the one face the cursor is inside, handed over from the CPU, plus the one
       it has just left, on its way out */
    '  float hot = max(step(distance(a_c, u_hot), 0.5),',
    '                  step(distance(a_c, u_was), 0.5) * u_wasf);',
    /* the rest climb in grades: flat for the first GRADE of each, then a short
       ramp into the next. Discrete to the eye, continuous to the maths, so no
       face can ever snap from one value to another */
    '  float ts = t * STEPS;',
    '  float fl = floor(ts);',
    '  float tq = (fl + smoothstep(GRADE, 1.0, ts - fl)) / STEPS;',
    '  float a = mix(FACE_A * pow(tq, FACE_POW), HOT_A, hot) * veil(a_c.x);',
    '  vec3 P = lift(a_c + (a_p - a_c) * (1.0 + GROW * max(t, hot)));',
    '  v_col = vec4(mix(ramp(tq * 0.62), mix(u_mid, u_high, 0.45), hot), a);',
    /* a face with nothing to show is thrown out of the clip volume rather than
       rasterised: at rest the whole pass costs one vertex shader per corner */
    '  gl_Position = a < 0.0025 ? vec4(2.0, 2.0, 0.0, 1.0) : clip(P.xy);',
    '}'
  ].join('\n');

  var FACE_FS = FRAG_PRELUDE + [
    'varying mediump vec4 v_col;',
    'void main() {',
    '  gl_FragColor = vec4(v_col.rgb * v_col.a, v_col.a);',
    '}'
  ].join('\n');

  var POINT_VS = VERT_PRELUDE + [
    'attribute vec2 a_p;',
    'varying mediump vec4 v_col;',
    'varying mediump float v_r;',
    'void main() {',
    '  vec3 P = lift(a_p);',
    '  float t = P.z;',
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
                  'u_dpr', 'u_low', 'u_mid', 'u_high', 'u_hot', 'u_was', 'u_wasf'];
  function uniforms(p) {
    var u = {};
    for (var i = 0; i < UNIFORMS.length; i++) u[UNIFORMS[i]] = gl.getUniformLocation(p, UNIFORMS[i]);
    return u;
  }

  var faceProg, lineProg, pointProg, faceU, lineU, pointU, faceBuf, lineBuf, pointBuf;

  function setup() {
    faceProg = program(FACE_VS, FACE_FS, ['a_p', 'a_c']);
    lineProg = program(LINE_VS, LINE_FS, ['a_a', 'a_b', 'a_corner']);
    pointProg = program(POINT_VS, POINT_FS, ['a_p']);
    if (!faceProg || !lineProg || !pointProg) return false;
    faceU = uniforms(faceProg);
    lineU = uniforms(lineProg);
    pointU = uniforms(pointProg);
    faceBuf = gl.createBuffer();
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
  var w = 0, h = 0, dpr = 1, faceVerts = 0, lineVerts = 0, nodeCount = 0;
  var rowH = 0, cols = 0, rows = 0;
  /* the faces kept on the CPU as well, to answer one question per frame: which
     triangle is the cursor inside. triC holds the centroids, exactly the values
     the vertex buffer carries, so the shader can match on them; triV the three
     corners; triAt the two faces of each cell, for a local search. */
  var triC = null, triV = null, triAt = null;
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
    rowH = PITCH * Math.sqrt(3) * 0.5;
    cols = Math.ceil(w / PITCH) + 3;
    rows = Math.ceil(h / rowH) + 3;
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

    /* the faces of the same lattice: two per cell, wound from the edges that
       are already there, each vertex carrying the centroid of its triangle */
    var faces = new Float32Array(nodeCount * 2 * 12);
    triC = new Float32Array(nodeCount * 2 * 2);
    triV = new Float32Array(nodeCount * 2 * 6);
    triAt = new Int32Array(rows * cols * 2);
    for (i = 0; i < triAt.length; i++) triAt[i] = -1;
    var fo = 0, nt = 0;
    function tri(i1, i2, i3, cell, slot) {
      var x1 = nodes[i1 * 2], y1 = nodes[i1 * 2 + 1];
      var x2 = nodes[i2 * 2], y2 = nodes[i2 * 2 + 1];
      var x3 = nodes[i3 * 2], y3 = nodes[i3 * 2 + 1];
      var mx = (x1 + x2 + x3) / 3, my = (y1 + y2 + y3) / 3;
      faces[fo++] = x1; faces[fo++] = y1; faces[fo++] = mx; faces[fo++] = my;
      faces[fo++] = x2; faces[fo++] = y2; faces[fo++] = mx; faces[fo++] = my;
      faces[fo++] = x3; faces[fo++] = y3; faces[fo++] = mx; faces[fo++] = my;
      var v = nt * 6;
      triV[v] = x1; triV[v + 1] = y1; triV[v + 2] = x2;
      triV[v + 3] = y2; triV[v + 4] = x3; triV[v + 5] = y3;
      triC[nt * 2] = mx; triC[nt * 2 + 1] = my;
      triAt[cell * 2 + slot] = nt;
      nt++;
    }
    for (r = 0; r + 1 < rows; r++) {
      var od = r & 1;
      for (c = 0; c < cols; c++) {
        var n0 = r * cols + c, n1 = n0 + cols;
        if (od) {
          if (c + 1 < cols) { tri(n0, n0 + 1, n1 + 1, n0, 0); tri(n0, n1, n1 + 1, n0, 1); }
        } else {
          if (c + 1 < cols) tri(n0, n0 + 1, n1, n0, 0);
          if (c > 0) tri(n0, n1 - 1, n1, n0, 1);
        }
      }
    }
    faceVerts = fo / 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, faces.subarray(0, fo), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.STATIC_DRAW);

    /* everything that does not move: set once per build, for both programs */
    var half = measure * 0.5;
    var progs = [faceProg, lineProg, pointProg], us = [faceU, lineU, pointU];
    for (i = 0; i < 3; i++) {
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

    /* the face indices belong to the lattice that has just been thrown away */
    hotCur = -1; hotWas = -1; hotF = 0;

    draw();   /* the lattice at rest, on screen from the first paint */
  }

  /* ---- which face is the cursor inside ------------------------------------
     A local search: the lattice is a grid, so the cell the point falls in is
     arithmetic, and the jitter can only carry a face a fraction of a pitch from
     it. Two rings of cells around that one is more than enough, fifty faces at
     the very most, once a frame. The sign test tolerates a face wound either
     way, which a jittered lattice will occasionally produce. */
  function inside(x, y, t) {
    var o = t * 6;
    var x1 = triV[o], y1 = triV[o + 1];
    var x2 = triV[o + 2], y2 = triV[o + 3];
    var x3 = triV[o + 4], y3 = triV[o + 5];
    var d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
    var d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3);
    var d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  }

  function hotFace(x, y) {
    if (!triAt) return -1;
    var r0 = Math.floor(y / rowH) + 1, c0 = Math.floor(x / PITCH) + 1;
    for (var r = r0 - 2; r <= r0 + 2; r++) {
      if (r < 0 || r + 1 >= rows) continue;
      for (var c = c0 - 2; c <= c0 + 2; c++) {
        if (c < 0 || c >= cols) continue;
        var cell = (r * cols + c) * 2;
        for (var k = 0; k < 2; k++) {
          var t = triAt[cell + k];
          if (t >= 0 && inside(x, y, t)) return t;
        }
      }
    }
    return -1;
  }

  /* ---- the hot face -------------------------------------------------------
     hotCur is the face the cursor is in, hotWas the one it has just left and
     hotF how much of that one is left. The change of hands needs a margin:
     without it a hand resting on a shared edge would swap the two faces every
     other frame, which is precisely the flicker this effect must not have. */
  var hotCur = -1, hotWas = -1, hotF = 0;

  function pickHot(dt) {
    var want = amp > 0.02 ? hotFace(px, py) : -1;
    if (want !== hotCur) {
      var take = true;
      if (want >= 0 && hotCur >= 0) {
        var ax = px - triC[want * 2], ay = py - triC[want * 2 + 1];
        var bx = px - triC[hotCur * 2], by = py - triC[hotCur * 2 + 1];
        take = Math.sqrt(ax * ax + ay * ay) + HOT_HYST < Math.sqrt(bx * bx + by * by);
      }
      if (take) {
        if (hotCur >= 0) { hotWas = hotCur; hotF = 1; }
        hotCur = want;
      }
    }
    if (hotF > 0) {
      hotF -= dt / HOT_FADE;
      if (hotF <= 0) { hotF = 0; hotWas = -1; }
    }
  }

  /* ---- the frame ---------------------------------------------------------- */
  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(faceProg);
    gl.uniform2f(faceU.u_ptr, px, py);
    gl.uniform1f(faceU.u_amp, amp);
    gl.uniform2f(faceU.u_hot,
      hotCur >= 0 ? triC[hotCur * 2] : -9999, hotCur >= 0 ? triC[hotCur * 2 + 1] : -9999);
    gl.uniform2f(faceU.u_was,
      hotWas >= 0 ? triC[hotWas * 2] : -9999, hotWas >= 0 ? triC[hotWas * 2 + 1] : -9999);
    gl.uniform1f(faceU.u_wasf, hotF);
    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuf);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, faceVerts);

    gl.useProgram(lineProg);
    gl.uniform2f(lineU.u_ptr, px, py);
    gl.uniform1f(lineU.u_amp, amp);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);
    gl.drawArrays(gl.TRIANGLES, 0, lineVerts);

    if (amp === 0) return;   /* the nodes belong to the pointer, not to the page */

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
    if (POINTER_TAU <= 0 || dx * dx + dy * dy <= SNAP * SNAP) { px = tx; py = ty; }
    else {
      var k = 1 - Math.exp(-dt / POINTER_TAU);
      px += dx * k; py += dy * k;
    }

    var goal = live ? 1 : 0;
    var da = goal - amp;
    if (da < 0.01 && da > -0.01) amp = goal;   /* below the first visible edge either way */
    else amp += da * (1 - Math.exp(-dt / (live ? FADE_IN : FADE_OUT)));

    pickHot(dt);
    draw();

    /* still: stop, and the frame on screen is the one that would come next */
    if (px === tx && py === ty && amp === goal && hotF === 0) return;
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
    /* out of the window, not just out of an element, and not merely onto the
       scrollbar: some browsers report that as a leave, and the patch would dip
       and come back for no reason the eye can account for */
    if (e.relatedTarget) return;
    if (e.clientX > 0 && e.clientY > 0 &&
        e.clientX < window.innerWidth && e.clientY < window.innerHeight) return;
    leave();
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
