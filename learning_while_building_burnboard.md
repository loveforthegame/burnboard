# Learning while building — BurnBoard

Plain-language notes on what we learned, one entry per thing worth remembering.

---

## The blank-screen bug — green tests, dead app
Opening the app showed a totally blank page. Cause: the app's built-in self-test ran at the very top of the code and tried to use a setting (`_cfg`) before that setting was created further down. JavaScript treats "use before it exists" as a fatal error, so the whole app stopped before drawing anything. Only the background color showed.

**Why it mattered:** every automated check was green, yet the product didn't even open. The tests checked *copies* of the logic, never the real file starting up in a browser. Green tests are not the same as a working product.

**The lesson:** for anything that runs in a browser, one check must actually start the *real* file and confirm it shows something — not just test the pieces in isolation. We added a committed smoke test (`burnboard.smoke.js`) that does exactly this, and the tester agent now runs it every phase.

---

## Framer Motion is React-only — use `motion` (the vanilla DOM port) instead
The user asked for Framer Motion animations. Framer Motion only works inside a React component tree. The vanilla equivalent from the same author (Matt Perry) is the `motion` npm package — same animation API, no React needed. Load it via CDN as `motion@11` and it exposes a global `Motion` with `Motion.animate()`, `Motion.stagger()`, etc.

**Why it mattered:** burnboard is a single HTML file with zero build tooling. Using Framer Motion would have required adding React. Using `motion` (CDN script tag) added spring animations with zero new dependencies beyond the script tag.

---

## CSS animations and Web Animations API fight over the same property
When a CSS animation (via keyframes on a class) and a JS animation (via `Motion.animate` / Web Animations API) both try to animate `opacity` or `transform` on the same element, the Web Animations API wins and the CSS animation is silently cancelled. This is by spec — WA API has higher composite order than CSS animations.

**Why it mattered:** attempting to use `Motion.stagger()` on dashboard cards while they also had `.au` CSS animations caused the stagger to work but made the CSS animation invisible. Solution: pick one system per element — use CSS for card entrance animations, use Motion only for interactive transitions (session row expand/collapse) where CSS can't easily handle it.

---

## The toast centering bug hiding in plain sight
The toast used `transform:translateX(-50%)` in its base CSS to center itself, then applied `animation:fadeUp` on show. `fadeUp` keyframes set `transform:translateY(6px)` → `translateY(0)`. CSS animation overrides ALL of the transform property, so `translateX(-50%)` was replaced during the animation. After `animation-fill-mode:forwards` locked in `translateY(0)`, the centering was permanently lost.

**Why it mattered:** the shift was subtle (toast was close to centered anyway due to fixed bottom position) so nobody caught it. Fix: write the toast keyframes to include both transforms: `translateX(-50%) translateY(14px)` → `translateX(-50%) translateY(0)`.

---

## Exit animations need a fallback when `prefers-reduced-motion` kills the animation
Adding a CSS exit animation (`.hide` class triggers `toastOut` keyframe) and listening for `animationend` to clean up classes works great — unless the user has `prefers-reduced-motion: reduce` set. The CSS `animation:none !important` kills the animation, so `animationend` never fires, and the toast gets stuck permanently visible.

**Why it mattered:** the fix is one extra check — `if (reducedMotion) { remove classes directly; } else { add .hide, wait for animationend }`. Always have a non-animation path when cleanup depends on `animationend`.
