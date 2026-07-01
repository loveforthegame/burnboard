# PM translations — BurnBoard

Simple one-liners explaining what the tech does. No jargon dumps.

---

- **Smoke test** (`burnboard.smoke.js`) — a check that opens the real product and confirms it boots, instead of testing the parts separately. Catches "the app won't even open" bugs that piece-by-piece tests miss.
- **Unit tests** (`burnboard.test.js`) — check that each calculation (token math, insight triggers, billing cycles) gives the right answer on its own.
- **Inline single-file app** (`burnboard.html`) — the whole product (look, logic, storage) lives in one file you open in Chrome. No server, no install.
- **Motion (`motion@11` CDN)** — the animation library behind Framer Motion, but rewritten to work without React. Loaded as a script tag; gives every animation a spring-physics feel with two lines of JS.
- **Web Animations API** — the browser's built-in way for JavaScript to animate elements. Takes priority over CSS animations when both target the same thing. Motion uses it under the hood.
- **`prefers-reduced-motion`** — a system setting users can turn on to ask apps to cut the animations. Good UI respects it; breaking it means some users see broken or stuck UI elements instead of no animation.
