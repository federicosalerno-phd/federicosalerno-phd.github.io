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

  function reduced() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function px(n) { return n.toFixed(2) + 'px'; }

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

  /* :focus-visible as well as :hover, because the site makes no difference
     between them: the chosen fill, the 1.03 lift and the grown dot answer to
     both (glide.css, and the inline rules of every page), and Tab + Enter
     reaches the click handler above exactly like a pointer does. One call with
     both, so an engine that does not know the second throws on the whole
     selector -- and :hover on its own is still worth asking for */
  function warm(el) {
    try { return el.matches(':hover,:focus-visible'); }
    catch (err) { try { return el.matches(':hover'); } catch (err2) {} }
    return false;
  }

  /* one band into two boxes, in whichever document is asking: the page being
     left when a band opens, the page being returned to when one closes. It is
     deliberately the same function on both sides -- the halves that close are
     the halves that opened, to the half pixel, or the two ends of a round trip
     would not be the same two objects */
  function split(el, dir, hot) {
    var rect = el.getBoundingClientRect();
    var ow = el.offsetWidth, oh = el.offsetHeight;
    if (!ow || !oh || !seen(rect)) return null;
    var s = rect.width / ow;
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
    return { a: a, b: b, rect: rect };
  }

  /* and into the page. The capture happens as soon as the handler that called
     this returns, and it has to be of this state and not the one before it:
     one read, one layout, no chance of the two halves being taken before they
     have a size */
  function mount(el, parts) {
    document.body.appendChild(parts.a);
    document.body.appendChild(parts.b);
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
      el.style.removeProperty('animation');
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

  window.addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    var el = pressed;
    pressed = null;
    if (!vt) return;

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

    /* a row, opening. Hot only if it was actually pressed: a forward button
       repeating an old click is not a finger on a band, and a band that lights
       up under nobody's pointer is a band that lights up on its own */
    var parts = split(chosen, dir, el ? warm(chosen) : false);
    if (!parts) { vt.skipTransition(); return; }
    mount(chosen, parts);

    var rect = parts.rect;
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({
        mode: 'open',
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

    var s = null;
    try { s = JSON.parse(raw); } catch (err) {}
    if (!s || !vt.types || !vt.types.add) { vt.skipTransition(); return; }

    /* the split axis is this document's own where it has one: closing, the band
       being split belongs to this page and not to the one that was left */
    var body = document.body;
    var own = body ? body.getAttribute('data-hatch') : null;
    var dir = (own === 'v' || own === 'h') ? own : s.dir;
    if (dir !== 'v' && dir !== 'h') { vt.skipTransition(); return; }

    var shut = s.mode === 'close';
    var g = s;

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
      var parts = el ? split(el, dir, false) : null;
      var r = null;
      if (parts) {
        mount(el, parts);
        r = parts.rect;
      } else if (el) {
        /* the band is there but off the screen -- a page restored scrolled, a
           row that was near the bottom edge at 375px. The close runs anyway,
           on the seam brought back inside the viewport and without halves */
        r = fit(el.getBoundingClientRect());
        pin(el, false);
      } else {
        vt.skipTransition();
        return;
      }
      g = {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        x0: r.left, x1: r.right,
        y0: r.top, y1: r.bottom
      };
    }
    if (typeof g.cx !== 'number' || typeof g.cy !== 'number') {
      undo();
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
    vt.types.add(shut ? 'hatch-close' : 'hatch-open');
    vt.types.add('hatch-' + dir);

    /* and taken off again the moment the pseudo tree is gone, so a page that is
       sitting still carries nothing from the way it was opened. Closing, this
       is also where the halves come off and the band comes back: they are two
       copies of the same object landing on it, and one frame with both of them
       showing is one frame too many, so it is the same callback for both */
    var done = function () {
      for (var i = 0; i < TOKENS.length; i++) st.removeProperty(TOKENS[i]);
      if (shut) undo();
    };
    vt.finished.then(done, done);
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
  });
})();
