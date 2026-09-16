/* ---------------------------------------------------------------------------
   Glide -- where the light is, and what happens under the finger.

   Two jobs, guarded separately, because they answer to two different attributes
   on the <body>: the light belongs to data-hover="glide", the press belongs to
   data-press. A page can have one without the other, and this file used to
   return at the door when data-hover was anything else, which would have left
   the press dead everywhere.

   THE LIGHT. The stylesheet does the whole gesture; this file only says where
   on a surface the pointer is, as --gx/--gy in its own box, so the light sits
   under the hand instead of in the middle. Without this file every surface
   still lifts and still lights, from its centre.

   It is one delegated pointermove, and it does three things per event: a
   closest(), and two custom properties. The rectangle of the surface is read
   once when the pointer arrives on it and not again -- a getBoundingClientRect
   per move is a forced layout sixty times a second, and that is the kind of
   thing that turns a smooth hover into a grainy one. The cached rectangle is
   thrown away on scroll, on resize and whenever the pointer moves to another
   surface, which is every way it can go stale.

   THE PRESS. The stylesheet stretches the band on :active and springs it home
   on .press-back; this file does the two things CSS cannot. First, it moves the
   origin of the stretch under the finger -- one rectangle read at the
   pointerdown, never again, removed when the spring is over. It is not in the
   stylesheet because a transform-origin written there would also move the
   centre the hover lifts from, and that lift has to stay a lift from the
   middle. Second, it holds the navigation back for the length of a release,
   because a band that springs while the next document is already painting is a
   band nobody will ever see spring.

   Nothing here runs per frame and nothing here paints: one class per press, one
   origin per press, and the compositor does the rest.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !body.closest) return;
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* the same list the stylesheet lights, for the same reason: a surface with a
     box of its own. Text links have no box and the model-viewers are not ours */
  var SURFACE = '.row,.back,.pdf,.feature .links a,.tile,.paper,.gallery li,' +
                '.avatar-btn,.mv-zoom button,.ov-btn,.grp-close,.mv-parts button,' +
                '.surf button,.shots button';

  /* and the shorter list the stylesheet stretches: the bands of text only.
     Anything with a photograph in it presses flat, in CSS, and is not here */
  var BAND = '.row,.back,.pdf,.feature .links a';

  /* ---- the light --------------------------------------------------------- */
  if (body.getAttribute('data-hover') === 'glide' && !reduced) {
    var here = null;   /* the surface the pointer is on */
    var box = null;    /* and its rectangle, read once */

    var forget = function () { here = null; box = null; };
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
  }

  /* ---- the press --------------------------------------------------------- */
  var press = body.getAttribute('data-press');
  if (!press || press === 'off' || reduced) return;

  /* the spring in the stylesheet is .48s, .42s where linear() is missing; this
     is a little past the longer of the two, so the class is never taken off a
     band that is still moving. The next pointerdown clears it early anyway */
  var SPRING_MS = 520;
  /* how long the release is given before the page changes. It is the time the
     eye needs to see the band let go -- not a wait, and short enough that the
     second click of an impatient hand still lands on the document it aimed at */
  var NAV_MS = 170;

  var held = null;      /* the band under the finger, or the one still springing */
  var timer = 0;

  function done() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!held) return;
    held.classList.remove('press-back');
    held.style.removeProperty('transform-origin');
    held = null;
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;                  /* middle and right open menus */
    var el = e.target && e.target.closest ? e.target.closest(BAND) : null;
    if (!el) return;
    done();                                    /* a new press ends the last spring */
    held = el;
    /* the stretch starts where the band was pushed. Touch and the keyboard keep
       the centre: a tap has no point the eye was already resting on, and a band
       reached with Enter was never pointed at at all */
    if (press === 'stretch' && e.pointerType !== 'touch') {
      var r = el.getBoundingClientRect();      /* once, here, not per event */
      el.style.transformOrigin = (e.clientX - r.left).toFixed(1) + 'px center';
    }
  }, { passive: true });

  function release() {
    if (!held) return;
    var el = held;
    el.classList.add('press-back');   /* the spring, and only on the way home */
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (held === el) done();
    }, SPRING_MS);
  }
  /* on the window, so a finger that slides off the band before it lifts still
     gets its release: the band would otherwise stay pressed until the next one */
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });

  /* ---- the release, seen ------------------------------------------------- */
  /* a link followed at once never shows what it did. The click is held for
     NAV_MS and then followed by hand -- but only in the plain case. Anything a
     browser would do differently (a new tab, a download, a file, another
     origin, a modifier held down) is left alone: the link stays a link, and the
     press is the only thing this file is allowed to add to it.

     The listener captures, so the preventDefault below is already on the event
     when mesh-field.js sees it bubble up to document. Its own guard walks up
     from the target and stops at the first <a> -- a click on a link has never
     opened a quotation -- and it reads e.defaultPrevented as well, so a held
     click cannot leave a quote sitting behind the page it is leaving. */
  var going = false;
  /* a page restored from the back/forward cache brings its variables back with
     it, and a going left true would quietly hand every later click to the
     browser: the band would still stretch and would never be seen letting go */
  window.addEventListener('pageshow', function () { going = false; });
  document.addEventListener('click', function (e) {
    if (going || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!e.detail) return;                          /* Enter on a link: go, now */
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !a.matches || !a.matches(BAND)) return;
    if (a.target || a.hasAttribute('download')) return;
    if (a.origin !== window.location.origin) return;               /* elsewhere */
    if (/\.pdf$/i.test(a.pathname)) return;                  /* the viewer's job */
    if (a.hash && a.pathname === window.location.pathname) return;  /* same page */
    e.preventDefault();
    going = true;
    setTimeout(function () { window.location.href = a.href; }, NAV_MS);
  }, true);
})();
