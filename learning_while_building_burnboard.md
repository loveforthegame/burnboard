# Learning while building — BurnBoard

Plain-language notes on what we learned, one entry per thing worth remembering.

---

## The blank-screen bug — green tests, dead app
Opening the app showed a totally blank page. Cause: the app's built-in self-test ran at the very top of the code and tried to use a setting (`_cfg`) before that setting was created further down. JavaScript treats "use before it exists" as a fatal error, so the whole app stopped before drawing anything. Only the background color showed.

**Why it mattered:** every automated check was green, yet the product didn't even open. The tests checked *copies* of the logic, never the real file starting up in a browser. Green tests are not the same as a working product.

**The lesson:** for anything that runs in a browser, one check must actually start the *real* file and confirm it shows something — not just test the pieces in isolation. We added a committed smoke test (`burnboard.smoke.js`) that does exactly this, and the tester agent now runs it every phase.
