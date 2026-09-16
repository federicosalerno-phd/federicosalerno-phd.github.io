/* ---------------------------------------------------------------------------
   Hatch -- the two halves of the band that was chosen, and the geometry of the
   window that opens between them. The movement itself is in
   assets/css/hatch.css; this file only does the three things CSS cannot know.

   ONE. Which band was clicked. A cross-document view transition has no idea
   what started the navigation, and the whole gesture is built on the position
   of one band, so the click is remembered -- the element, nothing else, no
   preventDefault, no timer. The link stays a link: ctrl-click opens a tab and
   never reaches pageswap in this document, the middle button is not ours, and a
   navigation that turns out not to match the band that was clicked is dropped
   at the door.

   TWO. The halves, built at pageswap, one frame before the browser takes its
   snapshot of the page being left. Each is a fixed box with overflow:hidden, as
   tall or as wide as half the band, holding a full copy of the band positioned
   so its middle lands on the cut; the snapshot of such a box is its content
   clipped, so each box IS one half without anything having been cut by hand.
   The copy has to be the band as it stood under the pointer -- the hover fill,
   the grown dot, the 1.03 lift -- or the band changes at the instant it splits,
   which is the one instant everybody is looking at it. The real band is then
   hidden, so the page's own snapshot has a band-shaped hole in it: the hole is
   covered by the two halves at the start and by the window ever after.

   THREE. The geometry, carried to the next document through sessionStorage,
   because the two documents share nothing else and the arriving page has to
   know where on the screen the band was before it paints anything. It is read
   and deleted at pagereveal, before the first frame; that is also the flag that
   says this navigation is a hatch. Anything with no geometry waiting for it --
   the back button, a footer link, an address typed by hand, a page opened from
   somewhere else -- is skipped there and stays as instantaneous as it is today.

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

  function reduced() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function px(n) { return n.toFixed(2) + 'px'; }

  /* ---- which band ---------------------------------------------------------
     In capture, so it is read before anything downstream can cancel it, and it
     changes nothing about the event: the navigation is the browser's, at its
     own moment, and this only writes down what it was aimed at. Every case a
     browser would treat differently -- another tab, a download, another origin,
     a modifier held down -- leaves pressed empty and gets no transition. */
  document.addEventListener('click', function (e) {
    pressed = null;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !a.matches || !a.matches(BAND)) return;
    if (a.target || a.hasAttribute('download')) return;
    if (a.origin !== window.location.origin) return;
    pressed = a;
  }, true);

  /* ---- the halves --------------------------------------------------------- */
  function box(hot, left, top, w, h, name) {
    var d = document.createElement('div');
    d.className = 'hatch-half' + (hot ? ' is-hot' : '');
    d.setAttribute('aria-hidden', 'true');
    d.style.left = px(left);
    d.style.top = px(top);
    d.style.width = px(w);
    d.style.height = px(h);
    d.style.viewTransitionName = name;
    return d;
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
    return c;
  }

  window.addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    if (!vt) { pressed = null; return; }
    var el = pressed;
    pressed = null;

    var body = document.body;
    var dir = body ? body.getAttribute('data-hatch') : null;
    if (!el || (dir !== 'v' && dir !== 'h') || reduced()) {
      vt.skipTransition();
      return;
    }
    /* the click and the navigation are not necessarily the same thing: a
       redirect, a second click, a script sending the page elsewhere. If the
       document being opened is not the one the band pointed at, there is no
       band to split and the pages just change */
    if (e.activation && e.activation.entry &&
        e.activation.entry.url !== el.href) {
      vt.skipTransition();
      return;
    }

    var rect = el.getBoundingClientRect();
    var ow = el.offsetWidth, oh = el.offsetHeight;
    if (!rect.width || !rect.height || !ow || !oh) { vt.skipTransition(); return; }
    var s = rect.width / ow;
    /* :focus-visible as well as :hover, because the site makes no difference
       between them: the chosen fill, the 1.03 lift and the grown dot answer to
       both (glide.css, and the inline rules of every page), and Tab + Enter
       reaches the click handler above exactly like a pointer does. One call
       with both, so an engine that does not know the second throws on the whole
       selector -- and :hover on its own is still worth asking for */
    var hot = false;
    try { hot = el.matches(':hover,:focus-visible'); }
    catch (err) { try { hot = el.matches(':hover'); } catch (err2) {} }

    var a, b;
    if (dir === 'v') {
      a = box(hot, rect.left, rect.top, rect.width, rect.height / 2, 'hatch-a');
      b = box(hot, rect.left, rect.top + rect.height / 2,
              rect.width, rect.height / 2, 'hatch-b');
      a.appendChild(copy(el, ow, oh, (rect.width - ow) / 2,
                         rect.height / 2 - oh / 2, s));
      b.appendChild(copy(el, ow, oh, (rect.width - ow) / 2, -oh / 2, s));
    } else {
      a = box(hot, rect.left, rect.top, rect.width / 2, rect.height, 'hatch-a');
      b = box(hot, rect.left + rect.width / 2, rect.top,
              rect.width / 2, rect.height, 'hatch-b');
      a.appendChild(copy(el, ow, oh, rect.width / 2 - ow / 2,
                         (rect.height - oh) / 2, s));
      b.appendChild(copy(el, ow, oh, -ow / 2, (rect.height - oh) / 2, s));
    }
    body.appendChild(a);
    body.appendChild(b);
    /* the band leaves the page's own snapshot: from here on the only band on
       the screen is the two halves */
    el.style.visibility = 'hidden';
    hidden = el;
    /* the snapshot is taken as soon as this handler returns, and it has to be
       taken of this state and not the one before it: one read, one layout, no
       chance of the two halves being captured before they have a size */
    void a.offsetHeight;

    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({
        dir: dir,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        x0: rect.left, x1: rect.right,
        y0: rect.top, y1: rect.bottom
      }));
    } catch (err) {}
  });

  /* ---- the geometry, in the page that is arriving ------------------------- */
  var TOKENS = ['--hatch-cx', '--hatch-cy', '--hatch-x0', '--hatch-x1',
                '--hatch-y0', '--hatch-y1'];

  window.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;

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

    if (!vt) return;                       /* an ordinary load: nothing to do */
    if (!raw || reduced()) { vt.skipTransition(); return; }

    var g = null;
    try { g = JSON.parse(raw); } catch (err) {}
    if (!g || (g.dir !== 'v' && g.dir !== 'h') || !vt.types || !vt.types.add) {
      vt.skipTransition();
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

    vt.types.add('hatch');
    vt.types.add('hatch-' + g.dir);

    /* and taken off again the moment the pseudo tree is gone, so a page that is
       sitting still carries nothing from the way it was opened */
    var clear = function () {
      for (var i = 0; i < TOKENS.length; i++) st.removeProperty(TOKENS[i]);
    };
    vt.finished.then(clear, clear);
  });

  /* ---- coming back -------------------------------------------------------
     A document restored from the back/forward cache comes back exactly as it
     was left: two halves pinned in mid-air and a band that is not there. This
     is the only way that state can ever be seen, and it is the only thing that
     undoes it. */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var halves = document.querySelectorAll('.hatch-half');
    for (var i = 0; i < halves.length; i++) {
      if (halves[i].parentNode) halves[i].parentNode.removeChild(halves[i]);
    }
    if (hidden) { hidden.style.removeProperty('visibility'); hidden = null; }
    pressed = null;
  });
})();
