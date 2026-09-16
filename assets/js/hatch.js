/* ---------------------------------------------------------------------------
   Hatch -- the two halves of the band that was chosen, and the geometry of the
   window that opens between them. The movement itself is in
   assets/css/hatch.css; this file only does the three things CSS cannot know.

   ONE. Which band was clicked, and which of the two things it is. A
   cross-document view transition has no idea what started the navigation, and
   the whole gesture is built on the position of one band, so the click is
   remembered -- the element, nothing else, no preventDefault, no timer. The
   link stays a link: ctrl-click opens a tab and never reaches pageswap in this
   document, the middle button is not ours, and a navigation that turns out not
   to match the band that was clicked is dropped at the door.

   Nothing is clicked when the browser's own back button is used, and that is
   the half of this that has to be inferred rather than recorded: on a traverse
   the band is looked up by where the navigation is going. If the document has
   a .back pointing there, going there is a return, and a return closes; if it
   has a row pointing there, the forward button is repeating a click that was
   made before, and that opens, without the hover state a click would have left.
   Clicking .back and pressing the back button are one gesture to the hand and
   have to be one gesture on the screen. Which one it is -- 'open' or 'close' --
   is the only thing the two documents disagree about, so it travels with the
   geometry and the arriving page adds it to the transition's types.

   The two are not symmetrical in where the work is done, and they cannot be.
   Opening, the band exists in the document being left, so that is where it is
   cloned and hidden. Closing, the band exists in the document being RETURNED
   TO -- it is the row the finger pressed a page ago -- so the halves are built
   there instead, at pagereveal, in the live document rather than a snapshot,
   and taken off again when the transition has finished. That is the one place
   this file leaves something behind it has to clean up after.

   TWO. The halves, built at pageswap one frame before the browser takes its
   snapshot of the page being left -- or, closing, at pagereveal one frame
   before the arriving page is first drawn, by the same function, because two
   ways of building the same two boxes is two ways of getting them slightly
   different. Each is a fixed box with overflow:hidden, as
   tall or as wide as half the band, holding a full copy of the band positioned
   so its middle lands on the cut; the snapshot of such a box is its content
   clipped, so each box IS one half without anything having been cut by hand.
   The copy has to be the band as it stood under the pointer -- the hover fill,
   the grown dot, the 1.03 lift -- or the band changes at the instant it splits,
   which is the one instant everybody is looking at it. The real band is then
   hidden, so the page's own snapshot has a band-shaped hole in it: the hole is
   covered by the two halves at the start and by the window ever after.

   THREE. The mode and the geometry, carried to the next document through
   sessionStorage, because the two documents share nothing else and the arriving
   page has to know which way round this is, and where on the screen the band
   was, before it paints anything. It is read and deleted at pagereveal, before
   the first frame; that is also the flag that says this navigation is a hatch.
   Anything with nothing waiting for it -- a footer link, an address typed by
   hand, a reload, a page opened from somewhere else -- is skipped there and
   stays as instantaneous as it is today. Nothing survives a reload: the key is
   written one navigation before it is read and burnt on arrival either way, so
   a refresh finds an empty box and loads the page the way it always did.

   The file is loaded synchronously in the <head>, before the body exists, so
   nothing here touches document.body until an event hands it over.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  /* no cross-document view transitions, no hatch: the pages navigate the way
     they always have. PageSwapEvent and PageRevealEvent are the two halves of
     the feature and both are needed */
  if (!window.PageSwapEvent || !window.PageRevealEvent) return;
  /* the stylesheet scopes every rule to the type of the transition. Without
     that selector the whole file would be dropped and the UA's own cross-fade
     would run instead, which is not a thing anybody asked for */
  if (!window.CSS || !CSS.supports ||
      !CSS.supports('selector(:active-view-transition-type(hatch))')) return;

  /* the bands of text, the same list glide.css lifts and glide.js used to
     stretch. Anything with a picture in it is not a band and does not split */
  var BAND = '.row,.back,.pdf,.feature .links a';
  var KEY = 'hatch';

  var pressed = null;   /* the band that was clicked, until the page is gone */
  var hidden = null;    /* the same band, made invisible for the snapshot */

  /* ---- the flag, at the earliest moment there is --------------------------
     html.hatch-busy says a page transition is running in THIS document, and
     everything on the page that runs per frame is asked to stand down until
     hatch:end. The long note in pagereveal has the whole of the why -- the
     window of this gesture is a clip-path and clip-path ticks on the main
     thread of the arriving page -- and it is raised there too, before the types
     go on. Raising it there is not early enough on its own, and that is what
     these three lines are for. A deferred script runs when parsing ends;
     pagereveal runs at the first rendering opportunity after that; which of the
     two comes first is not ours to decide, and with the script already in cache
     assets/js/mesh-field.js boots BEFORE the reveal, reads a flag nobody has
     raised yet, and builds its lattice on the spot -- the arrangement both
     files describe and neither keeps.
     This file is synchronous in the <head>, so nothing else of the page has run
     when this does. The key is only there if the document being left wrote one
     at pageswap for this very navigation; it is not consumed here -- pagereveal
     reads and burns it a moment later -- and every way out of that handler
     calls free(), including the ones where there is no transition at all, so a
     key left behind by a navigation that never became one costs a class for the
     length of one reveal and nothing after it */
  try {
    if (window.sessionStorage && window.sessionStorage.getItem(KEY)) {
      document.documentElement.classList.add('hatch-busy');
    }
  } catch (err) {}

  /* how far each half box reaches past the band on the three sides that are not
     the cut. It changes nothing about where the band is or how far it travels:
     the copy inside is still centred on the seam, and the box only grows
     outwards, into the part of the screen the half is leaving by. It is there
     so that a focus ring -- which lives outside the band, four pixels out in
     index.html and five with the outline the other pages use -- survives the
     overflow:hidden that makes a half a half, and so that a band at a
     fractional position cannot leave a hair of the hole behind it showing along
     its outer edge while it pulls away. Six is over both */
  var BLEED = 6;

  function reduced() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  /* three decimals and not two, and not a whole number on any account. Every
     length here comes out of getBoundingClientRect, which is fractional by
     nature -- a column centred in an odd number of pixels, a band lifted 3% by
     a hover -- and the seam, the copy's place inside its box and the edges the
     window is cut to all have to be the same fraction or the cut lands half a
     pixel off the middle of the band. A thousandth of a pixel is under the
     smallest thing any screen can show, at any device pixel ratio */
  function px(n) { return n.toFixed(3) + 'px'; }

  /* the one form in which two addresses can be compared. The site writes the
     home as "/" in every .back and as "/index.html" nowhere, and the browser
     hands back whichever the history entry was made with, so the two are folded
     together here; anything not on this origin is not a page of this site and
     comes back null, which no band will ever match */
  function path(u) {
    var url;
    try { url = new URL(u, window.location.href); } catch (err) { return null; }
    if (url.origin !== window.location.origin) return null;
    return (url.pathname === '/' || url.pathname === '') ? '/index.html'
                                                        : url.pathname;
  }

  /* the band of this document that leads to a given page. .back wins over a
     row pointing at the same place, and that single preference is what makes
     the back button and the Back to home link the same gesture: whichever way
     the reader asks for the previous page, the answer is the closing one */
  function bandTo(to) {
    if (!to) return null;
    var all = document.querySelectorAll(BAND), first = null, i, a;
    for (i = 0; i < all.length; i++) {
      a = all[i];
      if (a.target || a.hasAttribute('download')) continue;
      if (path(a.href) !== to) continue;
      if (a.matches && a.matches('.back')) return a;
      if (!first) first = a;
    }
    return first;
  }

  /* the seam has to be on the screen. A band scrolled out of the viewport would
     put the window's slit above or below everything and the page being left
     would vanish in the first frame instead of opening; that is only ever the
     case for a band nobody just touched -- the back button, the forward button
     -- and the answer there is to build no halves. Going out that is the end of
     it and the pages simply change: there is nothing to see a page come out of.
     Coming home it is not, and fit() below is what happens instead */
  function seen(r) {
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return r.width > 0 && r.height > 0 &&
           cy >= 0 && cy <= (window.innerHeight || 0) &&
           cx >= 0 && cx <= (window.innerWidth || 0);
  }

  /* ---- which band ---------------------------------------------------------
     In capture, so it is read before anything downstream can cancel it, and it
     changes nothing about the event: the navigation is the browser's, at its
     own moment, and this only writes down what it was aimed at. Every case a
     browser would treat differently -- another tab, a download, another origin,
     a modifier held down -- leaves pressed empty and gets no transition. */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    /* a click on something that is not a link forgets nothing. The band was
       written down for the navigation that is already on its way, and the
       document being left stays interactive until the swap: on a slow answer
       the reader goes on using the page -- a triangle of the lattice clicked
       for a quotation is the ordinary gesture here -- and clearing the band on
       any click at all meant that gesture arrived at pageswap with nothing
       recorded, no halves and no window, the pages changing at a stroke. Only a
       click aimed at a link replaces what is remembered, and only pageswap,
       which is the one place it is read, consumes it */
    if (!a) return;
    pressed = null;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!a.matches || !a.matches(BAND)) return;
    if (a.target || a.hasAttribute('download')) return;
    if (a.origin !== window.location.origin) return;
    pressed = a;
  }, true);

  /* ---- the halves --------------------------------------------------------- */
  function box(left, top, w, h, name) {
    var d = document.createElement('div');
    d.className = 'hatch-half';
    d.setAttribute('aria-hidden', 'true');
    d.style.left = px(left);
    d.style.top = px(top);
    d.style.width = px(w);
    d.style.height = px(h);
    d.style.viewTransitionName = name;
    return d;
  }
  /* everything about a band that can be halfway to somewhere else at the moment
     it is cut. The copy is not hovered and never will be -- it has no href, it
     is aria-hidden and the pointer goes through it -- so not one hover rule of
     glide.css or of any page reaches it, and for a while this file answered
     that by naming the hover state itself: --btn-sel, --on-btn-sel, a dot at
     --g-bar. Naming it is what was wrong. glide.css carries a band to its
     chosen colour over .42s and a click lands whenever the reader lands it, so
     a band a third of the way there was being cloned at the far end of it: the
     band changed colour at the instant it split, which is the instant the whole
     gesture is about. Reading the computed value instead is exact whenever the
     click happens, and it settles four other questions for nothing -- hover
     against focus-visible, (hover:hover), reduced motion, a finger that left
     :hover stuck on what it tapped -- because all of them are already in the
     number that comes back. The ring is in this list for the same reason: on a
     keyboard the band that splits is the band that has the ring, and a copy
     without it loses it in the first frame */
  var PAINT = ['background-color', 'color',
               'border-top-color', 'border-right-color',
               'border-bottom-color', 'border-left-color',
               'box-shadow',
               'outline-color', 'outline-style', 'outline-width',
               'outline-offset'];

  function paint(el, c) {
    var cs, i, v;
    try { cs = window.getComputedStyle(el); } catch (err) { return; }
    if (!cs) return;
    for (i = 0; i < PAINT.length; i++) {
      v = cs.getPropertyValue(PAINT[i]);
      /* important, because glide.css and every page's own style reach the copy
         through its class and would otherwise put the resting fill back */
      if (v) c.style.setProperty(PAINT[i], v, 'important');
    }
    /* and the mark in the margin, which is a pseudo element and out of reach of
       any inline style: it goes over as a custom property instead, and
       hatch.css spends it on the copy's own ::before. The value that comes back
       is a matrix with the hover growth and the -50% of the centring already
       resolved into it, so it is the dot exactly as it stands, at whatever size
       glide had got it to. A band whose mark is not a pseudo element -- a row
       carrying an orb -- has nothing here, and takes the same measurement one
       step below */
    try {
      v = window.getComputedStyle(el, '::before').getPropertyValue('transform');
      if (v && v !== 'none') c.style.setProperty('--hatch-dot', v);
    } catch (err2) {}
    /* and the same measurement for a mark that is an element rather than a
       pseudo. The rows of the home carry an orb, and hover grows it by --g-bar
       on glide's own curve; the copy is out of reach of every hover rule there
       is -- no href, aria-hidden, the pointer goes through it -- so it would
       stand at rest in the first frame of the cut while the band it came from
       was a quarter wider a moment before. The matrix that comes back has the
       centring and whatever the growth had got to in it, so it is the orb
       exactly as it stands, halfway through the .42s or at the end of it. It is
       frozen with its transition, because hatch.css silences the copy itself
       and the orb is a descendant of it: what it shows, it shows now */
    try {
      var o = el.querySelector && el.querySelector('.orb');
      var oc = o && c.querySelector ? c.querySelector('.orb') : null;
      if (o && oc) {
        v = window.getComputedStyle(o).getPropertyValue('transform');
        if (v && v !== 'none') oc.style.setProperty('transform', v, 'important');
        oc.style.setProperty('transition', 'none', 'important');
      }
    } catch (err3) {}
  }

  /* a copy of a moving thing has to be moving with it and not from the start.
     The orb inside a row of the home is two shapes turning on infinite CSS
     animations; cloneNode copies the markup, the animations are started fresh
     on the copy, and a fluid caught mid-turn would snap back to its first frame
     at the moment of the cut. Every running animation of the original is paired
     with the one of the same name in the copy, in tree order, and handed the
     original's start time: same timeline, same origin, so they do not merely
     begin together, they stay together for the whole second the halves are on
     the screen. Animations only, never transitions -- a transition has no
     animationName, and what the copy shows of those is the frozen value paint()
     has just written on it */
  function sync(src, dst) {
    var A, B, taken, i, j, a, b;
    if (!src || !dst || !src.getAnimations || !dst.getAnimations) return;
    try {
      A = src.getAnimations({ subtree: true });
      B = dst.getAnimations({ subtree: true });
    } catch (err) { return; }
    taken = [];
    for (i = 0; i < A.length; i++) {
      a = A[i];
      if (!a.animationName) continue;
      for (j = 0; j < B.length; j++) {
        if (taken[j]) continue;
        b = B[j];
        if (b.animationName !== a.animationName) continue;
        taken[j] = 1;
        try {
          if (typeof a.startTime === 'number') b.startTime = a.startTime;
          else b.currentTime = a.currentTime;
        } catch (err2) {}
        break;
      }
    }
  }

  /* the copy is laid out at the band's unscaled size and then given the band's
     own scale back, from its centre: getBoundingClientRect has the lift in it,
     offsetWidth/offsetHeight do not, and the difference between them is the
     lift. left/top place the copy's centre exactly on the cut */
  function copy(el, ow, oh, left, top, s) {
    var c = el.cloneNode(true);
    c.removeAttribute('id');
    c.removeAttribute('href');
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('tabindex', '-1');
    c.style.left = px(left);
    c.style.top = px(top);
    c.style.width = px(ow);
    c.style.height = px(oh);
    c.style.setProperty('--hatch-s', String(s));
    paint(el, c);
    return c;
  }

  /* one band into two boxes, in whichever document is asking: the page being
     left when a band opens, the page being returned to when one closes. It is
     deliberately the same function on both sides -- the halves that close are
     the halves that opened, to the half pixel, or the two ends of a round trip
     would not be the same two objects.

     Nobody is asked here whether the band was hot: it used to take that as an
     argument and pass it down to the copy, and the answer was a guess in both
     directions -- true for a click even if the pointer had only just arrived
     and the fill was a third of the way over, false for a forward button even
     when the cursor happened to be resting on the row. paint() reads what the
     band actually looks like in this frame instead, and a measurement cannot be
     wrong about either case.

     The boxes reach BLEED past the band on every side except the cut. The
     arithmetic of the seam is untouched by it: the copy's centre still lands on
     the box edge that is the seam, the travel below is still measured from the
     seam, and the extra pixels are on the side each half is leaving by */
  /* THE CUT ITSELF LANDS ON A WHOLE DEVICE PIXEL, and this is the one number in
     the file that is rounded on purpose. Everywhere else three decimals are
     kept for a reason (see px()), but the seam is not a position, it is an
     EDGE: it is where overflow:hidden stops the copy, and an edge at 40.5
     device pixels is captured as a row of half-covered pixels. For the first
     frames of an opening that row sits over the lead -- the strip of the new
     page the window has already uncovered and the half is meant to be hiding --
     so the half's own fill and the page behind it are mixed along the length of
     the band, and then unmixed as the half moves off: a hair that flickers
     exactly where the reader is looking. On the way home it is the same row,
     arriving. Rounded to the device grid the row is whole and there is nothing
     to mix.
     It costs nothing, because the copy does not move with it: the box edge goes
     to the grid, and the copy's offset inside the box is computed from the
     band's own place on the screen rather than from the box, so the two halves
     of the band still line up on the pixel the band was on. The most the seam
     can shift is half a device pixel, which is why the seam this returns is
     also the one written into --hatch-cx/--hatch-cy: the window's slit, the
     origin of the zoom and the end of the travel are then all on the same line
     as the cut, instead of half a pixel off it */
  function snap(n) {
    var d = window.devicePixelRatio || 1;
    if (!(d > 0)) d = 1;
    return Math.round(n * d) / d;
  }

  function split(el, dir) {
    var rect = el.getBoundingClientRect();
    var ow = el.offsetWidth, oh = el.offsetHeight;
    if (!ow || !oh || !seen(rect)) return null;
    var s = rect.width / ow;
    /* where the copy has to be put so that it stands exactly on the band: its
       unscaled box centred on the band's centre, since the lift is given back
       from the copy's own centre. Both are screen coordinates; the offset
       inside each box is this minus that box's own corner, and nothing in it
       depends on where the cut was rounded to */
    var bl = rect.left + (rect.width - ow) / 2;
    var bt = rect.top + (rect.height - oh) / 2;
    var a, b, seam;
    if (dir === 'v') {
      seam = snap(rect.top + rect.height / 2);
      a = box(rect.left - BLEED, rect.top - BLEED,
              rect.width + 2 * BLEED, seam - rect.top + BLEED, 'hatch-a');
      b = box(rect.left - BLEED, seam,
              rect.width + 2 * BLEED, rect.bottom + BLEED - seam, 'hatch-b');
      a.appendChild(copy(el, ow, oh, bl - rect.left + BLEED,
                         bt - rect.top + BLEED, s));
      b.appendChild(copy(el, ow, oh, bl - rect.left + BLEED, bt - seam, s));
    } else {
      seam = snap(rect.left + rect.width / 2);
      a = box(rect.left - BLEED, rect.top - BLEED,
              seam - rect.left + BLEED, rect.height + 2 * BLEED, 'hatch-a');
      b = box(seam, rect.top - BLEED,
              rect.right + BLEED - seam, rect.height + 2 * BLEED, 'hatch-b');
      a.appendChild(copy(el, ow, oh, bl - rect.left + BLEED,
                         bt - rect.top + BLEED, s));
      b.appendChild(copy(el, ow, oh, bl - seam, bt - rect.top + BLEED, s));
    }
    return { a: a, b: b, rect: rect, seam: seam };
  }

  /* the six lengths hatch.css is handed, out of one rectangle and the line the
     cut was actually made on. The seam replaces the middle of the band on the
     axis of the split and only there: the other four are the band's edges, and
     the horizontal window measures its slit from them */
  function geo(r, seam, dir) {
    var mid = typeof seam === 'number';
    return {
      cx: (dir === 'h' && mid) ? seam : r.left + r.width / 2,
      cy: (dir === 'v' && mid) ? seam : r.top + r.height / 2,
      x0: r.left, x1: r.right,
      y0: r.top, y1: r.bottom
    };
  }

  /* and into the page. The capture happens as soon as the handler that called
     this returns, and it has to be of this state and not the one before it:
     one read, one layout, no chance of the two halves being taken before they
     have a size */
  function mount(el, parts) {
    document.body.appendChild(parts.a);
    document.body.appendChild(parts.b);
    /* and now, and not a moment earlier: an animation does not exist until the
       element it is on is in the document and its style has been resolved, so
       the two copies have no clocks to set until they are in */
    sync(el, parts.a.firstChild);
    sync(el, parts.b.firstChild);
    /* the band leaves the picture: from here on the only band on the screen is
       the two halves, and what is underneath them is a band-shaped hole.
       opacity and not visibility, and the difference is only ever felt on the
       way home: closing, this is the LIVING document, the band stays hidden for
       the whole second the halves take to come back, and a hidden band is one
       nobody can press. visibility:hidden takes the box out of hit testing as
       well as out of the picture, so a reader who comes back and immediately
       reaches for the same row again -- which is the most ordinary thing to do
       -- would press a hole; at opacity 0 the row is still a link and answers
       at once, and the half over it is pointer-events:none so the press goes
       through to it. Nothing is drawn either way */
    el.style.opacity = '0';
    hidden = el;
    void parts.a.offsetHeight;
  }

  /* the band a return lands on has to be measured where it is going to be SEEN,
     and on a page being drawn for the first time it is in neither of the two
     states that make that true. index.html and biomedical.html give every row
     an entrance -- idx-rise, filled backwards -- whose first frame is ten
     pixels low, and the row is measured before that animation has had a single
     frame, so the seam, the halves and the whole closing clip would land ten
     pixels under the band, a third of its own height, and the band would jump
     up by that much at the moment of the swap, which is the moment being
     watched. glide.css is the other one: a pointer that never left the place
     the row is about to appear under has it three per cent large before it is
     visible. Both are pinned here, for the length of the transition only -- the
     row is invisible while it is pinned, so nothing of either is lost -- and
     handed back in undo(), where a hover that is still there resumes on glide's
     own .42s instead of appearing all at once */
  function pin(el, on) {
    if (!el) return;
    if (on) {
      el.style.animation = 'none';
      el.style.transition = 'none';
      el.style.scale = '1';
    } else {
      /* THE ENTRANCE IS NOT GIVEN BACK, and that is the difference between a
         return that ends and one that ends with a blink. animation-name going
         from none to idx-rise does not resume anything, it creates a new
         animation: the band would play its whole arrival -- ten pixels up, from
         nothing to opaque, over .55s -- starting in the frame the two halves
         come off it, which is the frame the reader is watching the band come
         back together. html.hatch-in says the same thing about every row of the
         document for the same reason (hatch.css, last rule), so this line is
         belt to that sheet's braces and holds even on a band that rule does not
         name. What IS given back is the transition and the lift: those are
         glide's, they are about the pointer and not about the arrival, and a
         hover still standing on the band resumes on its own .42s from here */
      el.style.animation = 'none';
      el.style.removeProperty('transition');
      el.style.removeProperty('scale');
    }
  }

  /* a band that is on the page but not on the screen, on the way home: the
     return still has to be a return. There are no halves to build -- two copies
     of a band nobody can see, travelling off an edge they are already past,
     are two objects nobody will ever look at -- so what is left is the page
     shrinking and the window closing on the seam, slid until its middle is
     inside the viewport: the page leaves by the edge the band is behind. The
     alternative was the one this replaces, skipping the transition outright,
     and a back button that answers on most pages and does nothing on the rest
     is two back buttons */
  function fit(r) {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    var cx = Math.min(Math.max(r.left + r.width / 2, 0), w);
    var cy = Math.min(Math.max(r.top + r.height / 2, 0), h);
    return { left: cx - r.width / 2, right: cx + r.width / 2,
             top: cy - r.height / 2, bottom: cy + r.height / 2,
             width: r.width, height: r.height };
  }

  /* the only thing that undoes any of it. Three occasions need it and they are
     all the same three lines: a transition that has finished in the document it
     was built in, a document coming back from the back/forward cache with its
     halves still pinned in mid-air, and a document being left again before its
     own transition was over -- that last one matters, because two elements with
     the same view-transition-name in one document is not a transition at all */
  function undo() {
    var halves = document.querySelectorAll('.hatch-half'), i;
    for (i = 0; i < halves.length; i++) {
      if (halves[i].parentNode) halves[i].parentNode.removeChild(halves[i]);
    }
    if (hidden) {
      hidden.style.removeProperty('opacity');
      pin(hidden, false);
      hidden = null;
    }
  }

  /* the whole of the leaving side, in a function of its own so that the
     listener below can stand guard over it: a throw halfway through -- a
     getComputedStyle that is not there, a clone the DOM refuses -- must not
     leave the page with a band hidden and one half built, because the capture
     happens the moment the handler returns and it captures whatever is there.
     The listener catches, undoes and skips; nothing here catches for itself */
  function swap(e, vt, el) {
    var body = document.body;
    var dir = body ? body.getAttribute('data-hatch') : null;
    if (!body || (dir !== 'v' && dir !== 'h') || reduced()) {
      vt.skipTransition();
      return;
    }
    undo();

    var act = e.activation;
    var dest = act && act.entry ? path(act.entry.url) : null;
    var chosen = el;

    if (chosen) {
      /* the click and the navigation are not necessarily the same thing: a
         redirect, a second click, a script sending the page elsewhere. If the
         document being opened is not the one the band pointed at, there is no
         band to split and the pages just change */
      if (dest && path(chosen.href) !== dest) { vt.skipTransition(); return; }
    } else if (act && act.navigationType === 'traverse' && dest) {
      /* nobody clicked: the back or forward button did. The band is the one
         this document has pointing where the history is going */
      chosen = bandTo(dest);
    }
    if (!chosen) { vt.skipTransition(); return; }

    /* a .back is a way out of this page and not a way into another one, so it
       closes. Nothing is cloned and nothing is hidden here: on the way back the
       band being closed into belongs to the document that is arriving, and this
       one has only to say which page it is closing from and which way up */
    if (chosen.matches && chosen.matches('.back')) {
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify({
          mode: 'close', dir: dir, from: path(window.location.href)
        }));
      } catch (err) {}
      return;
    }

    /* a row, opening. Whether it is lit is not decided here and not carried:
       the copy is taken from the band as it stands in this frame, so a click
       gets the fill the pointer had got it to and a forward button gets
       whatever the row looks like with nobody on it */
    var parts = split(chosen, dir);
    if (!parts) { vt.skipTransition(); return; }
    mount(chosen, parts);

    var g = geo(parts.rect, parts.seam, dir);
    g.mode = 'open';
    g.dir = dir;
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(g));
    } catch (err) {}
  }

  window.addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    var el = pressed;
    pressed = null;
    if (!vt) return;
    try {
      swap(e, vt, el);
    } catch (err) {
      /* whatever was half built comes down and the pages simply change. The
         key is not written on this path -- swap() writes it last, after
         everything that can throw -- so the page arriving finds nothing
         waiting and stays as instantaneous as any other load */
      undo();
      try { vt.skipTransition(); } catch (err2) {}
    }
  });

  /* ---- the geometry, in the page that is arriving ------------------------- */
  var TOKENS = ['--hatch-cx', '--hatch-cy', '--hatch-x0', '--hatch-x1',
                '--hatch-y0', '--hatch-y1'];
  var gen = 0;          /* which reveal the tokens on the root belong to */

  /* the word the page has been waiting for. Whatever stood aside for the length
     of the gesture starts again here, and it is said in the same callback that
     takes the halves off rather than a frame later: what was postponed is work,
     and work postponed to the frame AFTER a transition is a hitch at the end of
     it instead of one in the middle */
  function free() {
    document.documentElement.classList.remove('hatch-busy');
    try { window.dispatchEvent(new Event('hatch:end')); } catch (err) {}
  }

  /* the whole of the arriving side. Like swap() it is a function so that the
     listener can catch for it: this one runs before the first frame of a page
     that has just been parsed, and a throw here would leave the flag up, the
     types on and, closing, a band hidden under two halves nobody will take
     off. The listener below is the catch, and it is also the one place that
     guarantees free(): every ordinary way out of this function calls it by
     hand, and the catch calls it for the way out that was not planned */
  function reveal(e, vt) {
    /* read and burnt here before anything else can return, transition or no
       transition: it was written for the document that comes immediately after
       the swap, and a navigation that arrives without one -- a snapshot the UA
       dropped, a load slow enough to time it out -- would otherwise leave it
       lying in the tab with nothing to consume it */
    var raw = null;
    try {
      raw = window.sessionStorage.getItem(KEY);
      if (raw) window.sessionStorage.removeItem(KEY);
    } catch (err) {}

    /* EVERY WAY OUT OF HERE SAYS SO, and that is the other half of the flag
       raised at the top of this file. It goes up on the strength of a key in
       sessionStorage, which is a promise of a transition and not a transition:
       the snapshot may have been dropped, the load may have timed the gesture
       out, the reader may have reduced motion on, the geometry may be the wrong
       shape. Every one of those ends here, in the one handler that runs on any
       reveal there is, and each of them hands the page back before it returns.
       A flag that can be raised and not lowered is a page that never starts */
    if (!vt) { free(); return; }            /* an ordinary load: nothing to do */
    if (!raw || reduced()) { vt.skipTransition(); free(); return; }

    var s = null;
    try { s = JSON.parse(raw); } catch (err) {}
    if (!s || !vt.types || !vt.types.add) { vt.skipTransition(); free(); return; }

    /* the split axis is this document's own where it has one: closing, the band
       being split belongs to this page and not to the one that was left */
    var body = document.body;
    var own = body ? body.getAttribute('data-hatch') : null;
    var dir = (own === 'v' || own === 'h') ? own : s.dir;
    if (dir !== 'v' && dir !== 'h') { vt.skipTransition(); free(); return; }

    var shut = s.mode === 'close';
    var g = s;

    /* the types go on FIRST, before anything is measured or cloned, and that
       order is load bearing. hatch.css holds every band of this document at
       rest for as long as a type of this transition matches -- see the note
       there about the band the halves are landing on -- and the band about to
       be cloned is very often the one under the pointer. Adding the types after
       the measurement would measure a lit band, clone a lit band, and then put
       the living one back to rest underneath it. They are added before the
       remaining ways out, and every one of those calls skipTransition(), which
       ends the transition and takes the types with it */
    /* AND THE CLASS THAT IS NOT FOR CSS AT ALL goes on in the same breath,
       before the first of the types and therefore before anything of this
       gesture has been measured, cloned or drawn. It says that a hatch is
       running in this document right now, and it is there for the one thing
       hatch.css admits it cannot fix: the window is a clip-path, clip-path is
       not a compositor property in Blink, and the clip therefore ticks on the
       main thread of THIS page -- the page that has just been parsed, while it
       decodes its images, settles its fonts and starts whatever it starts. The
       two halves are transforms and sail straight through a stall; the window
       stops dead with it, and the two coming apart for two frames and catching
       up in the third is exactly the stutter that was being reported. The lead
       covers eight pixels of it and no more.
       So the arriving page is asked to be quiet while the gesture is on.
       assets/js/mesh-field.js is the only thing here big enough to matter and
       the only one we own: it reads this class before it builds its lattice,
       before it fetches its quotations and on every pointermove, and waits for
       the hatch:end event free() fires instead. It is a class and an event
       rather than a global so that anything else -- a viewer, a gallery,
       something not written yet -- can take the same hint without this file
       having to know about it. No stylesheet selects it.
       It is usually already up: the head of this file raises it on the strength
       of the key in sessionStorage, which is earlier than any script of the
       page can run and the only moment early enough for a deferred one. This is
       the second lock on the same door, for the reveal that got here without
       one -- a key written while storage was full, a document whose first
       script was this one */
    document.documentElement.classList.add('hatch-busy');

    vt.types.add('hatch');
    vt.types.add(shut ? 'hatch-close' : 'hatch-open');
    vt.types.add('hatch-' + dir);

    if (shut) {
      /* the halves are built here instead, in the live document, in the last
         moment before it is first drawn: the band they close onto is this
         page's own -- the row that was pressed to leave it -- and the geometry
         is measured off it rather than carried. The <link rel="expect"
         blocking="render"> in the head holds that first frame until the page is
         whole, so there is a laid-out band here to measure */
      var el = body ? bandTo(s.from) : null;
      /* held still and at rest first, or it is measured mid-entrance and three
         per cent large: see pin() */
      pin(el, true);
      var parts = el ? split(el, dir) : null;
      var r = null, seam = null;
      if (parts) {
        mount(el, parts);
        r = parts.rect;
        seam = parts.seam;
      } else if (el) {
        /* the band is there but off the screen -- a page restored scrolled, a
           row that was near the bottom edge at 375px. The close runs anyway,
           on the seam brought back inside the viewport and without halves */
        r = fit(el.getBoundingClientRect());
        pin(el, false);
      } else {
        vt.skipTransition();
        free();
        return;
      }
      g = geo(r, seam, dir);
    }
    if (typeof g.cx !== 'number' || typeof g.cy !== 'number') {
      undo();
      vt.skipTransition();
      free();
      return;
    }

    /* written on the root before the first frame, which is the whole reason
       this file is not deferred: pagereveal is the last moment there is */
    var st = document.documentElement.style;
    st.setProperty('--hatch-cx', px(g.cx));
    st.setProperty('--hatch-cy', px(g.cy));
    st.setProperty('--hatch-x0', px(g.x0));
    st.setProperty('--hatch-x1', px(g.x1));
    st.setProperty('--hatch-y0', px(g.y0));
    st.setProperty('--hatch-y1', px(g.y1));

    /* the entrances of this page do not run inside the window: the window
       opening is the entrance. It goes on here, after the last way out, and it
       is never taken off again -- hatch.css carries the whole of that argument.
       pagereveal is before the first frame, so no row is ever seen rising */
    var root = document.documentElement;
    root.classList.add('hatch-in');
    /* hatch-busy is not raised here. It went up two ways before this point --
       in the head of this file, off the key, which is the only moment early
       enough for a script that is deferred, and again above with the types --
       and both of them are before the first frame, which is what it is for */
    /* which transition the tokens on the root belong to. A document can live
       through two of these -- a back/forward-cache restore comes back to the
       same document and reveals again -- and the late clean-up below must not
       reach into the one that came after it */
    gen++;
    var mine = gen;

    /* THE LAST FRAME, which is the other half of what was being reported, and
       the order below is the whole of the answer to it.
       Closing, this is where the halves come off and the band comes back: they
       are two copies of the same object landing on it, and one frame showing
       both of them, or neither, is one frame too many. So it is one callback,
       in the microtask after finished resolves, which is inside the frame the
       transition ended in and before anything is drawn again -- the band comes
       back in the same paint the halves go out of. It is also the frame in
       which the types stop matching, so the pin coming off and hatch.css
       letting go of the hover happen together: the band is handed to glide.css
       in one piece, at rest, with its .42s to run.
       WHAT IS NO LONGER IN THAT FRAME IS THE CLEAN-UP. The six --hatch-* tokens
       are custom properties on the root element, and custom properties are
       inherited: taking one off the root invalidates the computed style of
       every element under it that reads any variable at all, which on this site
       is all of them, and on projects.html that is nineteen cards and their
       nineteen viewers restyled in the one frame that has to be perfect. That
       recalculation was landing on the frame the halves close in. Nobody is
       waiting for those six lengths to go -- the pseudo tree that read them no
       longer exists, and the next reveal overwrites them before it needs them
       -- so they are dropped when the page is next idle, a second later if need
       be, and the generation counter is there because a second reveal may have
       come and gone by then */
    var done = function () {
      undo();
      free();
      var drop = function () {
        if (gen !== mine) return;
        for (var i = 0; i < TOKENS.length; i++) st.removeProperty(TOKENS[i]);
      };
      if (window.requestIdleCallback) window.requestIdleCallback(drop, { timeout: 1000 });
      else window.setTimeout(drop, 300);
    };
    vt.finished.then(done, done);
  }

  window.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    try {
      reveal(e, vt);
    } catch (err) {
      /* the way out that was not planned: halves off, band back, transition
         skipped, and the page handed back to itself. All three are safe to
         repeat -- if reveal() got as far as vt.finished before it threw, done()
         will run the same three lines again on a document that has nothing
         left to undo, and hatch:end fired twice wakes nothing twice, because
         everything that waits on it waits once */
      undo();
      if (vt) { try { vt.skipTransition(); } catch (err2) {} }
      free();
    }
  });

  /* ---- coming back -------------------------------------------------------
     A document restored from the back/forward cache comes back exactly as it
     was left: two halves pinned in mid-air and a band that is not there. This
     is where that is undone, and it happens before the pagereveal above -- the
     restore delivers pageshow while the page is being activated and pagereveal
     at the first frame after it -- so a page coming back into a closing
     transition is already clean when its own halves are built on top of it. */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    undo();
    pressed = null;
    /* and the flag with them: a document left in the middle of its own gesture
       comes back with hatch-busy still on it and nothing left to resolve it,
       and everything that stood aside for it would stand aside for good. This
       runs before the reveal that may follow, which puts it back on */
    free();
  });
})();
