/* ---------------------------------------------------------------------------
   Strike
   The one thing the hover on this site could not do was survive being left. A
   :hover transition belongs to the pointer: cross a band in eighty milliseconds
   and the move is half played and then played backwards, which is the stutter
   down the list. So the move is no longer a state. It is an impulse -- two
   keyframe animations, started by one class the moment the pointer crosses an
   edge and taken off again by their own animationend -- and once they have
   started nothing can stop them. The pointer is three bands further down and the
   first band is still answering.

   This file does two small things. It writes the point where the pointer came in
   into --kx/--ky, which is where the fill opens from and what makes no two
   passes alike, and it puts the class on. Both happen on a pointerover delegated
   from the document: no listener per element, no work per frame, and a page
   nobody touches pays for four event listeners and not one line more. The
   gesture itself is all in the stylesheet; without this file every surface still
   has its held state, it simply opens from its own middle and without the ring.

   Off for reduced motion, and off on any page whose <body> does not say
   data-hover="strike", so the attribute alone still reverts the whole variant.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !body.closest) return;
  if (body.getAttribute('data-hover') !== 'strike') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* the same list the stylesheet strikes, for the same reason: a surface with a
     box. Text links have no box, the 15 px pins have no room, the model-viewers
     must not be touched at all, and .step is prose with a :hover and no click */
  var SURFACE = '.row,.back,.pdf,.feature .links a,.tile,.paper,.gallery li,' +
                '.avatar-btn,.mv-zoom button,.ov-btn,.grp-close,.mv-parts button,' +
                '.surf button,.shots button';
  var HIT = 'is-struck';

  function surface(node) {
    return node && node.closest ? node.closest(SURFACE) : null;
  }

  /* A surface still answering is left to answer. This is the whole of re-entry:
     no clock is ever put back to zero, because a strike restarted from its first
     keyframe would jump the band from where it stands down to nothing in one
     frame -- and a pointer that leaves a row and comes straight back is the
     commonest thing a pointer does on a short list. A release counts as
     answering too: it is a transition, it has no animationName, and it is
     exactly the case a check on names alone would miss. Only the entrance is
     ignored, because being born is not an answer. */
  function busy(el) {
    var live = el.getAnimations ? el.getAnimations() : null, i, a;
    if (!live) return false;
    for (i = 0; i < live.length; i++) {
      a = live[i];
      if (a.animationName === 'idx-rise') continue;
      if (a.playState === 'finished') continue;
      return true;
    }
    return false;
  }

  /* where it was touched, as a share of its own box. The rectangle is read once
     per arrival and never per frame */
  function strike(el, e) {
    if (busy(el)) return;
    if (e) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      el.style.setProperty('--kx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--ky', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    } else {
      /* the keyboard has no point of entry: out of the middle, which is also what
         a page with no script does */
      el.style.removeProperty('--kx');
      el.style.removeProperty('--ky');
    }
    el.classList.add(HIT);
  }

  document.addEventListener('pointerover', function (e) {
    var el = surface(e.target);
    if (!el) return;
    /* pointerover fires again for every child underneath: only the crossing of
       the surface's own edge counts as having arrived */
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    strike(el, e);
  }, true);

  document.addEventListener('focusin', function (e) {
    var el = surface(e.target);
    if (!el) return;
    try { if (!el.matches(':focus-visible')) return; } catch (err) { return; }
    strike(el, null);
  }, true);

  /* a press is now, not in 520 ms: the impulse steps aside so :active owns the
     size for as long as the button is down. A tap is left alone -- a finger gets
     no hover afterwards, so the strike is the whole of its answer */
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    var el = surface(e.target);
    if (el) el.classList.remove(HIT);
  }, true);

  /* and the impulse ends itself. With the class gone the surface falls back on
     what the stylesheet declares: the same size and the same opening if the
     pointer stayed, so nothing moves at all, or the resting ones if it left,
     which is the release */
  document.addEventListener('animationend', function (e) {
    if (e.pseudoElement || e.animationName !== 'k-strike') return;
    if (e.target && e.target.classList) e.target.classList.remove(HIT);
  }, true);
})();