/* model-tone.js: the colours of every 3D model on the site, toned down once, at load.
   Linked with defer from the three pages that show models (projects, biomedical-artifact,
   biomedical-platform), after model-viewer.

   The CAD exports carry full reds, greens, blues and yellows. Every coloured base colour
   factor is taken to sRGB, to HSL, its saturation multiplied by --tone-sat, then moved by
   --tone-mix toward the warm neutral grey --tone-grey, and written back in linear RGB with
   its own alpha. A grey or a white (no chroma to speak of) and a textured material (factor
   1 1 1) are left exactly as they are. The three numbers are tokens in :root of
   /assets/css/slant.css, beside --render-sat, which tones the renders of the same models
   (their cards and photos) by the same amount, so a model and its picture agree.

   Why not a CSS filter on <model-viewer>: it would grey the hotspots, the callouts and the
   accent drawn in its slots too. The materials are changed through model-viewer's own
   scene-graph API instead.

   ORDER. One listener, in the capture phase, on the document: the load event of a
   model-viewer does not bubble, but it crosses the document on its way down, so this runs
   before any listener the page has hung on the element itself. Everything a page reads at
   load (the factors the part toggles and the highlight of the platform remember and write
   back) is therefore already toned: the toned colour is the new original.
   window.modelTone(rgb) gives the same tone to a colour a page writes by itself (the three
   arrows of the triad), linear RGB in, linear RGB out. */
(function () {
  'use strict';

  /* below this chroma (max - min of the sRGB channels) a material is a grey and stays one */
  var NEUTRAL = 0.04;

  var P = null;
  function params() {
    if (P) return P;
    var cs = getComputedStyle(document.documentElement);
    var sat = parseFloat(cs.getPropertyValue('--tone-sat'));
    var mix = parseFloat(cs.getPropertyValue('--tone-mix'));
    var m = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(cs.getPropertyValue('--tone-grey'));
    P = {
      sat: isFinite(sat) ? sat : 0.75,
      mix: isFinite(mix) ? mix : 0,
      grey: m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
              : [0.561, 0.541, 0.51]
    };
    return P;
  }

  function toSrgb(c) {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
  function toLinear(c) {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function channel(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  /* linear RGB(A) in, linear RGB(A) out; null when the colour is a neutral */
  function tone(f) {
    var k = params();
    var r = toSrgb(f[0]), g = toSrgb(f[1]), b = toSrgb(f[2]);
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < NEUTRAL) return null;
    var l = (max + min) / 2;
    var s = d / (1 - Math.abs(2 * l - 1));
    var h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    s = Math.min(1, s * k.sat);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var out = [channel(p, q, h + 1 / 3), channel(p, q, h), channel(p, q, h - 1 / 3)];
    for (var i = 0; i < 3; i++) out[i] = toLinear(out[i] + (k.grey[i] - out[i]) * k.mix);
    if (f.length > 3) out.push(f[3]);
    return out;
  }

  /* a material is toned once, whatever happens after: a second load of the same model
     must not grey it twice */
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;

  function toneViewer(viewer) {
    var model = viewer.model;
    if (!model || !model.materials) return;
    Array.prototype.forEach.call(model.materials, function (m) {
      if (done && done.has(m)) return;
      try {
        var pbr = m.pbrMetallicRoughness;
        var next = tone(pbr.baseColorFactor);
        if (done) done.add(m);
        if (next) pbr.setBaseColorFactor(next);
      } catch (e) { /* a material the scene never draws cannot be read: leave it */ }
    });
  }

  document.addEventListener('load', function (e) {
    var t = e.target;
    if (t && t.localName === 'model-viewer') toneViewer(t);
  }, true);

  /* a model that somehow arrived before this script */
  Array.prototype.forEach.call(document.querySelectorAll('model-viewer'), function (viewer) {
    if (viewer.loaded) toneViewer(viewer);
  });

  window.modelTone = function (rgb) {
    var t = tone(rgb);
    return t ? t.slice(0, 3) : [rgb[0], rgb[1], rgb[2]];
  };
})();
