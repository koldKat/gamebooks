# Gamebooks — Claude Rules

These rules are non-negotiable and apply every session without exception.

---

## 1. No cache-busting version strings — do not add them back

Static `.js`/`.css` are served with `Cache-Control: no-cache` (`server/static.js`) — the browser always revalidates with the server (ETag-backed 304 if unchanged), so a plain refresh already picks up any change. There is deliberately no `?v=N` query string anywhere in `public/`/`admin/` and no version-bumping step after an edit. (Removed 2026-08-23 — the app previously used `Cache-Control: public, max-age=3600` for JS/CSS, which needed a global `?v=N` cascade bumped across ~150 files on every change to force a fresh fetch within the hour; switching to `no-cache` made the whole scheme unnecessary.)

## 2. Never restart the server

NEVER run `node server.js`, `pm2 restart`, `kill`, or any equivalent. The user handles all server restarts. After server-side changes just say "restart the server to apply."

## 3. SVG icon pack processing

New packs are always in `~/Downloads`. Do not look elsewhere.

Processing rules:
1. **Invert colors** — replace ALL `fill` attributes (except `fill="none"`) with `fill="#ffffff"`. Root AND all child elements.
2. **Strip** `width`, `height`, `id`, `data-name`, `enable-background` attributes.
3. **Skip Flaticon files** — filenames containing "flaticon" are license/font files, skip them.
4. **No overwrites** — if name exists in DB, append ` 2`, ` 3`, etc.
5. **Valid types only**: `weapon`, `armor`, `consumable`, `tool`, `jewelry`, `miscellaneous`. Default unknown items to `tool`. There is NO `other` type.
6. **Run import scripts from the project root** — `better-sqlite3` is in the project's `node_modules`.

## 4. No monolithic files — module placement rules

`main.js` is a 10,000+ line monolith being actively split. Do NOT add significant new code to it. Full refactor plan is in memory file `project_refactor_main.md`.

**Where new code goes:**
- New self-contained UI (modal, panel, widget) → new `.js` module from day one, never lands in main.js
- Extends an already-extracted module's domain → add to that module
- Genuinely cross-cutting and small (<30 lines) → main.js temporarily, marked `// TODO: move to <module>`
- Never "add to main.js and sort later" without that marker

**Two-sentence test before writing any code:**
1. "This belongs in `X.js` because X is responsible for ___"
2. "If I removed X.js tomorrow, this feature would go with it"
If both can't be answered cleanly → new module, or wrong module.

**Preventing module drift:**
- Each module's header comment states its one responsibility in one sentence
- Before adding to an existing module: does this match that responsibility? If no → it doesn't go there
- If wiring a new feature requires adding multiple unrelated hooks to an existing module, it belongs elsewhere

## 5. Refactor safety — mandatory pre-flight for every extraction

Before moving ANY function out of main.js:

1. **Edit tool only** — never python3/sed line-range scripts to delete code
2. **Unfiltered grep for every function being moved:**
   ```bash
   grep -n "functionName" public/js/main.js
   ```
   No exclusions. Read every result. Definition = being removed. Call site outside the block = must be exported + imported. Do this for EVERY function, not just the ones you expect to be called externally.
3. **Orphan check after extraction:**
   ```bash
   grep -oP "addEventListener\('click', \K[a-zA-Z_][a-zA-Z0-9_]*(?=\))" public/js/main.js | sort -u | while read fn; do
     grep -q "function $fn\b\|import.*\b$fn\b" public/js/main.js || echo "MISSING: $fn"
   done
   ```
4. **Syntax check before declaring done:**
   ```bash
   node --input-type=module --check < public/js/main.js
   ```

## 6. Read-only means visible-but-disabled, not hidden

When the user says a panel/feature "should be read only" outside some condition, that means visible with actions disabled — NOT hidden. Conflating these caused a major regression.

## 7. Documentation is generated — never hand-edit the HTML docs

`docs/user-guide.md`, `docs/admin.md`, and `docs/technical.md` are the only source of truth. `public/guide.html`, `admin/admin-guide.html`, and `admin/technical.html` are generated from them by `npm run docs:build` (`scripts/generate-docs.js`) — never edit those three `.html` files directly, edits will be silently lost the next time someone runs the build.

After editing any `docs/*.md` file, run `npm run docs:build` before declaring the task done. Run `npm run docs:check` to verify the HTML is current without regenerating it.

---

## Tech stack quick reference

- **DB**: SQLite via `better-sqlite3`, path: `database.sqlite` in project root
- **Server**: `server.js`, plain Node.js, no framework
- **Frontend**: ES modules, served with `Cache-Control: no-cache` — no version query strings
- **State**: per-user per-book JSON in `user_books.state_data`
- **Valid item types**: `weapon`, `armor`, `consumable`, `tool`, `jewelry`, `miscellaneous`
