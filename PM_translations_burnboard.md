# PM translations — BurnBoard

Simple one-liners explaining what the tech does. No jargon dumps.

---

- **Smoke test** (`burnboard.smoke.js`) — a check that opens the real product and confirms it boots, instead of testing the parts separately. Catches "the app won't even open" bugs that piece-by-piece tests miss.
- **Unit tests** (`burnboard.test.js`) — check that each calculation (token math, insight triggers, billing cycles) gives the right answer on its own.
- **Inline single-file app** (`burnboard.html`) — the whole product (look, logic, storage) lives in one file you open in Chrome. No server, no install.
