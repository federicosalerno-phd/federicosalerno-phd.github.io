/* ---------------------------------------------------------------------------
   Glide -- where the light is.

   The stylesheet does the whole gesture; this file only says where on a surface
   the pointer is, as --gx/--gy in its own box, so the light sits under the hand
   instead of in the middle. Without this file every surface still lifts and
   still lights, from its centre.

   It is one delegated pointermove, and it does three things per event: a
   closest(), and two custom properties. The rectangle of the surface is read
   once when the pointer arrives on it and not again -- a getBoundingClientRect
   per move is a forced layout sixty times a second, and that is the kind of
   thing that turns a smooth hover into a grainy one. The cached rectangle is
   thrown away on scroll, on resize and whenever the pointer moves to another
   surface, which is every way it can go stale.

   Nothing runs per frame: the light is moved by the compositor through a
   translate3d, and its own 60ms transition is what makes a fast pass read as
   weight rather than as jitter.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !body.closest) return;
  if (body.getAttribute('data-hover') !== 'glide') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* the same list the stylesheet lights, for the same reason: a surface with a
     box of its own. Text links have no box and the model-viewers are not ours */
  var SURFACE = '.row,.back,.pdf,.feature .links a,.tile,.paper,.gallery li,' +
                '.avatar-btn,.mv-zoom button,.ov-btn,.grp-close,.mv-parts button,' +
                '.surf button,.shots button';

  var here = null;   /* the surface the pointer is on */
  var box = null;    /* and its rectangle, read once */

  function forget() { here = null; box = null; }
  window.addEventListener('scroll', forget, { passive: true });
  window.addEventListener('resize', forget, { passive: true });

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var el = e.target && e.target.closest ? e.target.closest(SURFACE) : null;
    if (!el) { if (here) forget(); return; }
    if (el !== here) {
      /* arriving: the light is put where the edge was crossed before it is
         faded in, so it never slides in from the middle of the box */
      here = el;
      box = el.getBoundingClientRect();
    }
    el.style.setProperty('--gx', (e.clientX - box.left).toFixed(1) + 'px');
    el.style.setProperty('--gy', (e.clientY - box.top).toFixed(1) + 'px');
  }, { passive: true });

  /* the keyboard has no point of entry: a focused surface lights from its own
     centre, which is what the stylesheet does on its own */
  document.addEventListener('focusin', function (e) {
    var el = e.target && e.target.closest ? e.target.closest(SURFACE) : null;
    if (!el) return;
    el.style.removeProperty('--gx');
    el.style.removeProperty('--gy');
    forget();
  }, true);
})();
