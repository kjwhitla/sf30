# Browser payload recovery status

The browser payload currently committed under `bootstrap/` is **incomplete** and must not be treated as the canonical runnable v0.4.3 browser source.

## Verified diagnosis

The branch contains exactly six Base64 chunks:

- `ui.b64.part-00`
- `ui.b64.part-01`
- `ui.b64.part-02`
- `ui.b64.part-03`
- `ui.b64.part-04`
- `ui.b64.part-05`

Each chunk is exactly 3,000 bytes. Combined, they decode to a 13,500-byte gzip stream that terminates with `unexpected end of file`.

A salvage extraction proves the beginning of the archive is valid and contains complete entries for:

- `index.html` — 351 bytes
- `web/app.js` — 19,026 bytes
- `web/styles.css` — 9,336 bytes
- `assets/playtest/sheets/dice.jpg` — 3,031 bytes
- `assets/playtest/sheets/iron-wake-units.jpg` — 8,816 bytes

The archive then ends before its remaining entries are available. No package manifest or complete asset set can be recovered from the committed payload.

## Required recovery

Recover the missing continuation/final chunk(s), or re-export the verified v0.4.3 browser package from the original local artifact. Once a complete archive is available:

1. validate the archive to EOF;
2. verify the browser reports `APP_VERSION = 0.4.3`;
3. commit the browser source/assets as ordinary Git-tracked files;
4. add a browser smoke check to CI;
5. remove the Base64 browser transport.

Do not invent or recreate missing browser assets from memory. The existing v0.4.3 artifact is the required source of truth.
