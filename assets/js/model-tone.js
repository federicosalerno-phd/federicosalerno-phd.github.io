/* model-tone.js: the colours and the finish of every 3D model on the site, set once, at load.
   Linked with defer from the three pages that show models (projects, biomedical-artifact,
   biomedical-platform), after model-viewer.

   The CAD exports are poor material data: every part is a fully matte non-metal (metallic 0,
   roughness .9), whatever its appearance is called, and the colours are the CAD defaults,
   full reds, greens and blues next to washed pastels. Lit by the studio environment of the
   viewers (/assets/env/studio.hdr) that reads as plaster. Two fixes, both here:

   COLOUR. A coloured base colour factor is taken to OKLCH, its chroma multiplied by
   --tone-chroma and its lightness capped at --tone-lmax, then written back in linear RGB
   with its own alpha. Capping the lightness, not cutting the saturation, is the point: a
   pastel comes down to a deep, quiet colour (a paint, an anodised part) instead of a
   greyer pastel. A grey or a white (no chroma to speak of) and a textured material
   (factor 1 1 1) keep their colour.

   FINISH. The appearance names the CAD tool exported (polished steel, satin finish
   aluminum, glossy rubber, black low gloss plastic...) give each material a metalness and a
   roughness. A metal is fully metallic, its grey lifted to at least --metal-grey so it
   reflects like steel and not like soot; a white that is not a metal comes down to
   --tone-white, a white on a black stage, not a lamp. The unnamed material is the CAD
   default grey: on these mechanical parts it stands for steel. The numbers are tokens in
   :root of
   /assets/css/slant.css. The photos of the models (cards, front, side, iso) are rendered
   from these same viewers, so a model and its picture agree.

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

  /* below this OKLCH chroma a material is a grey and stays one */
  var NEUTRAL = 0.03;

  var P = null;
  function params() {
    if (P) return P;
    var cs = getComputedStyle(document.documentElement);
    function num(name, fallback) {
      var v = parseFloat(cs.getPropertyValue(name));
      return isFinite(v) ? v : fallback;
    }
    P = {
      chroma: num('--tone-chroma', 0.7),
      lmax: num('--tone-lmax', 0.62),
      metal: num('--metal-grey', 0.56),
      white: num('--tone-white', 0.45)
    };
    return P;
  }

  function clamp(c) { return Math.min(1, Math.max(0, c)); }

  /* linear RGB(A) in, linear RGB(A) out; null when the colour is a neutral.
     OKLab from linear sRGB (Ottosson's matrices) and back. */
  function tone(f) {
    var k = params();
    var l = Math.cbrt(0.4122214708 * f[0] + 0.5363325363 * f[1] + 0.0514459929 * f[2]);
    var m = Math.cbrt(0.2119034982 * f[0] + 0.6806995451 * f[1] + 0.1073969566 * f[2]);
    var s = Math.cbrt(0.0883024619 * f[0] + 0.2817188376 * f[1] + 0.6299787005 * f[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    if (Math.sqrt(a * a + b * b) < NEUTRAL) return null;
    /* a yellow is light by nature: capped like a red it turns olive, so the cap rises
       toward the yellows (OKLCH hue about 100 degrees) */
    var y = Math.max(0, Math.cos(Math.atan2(b, a) - 100 * Math.PI / 180));
    a *= k.chroma;
    b *= k.chroma;
    L = Math.min(L, k.lmax + 0.1 * y * y * y * y);
    l = L + 0.3963377774 * a + 0.2158037573 * b;
    m = L - 0.1055613458 * a - 0.0638541728 * b;
    s = L - 0.0894841775 * a - 1.2914855480 * b;
    l *= l * l;
    m *= m * m;
    s *= s * s;
    var out = [
      clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
    if (f.length > 3) out.push(f[3]);
    return out;
  }

  /* the appearance name the CAD tool exported, without the trailing copy number and,
     on the Biomedical models, without the grp--part-- / tool--part-- prefix */
  function appearance(name) {
    var n = (name || '').toLowerCase();
    if (/^(grp|tool)--/.test(n)) {
      var hit = /^(?:grp|tool)--.*?--(.*)$/.exec(n);
      n = hit ? hit[1] : '';
    }
    return n.replace(/[-_ ]?\d+$/, '').replace(/-+$/, '');
  }

  /* metalness and roughness from the appearance; null leaves the material alone */
  function finish(name) {
    var n = appearance(name);
    if (/^triad/.test(n)) return null;
    if (n === '' || /steel|chrom|alumin|brass|zinc|mirror|iron|metal|copper|bronze/.test(n)) {
      return { metal: 1, rough: /mirror|chrom|polished/.test(n) ? 0.2 : /matte/.test(n) ? 0.48 : 0.34 };
    }
    return {
      metal: 0,
      rough: /rubber|tire|soft touch/.test(n) ? 0.75
           : /high gloss|glossy/.test(n) ? 0.28
           : /low gloss|satin|spray/.test(n) ? 0.5
           : /pw-mt|texture|teak|wood/.test(n) ? 0.6
           : 0.42
    };
  }

  /* a material is toned once, whatever happens after: a second load of the same model
     must not tone it twice */
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;

  function toneViewer(viewer) {
    var model = viewer.model;
    if (!model || !model.materials) return;
    var k = params();
    Array.prototype.forEach.call(model.materials, function (m) {
      if (done && done.has(m)) return;
      try {
        var pbr = m.pbrMetallicRoughness;
        var f = pbr.baseColorFactor;
        var fin = finish(m.name);
        var next = tone(f);
        if (!next && fin) {
          /* a grey metal is lifted to reflect like steel; a white or a light grey that is
             not a metal comes down, or its lit faces burn out on the black stage */
          var g = Math.max(f[0], f[1], f[2]);
          var to = fin.metal ? Math.max(g, k.metal) : Math.min(g, k.white);
          if (to !== g) {
            var r = to / Math.max(g, 1e-3);
            next = [clamp(f[0] * r), clamp(f[1] * r), clamp(f[2] * r)];
            if (f.length > 3) next.push(f[3]);
          }
        }
        if (done) done.add(m);
        if (next) pbr.setBaseColorFactor(next);
        if (fin) {
          pbr.setMetallicFactor(fin.metal);
          pbr.setRoughnessFactor(fin.rough);
        }
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
