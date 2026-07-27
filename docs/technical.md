# Gamebook Tracker - Technical Reference

---

## Project structure

```
gamebooks/
  server.js          Thin entrypoint: requires + Router (regex dispatch) + httpServer.listen(...)
  package.json       Single dependency: better-sqlite3
  database.sqlite    SQLite database (auto-created on first run, git-ignored)
  server/
    db.js            Barrel: schema/migrations (kept in original order) + re-exports server/db/*
    db/
      connection.js    The single better-sqlite3 instance, hasColumn, string/search helpers
      content.js       Small getters: tagline/level-up/join templates
      auth.js          Password hashing, users, sessions, password reset, lockouts
      xp.js            TITLES, computeLevel/awardXp/awardCoins, processStateXp, xp_config
      books.js         Books/user_books/stashes/series/series_runs CRUD + ratings
      feed.js          getFeed(), public-listing/sitemap helpers, public profile/run views
      admin.js         Admin CRUD (users/books/tips/items/series/settings/announcements/shop)
      forum.js         Forum thread/post data layer (distinct from server/forum.js SSR renderer)
      parties.js       Play Together party functions
      feedback.js      Feedback thread messaging + attachments
      misc.js          Notifications, impersonation tokens, export-for-backup helpers
    paths.js         ROOT/AVATARS_DIR/COVERS_DIR/BOOKS_DIR/ATTACHMENTS_DIR constants
    sse.js           SSE broadcast registries (party/public-catalog/feed/app-xp/user-badge)
    email.js         Nodemailer transporter, sendAdminEmail, sendReplyEmail
    request-helpers.js  send/readBody/authenticate, security headers, rate limiting
    runtime-state.js   Maintenance mode, traffic counters, CPU/mem averages, uptime/process lifecycle
    static.js        Static file server (etag/cache-control) + XML sitemap
    forum.js         Forum SSR page rendering (index/category/thread HTML)
    export.js        Book/app export zip building
    html-escape.js   escapeHtml/escapeJsonString
    backup.js        SQLite backup scheduling
    routes/
      auth.js          Login/register/forgot/reset handlers
      books.js         Book/stash/series/run/stream/rating/notebook/party handlers
      shop.js          Gold Coin shop handler
      profile.js       Profile/avatar/prefs handlers
      public.js        Public user/run/series-run JSON handlers + public SSR pages
      admin.js         Admin route handlers, serveAdminFile/serveAdminPanel, tips/items/series admin
      notifications.js  Notification handlers
      feedback.js      Feedback thread handlers
      announcements.js  Announcement handlers
      forum.js         Forum route handlers (HTTP glue around server/forum.js + server/db/forum.js)
  admin/
    index.html       Admin panel HTML/CSS (served only to localhost connections) - script is a
                     single <script type="module" src="/admin/js/boot.js"> import, no inline JS
    admin-guide.html Admin panel user guide
    technical.html   HTML mirror of this file
    js/
      core.js          Shared format/DOM-building helpers + generic sortable/searchable/
                       paginated-table system + showAlert/showConfirm
      users-books.js   Users tab, Books tab, User/Book detail views, Confirm actions, Gift modal,
                       Navigation - kept as one module since the two detail views constantly
                       call back into each other
      dashboard.js     Stats cards, Vacuum button, Tools tab, Live resource poll
      series.js, anthologies.js, tips.js, feedback.js, announcements.js, inventory.js
                       One per like-named tab
      boot.js          Tooltip, tab-switching, initial boot sequence - the only file
                       admin/index.html imports directly
  docs/
    user-guide.md
    technical.md
  public/
    index.html
    guide.html       Styled HTML user guide (served as a static file at /guide.html)
    favicon.svg
    css/
      style.css          Shared/base rules only (tooltips, buttons, inputs, scrollbars, generic
                          layout) - see "CSS file split" below for everything else
      charsheet.css, equipment.css, shop.css, dice.css, feedback.css, battlesim.css,
      demo.css, profile.css, public-profile.css, login.css, add-book.css, play.css,
      landing.css        One file per like-named JS module
      reduce-motion.css, mobile.css  Cross-cutting overrides, loaded last in index.html
    js/
      constants.js       Shared constants (COLORS)
      i18n.js            Translation tables (en), t(), applyTranslations()
      state.js           State object, API persistence, auth helpers, pure helpers
      graph.js           vis-network lifecycle, node rendering, deletion
      play.js            Render pipeline, all playthrough actions, modals
      charsheet.js       Character sheet - self-contained module
      inventory.js       Inventory grid - self-contained module (per-run item slots, drag reorder, template)
      equipment.js       Equipment panel - self-contained module (per-run equip slots, context menu, template)
      sort.js            Search/sort helpers (foldForSearch, matchesSearch, naturalCompare)
      util.js            Shared utility helpers: escapeHtml, compressImage, compressToBlob (client-side JPEG quality iteration), registerPanelShortcut (single-key panel toggle shared by charsheet/inventory/equipment/battlesim*), shortcutLabel (first-letter shortcut hint span)
      autocomplete.js    Shared name-autocomplete helpers for add/edit modals
      auth.js            Login, register, forgot-password, reset-password forms
      notes.js           Notebook modal and pinned notes overlay
      battlesim829.js    Battle simulator for book 829
      battlesim8.js      Battle simulator for book 8
      battlesim286.js    Battle simulator for book 286 (flat weapon min-hit model, tech gadgets, sleep/dream table)
      add-book.js        Create Book, Create Anthology, Create Series modals
      edit-book.js       Edit Book/Anthology/Series/Stash modals; ISBN/ISSN/ASIN validation
      books.js           Books list rendering, panel management, stash UI
      covers.js          Public covers wall, cover rotation, cover/series activity modals
      feed.js            Activity feed loading and rendering
      open-world.js      Open World / series-run cross-book state management
      shop.js            Gold Coin shop modal
      profile.js         User profile modal, XP display, avatar
      public-profile.js  Public profile modal, public run viewer, public series journey viewer
      prefs.js           UI preference persistence (panel collapse state, server sync)
      livetab.js         Live tab / SSE broadcast helpers, user badge SSE
      notif.js           Notification dropdown and inbox badge
      rewards.js         XP/coin reward floater (bottom-right toast)
      bg.js              Graph background image, background context menu, sidebar book info
      stats.js           Stats for Nerds modal
      party.js           Play Together invite flow and SSE live-sync
      tips.js            Tip bar (rotating tips with progress bar)
      inbox.js           Inbox / feedback thread modal (replies with optional file attachments)
      dice.js            Dice roller
      tooltip.js         Tooltip system
      export.js          Export this book / Export everything
      feedback.js        Feedback widget (submission with optional file attachments)
      demo.js            Demo mode
      user.js            Admin/author/contributor state and badge helpers
      boot.js            Application entry point: screen routing, hook wiring, DOMContentLoaded init
      main.js            Single-line entry point: `import './boot.js?v=N'`
    avatars/         Uploaded user avatar images (auto-created, git-ignored)
    covers/          Uploaded book cover images (auto-created, git-ignored)
    attachments/     Uploaded message/post attachments (auto-created, git-ignored)
```

---

## Module dependency graph

The project has ~30 ES modules. They form a layered DAG:

```
Layer 0 (no project imports):
  constants.js  i18n.js  state.js  sort.js

Layer 1 (import only from layer 0):
  graph.js       ← state.js, i18n.js, constants.js
  charsheet.js   ← state.js, i18n.js
  autocomplete.js ← state.js
  user.js        ← state.js

Layer 2:
  inventory.js   ← state.js, play.js*, charsheet.js
  equipment.js   ← state.js, inventory.js, charsheet.js
  play.js          ← state.js, graph.js, charsheet.js, inventory.js*, equipment.js*, i18n.js

  * three-way cycle: equipment.js → inventory.js → play.js → equipment.js
    Works because none consume each other's exports at module-evaluation time.

Layer 3 (feature modules - import from layers 0–2 as needed):
  notes.js, battlesim829.js, battlesim8.js, battlesim286.js, auth.js, add-book.js, edit-book.js,
  books.js, covers.js, feed.js, open-world.js, shop.js, profile.js,
  public-profile.js, prefs.js, livetab.js, notif.js, rewards.js, bg.js,
  stats.js, party.js, tips.js, inbox.js, dice.js, tooltip.js, export.js,
  feedback.js, demo.js

Layer 4 (top):
  boot.js   ← imports all of the above
  main.js   ← imports boot.js only (single line)
```

`index.html` loads `js/main.js` as `type="module"`. The vis-network library is loaded via CDN as a global (`vis`) before the module script runs.

**Version-bump cascade:** when any module changes, bump it, then bump all modules that import it, ending at `boot.js` → `main.js` → `index.html`. Key chains: `state.js → graph.js → play.js → boot.js`; `charsheet.js → play.js → boot.js`; any leaf module → `boot.js → main.js`. Use `grep -r "modulename.js?v="` to find all import sites.

---

## CSS file split (2026-07-18)

`style.css` had grown to 9,238 lines - one file for the entire app. Split into 15 per-module files (one per like-named JS module, e.g. `shop.css` for `shop.js`) plus `style.css` itself, now 549 lines of genuinely shared/base rules only (tooltips, buttons, inputs, scrollbars, generic layout not owned by any one module). `public-profile.css` is shared by both `public-profile.js` and `covers.js` (cover activity view lives in the same `#public-modal` markup both use).

**Unlike the JS side, there's no import-cascade to maintain** - each stylesheet is an independent `<link>` in `index.html`, so a changed CSS file only needs its own `?v=N` bumped, never a chain of importers. `grep -r "modulename.js?v="` (the JS cascade check) has no CSS equivalent to worry about.

**Load order matters for two files specifically:** `reduce-motion.css` and `mobile.css` are cross-cutting overrides (`body.reduce-motion .foo`, `@media` blocks, several with `!important`) rather than one module's own styling, so they're deliberately the last two `<link>` tags in `index.html`, after every per-module file - this is actually an improvement over the original file, which had these two sections sitting at arbitrary mid-file positions purely because that's where they happened to be authored.

**Verification method used for the split** (worth reusing for any similar file-splitting work): exact `sed -n 'X,Yp'` line-range extraction per section (never a shortcut contiguous range spanning content that isn't actually wanted - two real mistakes were caught this way, see `project_refactor_main.md` memory for specifics), then before touching the source file, confirming `sum of all new files + planned remainder == original total line count` exactly. Only after that reconciliation passed was the source file trimmed. The new files were also linked in *alongside* the still-intact original first, for a visual check with everything duplicate-loaded, before the corresponding blocks were ever removed from the original - build first, verify, delete after.

Each JS module's own "how to remove this module" header comment (`shop.js`, `charsheet.js`, `profile.js`, `public-profile.js`) now points at its own CSS file instead of "remove the ___ CSS from style.css".

**Follow-up bug, fixed 2026-07-19:** `server.js`'s `computeCodeStats()` (feeds "Lines of code"/"Code size" in Stats for Nerds, computed once at server startup) hardcoded a single filename, `'public/css/style.css'`, instead of scanning the whole `public/css/` directory - a leftover from before the split, missed when this file was written. After the split, this silently dropped 8,689 of the app's ~9,238 CSS lines from the count (everything now living in the 15 new files), making both stats read far lower than reality. Fixed to `fs.readdirSync('public/css').filter(f => f.endsWith('.css'))`, same pattern already used for `public/js` and `admin` in the same function. Needs a server restart to actually recompute (the scan is an IIFE that runs once at module load, not per-request).

---

## Server file split (2026-07-26)

`server.js` (3,743 lines) and `server/db.js` (6,373 lines) were the last two monolithic
files in the codebase; everything else had already been split module-by-module (see the
"CSS file split" section above and the frontend module dependency graph). Same treatment,
same process: build each new module fully, verify it, wire it in, delete the old code from
the monolith last - never a bulk line-range removal.

**`server/db.js`** is now a thin barrel (713 lines): every raw `CREATE TABLE`/`ALTER
TABLE`/one-time-migration block stays physically in `db.js`, in its original relative
order - some migrations reference tables/functions defined much later in the original
file purely because production's live database already has those tables from earlier
deployments, so reordering the DDL was judged unsafe. Only the *function definitions*
moved out, into `server/db/*.js` domain modules (see project structure above), each
`require()`-d back into `db.js` at the position its definitions used to occupy. `db.js`'s
final `module.exports` re-exports the exact same 233 named functions it did before the
split - nothing outside `server/db.js` needed to change a single `db.xxx(...)` call site.

**`server.js`** is now 597 lines: requires, one-time bootstrap (dir creation, XP
migrations, geoip update), the Router (regex route-pattern constants + one large `async
(req, res) => {}` dispatch function), `attachClientErrorHandler`, and the final
`httpServer.listen(...)`. Everything else moved into `server/*.js` (cross-cutting: SSE,
email, request helpers, runtime/process state, static file serving) and `server/routes/*.js`
(per-domain HTTP handlers). Mutable process state that used to be bare module-level `let`
bindings in `server.js` (maintenance-mode flag, traffic byte counters, CPU/memory rolling
averages, uptime/session timestamps) was extracted into `server/runtime-state.js` behind
getter/setter accessor functions, since raw `let` variables can't be shared across
CommonJS modules by reference.

**Verification method** (`server.js` itself can never actually be run to test - it ends in
`httpServer.listen(...)`, a live server, and the "never restart the server" rule forbids
running it): every new/rewritten file passed `node --check` (syntax only), then was
actually `require()`-d in isolation to catch load-time errors `--check` misses (e.g. a
stray dead `require('./server/routes/admin')` with a wrong relative path, accidentally
absorbed into `routes/announcements.js` during a sed-based extraction - found this way,
not by `--check`). A third pass, a small script cross-referencing every bare `identifier(`
call in a file against its locally-defined/required names, caught the class of bug
`--check`/`require()` both miss entirely: a name that's fine at module-load time but
undefined the moment a handler function actually runs. This caught several real
missing-import bugs (`authenticate`/`addSecurityHeaders` in `routes/admin.js`,
`tokenFromReq`/`isLocalhost` in `routes/books.js`, `sendAdminEmail`/`escapeHtml` in
`routes/forum.js`, and `fs`/`path`/`ATTACHMENTS_DIR` in `routes/forum.js`'s
`handleForumDeleteThread` - all four fixed by adding the missing names to that file's
`require()` destructuring). The `server/db.js` barrel's export surface was diffed
(`Object.keys(db).length`) before and after every extraction step and stayed at exactly
233 throughout.

## Admin panel JS split (2026-07-27)

`admin/index.html` was the one file that missed the entire main.js/style.css/server.js/
server/db.js split effort - a single inline `<script>` had grown to 2,454 lines (101
top-level functions), same monolith shape those other files used to have. Split into 10
modules under `admin/js/` (see project structure above), same process as always: build
each module fully, verify, wire in, remove the old code from the monolith last.

**Serving mechanism, new for this split:** `admin/js/*.js` needed a route that didn't
exist before. `server/routes/admin.js`'s `serveAdminFile()` now infers `Content-Type` from
the filename extension (`.js` → `text/javascript`, else `text/html`) instead of hardcoding
HTML - required, since browsers reject `<script type="module">` if the response's MIME
type isn't a JS type. `server.js` has `GET /admin/js/:file` (regex-restricted to
`[a-zA-Z0-9_-]+\.js`, no path-traversal risk), gated by the same `requireLocalhost` as the
rest of the admin panel - and, as a side effect of how the existing maintenance-mode
exemption check works (`urlPath.startsWith('/admin')`), these files stay reachable during
maintenance mode too, same as the rest of the admin panel already was.

`admin/index.html`'s script tag is now `<script type="module" src="/admin/js/boot.js">` -
same end state as `main.js`. `users-books.js` (Users tab, Books tab, both detail views,
Gift modal) is the one deliberately-not-split-further module: the user-detail and
book-detail views call back into each other constantly (viewing a user's books opens a
book detail, which links back to the owner, which reopens user detail...), so it stayed as
one cohesive 1,097-line module rather than being forced into `users.js`/`books.js`. It
imports `loadAll`/`loadTools` from `dashboard.js`, which itself imports `loadUsers`/
`loadBooks` back from `users-books.js` - a genuine circular import, which is safe in real
ES modules (unlike CommonJS) as long as the imported bindings are only read inside
function bodies that run later, never at module-evaluation time - verified this holds for
both directions before shipping.

**Verification method:** no browser access, so entirely static - `node --check` on every
file, every module's `core.js` import cross-referenced against `core.js`'s actual export
list, the circular `users-books.js`↔`dashboard.js` import checked both directions, an
orphan bare-identifier scan across all 10 files, and a byte-level diff (comment/whitespace
normalized) of the two largest files against the original extracted source before
considering them done - caught one real transcription slip this way (a non-breaking-space
character in the Gift button's spacing silently became a plain space; functionally
harmless but would not have been caught by syntax-checking alone). Also worth remembering:
typing a `\uXXXX` escape directly into an Edit/Write tool call's string parameter gets
silently decoded to the actual Unicode character by the JSON layer before the tool ever
sees it as text - the fix that actually worked was reading the live file's exact bytes with
a small script and using that as the basis for the change, rather than retyping the escape
sequence by hand.

`feedback.js` is the one module with a real gotcha: its feed-card HTML uses inline
`onclick="toggleFeedbackCard(this)"` (built via `innerHTML` templates), which resolves
against `window`, not module scope - fixed with an explicit `window.toggleFeedbackCard = ...`
at the bottom of the file (and two more for its sibling handlers). Confirmed via a
codebase-wide `onclick="..."` scan that these are the only three call sites needing this
treatment; everything else already used `addEventListener`.

---

## Server

`server.js` is a plain Node.js HTTP server. It serves static files from `public/` and exposes a JSON REST API. Routes are matched manually with regex - no express or other framework.

Listens on `localhost:3000` by default (override with `PORT` env var).

### REST API

All `/api/*` routes except `/api/register`, `/api/login`, `/api/feed`, `/api/site-stats`, `/api/config`, `/api/ping`, and `/api/public/*` require an `Authorization: Bearer <token>` header. A missing or invalid token returns `401`.

**Maintenance mode:** toggled via `POST /api/admin/settings` (`{ key: 'maintenance_mode', value: '1'/'0' }`).

- All requests except `/api/admin/*`, `/api/ping`, and static assets return HTTP 503 with a custom dark-themed page (inline CSS/JS only, no external resources).
- The 503 page polls `GET /api/ping` every 8 seconds and auto-reloads when the server comes back.
- Admin routes are exempt so the admin can turn maintenance mode off without being locked out.
- The server runs behind nginx; `isLocalhostReal()` reads the `X-Real-IP` header (not `req.socket.remoteAddress`) to grant localhost bypass.
- CSP on the 503 response: `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`.
- Client-side: both `apiFetch` and `publicFetch` check for HTTP 503 and dispatch a `maintenance-mode` window event; a `{ once: true }` listener calls `location.reload()` to eject in-app users cleanly.

**Main app CSP** (`addSecurityHeaders`, `server.js`): `script-src` used to allow `'self' https://unpkg.com` - a leftover from before `vis-network` was vendored locally (it now loads from `/vendor/vis-network/vis-network.min.js`, and nothing in the codebase actually loads anything from unpkg.com). Fixed (2026-07-26) to just `'self'` - the stale allowance served no purpose and unnecessarily widened the trusted script-source allowlist. The matching `<link rel="preconnect" href="https://unpkg.com">` in `index.html` was dead weight for the same reason and was removed too.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Create account → `{ token, username }`. Calls `db.createDemoBook(userId)` (returns book ID), writes `demo_<userId>.svg` to `covers/`, and calls `db.setBookCover` to attach it. |
| POST | `/api/login` | Authenticate → `{ token, username }` |
| POST | `/api/logout` | Invalidate token |
| GET | `/api/feed` | Public activity feed → `{ entries: [...], pinned: row \| null }`. `entries` contains runs and other events from all users in the last 30 days, sorted newest-first globally; client groups by day. `pinned` is the single pinned published announcement (or `null`). Pinned announcements are excluded from `entries` so they never appear twice. |
| GET | `/api/ping` | Liveness check → `200 "ok"`. No auth required. Passes through the maintenance gate. Used by the maintenance page polling script to detect when the server is back. |
| GET | `/api/config` | Public app config → `{ version, adminUsername }`. No auth required. |
| GET | `/api/tagline` | Returns `{ tagline: string }` - the app subtitle chosen randomly from the `taglines` DB table at server startup and held for the lifetime of the process. No auth required. `boot.js` fetches this before `applyTranslations()` and injects it via `setTranslationOverride('app.tagline', tagline)`. |
| GET | `/api/site-stats` | Public aggregate stats (same data shown in the Stats for Nerds panel) → `{ users, admins, uniqueBooks, totalUserBooks, uniqueSeries, totalUserSeries, uniqueAnthologies, totalUserAnthologies, totalXp, appLevel, appTitle, … }`. No auth required. Book counts exclude anthology children (`parent_book_id IS NOT NULL`) and standalone book totals exclude anthology containers where appropriate, so Books / Series / Anthologies line up with the left-panel categories. |
| | | *"The App" section (2026-07-25):* added a "Total uptime" row to `stats.js`, computed client-side from data the endpoint already sent (`appAgeDays * 86400 - totalDowntimeS`) rather than a new server field - sits between "Server uptime (session)" (just since the last restart) and "Uptime %"/"Total downtime" (which were already there). |
| GET | `/api/app-xp` | Auth required, and 403 unless `db.isUserAdmin(userId)` - powers both the admin-only "App" XP widget and the "Avg User Level" widget on the Books screen. → `{ users, level, title, xp, levelXp, nextLevelXp, xpFromBoost, xpBoostPct, heartbeatRatePerMin, sumLevels, minLevel, maxLevel, avgLevel, avgLevelTitle, avgLevelFraction, levelsNeededForNextAvg }`. See `db.getAppXpSummary()` and `app-xp.js`. |
| GET | `/api/app-xp/stream` | Admin-only SSE stream (token via `?token=`, 403 unless `db.isUserAdmin`) - pushes `{ username, xpDelta? , coinDelta? }` whenever any other user earns XP or GC, powering the live floaters. See `db.setAppXpHook()` and `app-xp.js`. |
| GET | `/api/public/books` | All public non-demo top-level books and anthologies → `[{ id, name, coverUrl, createdAt, authors, isContainer, totalSections, description, isbn, issn, asin, pages, seriesName, seriesNumber, childNames[] }]`. No auth required. Used for the public covers search and the Create Book / Create Anthology autocomplete. |
| GET | `/api/public/user/:username` | Public profile for a user (only if `public_profile` is set) → `{ username, avatarUrl, books: [{ id, name, runs }] }` |
| GET | `/api/public/book/:id/run/:index` | Public run data - only accessible if the run has `isPublic: true` → `{ bookName, graph, positions, totalSections, run, allVisited, endNodes }`. `allVisited` is the union of all sections visited in any of the user's runs for this book (so nodes from other runs appear in the chart). `endNodes` is `[{ id, result }]` for the final node of each other completed run (for overview-mode coloring). `run.result` can be `'death'`, `'battle'`, or `'success'`. |
| GET | `/api/public/covers` | Public cover-backed items used by the covers wall. Returns books and anthology containers that have uploaded covers → `[{ id, name, isbn, issn, asin, coverUrl }]`. Series cards are built client-side from `GET /api/public/books` + `GET /api/public/series`. |
| GET | `/api/public/stream` | SSE stream for public catalog changes. Emits `public_catalog_changed` when a public book, anthology, or series is created, updated, or deleted so the public covers wall can refresh without polling. |
| GET | `/api/user/stream` | Authenticated SSE stream for live badge refresh hints. Token is accepted as `?token=<bearer>` because `EventSource` cannot set headers. The client refetches badge endpoints when an event arrives. |
| GET | `/api/public/book/:id/activity` | Public activity for a book and all ISBN/ISSN siblings → `{ book: { id, name, totalSections, coverUrl, isbn, issn, asin, pages, authors, description, isPublic }, entries: [...] }`. Only runs explicitly marked `isPublic: true` are included. `isPublic` indicates whether the book can be added to other users' libraries. |
| GET | `/api/books` | List user's books → `[{ id, name, total_sections, discoverable_sections, isbn, issn, asin, cover_path, pages, authors, description, created_at, created_by, is_public, visited, series_id, series_number, series_name, is_container, parent_book_id, book_order, bgHidden, bgPosY }]`. `visited` is the count of unique section numbers that appear in any playthrough's `path` array. Computed server-side by parsing `state_data`. `series_name` is joined from the `series` table. `bgHidden`/`bgPosY` come from `user_books.bg_hidden`/`user_books.bg_pos_y`. |
| POST | `/api/books` | Create book → `{ id, name, total_sections, isbn, issn, asin, pages, authors, description }`. Sets `books.created_by` to the creating user's ID. Accepts optional `is_public`, `series_name` (string, resolved to `series_id` via `getOrCreateSeries` with `addToLibrary=true`), `series_number`, `is_container`, `parent_book_id`, `book_order`. Normal books require a minimum of 5 sections; when `is_container` is true, `total_sections` is stored as 0 and the minimum is skipped. `is_public` is now correctly persisted on creation (was previously ignored). |
| PATCH | `/api/books/:id` | Update book metadata (name, total_sections, isbn, issn, asin, pages, authors, description, discoverable_sections, is_public, series_name, series_number, is_container, parent_book_id, book_order). **Creator-only** (or admin). `series_name` is resolved to `series_id` via `getOrCreateSeries`; pass `null`/empty to clear. When `is_container` is true, `total_sections` is stored as 0 regardless of the sent value. When `discoverable_sections` changes, retroactive XP is awarded to all users of the book. |
| GET | `/api/series` | List the current user's series (those in their `user_series`) → `[{id, name, description, is_public, is_owner}]`. `is_owner` is true when `created_by === userId`. Used by the books screen and the series dropdowns in the book/anthology edit dialogs. |
| GET | `/api/series/autocomplete` | All series in the system → same shape as above, no `is_owner`. Used for book/anthology edit modal dropdowns. No user filtering. |
| POST | `/api/series` | Create a series → `{ id, name, existed }`. Auto-inserts into `user_series` for the creator. `existed: true` if a case-insensitive match already existed (still adds to creator's `user_series`). |
| PATCH | `/api/series/:id` | Update a series. Creator or admin only (403 otherwise). Body: `{ name?, description?, isPublic? }`. Returns `{ ok }`. |
| DELETE | `/api/series/:id` | Remove a series from the caller's library. Default mode behaves like **Delete Series & Contents**: removes the caller's `user_series` row and removes books from that series from their `user_books`. With `?cascade=0`, behaves like **Delete Series**: removes only the caller's `user_series` row and leaves books behind as standalones. If the caller was the creator and other owners remain, ownership transfers to the next owner. If no owners remain, the shared series row is deleted and any remaining attached books are orphaned (`series_id = NULL`, `series_number = NULL`). |
| POST | `/api/series/:id/add` | Add a public series to the caller's library → `{ ok, added }`. Inserts into `user_series`. With `?cascade=1` also adds all public books in the series (and public children of anthology containers) via `addBookToLibrary`. Awards `series_added_by_other` XP (150) to the creator. |
| GET | `/api/tips` | All active tips grouped by type → `{ real: string[], silly: string[] }`. No auth required. Tips are stored in the `tips` table and served from there rather than hardcoded in JS. |
| GET | `/api/public/series` | All public series for the covers wall → `[{ id, name, description, book_count }]`. No auth required. The client combines this with public books to build live composite series covers. |
| GET | `/api/public/series/:id` | Public series info → `{ id, name, description, isPublic, books: [{id, name, totalSections, coverUrl, isContainer, seriesNumber, childCount, isbn, issn, pages, authors}] }`. No auth required. |
| GET | `/api/stashes` | Get current user's stashes → `[{ id, name, createdAt, bookIds[], seriesIds[] }]`. |
| POST | `/api/stashes` | Create a stash → body `{ name, book_ids: number[], series_ids: number[] }` → `{ ok: true, id }`. Empty stashes are allowed. |
| POST | `/api/stashes/:id` | Update a stash → body `{ name, book_ids: number[], series_ids: number[] }` → `{ ok: true }`. Replaces the stash membership wholesale on save. |
| DELETE | `/api/stashes/:id` | Delete a stash. Returns `{ ok: true }`. Items return to the main list; nothing is deleted from the library. |
| DELETE | `/api/books/:id` | Remove book from the user's library. If the deleting user was the creator, ownership transfers to the next user (earliest `created_at` in `user_books`). If no users remain, the `books` row and cover file are deleted. |
| POST | `/api/books/:id/add` | Add a public book to the current user's library → `{ ok: true }`. `404` if not found or not public; `409` if already in library. Creates a fresh `user_books` row with an empty state. |
| GET | `/api/books/:id/state` | Get full state JSON for a book |
| PUT | `/api/books/:id/state` | Save full state JSON for a book. The metadata sync (`UPDATE books SET name, total_sections`) is **creator-only** - non-creator saves update `user_books` only. |
| POST | `/api/books/:id/reset` | Reset the caller's saved state for a book and return the cleared state. Does not revoke already-earned XP; it clears the per-book progress XP locks so reruns can earn progress XP again. |
| | | *Server-side (2026-07-26):* `resetBookProgress()`'s cleared-events list was missing `add_charsheet_field`, `inventory_started`, `add_item`, `equipment_started`, `equip_item` - a reset wiped the book's state but left those XP locks in place, so a replay could never re-earn XP for re-adding the same items/charsheet fields, unlike discover/visit/notes/priority/color which correctly re-award after a reset. Added the 5 missing event names to the cleared list. |
| | | *Client-side (2026-07-25):* `boot.js`'s (non-open-world) reset-button handler used to call `state.js`'s `resetState()` (an optimistic, purely-local blank state) and immediately rebuild the graph *before* the actual `POST /api/books/:id/reset` request (fired via `resetBookProgress()`, not awaited) had confirmed anything - and that function's failure path was a bare `.catch(() => {})`. If the reset request genuinely failed, the user saw a freshly-blanked graph and believed the reset worked, while the server silently still held their old progress, with no error shown at all. Fixed: `resetBookProgress()` now resolves `true`/`false` based on whether the server actually confirmed the reset, and the click handler awaits it, only touching the graph on success - on failure it shows an alert and leaves the pre-reset state and graph untouched. The open-world/series reset path was already correct (it already awaited its own server call and checked `r?.ok` before touching local state); restructured slightly so both branches only run `resetState()`/rebuild the graph after their respective server confirmation, instead of unconditionally between the two branches. |
| POST | `/api/books/:id/cover` | Upload raw JPEG body as book cover → `{ coverUrl }`. Deletes previous cover file. **Creator-only** (or localhost/admin) - silently no-ops if caller is not the book's creator. When called from localhost (admin panel), no auth required and no XP awarded. |
| POST | `/api/books/:id/cover/delete` | Remove cover from a book. **Localhost-only**. Deletes the cover file and sets `cover_path = NULL`. |
| GET | `/api/books/:id/rating` | Get the current user's rating for a book → `{ rating, userBookId, avgRating, voteCount, canRate }`. `rating` is the user's own vote (null if unrated). `canRate` is false if the user has not yet completed at least one run of the book (for standalone books) or at least one run of every child (for anthologies). 404 if not in library. |
| PATCH | `/api/books/:id/rating` | Set rating → body `{ rating }` (0.5–5.0 in 0.5 steps, or null to clear) → `{ rating, xpAwarded, avgRating, voteCount }`. Returns 403 if `canRate` is false (no run completed). `xpAwarded` is true only the first time a rating is set. XP: 25. Stored on `user_books.rating`. Clearing a rating (null) is always allowed. Aggregate is recomputed and returned immediately. |
| GET | `/api/series/:id/rating` | Get the current user's rating for a series → `{ rating, avgRating, voteCount, canRate }`. `canRate` is false if the user has not yet completed all books/anthologies in the series. 404 if not in library. |
| PATCH | `/api/series/:id/rating` | Set series rating → body `{ rating }` → `{ rating, xpAwarded, avgRating, voteCount }`. Returns 403 if `canRate` is false. XP: 25 (`rate_series`). Stored on `user_series.rating`. |
| GET | `/api/books/:id/notebook` | Get the user's notebook for a book → `{ text }`. `text` is an empty string if no notes saved yet. 404 if not in library. |
| | | *Client-side (2026-07-25):* `notes.js`'s three read call sites (`loadNotesForBook`, `openNotebook`, the pin-checkbox handler) used to skip the `res.ok` check and fall through to `data.text ?? ''` regardless - on the 404 above (or any other error), that silently blanked the currently-shown notes to an empty string, and hitting Save afterward would overwrite the real saved notebook with nothing. Fixed to leave the existing content alone (restoring `openNotebook`'s pre-fetch textarea value too) whenever the fetch fails instead of treating an error response as empty notes. Separately, the pinned notes overlay's hover-to-edit panel's `mouseleave` handler used to reset `notesDisplayInput.value` back to `_notesText` - initially suspected as silently discarding unsaved edits, but on closer trace this was a no-op: both `notesDisplayInput` and `notebookInput`'s own `input` listeners already keep `_notesText` synced to the live textarea value on every keystroke, so by the time `mouseleave` fired the two were already identical. Removed anyway since it served no purpose, but it was not the data-loss bug it first looked like. |
| PUT | `/api/books/:id/notebook` | Save notebook text → body `{ text: string, ptIdx?: number }` (text max 100 000 chars) → `{ ok: true, xpAwarded: bool }`. Stores in `user_books.notebook`. Awards `notebook_saved` XP (65) once per run if `ptIdx` ≥ 0. |
| | | *Client-side (2026-07-25):* `notes.js`'s `saveNotebook`/`saveNotesDisplay` used to call `setNotesDisplayText(text)` and close the modal / exit edit mode unconditionally, without checking `res.ok` first - a rejected save (e.g. the 100 000-char limit above, or a transient 404/500) was treated exactly like a successful one client-side, with no error shown at all. The user would only discover the real, unsaved server-side notebook was still the old text on their next reload. Fixed both to check `res.ok`, `showAlert()` the server's error message on failure, and leave the modal open / stay in edit mode with the unsaved text intact so nothing is lost. That fix introduced its own follow-on bug: `showAlert()` has no Escape-key handling of its own, and `notes.js`'s document-level Escape listener didn't check for it either - pressing Escape to dismiss the failure alert also closed the notebook modal underneath it, and the next `openNotebook()` call blanks the textarea and re-fetches before the user can retry, discarding the very unsaved text the alert was warning about. Fixed by having the Escape listener check `#confirm-overlay` (the alert/confirm dialog's own overlay) first and yield to it if active.
| PATCH | `/api/books/:id/bg` | Save graph background preference → body `{ hidden: bool, pos_y: number }`. Stores in `user_books.bg_hidden` / `user_books.bg_pos_y` (pos_y clamped 0–100). → `{ ok: true }`. |
| GET | `/api/books/:id/stream` | SSE stream for party live-sync. Token must be passed as `?token=<bearer>` since `EventSource` cannot set headers. Returns 404 if the user is not in a party for this book. Keeps the connection open and pushes `data: { type: 'state_updated', by: userId, bookId }` whenever another party member saves state, and `data: { type: 'party_changed' }` whenever another party member accepts an invite or leaves. |
| POST | `/api/books/:id/party` | Create a party for a book and send invites. Body: `{ usernames: string[] }`. Creates the party, sets caller's `user_books.party_id`, and sends a `party_invites` row for each username. Returns `{ ok, partyId, errors: [{ username, error }] }`. 409 if already in a party for this book. |
| GET | `/api/books/:id/party` | Get current party info for a book → `{ party: { partyId, bookId, members: [{ id, username, avatar_path }] } \| null }`. |
| DELETE | `/api/books/:id/party` | Leave the party for a book. Each remaining member keeps the current shared state and continues independently. If only one member would remain, the party is dissolved (that member's `party_id` is also cleared). |
| POST | `/api/books/:id/party/invite` | Add an invite to an existing party. Body: `{ username }`. 409 if the user already has a pending invite for the same party. Users who are already tracking the book can still be invited - accepting will merge the party state into their existing row. |
| GET | `/api/party-invites` | Get all pending party invites for the current user → `{ invites: [{ id, party_id, inviter_username, inviter_avatar, book_id, book_name, cover_path, created_at }] }`. |
| POST | `/api/party-invites/:id/accept` | Accept a party invite. If the invitee already has a `user_books` row for the book it is updated (party state replaces it); otherwise a new row is created. Sets `user_books.party_id`. Awards `add_book` XP (50) only if the book was not previously in the library; awards full state XP for inherited content. |
| POST | `/api/party-invites/:id/decline` | Decline a party invite. |
| GET | `/api/users/search?q=` | Search users by username substring (auth required). Excludes the caller. Returns `{ users: [{ id, username, avatar_path }] }`. Used for invite autocomplete; returns empty array if `q` is blank. |
| GET | `/api/notifications` | Get current user's notifications → `{ unseen: number, items: [{ id, type, payload, seen, createdAt }] }`. Returns last 25, newest first. |
| POST | `/api/notifications/seen` | Mark all unseen notifications as seen → `{ ok: true }`. |
| POST | `/api/attachments` | Upload a file attachment (auth required). Body: raw binary; `Content-Type: application/octet-stream`; original filename in `X-Filename` header (percent-encoded). Max 64 MB. Returns `{ id, filename, original_name }`. The file is written to `public/attachments/` as `att_{userId}_{timestamp}{ext}`. Accepted types: images (JPEG/PNG/GIF/WebP/AVIF), PDF, ZIP/7z/RAR/GZIP by magic bytes; plain text extensions (.txt .md .csv .json .xml) by extension. Client images larger than 512 KB are JPEG-compressed before upload. JPEG magic bytes override extension to `.jpg`. The returned `id` must be included in a subsequent submit call's `attachment_ids` to link the file; unlinked uploads are orphaned. |

### Profile API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Get current user's id, username, avatarUrl, publicProfile, XP info, and shop fields |
| PATCH | `/api/profile` | Update username, password, avatar, public profile visibility, feed visibility, and/or author display name → `{ username, avatarUrl, publicProfile, hideFeed, displayName }` |
| POST | `/api/profile/avatar` | Upload raw JPEG body → `{ avatarUrl }` |

`PATCH /api/profile` body: `{ username?, currentPassword?, newPassword?, avatarUrl?, publicProfile?, hideFeed?, displayName? }`. Password change requires `currentPassword`. `displayName` is only applied if the user `is_author = 1`; ignored otherwise. Returns `{ errors }` on validation failure.

`GET /api/profile` response fields:

| Field | Notes |
|-------|-------|
| `id` | Used by `boot.js` to gate the `✎` edit button |
| `coinsBalance` | `floor(xp/1000) + bonus_coins - coins_spent` |
| `coinsSpent` | Raw `coins_spent` column, lifetime total across all shop purchases. Shown as a small "N spent" pill in the shop modal header next to the balance pill (`shop.js`'s `updateSpentDisplay()`), refreshed on modal open and after every purchase. |
| `xpBoostPct` | Actual boost percent (tenths stored in DB, divided by 10 before returning). Includes free level-up boosts (0.1% per level) + purchased boosts. |
| `xpBoostPurchased` | Count of purchased boosts only (= `xp_boost_pct - level` in DB tenths). |
| `xpFromBoost` | **Extra** XP from boosts only (not total XP earned while boosted) |
| `bonusHeartbeatXp` | Count of purchased Heartbeat XP upgrades; each = +0.1 base heartbeat XP |
| `isAuthor` | Shows the display name field in the profile modal |
| `isAdmin` | Shows admin-only controls (e.g. PDF upload rows) in the regular app |
| `pdfAccess` | When `true` (or `isAdmin = true`), shows a **PDF** link in the play area |

### Shop API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/shop/purchase` | Purchase a shop item. Body: `{ item: 'xp_boost' \| 'heartbeat_xp' \| 'undo' \| 'fast_travel' }`. Returns `{ ok, newBalance, ...profileFields }` with full updated XP/shop info. `402` if insufficient coins, `400` if invalid item, `403` if purchase cap reached. |

**Gold Coins:** `floor(xp / 1000) + bonus_coins - coins_spent`. Base GC is still derived from XP, but `bonus_coins` stores one-time extra GC rewards that do not affect XP. Balance is shown in the books screen header and in the shop modal.

**Shop items:**

| Item | Cost | Effect | Purchase cap |
|------|------|--------|--------------|
| `xp_boost` | dynamic: next purchase costs `purchased_count + 1` GC | +0.1% to all future XP permanently (`xp_boost_pct += 1` tenth) | `lvl` purchases (= `lvl × 0.1%`) |
| `heartbeat_xp` | dynamic: next purchase costs `current bonus + 1` GC | +0.1 base idle heartbeat XP permanently per purchase (`bonus_heartbeat_xp += 1` purchase counter) | `lvl` purchases (= `lvl × 0.1 XP`) |
| `undo` | dynamic: `(bonus_undos + 1) * 3` GC | +1 undo per run permanently (`bonus_undos += 1`) | 1 per 10 levels |
| `fast_travel` | dynamic: `(bonus_fast_travels + 1) * 5` GC | +1 fast travel per run permanently (`bonus_fast_travels += 1`) | 1 per 10 levels |

Caps are enforced in `purchaseShopItem` - returns `{ error: 'cap_reached', cap, level, item }` (→ `403`) when the user's purchased count equals the cap. Existing purchases above the cap are grandfathered. XP boost cap uses `xp_boost_pct - level` (purchased tenths). Heartbeat XP cap uses `bonus_heartbeat_xp`. Undo and fast travel cap uses `undoFastTravelCap(level)` - 1 purchase per 10 levels (level 0-10 → 1, 11-20 → 2, 21-30 → 3, etc: `floor((max(level,1)-1)/10)+1`). Mirrored client-side in `shop.js` as `_undoFastTravelCap` for correct "Max" button state - keep both in sync if the formula changes.

**XP boost mechanics:**
- `xp_boost_pct` is stored in **tenths of a percent** (1 stored = 0.1% actual boost).
- Formula: `boosted = floor(amount × (1 + xp_boost_pct/1000))`. Applied only to XP awarded after the boost is gained.
- `xp_boost_pct` accumulates from two sources: shop purchases (+1 tenth per GC) and level-ups (+1 tenth per level = 0.1% per level). Both use the same column.
- `xp_from_boost` stores only the **extra** XP (`boosted - baseWhole`), incremented per event.
- On level-up detected in `_awardXpTx`: `xp_boost_pct` is incremented immediately; the triggering event uses the pre-level boost; the next event uses the new boost.
- One-time startup backfill (guarded by `level_boost_backfilled` key) grants existing users their level-based boost retroactively. Does **not** backfill `xp_from_boost`.
- Purchased Heartbeat XP changes the idle heartbeat base from `1` to `1 + (bonus_heartbeat_xp × 0.1)`, then multiplied by the normal boost before flooring.
- Purchased undos and fast travels stack on top of the level-based formula in `maxUndos()` / `maxFastTravels()`.

**Extra coin milestones:** coin rewards not tied to XP are tracked in `coin_events` and accumulated in `users.bonus_coins`. Deduped by `(user_id, event, ref)`, so recalculation/backfill is safe.

| Event | Reward | Trigger |
|-------|--------|---------|
| `playtime_24h` | 1 GC | Each time a user crosses another 1,440 `idle_heartbeat` events (24 tracked hours) |
| `book_completed` | 1 GC | First time a user earns `visit_all` for a book |
| `runs_milestone` | 1 GC | Every 100 completed runs (`win_run + death_run + battle_run` events) - ref is the milestone number as a string (`"100"`, `"200"`, …) |
| `visit_all_series` | N GC (N = child book count) | First time a user earns `visit_all` for every non-container book in a series |
| `visit_all_anthology` | N GC (N = child book count) | First time a user earns `visit_all` for every child book of an anthology |

Backfills for `book_completed`, `visit_all_series`, `visit_all_anthology`, and `runs_milestone` run once at startup (guarded by `book_complete_coin_backfilled`, `group_complete_coin_backfilled`, and `runs_milestone_coin_backfilled` keys in `admin_settings`). The `runs_milestone` check also fires at runtime after every state save that completes a run.

Avatar files are stored in `public/avatars/<userId>_<timestamp>.jpg` and served as static files. The old file is deleted when a new one is uploaded. `avatarUrl` is a path like `/avatars/<filename>`.

Book cover files are stored in `public/covers/<userId>_<bookId>_<timestamp>.jpg`. The old cover file is deleted when a new one is uploaded. `coverUrl` is a path like `/covers/<filename>`. Cover upload uses `POST /api/books/:id/cover` with a raw JPEG body (max 256 KB). From the regular app it is creator-only and awards XP; from the admin panel (localhost) it bypasses both checks. Cover removal uses `POST /api/books/:id/cover/delete` (localhost-only), which deletes the file and clears `cover_path`. `db.setBookCover` accepts an `isAdmin` flag that skips the creator and user_books membership checks.

Book PDF files are stored in `public/books/<bookId>_<timestamp>.pdf` and served via `GET /books/<filename>`. Upload: `POST /api/books/:id/pdf` (raw PDF body, max 128 MB, magic bytes `%PDF` validated). Remove: `DELETE /api/books/:id/pdf`. The old file is deleted when a new one is uploaded or when removed. `pdf_path` is stored on the `books` row. The static file gate (`GET /books/:path`) requires the request to be authenticated with a user who has `is_admin = 1` OR `pdf_access = 1`; unauthenticated requests and users without either flag receive `403`.

### Feedback API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/feedback` | Submit a feedback message. **No auth required** - accepts both authenticated and anonymous submissions. Body: `{ username, email?, message, attachment_ids?: number[] }`. Returns `{ id }`. If a valid Bearer token is present the thread is linked to that user; otherwise `user_id` is stored as `NULL`. `attachment_ids` is an optional array of IDs returned by prior `/api/attachments` uploads; only IDs uploaded by the same user and not yet linked are accepted. |
| GET | `/api/feedback` | Get the current user's feedback threads (auth required) → `[{ id, username, email, message, created_at, admin_unread, user_unread, messages: [{ id, sender, body, created_at, attachments: [{ id, filename, original_name }] }] }]` |
| POST | `/api/feedback/:id/reply` | User reply to a thread (auth required). Body: `{ message, attachment_ids?: number[] }`. |
| POST | `/api/feedback/:id/read` | Mark a thread as read by the user (auth required) → `{ ok: true }`. Clears the `user_unread` flag. |
| DELETE | `/api/feedback/:id` | Delete a thread for the user (auth required). |

The `feedback` table allows `user_id = NULL` for anonymous submissions. Anonymous users cannot retrieve or reply to their threads (no user identity to look up). The admin inbox receives all threads regardless.

### Forum API

The forum is a categorised threaded discussion board. Pages are fully server-rendered (crawlable SSR, no JS required to read), but posting requires a valid session token read from `localStorage` (`gamebook_auth_token`) client-side.

**Categories** (seeded once at startup, stored in `forum_categories`):

| Slug | Name |
|------|------|
| `general` | General Discussion |
| `recommendations` | Book Recommendations |
| `playthroughs` | Playthroughs & Spoilers |
| `feedback` | Site Feedback |
| `off-topic` | Off Topic |

**Pages (HTML responses)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/forum` | Forum index - shows all category cards with thread count and last-post time. |
| GET | `/forum/c/:slug` | Category page - lists threads in that category, newest pinned first then by last post. Includes "+ New Thread" button for logged-in users. |
| GET | `/forum/thread/:id` | Thread page - shows the OP and all replies. Breadcrumb links back to the category. |

All forum pages use `addForumSecurityHeaders()` which allows `script-src: 'unsafe-inline'` (required for inline forum JS) and restricts `connect-src: 'self'`.

**API endpoints (JSON, auth required)**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/forum/me` | Bearer token | Returns `{ id, username, isAdmin }` for the current session. Used by forum JS to determine if admin controls should be rendered. |
| POST | `/api/forum/threads` | Bearer token | Create a thread. Body: `{ title, body, category_id?, attachment_ids?: number[] }` (title max 200, body max 20000 chars) → `{ id }`. |
| POST | `/api/forum/threads/:id/posts` | Bearer token | Reply to a thread. Body: `{ body, attachment_ids?: number[] }` (max 20000 chars) → `{ id }`. `403` if thread is locked. |
| PATCH | `/api/forum/threads/:id` | Bearer token | Edit a thread's title and body. Body: `{ title, body }`. Owner or admin only. Returns `{ ok, edited_at }`. Sets `edited_at` timestamp; displayed as *edited date* in the thread view. |
| DELETE | `/api/forum/threads/:id` | Bearer token | Hard-delete a thread and all its posts. Owner or admin only; `403` otherwise. Also deletes the thread's own `attachments` rows and every one of its posts' `attachments` rows, and unlinks the underlying files from `ATTACHMENTS_DIR` on disk (`db.forumDeleteThread` returns `{ ok, filenames }`; `server.js`'s handler does the actual `fs.unlinkSync` per filename). Contrast with `DELETE /api/forum/posts/:id` below and both feedback-thread deletes, which are soft deletes and correctly leave attachments untouched. |
| PATCH | `/api/forum/posts/:id` | Bearer token | Edit a post's body. Body: `{ body }`. Owner or admin only. Returns `{ ok, edited_at }`. Soft-deleted posts cannot be edited. |
| DELETE | `/api/forum/posts/:id` | Bearer token | Soft-delete a post (sets `is_deleted=1`, replaces body with `[deleted]`, decrements `reply_count`). Owner or admin only. |
| POST | `/api/forum/threads/:id/lock` | Bearer token (admin) | Toggle thread locked state → `{ locked: bool }`. `403` if not admin. |
| POST | `/api/forum/threads/:id/pin` | Bearer token (admin) | Toggle thread pinned state → `{ pinned: bool }`. `403` if not admin. |

**Admin detection:** a user is considered a forum admin if `users.is_admin = 1`. `db.forumIsAdmin(userId)` checks this.

**`esc()` escaping (2026-07-25):** `server/forum.js`'s shared `esc()` helper only escaped `& < > "`, not single quotes. A few call sites (category-card/breadcrumb `onclick="location.href='...'"` links) embed an `esc()`'d value inside a single-quoted JS string within that attribute, so a value containing `'` could have broken out of it. Not currently exploitable - the only value ever placed there is a category slug, and categories are hardcoded at seed time with no API to create new ones with arbitrary content - but fixed anyway (`esc()` now also escapes `'` to `&#39;`) so it doesn't become a live gap if category creation is ever made dynamic.

**Forum dialog layout (2026-07-28):** `.wrap` and `.site-header` in `server/forum.js` use `max-width: 100%` (previously `max-width: 640px; margin: 0 auto` on both) - this removes the fixed-width column so forum pages fill the available width instead of leaving large empty margins inside the narrow forum modal iframe. Also fixed the reply-compose form picking up `.reply-indent`'s `margin-right: calc(80px + 0.6rem)` (meant to align a *posted* reply's row next to its 80px user-card, not the compose box itself, which has no user-card beside it) - that class assignment on `#reply-wrap` was simply removed. A follow-up grep across the whole repo found that was `.reply-indent`'s only usage anywhere, so the now-fully-orphaned CSS rule (base + its mobile override) was deleted too.

**Thread title disappearing behind the ellipsis (2026-07-28):** `.thread-title` truncates overflowing titles via `overflow: hidden; text-overflow: ellipsis`, but the title text lived inside a `<button class="nav-btn" onclick="...">` rather than plain inline content. Buttons render as atomic inline boxes, not normal text flow, so when the row didn't fit the browser couldn't partially clip text *inside* the button - it just dropped the whole button, leaving nothing but the ellipsis. This only became visible on **pinned** threads because the `pinned` badge eats extra width, pushing otherwise-fitting titles into overflow (non-pinned threads with the same title length had enough room without the badge). Fixed by swapping the `<button onclick="location.href=...">` for a real `<a href="...">` - anchors are genuine inline elements and truncate correctly, and this also makes the title link natively keyboard/middle-click/right-click friendly instead of only working via JS.

**Markup engine added to forum posts (2026-07-28):** `renderBody()` in `server/forum.js` only supported `[label](url)` links and `\n` → `<br>` - no bold/italic/underline/strikethrough/color, unlike the announcement system's `formatAnnBody()` (`public/js/feed.js`, duplicated in `admin/js/announcements.js`). Extended `renderBody()` with the same `**bold**` / `*italic*` / `__underline__` / `~~strikethrough~~` / `{color:name}...{/color}` regex chain (see `FORUM_COLORS`), so forum post bodies now support the same markup as announcements.

**Reduce Animations not reaching the forum iframe (2026-07-28):** the forum is a separate document served in its own `<iframe>` (`#forum-modal-frame`), so it never saw the parent app's `body.reduce-motion` class - the `forum-unread-pulse` animation (unread threads/categories/new posts) kept running regardless of the setting. Fixed with a small inline script at the top of `shell()`'s `<body>` that checks the same `localStorage.getItem('reduce-motion')` flag the main app uses (same-origin, so directly readable) and applies `body.reduce-motion` itself, plus matching `animation: none !important` CSS rules.

**Forum modal reopening to a stale page (2026-07-28):** `openForumModal()` in `boot.js` only reset the iframe's `src` if it differed from `getAttribute('src')` - but navigating *inside* the iframe (clicking a category/thread) changes its live location without ever touching the `<iframe>` element's own `src` attribute, so that comparison always saw the original `/forum` value and skipped resetting. Reopening the modal would silently keep showing wherever the iframe was last navigated to (by any user on that browser), not the forum home. Fixed by resetting via `forumFrame.contentWindow.location.replace(url)` instead, which reflects where the iframe actually is regardless of the attribute.

**Forum compose form layout (2026-07-28):** the "+ Attach" row and the "Post"/"Cancel" row were two separate stacked rows in both the new-thread and reply forms - merged into one row per form, with the (empty-when-no-attachments) `.att-list` div's existing `flex:1` acting as a spacer so Post/Cancel land flush right. Also bumped `textarea.forum-input`'s `min-height` from a flat `100px` (~4 visible rows regardless of screen size) so the compose box scales with the actual screen height instead of staying tiny on tall screens - the `100px` floor is kept so short viewports don't regress. The OP-edit and post-edit textareas had their own inline `style="min-height:120px"`/`100px"` overrides that silently defeated this class rule entirely - removed both so all four textareas (new thread, reply, OP edit, post edit) share the same dynamic sizing. While merging the rows, found `.forum-err`'s `margin-top: 0.4rem` was misaligning it against sibling buttons in every `align-items: center` row it's used in (all 4 usages, including the pre-existing OP/post edit forms) - removed, since none of its usages are in a stacked block context that needed the top spacing. Padding tightened further (2026-07-28, second pass): `.forum-form` padding `1rem→0.6rem`/margin-top `1rem→0.5rem`, its `h3` margin `0.75rem→0.4rem`, `.forum-input` padding `0.5rem 0.65rem→0.4rem 0.55rem`/margin-bottom `0.5rem→0.35rem`.

**Themed thread-title tooltip (2026-07-28):** `.thread-title` truncates long titles via `text-overflow: ellipsis`, with no way to see the full title short of opening the thread - added a CSS-only tooltip (`[data-tooltip]:hover::after`, using `content: attr(data-tooltip)`) instead of a native `title=""` attribute, so it's themed to match the rest of the forum's dark UI instead of the browser's plain default tooltip box. The full title is always set as `data-tooltip` (server can't know client-side whether a given title actually overflows), so non-truncated titles get a harmless redundant tooltip too.

**First tooltip attempt didn't render at all (2026-07-28):** the `data-tooltip` attribute and `position: relative` were initially placed on `.thread-title` itself, with the `::after` tooltip generated on that same element. But `.thread-title` also has `overflow: hidden` (needed for the ellipsis truncation above it) - and an element's own `overflow: hidden` clips *any* absolutely-positioned descendant that renders outside its box, including `::after`, even one deliberately positioned to escape via `bottom: calc(100% + Npx)`. The tooltip was being generated correctly the whole time, just invisibly clipped by the very rule that made truncation work in the first place. Fixed by moving `position: relative` and the `data-tooltip` attribute up to `.thread-card` (the outer grid container, which has no `overflow` rule of its own) instead, with the `::after` selector changed to `.thread-card[data-tooltip]:hover::after` - `attr()` can only read a `data-*` value from the same element the pseudo-element is generated on, so the attribute had to move with the positioning context, not just the CSS rule.

**Dynamic forum modal height - tried and reverted (2026-07-28):** attempted to make `#forum-modal` (`public/css/charsheet.css`) shrink-to-fit its content instead of always reserving a fixed `height: 92vh` (e.g. the 5-category forum index only needed a fraction of that). Since same-origin iframes never auto-size to their content on their own, this needed cross-frame plumbing: `server/forum.js`'s `shell()` reporting `document.documentElement.scrollHeight` to the parent via `postMessage` (on load and via a `ResizeObserver` on `document.body`), and `boot.js` translating that into an explicit `#forum-modal-frame` height, with `#forum-modal` switched to `max-height: 92vh` so it shrink-wrapped its flex children. Caught and fixed one real bug before it shipped - the textarea's `min-height` was still a plain `30vh` (relative to the iframe's own viewport, which this mechanism was now setting based on measured content), creating a circular dependency that converged mathematically but only after several visibly jerky resize steps whenever the compose form opened; fixed by computing the textarea's min-height once from the *parent* window's height instead (`--ta-min-h` custom property - kept even after the revert below, since it's harmless and arguably more correct than a plain `vh` regardless). Despite that fix, the mechanism still had a real bug in practice: navigating from a tall page (a thread with many replies) back to a short one (the forum index) left the modal stuck at the taller size instead of shrinking back down. Rather than debug further sight-unseen, reverted the whole mechanism back to the original fixed `height: 92vh` / `#forum-modal-frame { flex: 1 }` - simple and correct, if not space-efficient for short pages.

**Sitemap:** `/forum`, all 5 category pages (`/forum/c/:slug`), and every thread URL (`/forum/thread/:id`) are included in the sitemap. Book pages (`/book/:id`) are included for every non-demo book with `is_public = 1` only. `public/sitemap.xml` (a static file) was removed - it was dead weight, always shadowed by the `GET /sitemap.xml` route which is checked first, but confusing to find on disk since it looked like *the* sitemap and only had 2 stale URLs in it. `guide.html`'s `<lastmod>` is now the file's actual `mtime` (`fs.statSync`) instead of a hand-typed date that only got updated when someone remembered to.

**Social preview image:** `og:image`/`twitter:image` switched from `og-image.svg` to a pre-rendered `og-image.png` (1200x630, generated once via `rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png`, not regenerated at request time). Reason: several platforms that render link previews (Facebook, LinkedIn, Slack, iMessage) don't reliably rasterize SVG for `og:image`, only Twitter/X consistently does - so the SVG-only setup meant broken/missing preview images on most platforms. The `.svg` source file is kept in `public/` for future re-exports if the design changes; only the meta tag references (and the matching `og:image:type`, now `image/png`) were repointed, in `index.html`, `guide.html`, and the three server-side SSR meta-injection points in `server.js` (book/anthology pages, public profile pages) that fall back to the site-wide image when a book/user has no cover/avatar of their own.

All `/api/admin/*` routes and `GET /admin` are localhost-only (`403` otherwise, no auth token required). Admin UI, API reference, and settings are documented in `docs/admin.md` and `admin/admin-guide.html`.

**Admin stats endpoints:**
- `GET /api/admin/stats` - full payload: `users`, `books` (non-demo non-container top-level), `anthologies` (`is_container=1` top-level non-demo), `series` (all rows), `sessions`, `pdfCount`, sections, playthroughs, wins, deaths, DB size, coins, uptime, traffic. Battle deaths counted separately but not in top-level `deaths` card. Expensive.
- `GET /api/admin/live` - cheap 1-second-poll subset: `{ heapUsed, heapTotal, rss, cpuPct, sessionUptime, appAge, trafficIn, trafficOut }`. CPU% is a one-decimal float from `process.cpuUsage()` delta. Drives the Heap, RSS/CPU, and uptime cards.

**Traffic counters:** `_trafficIn` / `_trafficOut` accumulate raw bytes. Persisted to `admin_settings` (`traffic_in`/`traffic_out`) every 50 requests and on SIGINT/SIGTERM.

**Uptime tracking** (all stored in `admin_settings`):

| Key | Description |
|-----|-------------|
| `server_first_tracked_at` | Set once, never overwritten |
| `server_session_start_at` | Reset on each restart when gap > 5 s |
| `server_total_downtime_s` | Accumulated downtime |
| `server_last_heartbeat` | Written every 30 s |
| `server_stopped_at` | Written on clean shutdown, cleared to `0` on next start |

`_sessionStartAt` cached in memory. "Session Uptime" = `now - _sessionStartAt`. "App Age" = `now - getAppBirthTimestamp()` where `getAppBirthTimestamp()` = `MIN(created_at)` across `users` and `books`. Both refresh every second via the live endpoint.

---

## Database (`server/db.js`)

Uses `better-sqlite3` (synchronous SQLite). WAL mode enabled. `VACUUM` runs on every server startup (after pragma statements, before migrations) to reclaim freed pages and keep the file compact.

### Schema

```sql
users (id, username UNIQUE, password_hash, salt, avatar_path, public_profile, xp, last_country, last_city, active_country, active_city, active_loc_at, last_domain, last_active_at, coins_spent, xp_boost_pct, bonus_undos, bonus_fast_travels, failed_login_attempts, locked_until, is_protected, is_admin, is_author, is_contributor, display_name, pdf_access INTEGER DEFAULT 0, join_template_id INTEGER, created_at)
sessions (token PK, user_id → users, created_at, expires_at)
books (id, name, total_sections, discoverable_sections, isbn, issn, asin, cover_path, pdf_path, is_demo, pages, authors, description, created_by → users, created_at, updated_at, series_id → series SET NULL, series_number TEXT, is_container INTEGER DEFAULT 0, parent_book_id → books SET NULL, book_order INTEGER)
  INDEX idx_books_series_id ON books(series_id)
  INDEX idx_books_parent_book_id ON books(parent_book_id)
book_enemies (id, book_id → books CASCADE, name, attack INTEGER, defense INTEGER, hp INTEGER, pb INTEGER, created_at)
series (id PK AUTOINCREMENT, name TEXT UNIQUE, description TEXT, is_public INTEGER NOT NULL DEFAULT 0, created_by → users SET NULL, created_at)
user_series (user_id → users CASCADE, series_id → series CASCADE, added_at, rating REAL DEFAULT NULL; PRIMARY KEY (user_id, series_id))
user_stashes (id PK AUTOINCREMENT, user_id → users CASCADE, name TEXT, created_at)
stash_books (stash_id → user_stashes CASCADE, user_id → users CASCADE, book_id → books CASCADE; PRIMARY KEY (stash_id, book_id))
stash_series (stash_id → user_stashes CASCADE, user_id → users CASCADE, series_id → series CASCADE; PRIMARY KEY (stash_id, series_id))
user_books (id, user_id → users CASCADE, book_id → books CASCADE, state_data TEXT, rating REAL, notebook TEXT, party_id → book_parties SET NULL, bg_hidden INTEGER DEFAULT 0, bg_pos_y REAL DEFAULT 50, created_at, updated_at)
  UNIQUE INDEX ON user_books(user_id, book_id)
  INDEX idx_user_books_party_id ON user_books(party_id)
  INDEX idx_user_books_book_id ON user_books(book_id)
tips (id PK AUTOINCREMENT, text TEXT UNIQUE, type TEXT CHECK(type IN ('real','silly')), active INTEGER DEFAULT 1, created_at)
book_parties (id PK AUTOINCREMENT, book_id → books CASCADE, created_at)
party_invites (id PK AUTOINCREMENT, party_id → book_parties CASCADE, inviter_id → users CASCADE, invitee_id → users CASCADE, status TEXT DEFAULT 'pending', created_at, responded_at)
  UNIQUE INDEX ON party_invites(party_id, invitee_id)
xp_events (id PK AUTOINCREMENT, user_id → users, event TEXT, ref TEXT, created_at)
  UNIQUE INDEX ux_xp_events ON xp_events(user_id, event, ref)
  INDEX idx_xp_events_event_created ON xp_events(event, created_at)
admin_settings (key TEXT PK, value TEXT)
announcements (id PK AUTOINCREMENT, title TEXT, body TEXT, is_draft INT DEFAULT 1, pinned INT DEFAULT 0, created_at, published_at)
forum_categories (id PK AUTOINCREMENT, name TEXT, slug TEXT UNIQUE, description TEXT, sort_order INT DEFAULT 0)
forum_threads (id PK AUTOINCREMENT, user_id → users SET NULL, category_id → forum_categories, title TEXT, body TEXT, reply_count INT DEFAULT 0, is_locked INT DEFAULT 0, is_pinned INT DEFAULT 0, last_post_at, created_at, edited_at)
forum_posts (id PK AUTOINCREMENT, thread_id → forum_threads CASCADE, user_id → users SET NULL, body TEXT, is_deleted INT DEFAULT 0, created_at, edited_at)
level_up_templates (id PK AUTOINCREMENT, template TEXT UNIQUE, active INT DEFAULT 1, created_at)
join_templates (id PK AUTOINCREMENT, template TEXT UNIQUE, active INT DEFAULT 1, created_at)
taglines (id PK AUTOINCREMENT, text TEXT UNIQUE, active INTEGER DEFAULT 1)
attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,          -- stored filename: att_{userId}_{timestamp}{ext}
  original_name TEXT NOT NULL,         -- original filename from X-Filename header
  created_at   INTEGER,
  kind         TEXT,                   -- 'feedback_message' | 'forum_post' (NULL until linked)
  linked_id    INTEGER                 -- FK into feedback_messages.id or forum_posts.id
)
INDEX idx_attachments_kind_linked ON attachments (kind, linked_id)
```

**Attachments** - polymorphic file store used by both feedback messages and forum posts.

- Files are stored in `public/attachments/` as `att_{userId}_{timestamp}{ext}`.
- Uploaded via `POST /api/attachments`; returns `{ id, filename, original_name }`.
- `kind` and `linked_id` are `NULL` until the owning message is submitted; `db.linkAttachments(kind, linkedId, ids, userId)` sets them inside a transaction, guarded by `uploaded_by = userId AND linked_id IS NULL` to prevent hijacking or re-linking.
- `GET /api/feedback` and the forum thread page include an `attachments` array on every message.
- Archives (`.zip .7z .rar .gz`) are served with `Content-Disposition: attachment`; all other types are served inline.
- `serveStatic` serves `/attachments/` without session auth (same pattern as `/avatars/` and `/covers/`).
- JPEG magic bytes (`FF D8 FF`) override the client-supplied extension to `.jpg` at upload time.
- Client-side image compression (`util.js › compressImage`): if an image file exceeds a caller-given byte budget (defaults to 512 KB/1200px; `add-book.js`/`edit-book.js` pass 256 KB/900px for book/anthology covers) the client iterates JPEG quality from 0.92 down to 0.1 via canvas until the blob fits or quality bottoms out - at the floor it returns the smallest blob it managed rather than giving up, so a caller always gets something to upload. This used to be two separately-maintained copies (`util.js` for feedback/inbox attachments, `profile.js` for covers) that had quietly drifted - the `profile.js` copy gave up and returned `null` *before* even trying quality 0.1, unlike this one. Consolidated into this single implementation (2026-07-24); `profile.js` now only keeps `compressToBlob` directly for `confirmCrop`'s already-drawn avatar canvas, importing it from here rather than its own copy.

**Login rate limiting:**
- 5 consecutive failed attempts → account temporarily locked for 15 minutes (`locked_until = now + 900`). Returns `403` with a descriptive message.
- `failed_login_attempts` resets on successful login or when the temp lock expires.
- Admin can hard-lock any non-protected account (`locked_until = -1`); hard locks never auto-clear.
- Locked users appear in a "Locked Accounts" section at the top of the admin Users tab.

**Protected accounts** (`is_protected = 1`):
- Can never be locked or deleted. Flag set once at migration, survives username renames.
- Protected users skip all lock logic in `verifyUser`.
- `adminLockUser` and `handleAdminDeleteUser` refuse to act on them. Lock/Delete buttons hidden in the admin UI.

**Admin accounts** (`is_admin = 1`):
- Separate from `is_protected`. A protected account doesn't automatically have admin privileges.
- Controls admin API access (`isUserAdmin()`, `forumIsAdmin()`) and the Stats for Nerds admin count.

**Books are shared entities:** one `books` row holds metadata (name, sections, identifiers, cover) shared by all users tracking that title. Per-user data (graph, playthroughs, char sheet) lives in `user_books`. UNIQUE constraint on `(user_id, book_id)` with cascade on both FKs - deleting a user or book removes join rows. When the last `user_books` row is deleted, the `books` row and cover file are cleaned up.

`adminDeleteBook` (admin panel Delete) **refuses** with HTTP 409 `{ error: 'has_readers', count, names[] }` if any `user_books` rows exist for the book. The admin must remove those readers first. The user-facing `deleteBook` (`DELETE /api/books/:id`) is unaffected - it removes only the caller's own `user_books` row and transfers `created_by` ownership if the caller was the creator.

**`created_by`** stores the integer user ID who originally created the book.

- Only the creator may edit book metadata (`PATCH /api/books/:id`) or upload a cover (`POST /api/books/:id/cover`) from the main app.
- `PUT /api/books/:id/state` syncs `name`/`total_sections` back to `books` only for the creator.
- Non-creators can still track, play, and delete their own `user_books` row.
- The `✎` edit button is hidden for non-creators in both the books list and toolbar.
- Admin access to other users' books is via the admin panel only (localhost): `handleUpdateBook` sets `isAdmin = fromLocalhost`.
- `created_by` is `NULL` for books predating the migration; backfilled from the earliest `user_books` entry per book.
- The Gift Book action creates a new `user_books` row for the target user but does **not** change `created_by`.

**`is_author`** / **`display_name`** - added via `ALTER TABLE` migrations on startup.

- `is_author` is set by the admin via `POST /api/admin/users/:id/author` (`{ isAuthor: bool, displayName?: string }`).
- When `is_author = 1`, an amber ★ badge appears next to the user's name throughout the app.
- `display_name` is only editable by authors (via `PATCH /api/profile`) and replaces the username in all display contexts when set.
- Client-side: `_authorMap` (keyed by username) caches `{ isAuthor, displayName }`. `displayFor(username)` returns `displayName || username`; `authorBadge(username)` returns the ★ span.

`pdf_access` (`INTEGER DEFAULT 0`) controls whether a user can download book PDFs. When `pdf_access = 1` (or `is_admin = 1`), `GET /books/:path` serves the PDF file; otherwise a `403` is returned. Toggled by the admin via `POST /api/admin/users/:id/pdf-access` with body `{ pdfAccess: bool }`. Returned in `GET /api/profile` as `pdfAccess: bool`. Users with PDF access (or admins) see a small **PDF** link next to the book title in the play area; clicking it opens the PDF in a new tab.

`join_template_id` is assigned once at registration by randomly selecting a row from the `join_templates` table. It is backfilled for existing users on server startup. It permanently identifies which join-feed template a user owns - the same template is always used for that user's `user_joined` feed entry so the text is stable across refreshes.

**Geo and profile columns** (all added via `ALTER TABLE` migrations on startup):
- `public_profile` defaults to `0` (private); `xp` defaults to `0`.
- `last_country`/`last_city` - resolved at **login time** via `geoip-lite`. `NULL` until first login.
- `active_country`/`active_city` - updated on every authenticated request via `updateUserActiveGeo()` (10-minute write throttle + equality check). `active_loc_at` is the Unix timestamp of the last write.
- Admin panel **Location** column sources from `active_country`/`active_city`.
- `last_domain` - which of the app's domains (e.g. koldkat.net/pathmap.net/bookplay.net) the user was last seen on, read from `req.headers.host` in `authenticate()`/`authenticateOptional()` via `updateUserLastDomain()` (equality check only, no time throttle - the write is already a no-op on every request after the first since the domain essentially never changes mid-session). `NULL` until their first authenticated request after this was added. Admin panel **Domain** column sources from this, stripping a leading `www.`.

`isbn` stores the normalised ISBN string (digits only, no hyphens). `issn` stores the formatted ISSN string (`XXXX-XXXX`). `asin` stores the normalised ASIN (10 uppercase alphanumeric characters). All three are `NULL` when not set. A book entry will have either `isbn`/`asin` (book-format) or `issn` (magazine-format), but not both. `is_demo` is `1` for the built-in demo book, `0` for all user-created books.

`pages` is the physical page count of the source book (integer, `NULL` if not set). `authors` is a comma-separated list of author names (text, `NULL` if not set). `description` is a free-text description of the book (text, `NULL` if not set). All three are added via `ALTER TABLE` migrations on startup. They are displayed in the book detail modal and editable from the New Book form and Edit Book dialog.

`discoverable_sections` is an optional override (integer, `NULL` when not set) that caps the XP thresholds for `discover_all` and `visit_all`. It is stored on the shared `books` row so it applies to all users tracking the same title. It is only editable from the Edit Book dialog, and the dialog only reveals the field when the exploration wall has been hit (discovered == visited) - the condition that signals the user has mapped the entire reachable graph. Added via `ALTER TABLE` migration on startup.

**Series** (`series` table, linked via `books.series_id`): groups books into named series. `series_number` on `books` is free text (`"12"` or `"XII"`). `is_public INTEGER NOT NULL DEFAULT 0` controls public API visibility.

**Series library membership** (`user_series` table): a series only appears in a user's list if they have an explicit `user_series` row.

- Creator gets the row automatically on series creation.
- Other users add via `POST /api/series/:id/add?cascade=1` - the `cascade=1` param also adds all public books in the series to `user_books`.
- `getAllSeries(userId)` filters by `user_series`; `getAllSeries()` (no args) returns all series for admin/autocomplete.
- `addSeriesToLibrary(userId, seriesId)` - `INSERT OR IGNORE`.
- `removeSeriesFromLibrary(userId, seriesId)` - removes the `user_series` row **and** all the series' books from `user_books`.
- `removeSeriesEntryOnly(userId, seriesId)` - removes only the `user_series` row, leaves books in the library.
- `deleteSeries(seriesId)` - removes the shared series entirely, orphans all linked books (`series_id = NULL`), removes all `user_series` rows.
- `handleDeleteSeries`: non-creators remove only their own membership; creators transfer ownership to the next owner if one exists; only ownerless series are fully deleted.
- `getOrCreateSeries(name, userId, addToLibrary=false)` - resolves by name (case-insensitive), creating if absent. Only inserts into `user_series` when `addToLibrary=true` (create-book flow) or on brand-new series creation. `handleUpdateBook` passes `addToLibrary=false` so editing does not silently re-add a removed series.
- `getPublicSeriesInfo(seriesId)` - returns series metadata + public books sorted by `CAST(series_number AS REAL)` (numbered first, unnumbered alphabetically), plus aggregate `avgRating`/`voteCount`.
- The ✎ edit button is only shown to the series owner; `handleUpdateSeries` enforces this server-side (403 for non-owners).
- `getPublicBooksInSeries(seriesId)` - all `is_public = 1` direct books plus public children of anthology containers; used by the cascade-add flow.

**Stashes** (`user_stashes`, `stash_books`, `stash_series`): private library-organisation buckets. Affect only the right-panel books list; don't modify shared metadata.
- Can hold a mix of series and explicit books/anthologies. Items belong to at most one stash.
- `createStash()` / `updateStash()` validate ownership, then persist `book_id` and `series_id` rows.
- Stash counts/progress bars flatten nested contents: series → their visible items; anthologies → child books.
- Deleting a stash only removes the stash rows; items return to the main list automatically.

**Anthologies** (`is_container = 1`): a book row that acts as a parent container (e.g. *Warlock Magazine #5* containing three adventures).

- **Containers** have name, ISBN/ISSN, cover, page count, authors, description, and can be public. No section count or playthroughs (`total_sections = 0`, no Open button).
- **Children** (`parent_book_id → container`) have full graph/run tracking but no cover, ISBN/ISSN/ASIN, or pages - those live on the container.
- The Edit Book modal hides inappropriate fields: `is_container` hides the sections input; selecting a parent hides cover, identifiers, and pages.
- Child books can simultaneously belong to a series.
- Deleting a container orphans its children (`parent_book_id = NULL`) - children are never cascade-deleted.
- The 5-section minimum is bypassed for containers. All columns added via `ALTER TABLE` migrations at startup.

**Anthology cascade add/remove:**
- `addBookToLibrary(userId, bookId)` - detects `is_container = 1` and automatically adds all `is_public = 1` children, awarding XP per child.
- `deleteBook(userId, bookId)` - removes all children from the user's library when a container is deleted.

**Anthology feed and activity modal:**
- `getFeed()` joins with the parent book and includes `parentBookId`, `parentBookName`, `parentCoverUrl`, and `isContainer` on every feed entry.
- `book_created`/`book_added` events display "created anthology" / "added anthology" vs "created book" / "added book" based on `isContainer`.
- Child book feed entries show the book name + a purple **anthology tag** (`.feed-collection-tag`) + an amber **series tag** (`.feed-series-tag`) when applicable.
- Series info uses `COALESCE`: if a child has no direct series but its parent anthology does, the parent's series is used. This applies to `getFeed()`, `getBookActivity()`, `all_visited`, and `all_discovered`.
- `getBookActivity()` returns `parentId`, `parentName`, `isContainer`, and `children[]` in the `book` object.
- The activity modal shows an `Anthology: AnthologyName` chip for children (navigates to the anthology modal) and a "Books in this anthology" list for containers.

**Public books search** (`getAllPublicBooks()`):
- Excludes child books (`parent_book_id IS NOT NULL`).
- Includes containers that have at least one public child, even if the container itself isn't `is_public`.
- Each entry carries `childNames[]` so the covers panel search can match on child titles.
- Carries `isContainer`, `totalSections`, `description`, `isbn`, `issn`, `asin`, `pages`, `seriesName`, `seriesNumber` - used for the autocomplete pre-fill on Create Book / Create Anthology.
- Covers-panel search recognises keywords `anthology`/`anthologies` (shows only containers) and matches against `seriesName`.

`state_data` (in `user_books`) stores the full per-user client state object as a JSON string. `name`, `total_sections`, `discoverable_sections`, `isbn`, `issn`, `asin`, `pages`, `authors`, and `description` are stored as columns on `books` so the books list can be rendered without parsing state blobs. `cover_path` on `books` stores the filename only (not the full URL path).

**`book_enemies`** - reference enemy stat blocks feeding the enemy-name autocomplete inside a book's battle simulator (`GET /api/books/:id/enemies`). No admin UI exists for this table yet - rows are seeded by hand via direct SQL against `database.sqlite`, extracted from each book's actual combat encounters. `attack`/`defense`/`pb` map to book 829's opposed Attack/Defense/Proектоброня system (`battlesim829.js`); books using a different combat model (e.g. book 286's flat weapon min-hit system) repurpose `attack` to mean whatever that book's own simulator needs it to (for 286, "enemy minimum hit"), leaving `defense`/`pb` at 0. Book 8 doesn't use named per-section enemies at all - its rows are generic Skill/Life variant templates for `battlesim8.js`'s own dice-based enemy generator, not real book encounters.

### XP and levelling system

Users earn XP through gameplay activity. XP is stored incrementally in `users.xp`; every awarded event is recorded in `xp_events` with a UNIQUE constraint on `(user_id, event, ref)` so XP can never be double-awarded regardless of how many times the same action fires. The XP amount and event semantics are never exposed to users - they see only level, title, and a progress bar.

**Level formula**
```
xpForLevel(n)  = 1000 × n × (n+1) / 2
computeLevel(xp) = min(floor((-1 + sqrt(1 + 8·xp/1000)) / 2), 100)
```
Level 1 = 1,000 XP · Level 2 = 3,000 · Level 10 = 55,000 · Level 100 = 5,050,000 (cap)

`server/forum.js` keeps its own copy of `computeLevel()` (for the forum's user-panel level badge, since it's a separate SSR page with no access to `server/db.js`). Until 2026-07-25 its copy was missing the canonical version's `if (xp <= 0) return 0` guard - nothing in the schema prevents `users.xp` from going negative (no CHECK constraint, and XP revocation is a real mechanism), so a negative-XP user would show a nonsensical negative level in the forum specifically, while every other level display in the app correctly clamps to 0. Fixed to match.

**App level** (shown in Stats for Nerds) scales with the current user count:
```
appXpForLevel(n) = (number_of_users × 1000) × n × (n+1) / 2
appLevel = floor((-1 + sqrt(1 + 8 × totalXp / (number_of_users × 1000))) / 2)
```
`totalXp` is the sum of all XP ever awarded across all users. The threshold rises automatically as the player count rises.

**Titles** (one per level)

| Lvl | Title | Lvl | Title | Lvl | Title | Lvl | Title |
|-----|-------|-----|-------|-----|-------|-----|-------|
| 0 | Newborn | 26 | Pathbreaker | 51 | Adventurer | 76 | Paragon |
| 1 | Lost Soul | 27 | Realm Walker | 52 | Bold Wanderer | 77 | Exemplar |
| 2 | Stray | 28 | Horizon Seeker | 53 | Daring Scout | 78 | Peerless |
| 3 | Wandering Eye | 29 | Lore Hunter | 54 | Fortune Seeker | 79 | Master |
| 4 | Curious Soul | 30 | Outrider | 55 | Risk Taker | 80 | Grand Master |
| 5 | Seeker | 31 | Pathfinder | 56 | Danger Walker | 81 | Hero |
| 6 | Fledgling | 32 | Guide | 57 | Iron Will | 82 | Guardian |
| 7 | Apprentice | 33 | Navigator | 58 | Brave Heart | 83 | Defender |
| 8 | Initiate | 34 | Wayfinder | 59 | Fearless One | 84 | Protector |
| 9 | Novice | 35 | Trailmaster | 60 | Undaunted | 85 | Stalwart |
| 10 | Student | 36 | Route Keeper | 61 | Veteran | 86 | Bastion |
| 11 | Wanderer | 37 | Mapper | 62 | Seasoned Hand | 87 | Paladin |
| 12 | Drifter | 38 | Chartist | 63 | Old Guard | 88 | Luminary |
| 13 | Rover | 39 | Lorekeeper | 64 | Grizzled Tracker | 89 | Beacon |
| 14 | Roamer | 40 | Chronicler | 65 | Battle-Scarred | 90 | Vanguard |
| 15 | Traveller | 41 | Cartographer | 66 | Proven Explorer | 91 | Legend |
| 16 | Wayfarer | 42 | Mapmaker | 67 | Tested Wayfarer | 92 | Myth |
| 17 | Scout | 43 | Geographer | 68 | Hardened Soul | 93 | Immortal |
| 18 | Ranger | 44 | Atlas Keeper | 69 | Ironclad | 94 | Demigod |
| 19 | Journeyman | 45 | Realm Scribe | 70 | Elder | 95 | Ascendant |
| 20 | Trailblazer | 46 | Land Warden | 71 | Champion | 96 | Exalted |
| 21 | Explorer | 47 | World Mapper | 72 | Conqueror | 97 | Transcendent |
| 22 | Pioneer | 48 | Domain Master | 73 | Victor | 98 | Eternal |
| 23 | Surveyor | 49 | Grand Surveyor | 74 | Vanquisher | 99 | Timeless |
| 24 | Discoverer | 50 | Master Mapper | 75 | Undefeated | 100 | Godwalker |
| 25 | Frontiersman | | | | | | |

**XP events** (admin reference - not shown to users)

| Event | XP | Ref key | Condition |
|---|---|---|---|
| `discover_node` | 1 | `bookId:sectionId` | First time a section appears in the graph, per book |
| `visit_node` | 2 | `bookId:sectionId` | First time a section appears in any run path, per book |
| `death_run` | 10 | `bookId:runIndex` | Per completed death run |
| `win_run` | 20 | `bookId:runIndex` | Per completed win run |
| `discover_all` | 30 | `bookId` | Once per book when discovered ≥ effective_sections (`discoverable_sections ?? total_sections`) |
| `visit_all` | 40 | `bookId` | Once per book when visited ≥ effective_sections (`discoverable_sections ?? total_sections`). Also grants 1 one-time Gold Coin milestone for that user/book. |
| `add_book` | 50 | `bookId` | Per book created |
| `add_isbn` | 25 | `bookId` | Once per book when ISBN first set |
| `add_issn` | 25 | `bookId` | Once per book when ISSN first set |
| `add_asin` | 25 | `bookId` | Once per book when ASIN first set |
| `add_pages` | 5 | `bookId` | Once per book when page count first set |
| `add_authors` | 10 | `bookId` | Once per book when author(s) first set |
| `add_description` | 50 | `bookId` | Once per book when description first set |
| `upload_cover` | 10 | `bookId` | Once per book on first cover upload |
| `make_book_public` | 125 | `bookId` | Once per book, first time `is_public` is toggled to true; creator only |
| `share_run` | 15 | `bookId:runIndex` | Per run, first time `isPublic` set to true |
| `add_note` | 5 | `bookId:sectionId` | Once per node per book, first time note is set non-empty |
| `set_priority` | 3 | `bookId:sectionId` | Once per node per book, first time priority is set |
| `charsheet_saved` | 65 | `bookId:runIndex` | Once per run, first time the user **manually** saves the character sheet (detected via `pt.charSheetEdited = true` set by `charsheet.js` on the Save button click - template auto-apply on run start does not set this flag) |
| `charsheet_run` | 10 | `bookId:runIndex` | Once per run, first time charSheet.fields becomes non-empty |
| `notebook_saved` | 65 | `bookId:runIndex` | Once per run, first time notebook is saved via PUT /api/books/:id/notebook with a valid ptIdx |
| `run_depth` | 25 | `bookId:runIndex` | Per run, first time the run path becomes non-empty (the run is started) |
| `mark_battle` | 4 | `bookId:sectionId` | Once per node per book, first time a node is flagged as a battle location |
| `set_color` | 3 | `bookId:sectionId` | Once per node per book, first time a custom colour is applied to the node |
| `battle_run` | 15 | `bookId:runIndex` | Per completed battle-death run |
| `public_profile` | 75 | `userId` | Once per user, first time profile made public |
| `upload_avatar` | 25 | `userId` | Once per user, first avatar upload |
| `rate_book` | 25 | `userBookId` | Once per user per book, first time a rating is submitted. Requires at least one completed run. |
| `rate_series` | 25 | `seriesId` | Once per user per series, first time a series rating is submitted. Requires all books/anthologies in the series to have been run. |
| `forum_thread` | 25 | `threadId` | Per new thread created |
| `forum_post` | 5 | `postId` | Per new reply posted (edits do not re-award) |
| `add_to_library` | 15 | `bookId` | Once per book, when a user adds someone else's public book to their library |
| `book_added_by_other` | 150 | `bookId:adderId` | Once per adder per book, awarded to the book's creator when another user adds it to their library |
| `series_added_by_other` | 150 | `seriesId:adderId` | Once per adder per series, awarded to the series creator when another user adds it to their library |
| `pdf_available` | 150 | `bookId` | Once per book; awarded to the uploader (or all library holders if uploaded from localhost) on **first upload only** - re-uploads do not re-award |
| `export_all` | 200 | `0` | Once per user, first time they use Export Everything |
| `export_book` | 50 | `bookId` | Once per book, first time the user exports that book |
| `create_series` | 50 | `seriesId` | Once per series, on first creation (not find-existing) |
| `add_series_description` | 10 | `seriesId` | Once per series, first time description is set (on create or edit) |
| `add_book_to_series` | 10 | `bookId` | Once per book, first time a series is assigned to a book (on create or update) |
| `add_book_to_anthology` | 10 | `bookId` | Once per book, first time it is attached to an anthology (on create or update) |
| `add_series_number` | 5 | `bookId` | Once per book, first time a series number is set while the book belongs to a series |
| `add_anthology_order` | 5 | `bookId` | Once per book, first time an anthology order number is set while the book belongs to an anthology |
| `create_party` | 75 | `partyId` | Awarded to the original party creator when the first invitee accepts and the party becomes a real multi-user party |
| `join_party` | 50 | `partyId:userId` | Once per user per party, when a pending invite is accepted |
| `party_formed` | 0 | `partyId` | Awarded to the party creator (0 XP; exists solely for feed deduplication) when the first invite is accepted. Referenced by the `party_formed` feed event. |
| `first_win` | 100 | `bookId` | Once per book per user, on the first run completed with `result === 'success'`. Uses book-scoped ref (never series-scoped) so it fires regardless of open world. |
| `first_loss` | 50 | `bookId` | Once per book per user, on the first run completed with `result === 'death'`. |
| `first_battle_death` | 25 | `bookId` | Once per book per user, on the first run completed with `result === 'battle'`. |
| `won_all_series` | 20 × N | `seriesId` | Once per user per series (N = non-demo non-container book count). Fires inside `processStateXp` after any `win_run` when every book in the series has at least one `win_run` event for this user. Skipped for open-world series (series runs cover that). |
| `won_all_anthology` | 20 × N | `parentBookId` | Once per user per anthology (N = non-demo child count). Same trigger logic as `won_all_series` but scoped to the anthology's `parent_book_id`. |
| `discover_all_series` | 30 × N | `seriesId` | Once per user per series. Fires after a book's `discover_all` award when all non-demo non-container books in the series also have `discover_all`. |
| `visit_all_series` | 40 × N | `seriesId` | Once per user per series. Same trigger as `discover_all_series` but for `visit_all`. |
| `discover_all_anthology` | 30 × N | `parentBookId` | Once per user per anthology. Fires after a child book's `discover_all` when all non-demo children have `discover_all`. |
| `visit_all_anthology` | 40 × N | `parentBookId` | Once per user per anthology. Same trigger as `discover_all_anthology` but for `visit_all`. |
| `idle_heartbeat` | 1 | `minuteBucket` | Once per minute per user while an authenticated feed refresh hits the server (used by the 60-second activity-feed poll) |
| `favorite_cover` | 5 | `book:id` / `series:id` | Once per cover item, first time a logged-in user favorites a book, anthology, or series cover from the public covers wall |
| `inventory_started` | 25 | `bookId` | Once per book, first time any playthrough's inventory becomes non-empty |
| `add_item` | 5 | `bookId:itemId` | Once per book per distinct item ID, first time that item appears in any playthrough's inventory |
| `add_charsheet_field` | 5 | `bookId:runIndex:fieldId` | Once per user-added character sheet field. Only fields absent from the book's `charSheetTemplate` at save time are counted - template fields copied to a new run do not award XP. Deduped by `fieldId` so editing or re-saving never double-awards. |

All group milestone events (`won_all_*`, `discover_all_*`, `visit_all_*`) use `INSERT OR IGNORE` and therefore can only be awarded once per user per entity, even if new books are later added to the series or anthology. The XP multiplier (N) is the book count **at the time the milestone fires**, not at the time the event is queried. Helper functions `_checkGroupMilestone` and `_checkGroupWonAll` in `db.js` implement the "all books achieved" check with a `NOT EXISTS` subquery.

**XP configuration table**

XP amounts are stored in the `xp_config` DB table (not hardcoded):

```sql
CREATE TABLE IF NOT EXISTS xp_config (
  event  TEXT PRIMARY KEY,
  amount REAL NOT NULL
);
```

On startup, every known event is seeded with `INSERT OR IGNORE` so existing overrides are never reset. An in-memory `Map` (`_xpCache`) is built once from the table; `getXpAmount(event)` reads from it - zero DB round-trips per award. `setXpAmount(event, amount)` writes to both the DB and the cache atomically; changes take effect immediately without a restart.

Admin panel → **XP Configuration** section lists all events with editable inputs. Saving posts each changed row to `POST /api/admin/xp-config`.

Two call patterns:
- `awardXp(userId, event, ref)` - uses `getXpAmount(event)` automatically.
- `awardXp(userId, event, ref, amountOverride)` - overrides the config value. Used for dynamic amounts (`idle_heartbeat` + purchased bonus, group milestone `N × rate`).

**Key functions in `db.js`**

- `awardXp(userId, event, ref, amountOverride = null)` - transaction: `INSERT OR IGNORE` into `xp_events`, then `UPDATE users SET xp = xp + amount` only if a row was actually inserted (rows-changed = 1). Idempotent by design. Amount comes from `xp_config` unless overridden.
- `getXpAmount(event)` - reads from in-memory cache; returns 0 for unknown events.
- `getXpConfig()` - returns all rows from `xp_config` ordered by event name (used by admin panel).
- `setXpAmount(event, amount)` - upserts `xp_config` and updates cache.
- `getUserXpInfo(userId)` → `{ xp, level, title, levelXp, nextLevelXp }` - single SELECT on `users`, no joins.
- `processStateXp(userId, bookId, oldState, newState, totalSections)` - called in `handleSaveState` after the state is written. Diffs old vs new state JSON already in memory and fires the appropriate `awardXp` calls. No full recomputation; at most a handful of INSERT OR IGNORE + one UPDATE per save.

**Per-run reward ref bug, fixed 2026-07-19 (real XP loss, not cosmetic):** `death_run`/`battle_run`/`win_run`/`share_run`/`charsheet_run`/`charsheet_saved`/`run_depth` all used to key their dedup ref off the run's **array index** in `playthroughs` (`${bookId}:${i}`, or `series:${owSeriesId}:${i}` for open world). A run's array slot isn't stable - once a run at a given index is deleted, a later, entirely unrelated run can land on that same index. Since the ref only encodes the index, the new run's reward attempt collides with the deleted run's leftover `xp_events` row and gets silently swallowed by `INSERT OR IGNORE` - the new run legitimately earned the reward and never got it, with no error, no log, nothing to notice. `run_depth` (fires on essentially every run, the moment it has any path at all) was overwhelmingly the most common victim simply because it's the most frequently-triggered of this group, not because of anything special about it. Fixed by keying the ref off the run's own `startedAt` timestamp instead (`newPt?.startedAt ?? i`, with the array index kept only as a fallback for the rare old run predating this field) - `startedAt` is assigned once at creation and never reused, so two different runs can never collide again regardless of what happens to the array around them. Both the fast-path loop and the "reconciliation safety net" fallback (a few lines below) needed the same fix - both built the ref the same way.

**Backfill (`scripts/backfill_run_reward_refs.js`, one-time, already run 2026-07-19):** scans every `user_books` row; for each playthrough with a `startedAt`, checks each of the 7 affected event types' *current* condition (e.g. `pt.completed && pt.result === 'death'` for `death_run`) - not a before/after diff, since this runs once against final state, not live saves. For each currently-true condition: skip if already awarded under the *new* (`startedAt`-based) ref; otherwise check the *old* (index-based) ref - if no row exists there either, or if it exists but its `created_at` predates this run's own `startedAt` (proof the row belongs to a deleted predecessor, not this run), award it fresh via the real `awardXp` (not a reimplementation, so boost/carry/level-up/coin-milestone handling is exactly production-correct). Idempotent by the same `INSERT OR IGNORE` the whole system already relies on, so re-running it is always safe (finds nothing new). Result: 216 awards, 5,206 total XP, across 14 users. `add_charsheet_field` (per-custom-field XP, also index-ref-scoped) was **not** included in this backfill - smaller amounts, not covered, a known small remaining gap if anyone asks about it specifically.

**`run_depth` stays index-based on purpose - a farming loop found and corrected the same day.** The `startedAt` fix above is right for `death_run`/`win_run`/`battle_run`/`share_run`/`charsheet_run`/`charsheet_saved`, since each represents real, distinct effort that deserves credit even if it happens at a reused array slot. `run_depth` (~25 XP, fires the instant *any* run has a non-empty path, i.e. essentially on creation) is different: starting a run costs nothing, so giving it a guaranteed-unique ref made it directly farmable (create a run, get the XP, delete it, repeat indefinitely).

A first attempt over-corrected this by making `run_depth` a one-time-per-book bonus (like `first_win`/`first_loss`) - **this was wrong and was reverted the same day.** The correct behavior, confirmed by the user: re-creating a run at the *same* array slot after deleting it should not re-earn `run_depth`, but a genuinely new, never-before-used slot should. Plain index-based dedup (the *original* pre-session ref scheme) gives exactly that for free - slot 24 re-created after deletion collides with its own earlier award (correctly no XP); slot 26, never used before, is fresh and awards normally. So `run_depth` deliberately kept (reverted back to) `${bookId}:${i}` / `series:${owSeriesId}:${i}` - the only one of the seven events that intentionally does **not** use the `startedAt`-based ref, and this is by design, not an oversight - don't "fix" it to match the others.

**Two follow-up scripts, both one-time, both run 2026-07-19, in this order:**
1. `scripts/revoke_duplicate_run_depth.js` - built for the (wrong) one-time-per-book model: collapsed every user's multiple `run_depth` rows per book down to one, deducting XP for the rest. **This wrongly took away legitimately-earned XP** for every distinct slot beyond the first, since under the correct index-based model each slot deserves its own award. Left in place as one-time tooling for the record; do not run it again - it encodes the wrong model.
2. `scripts/restore_run_depth_correction.js` - the actual fix: for every currently-occupied run slot (any playthrough with a non-empty path) lacking its *own* index-based award, awards `run_depth` fresh via the real `awardXp`. This restored what script 1 wrongly took away, *and* separately closed a handful of genuinely pre-existing gaps from the original slot-collision bug (indices that had never gotten their due `run_depth` even before any of today's changes) - both are legitimate, so its restored total is larger than what script 1 removed. Result: 626 awards restored, 16,430 XP, across 16 users. Idempotent, safe to re-run (finds nothing new going forward).

Net effect of the whole day's `run_depth` saga: the model is back to (and confirmed correct against) the original per-slot index-based design, every currently-real slot has its due XP, and the create/delete farming loop is closed. `xp_events` doesn't record the amount granted per row, so the two scripts' numbers don't perfectly cancel to zero - a small residual drift (a few hundred XP either way, driven by boost % possibly differing between when XP was revoked vs. restored) is expected and was not chased further; it's noise at this scale, not a correctness problem.
- `migrateXpForUser(userId)` - scans all of a user's books and their state_data blobs, awarding all retroactive XP via `awardXp`. Idempotent (INSERT OR IGNORE).
- `runXpMigration()` - called on server startup. Finds users with no `xp_events` rows and runs `migrateXpForUser` on each. After first run, users have xp_events rows so this is a no-op on all subsequent startups.
- `getRandomJoinTemplate()` - returns a random row from `join_templates`. Used at registration to assign a permanent `join_template_id` to the new user.
- `getRandomTagline()` - returns a random `text` value from the `taglines` table where `active = 1`. Falls back to the default tagline string if the table is empty. Called once at server startup; result cached in `_activeTagline`.
- `getAllBooksForExport(userId)` - returns all non-demo books for a user with parsed state, sorted by name. Used by the full-account export.
- `getBookForExport(userId, bookId)` - targeted single-book query; avoids parsing every book's state just to find one. Used by the per-book export endpoint.

**Demo book**

`createDemoBook(userId)` inserts a pre-built fictional gamebook ("Demo Book", 50 sections) directly into the `books` table for a new user. Returns `lastInsertRowid`. Called once from `handleRegister` immediately after user creation. After inserting, `handleRegister` writes an SVG cover file (`demo_<userId>.svg`) to `covers/` and calls `db.setBookCover` to attach it.

`handleRegister` also assigns the new user a random `join_template_id` from `join_templates` (populated with 50 templates at startup, same `INSERT OR IGNORE` seeding pattern as `level_up_templates`), then calls `feedPush` to broadcast a `user_joined` event to all live-connected clients immediately. Existing users without a `join_template_id` are backfilled at startup.

The state includes a fully mapped 50-node graph across 10 layers, 2 completed runs (one death, one win), and 1 in-progress run, plus notes and priority markings on several nodes. **Only section 49** has a death choice (`[50, -1]`) and **only section 50** has the win choice (`[0]`). All paths through the book funnel to section 49 via sections 45–48.

The book's `state_data` carries `isDemoBook: true`. This flag is checked in three places:
- `processStateXp` - returns immediately; no XP is ever awarded for activity on the demo book
- `getFeed` - demo book runs are excluded from the activity feed
- `migrateXpForUser` - skips the demo book during the one-time XP backfill

The demo book is treated as a normal book in every other way - the user can open, edit, play, and delete it freely.

**XP award trigger points in `server.js`**

| Handler | Event(s) fired |
|---------|---------------|
| `handleSaveState` | `discover_node`, `visit_node`, `death_run`, `battle_run`, `win_run`, `discover_all`, `visit_all`, `share_run`, `add_note`, `set_priority`, `mark_battle`, `set_color`, `charsheet_saved`, `charsheet_run`, `run_depth`; and milestones `first_win`, `first_loss`, `first_battle_death`, `won_all_series`, `won_all_anthology`, `discover_all_series`, `visit_all_series`, `discover_all_anthology`, `visit_all_anthology` where applicable |
| `handleSetNotebook` | `notebook_saved` |
| `handleCreateBook` | `add_book` (always); `add_isbn`, `add_issn`, `add_asin`, `add_pages`, `add_authors`, `add_description` each fired if the respective field is provided; `add_book_to_series` (10) if `seriesId` is set; `add_series_number` (5) if `seriesId` and `series_number` are set; `add_book_to_anthology` (10) if `parent_book_id` is set; `add_anthology_order` (5) if `parent_book_id` and `book_order` are set |
| `handleUpdateBook` | `add_isbn`, `add_issn`, `add_asin`, `add_pages`, `add_authors`, `add_description` each fired if the respective field was null before and is now set; `make_book_public` if `is_public` was false and is now true; `add_book_to_series` (10) if series was not previously set and is now set; `add_series_number` (5) if series number was previously empty and is now set while the book belongs to a series; `add_book_to_anthology` (10) if anthology parent was not previously set and is now set; `add_anthology_order` (5) if anthology order was previously empty and is now set while the book belongs to an anthology |
| `handleCreateSeries` | `create_series` (50) if `!result.existed`; `add_series_description` (10) if `!result.existed && description` |
| `handleUpdateSeries` | `add_series_description` (10) if series previously had no description and description is now set |
| `GET /api/feed` route | `idle_heartbeat` (1 XP max per minute, keyed by a server-side minute bucket, only when the request is authenticated) |
| `handleSetPrefs` | `favorite_cover` (5) when `favoriteBookIds` / `favoriteSeriesIds` gains a new cover ID |
| `handleUploadCover` | `upload_cover` |
| `handleUploadAvatar` | `upload_avatar` (only on first upload) |
| `handleUpdateProfile` | `public_profile` (if publicProfile === true in request body) |

**Profile modal display**

The profile modal shows a level badge, title, and progress bar between the avatar and the username field:
- `#profile-level-badge` - "Lvl N"
- `#profile-title-text` - title string
- `#profile-xp-bar-fill` - width = `((xp - levelXp) / (nextLevelXp - levelXp)) × 100%`
- `#profile-xp-text` - "X / Y XP" (or total XP at level 100)

Populated by `renderXpBlock(data)` in `profile.js`, called from `openProfileModal` using the XP fields returned by `GET /api/profile`.

The client also uses `GET /api/profile` deltas to drive the bottom-right XP / coin reward floater (`#reward-float-layer`). `rewards.js` keeps the last seen `{ xp, coinsBalance }` snapshot, compares it against fresh profile responses, and shows a merged floating notice when XP or coins increase. This is intentionally client-side only - no separate reward event stream or schema is involved.

**Positioning (`_positionRewardLayer`)** sets `layer.style.left` directly from measured `getBoundingClientRect()`s rather than pure CSS, since the correct gap to center in depends on which screen is showing (books/landing vs. the play area) - a `left`/`right`/`transform` reset always runs first, then one of three branches sets real values, in this order: books screen with the whole landing UI collapsed (dead-center, `50%`), books screen normally (between `#feed-panel` and `#landing-right`), or the play area (`mainVisible`, between `#play-bottom-stack` and `#play-btn-row`). Any inline `left` this sets always wins over `mobile.css`'s plain `calc(75vw + var(--sidebar-w) / 4)` fallback rule (inline styles beat any external stylesheet), which only actually applies if none of the three branches matched - in practice, rare. The play-area branch used to reference `#play-btns-bar` and `#charsheet-btn` as the gap's two edges - fixed to reference `#play-bottom-stack` and `#play-btn-row` (the actual containers) instead, since `#charsheet-btn` is just one button inside `#play-btn-row`'s `flex-direction: row-reverse` layout and isn't a stable stand-in for the row's real left edge once more buttons (inventory/equipment/battlesim) get appended and the row wraps. Confirmed working for the general case (e.g. heartbeat XP floaters); a separate, still-open issue exists for specific actions - see below.

**Known issue, unresolved as of 2026-07-19:** on a 1600×900 screen, floaters were reported missing specifically for run completion (loss/win) and marking a run public while in the play area - other XP sources (e.g. heartbeat) float correctly. Confirmed via direct DB query that the XP *is* awarded server-side (`death_run`/`share_run` events fire correctly at the right time), so nothing is wrong with awarding - this is purely about why these three specific triggers don't result in a floater. The likely suspect: unlike heartbeat XP (which the client learns about via its own periodic poll), a completed run or public-toggle only reaches the server via `PUT /api/books/:id/state`, whose response is just `{ok:true}` - the client only learns the new XP exists once `state.js`'s `book-state-saved` event fires (`books.js`'s listener calls `_hooks.scheduleRewardProfileRefresh?.()`, which debounces a single shared 850ms timer via `rewards.js`'s `_scheduleRewardProfileRefresh`) and *that* eventually calls `refreshCoinsDisplay()` → `GET /api/profile` → `_processRewardSnapshot`. That chain was traced end-to-end and looks structurally correct in the code - the failure hasn't been reproduced or observed directly (no browser tooling was available to this session), so the actual break point in that chain (or something else entirely) is still unconfirmed. Don't assume this is fixed by the `#play-bottom-stack`/`#play-btn-row` positioning change above - that's a separate, already-working piece.

---

### Password hashing

`crypto.scrypt` (Node built-in, promisified) with a random 16-byte hex salt. Stored as `{ password_hash, salt }`. Verification uses `crypto.timingSafeEqual`.

### Sessions

Random 32-byte hex token stored in the `sessions` table. Sent to the client on login/register; client stores it in `localStorage` under `gamebook_auth_token`.

Sessions expire 7 days after creation (`expires_at = created_at + 604800`). `getSession` rejects any token whose `expires_at` is in the past - the client receives a 401 and is redirected to the login screen. `expires_at` is added via an `ALTER TABLE` migration on startup; existing rows receive a default of `created_at + 7 days`. Expired rows are deleted on server startup and whenever the admin runs a Vacuum.

---

## State model

### Persisted (server-side, `books.state_data`)

```js
{
  bookName:      string,
  totalSections: number,
  startSection?: number,  // start section for new runs; defaults to 1 if absent; set via "Edit start node" right-click menu (only available before any runs)
  graph: {
    [sectionId: number]: {
      choices:   number[],   // outgoing section numbers; -1 = death, 0 = victory
      note?:     string,     // optional free-text note; omitted when empty
      showNote?: boolean,    // if true, note text is rendered as a pinned label beside the node in the graph
    }
  },
  playthroughs: [
    {
      path:        number[],              // visited section numbers in order; never contains -1 or 0
      completed:   boolean,
      result:      'death' | 'battle' | 'success' | null,  // 'battle' = ended mid-graph by battle death
      isPublic?:      boolean,            // if true, this run is publicly viewable; defaults to false/absent
      completedAt?:   number,            // Unix timestamp (ms) when the run ended
      lastActionAt?:  number             // Unix timestamp (ms) of the last navigate() call; updated on every step for active runs
    }
  ],
  activePtIndex: number | null,         // index into playthroughs; null if no active run
  positions: {
    [sectionId: number]: { x: number, y: number }
  },
  viewport?: { x: number, y: number, scale: number }  // last saved pan/zoom; undefined until first zoom or pan
}

// Per-node graph entry (extended fields):
// choices:   number[]
// note?:     string
// priority?: 'high' | 'low'   - absent when normal
// battle?:   true              - absent when not flagged; marks a node where battle death is possible
// color?:    string            - CSS hex colour (e.g. '#ef4444'); absent when no custom colour set

charSheetTemplate: {          // null if no template set; one per book
  fields: [ ... ]             // same structure as per-run charSheet
} | null,

alphanumericSections?: boolean,  // if true, section IDs are treated as strings (e.g. 'A1'); default false
notesPinned?: boolean,           // if true, the notebook overlay is shown pinned on the play area; persists across refreshes
connectorStyle?: string,         // vis-network edge smooth style; one of 'curvedCW'|'curvedCCW'|'cubic'|'horizontal'|'straight'; default 'curvedCW'

// Per-run charSheet (inside each playthrough object):
// playthroughs[i].charSheet = {
//   fields: [
//     {
//       id:       string,                                // random ID, stable across renames
//       name:     string,
//       type:     'number' | 'boolean' | 'text' | 'list' | 'enum',
//       value:    number | boolean | string | string[],
//       visible:  boolean,                               // show in the compact overlay
//       options?: string[],                              // enum only: available choices
//     }
//   ]
// }
```

### Not persisted (module-level in `state.js`)

| Variable | Type | Purpose |
|----------|------|---------|
| `viewingPt` | `playthrough \| null` | Which completed run's path is currently displayed in the trail and highlighted in the graph |
| `currentBookId` | `number \| null` | Which book is currently open; used by `saveState` to know which API endpoint to write to |

Both reset to `null` on page load and when navigating back to the books screen.

---

## Auth flow (client-side, `state.js` + `boot.js`)

On boot, `boot.js` checks `localStorage` for `gamebook_auth_token`:
- Token present → `showBooks()` (fetches `/api/books`)
- No token → `showLogin()`

If any API call returns `401`, `apiFetch` fires an `auth-expired` DOM event, clears the stored token and username, and `boot.js` redirects to the login screen.

If any call (authenticated or not) returns `503`, both `apiFetch` (`state.js`) and `publicFetch` (`boot.js`) dispatch a `maintenance-mode` window event. A `{ once: true }` listener calls `location.reload()` - the user lands on the maintenance page after the reload. `publicFetch` is a thin wrapper around `fetch` used for all unauthenticated public API calls (feed, public book/series/user activity, public run data) so that maintenance-mode ejection works even for logged-out users browsing the feed.

This depends on every authenticated call actually going through `apiFetch` rather than a raw `fetch`. `export.js`'s `exportAll`/`exportBook` used to call `fetch()` directly (building their own `Authorization` header by hand) and so silently skipped both the 401 and 503 handling above - a maintenance-mode reload or an expired session mid-export just showed a generic "Export failed." alert instead of the normal ejection flow. Fixed (2026-07-24) by routing both through `apiFetch`. Same class of gap in `demo.js`'s `startDemoMode()` - `GET /api/demo` is unauthenticated (no `authenticate()` call server-side, so anyone can try the demo without logging in), but it called raw `fetch()` instead of `publicFetch`/`fetchPublic`, missing the 503 handling `publicFetch` exists specifically to give logged-out callers. Fixed the same day by routing it through `fetchPublic`.

Same gap again (2026-07-25) in the `/api/attachments` upload used by both `feedback.js` and `inbox.js` - each had its own separately-maintained copy (`_uploadFile`/`_uploadAttachment`) with the same raw-`fetch` problem, alongside duplicated `IMG_EXTS`/`_extOf`/`_addAttItem` helpers. Consolidated into `util.js`'s `uploadAttachment()`/`isImageFilename()`/`addAttachmentItem()`, used by both files now, routed through `apiFetch` - fixing the gap in one place instead of two, and removing the risk of the two copies drifting apart the way the `compressImage` duplicates already had (see above).

Same gap a 4th time (2026-07-25) in `auth.js` - `doAuth`, `doRegister`, and the reset-password/forgot-password submit handlers all used raw `fetch()`. These are pre-login flows so `apiFetch`'s auth-header/401-handling doesn't apply, but `fetchPublic`'s 503 handling does - a maintenance-mode window during login/register/password-reset used to show a generic connection error instead of the normal ejection flow. Fixed by routing all four through `fetchPublic` (a thin, header-agnostic wrapper, so no other changes were needed at any of the four call sites).

Same gap a 5th time (2026-07-25) in `party.js` - the accept/decline-invite, send-invite, cancel-invite, invite-more, and leave-party handlers all built their own `Authorization` header and called raw `fetch()`, missing both the 401 and 503 handling above. Fixed by routing all six through `apiFetch`. Separately, three of `party.js`'s DELETE/POST handlers (decline-invite, cancel-invite, leave-party) proceeded to update the UI (remove the invite card / close the modal) without checking `r.ok` first - a failed request (network error, expired session, server error) still looked like it succeeded, with no error shown, until the next reconnect/reload silently reverted the UI. Fixed all three to check `r.ok` and show an alert on failure, matching the accept-invite handler's existing behavior.

Same gap a 6th time (2026-07-25) in `stats.js`'s `openStatsModal()` - `GET /api/site-stats` has no `authenticate()` call server-side (genuinely public), but the fetch used raw `fetch()` with no `res.ok` check, so a maintenance-mode window just fell into the generic catch block and showed "Failed to load stats." instead of the normal ejection flow. Fixed by routing it through `fetchPublic` and adding the `res.ok` check.

Same gap a 7th/8th/9th time (2026-07-26), found during a codebase-wide duplicated-code sweep: `boot.js`'s `/api/config` and `/api/tagline` loaders and `tips.js`'s `/api/tips` loader all used raw `fetch()` on genuinely public endpoints instead of `fetchPublic`/`publicFetch`. Fixed all three (added the `fetchPublic` import to `tips.js`, which had none). Separately, `play.js`'s open-world "toggle run public" handler built its own `Authorization`-less, `credentials: 'include'`-based `fetch()` PUT to `/api/series/:id/runs/:i` instead of using `apiFetch` (already used elsewhere in the same file for the DELETE on this same endpoint family) - fixed to match. `covers.js`'s two raw `fetch()` calls (streaming cover-image bytes with a progress bar via `response.body.getReader()`/`response.blob()`) were reviewed and left as-is - `apiFetch`/`fetchPublic` are thin JSON-oriented wrappers and don't interfere with either use, but the streaming/blob handling here doesn't need their 401/503 logic (image requests, not API calls) and reshaping them to fit would add risk for no benefit.

`autocomplete.js`'s `_setupAuthorsAutocomplete()` (2026-07-25): `_currentTokenBounds()` only looked *backward* from the caret to the previous comma to find where the current author-name token starts, never forward to find where it ends. `_applyAuthor()` then replaced everything from that start up to `raw.slice(caret)` (caret to end of string) - correct only if the caret sits at the very end of the token being replaced. The `input` field's `click` listener explicitly re-renders suggestions on click (supporting clicking into an *existing* author name to fix it, not just typing forward), so clicking mid-token and picking a suggestion was reachable in normal use: e.g. clicking right after "C.S." in `"J.R.R. Tolkien, C.S. Lewis"` and picking a match duplicated the already-typed `" Lewis"` onto the end. Fixed by having `_currentTokenBounds()` also compute the forward boundary (next comma, or end of string) and having `_applyAuthor()` replace the whole token span instead of just caret-to-end.

`party.js`'s `connectPartySSE(bookId)` (2026-07-25) is fire-and-forget from `boot.js`'s book-open flow (not awaited), with no lock preventing two overlapping calls for different books (e.g. opening book A then quickly opening book B before A's `/api/books/:id/party` fetch resolves). Whichever response landed last used to win regardless of which book was actually on screen, silently connecting the party `EventSource` to the wrong book's stream and showing the wrong party status in the header button until something else happened to reset it. Fixed with a generation counter (`_connectGen`, same idiom as `app-xp.js`'s `_xpAnimGen`) - `disconnectPartySSE()` bumps it, and a stale `connectPartySSE()` call whose generation no longer matches after its `await` just discards its result instead of applying it.

A second, separate bug found in the same forgot-password handler (2026-07-25): it never checked `res.ok` before reading the response body, unlike the other three handlers in this file. `handleForgotPassword` (`server.js:845-872`) returns a `429` with `{ error: '...' }` when `isRateLimited(ip)` - since a 429 body has neither `noEmail` nor a success flag, the client's `if (data.noEmail) {...} else {...}` fell into the *success* branch regardless, telling a rate-limited user "a reset link has been sent" even though the request was rejected. Fixed by adding the same `if (!res.ok) { ...show data.error...; return; }` guard the other three handlers already had.

A third, more serious bug in the same handler (2026-07-26): the reset link was built with `db.getAdminSetting('app_url') || \`https://${req.headers.host}\`` - and `app_url` is currently unset on the live DB, meaning the attacker-controlled `Host` header was the *actual* fallback in production, not just a theoretical one. Since this link gets emailed to the real account owner, a spoofed `Host` on the forgot-password request would poison the reset link itself, pointing it at an attacker's domain - clicking it would leak the reset token off-site, a real account-takeover path (classic Host Header Injection / password-reset poisoning). Fixed by replacing the header-derived fallback with a hardcoded `'https://koldkat.net'` - `req.headers.host` must never be trusted for constructing a URL that leaves the server in an email.

---

## Screen routing (`boot.js`)

The landing view has three fixed-position panels around a scrollable central feed:

| Panel | Position | Width | Notes |
|-------|----------|-------|-------|
| `#covers-panel` | Fixed left | 480px | Shows up to 20 random covers. Hidden if none available. Collapsed via `#covers-toggle`. |
| `#landing-wrapper` | Central scrollable | padded 480px each side | Contains `#feed-panel` and `#landing-right`. Padding transitions to 0 when a side panel collapses. |
| `#landing-right` | Fixed right | 480px | Contains `#login-screen` and `#books-screen`. Collapsed via `#right-toggle`. |

`#main-screen` (the book tracker) sits outside this structure entirely.

| Screen | Element | Shown when |
|--------|---------|------------|
| Login / Register | `#login-screen` | Not authenticated |
| Book list | `#books-screen` | Authenticated, no book open |
| Book tracker | `#main-screen` | A book is open |

- `showLogin()` / `showBooks()` - show `#landing-wrapper`, hide `#main-screen`, call `loadFeed()` and `loadCovers()`, make `#right-toggle` visible.
- `showMain()` - hides `#landing-wrapper`, removes `.active` from `#covers-panel`, hides both toggle buttons, shows `#main-screen`.
- All three call `setGuideVisible(bool)` to control `#guide-btn`. Clicking it opens an overlay with `<iframe src="/guide.html">`. Closes on ✕, Escape, or backdrop click.

**`#app-banner-f1-btn`:** sits to the left of "User Guide" in the landing header. Purely a discoverability affordance for the F1 keyboard shortcut - clicking it calls the exact same `_toggleShortcutsModal()` that the `e.key === 'F1'` handler calls, opening `#shortcuts-modal-overlay`. No separate logic; it exists because most users never think to press F1.

**Demo button auto-hide:** `_updateDemoBtnVisibility()` (`boot.js`) is called from `showBooks()` whenever the user is authenticated (`getToken() && !isDemoMode`). It fetches `GET /api/profile` (which merges `getProfileStats(userId)`, including a `deaths` field added alongside the existing `wins`/`losses`) and hides `#demo-btn` once `wins >= 1 && deaths >= 1`. Deliberately `deaths` (`result === 'death'`, the `-1` ending), not the combined `losses` field (`death` + `battle`) or `battle` alone - a battle death doesn't count toward this, only a plain death does. (An earlier version of this had it backwards - `battle` counting and `death` not - based on a misread of the user's own clarification; corrected after the user caught it live.) `showLogin()` resets `#demo-btn`'s inline style back to visible, since the hidden state is per-account and would otherwise leak into a subsequent guest/different-account session on the same page load after logout.

### Panel collapse toggles

`#covers-toggle` and `#right-toggle` are `16×52px` fixed tab buttons flush against their panel's inner edge.

- Hidden by default; shown via `.visible` - `#covers-toggle` appears when covers are loaded, `#right-toggle` on `showLogin()`/`showBooks()`. Both hidden by `showMain()`.
- Clicking adds/removes `covers-collapsed` / `right-collapsed` on `document.body`.
- CSS effects: panel slides off-screen via `transform: translateX(±480px)`, `#landing-wrapper` padding transitions to 0, toggle button moves to viewport edge. All 0.25s ease. Arrow character flips direction.

**Play-area sidebar** (`#sidebar-toggle` / `sidebar-collapsed`): collapses via `width: 0; min-width: 0; padding: 0; border-right-width: 0` (not `transform`). Floating elements (`#run-trail-float`, `#dice-roller`, `#play-bottom-stack`) reposition via `left` transitions.

**Collapsed-state persistence**: all collapsible panels persist state to both `localStorage` and `users.ui_prefs` (server-side JSON column). On login/boot, `syncPrefs()` fetches `GET /api/prefs` and calls `applyPrefs()` to reconcile all classes. Each toggle fires a fire-and-forget `PATCH /api/prefs` so state syncs across devices.

Collapsible keys stored in `ui_prefs`:

| Key | Panel |
|---|---|
| `covers-collapsed` | Landing page - covers (left) |
| `right-collapsed` | Landing page - activity/new book (right) |
| `sidebar-collapsed` | Tracker - left sidebar |
| `legendCollapsed` | Tracker - graph legend |
| `diceRollerCollapsed` | Tracker - dice roller |
| `trailCollapsed` | Tracker - run trail |
| `playXpCollapsed` | Tracker - bottom Player XP panel |
| `landingBgHidden` | Landing page - animated background visibility (`'1'` = hidden) |

Values are `'1'` (collapsed/hidden) or `'0'` (expanded/visible). `ui_prefs` is a `TEXT DEFAULT NULL` JSON column on the `users` table; `getUserPrefs` / `setUserPrefs` in `server/db.js` handle parse/stringify. The trail collapsed state (`_trailCollapsed` module variable in `play.js`) is updated via `setTrailCollapsed()` when prefs are applied; toggle saves back via a `_onTrailToggle` callback registered with `setOnTrailToggle()`.

**`Ctrl+X` group toggle:**
- Landing screens: hides/restores covers panel, feed (session-only), and right panel together.
- Tracker view: targets the play-area panel set (`sidebar-collapsed`, `legendCollapsed`, `diceRollerCollapsed`, `trailCollapsed`, `playXpCollapsed`).
- Second press restores only panels that were open before the previous hide-all, using an in-memory snapshot. Per-panel prefs remain the source of truth across reloads.

**Keyboard shortcut layout independence:** feed-toggle and charsheet shortcuts use `e.code` (physical key position) instead of `e.key` (character produced). `e.key` breaks on non-Latin layouts (e.g. Bulgarian physical `X` produces a Cyrillic character). `e.code` works correctly on any keyboard.

`showMain(bookId, isbn, issn, asin, cover, pdfPath, pages, authors, ...)` always calls `destroyNetwork()` + `initGraph()` so the graph is rebuilt fresh for each book. Metadata is stored in module-level `currentBook*` variables so the edit-book modal can pre-populate them.

### App banner

`#app-banner` sits at the top of `#feed-panel` (above the Activity header), matching the width of the feed cards. It shows the app title, tagline, and a "User Guide" button that opens `/guide.html` in a new tab. The banner is only present on the landing page (`index.html`), not in the tracker view.

`#books-tip-bar` sits directly below `#app-banner`. Contains an orange **Tip:** label + rotating tip text. Tips cycle every 15 s with a 500ms fade. A 2px animated progress bar (`#tip-progress-bar`) drains along the bottom, restarting on each change via the `offsetWidth` reflow trick. Tip logic lives in `tips.js`. `nextTip()` alternates between the "real" and "silly" pools, flipping to the other side when the current one is empty - bounded to one flip (a `_triedOtherSide` flag), so if `GET /api/tips` ever returns both pools empty (every tip deactivated, or a fresh install before any are seeded) it returns `''` instead of recursing forever.

`guide.html` is a standalone HTML page (`public/guide.html`) styled to match the app's dark theme. It mirrors the content of `docs/user-guide.md` and should be kept in sync whenever `user-guide.md` is updated.

### Play-area XP panel

`#play-bottom-stack` is the bottom-center tracker stack that now contains both `#play-btns-bar` and `#play-xp-summary`. The XP panel is a live mirror of the books-screen XP summary, rendered through the shared helper `_renderXpSummary(prefix, data)`. It displays level, title, XP bar, current XP text, and boost line, and persists its collapsed state via `ui_prefs.playXpCollapsed`.

**Centering, relative to its actual neighbors, not the viewport:** `#play-bottom-stack`'s `left` used to be `calc((100vw + var(--sidebar-w)) / 2)` - the midpoint of the space right of the sidebar, ignoring that `#dice-roller-wrap` sits fixed on the left of that space and `#play-btn-row` (charsheet/inventory/equipment/battlesim toggle buttons) sits fixed on the right of it. On a narrower window, once either of those grows wide enough (e.g. several toggle buttons wrapping into `#play-btn-row`, or the dice roller expanded), the plain viewport-midpoint math no longer matched where the *actual* free space between them was, and the stack (specifically its XP panel, which can be up to `420px` wide) could end up rendered on top of `#play-btn-row`. Fixed by tracking both neighbors' real widths via `ResizeObserver` into CSS custom properties - `--dice-roller-w` (set in `dice.js`, mirroring the existing `#dice-roller-wrap` fixed-position element) and `--play-btn-row-w` (added alongside the pre-existing `--play-btn-row-h`, in the same observer in `charsheet.js`'s `getPlayBtnRow()`) - then computing the midpoint between the dice roller's right edge and the button row's left edge instead of the viewport's: `calc((var(--sidebar-w) + 12px + var(--dice-roller-w, 0px) + 100vw - 1rem - var(--play-btn-row-w, 0px)) / 2)` (a separate `body.sidebar-collapsed` variant drops the `var(--sidebar-w) + 12px` term to plain `12px`, matching `#dice-roller-wrap`'s own collapsed-sidebar override). Both custom properties default to `0px` via the `var(..., 0px)` fallback until their first `ResizeObserver` callback fires (both `getPlayBtnRow()` and `initDice()` run unconditionally at boot, so this is a near-instant, one-frame gap in practice, smoothed further by the existing `transition: left 0.25s ease`).

**Heartbeat XP rate display:** on the level row of each XP bar (books screen `#books-xp-level-row`, play area `#play-xp-level-row`, profile modal `#profile-level-row`), a `<span>` shows the current idle rate in aqua. Formula: `rate = 1 + (bonusHeartbeatXp + bonusHeartbeatXpFree) * 0.1` where `bonusHeartbeatXpFree = Math.max(0, level - 10)`. Rendered as `+N heartbeat XP/min` (one decimal if not a whole number). Both `bonusHeartbeatXp` and `bonusHeartbeatXpFree` are returned by `GET /api/profile` and `getUserXpInfo`.

**Animated XP gain (`profile.js`):** the books-screen and play-area bars/counters (not the profile modal, which always snaps instantly) tween whenever `renderBooksXpSummary(data, { fromXp })` is called with a known previous XP value. Duration scales with the user's level: `level * XP_ANIM_MS_PER_LEVEL` (100ms/level, so lvl 37 = 3.7s, lvl 100 = 10s); level 0 renders instantly (low levels earn little XP per gain, so there's nothing worth animating). `_animateXpTo` interpolates linearly (not eased) from `_displayedXp` (the last value actually painted) to the target, recomputing `_xpLevelBounds` every frame from the interpolated value - so a level-up crossed mid-animation naturally shows the bar filling to 100%, resetting, and continuing in the new level with no special-casing. A module-level generation counter (`_xpAnimGen`) invalidates the in-flight `requestAnimationFrame` loop whenever a new update arrives (rather than queuing/stacking animations), so the new tween always starts from wherever the bar currently sits. Linear (not eased) interpolation was chosen specifically so a restart never reintroduces a fast-start burst partway through an in-progress deceleration. `renderBooksXpSummary` is fed `fromXp` by `rewards.js › _processRewardSnapshot`, which tracks the last known XP (`_lastRewardXp`) across snapshot pushes; direct instant (non-animated) calls to `renderBooksXpSummary(data)` with no `fromXp` are used only for session-initial loads. The "XP earned from boost" figure in the boost line tweens in lockstep with the main counter (same `t`, same frame, tracked via a parallel `_displayedBoostXp`) - `_renderXpSummary` no longer renders that line itself, only `_xpApply`/`_animateXpTo` do, so it can't fall out of sync or snap ahead of the main counter. The profile modal's own boost line (`renderXpBlock`) is untouched and always instant.

**XP boost color:** the boost percentage text (`+X% boost`) renders in aqua (`#22d3ee`) via inline `<span>` inside `innerHTML`; the following `(Y XP)` text stays in the default color. Implemented in `_xpBoostHtml`, called from `_renderBoostAmount` (books/play, animated) and `renderXpBlock` (profile modal, instant) in `profile.js`. This used to read `(Y XP earned)` - the word "earned" was dropped as useless filler (the number and percentage already say everything that matters), not the figure itself.

### App-wide XP widget (`app-xp.js`)

`#app-xp-summary` sits above `#books-xp-summary` on the Books screen, styled the same way (level, title, heartbeat rate, XP bar, XP text, boost line) but in a violet accent instead of the personal gold/cyan, so it reads as "the app" rather than the logged-in player. Visible only to the admin account (`hidden` attribute by default; unhidden by `refreshAppXp()` only when `getIsAdmin()` is true).

Data comes from `GET /api/app-xp` (see REST API table above), backed by `db.getAppXpSummary()`:
- `level`/`title`/`levelXp`/`nextLevelXp` use the same quadratic level formula as a per-user bar, but scaled by `Math.max(1, users * 1000)` instead of a flat `1000` - identical to `appLevelScale` in `getSiteStats()` (Stats for Nerds' "App level" figure) - so the app's level doesn't dwarf individual players' as the user base grows. `xp` is `SUM(users.xp)`, the same figure `getSiteStats()` reports as "Total XP earned" (that panel just renders it through `fmt()`, which switches to compact K/M/B notation above 10,000 - the two numbers agree, they're just formatted at different precision). Unlike the per-user level (capped at 100 by `computeLevel`), this app-wide `level` is genuinely uncapped and grows forever as the site's total XP grows. `app-xp.js`'s tween duration (`level * 100ms`, same convention as the personal bar) used to inherit that unbounded growth directly; fixed (2026-07-25) by clamping the level used for the duration calculation to 100 (`ANIM_DURATION_LEVEL_CAP`) - the displayed level number is unaffected, only how long the bar takes to animate to it.
- `xpFromBoost` is `SUM(users.xp_from_boost)` (cumulative XP ever earned via a boost, across everyone). `xpBoostPct` is `SUM(users.xp_boost_pct) / 10` - every user's *currently active* boost rate added together, the same "sum everyone's rate" shape as `heartbeatRatePerMin` below. This is deliberately not `xpFromBoost / xp * 100`: that would answer "what fraction of all XP ever earned came from boosts" (a retrospective ratio), whereas the per-user `xpBoostPct` field means "your current boost rate" - summing the same field across users answers the analogous question for the app as a whole.
- `heartbeatRatePerMin` sums every user's passive rate as if everyone were online simultaneously: `users + (SUM(bonus_heartbeat_xp) + SUM(max(0, level-10))) * 0.1`. The per-user `level-10` free-heartbeat term is computed in raw SQL (mirroring `avgLevelRow`'s quadratic-in-SQL pattern) rather than fetched and reduced in JS, to avoid a second full-table round trip.

Refreshed on login (both `showBooks()` and `navigateToBook()`, right after `_isAdmin` is resolved) and every 60s via the existing feed-poll leader interval in `livetab.js` - no dedicated `setInterval` was added. Also pushed near-instantly whenever the existing `feed_changed` SSE fires, piggybacking on `livetab.js`'s feed-SSE debounce rather than adding a second one.

**Deliberately staggered, not fired in the same tick as `loadFeed()`:** both the 60s poll and the SSE debounce call `loadFeed()` and refresh the App/Avg-Level bars off the same trigger, but `refreshAppXp()` is wrapped in `_refreshAppXpStaggered()` (`APP_XP_STAGGER_MS = 1200`) rather than invoked directly alongside `loadFeed()`. This was a real bug, not a style choice: a plain `PUT /api/books/:id/state` save carries no reward data in its response, so a viewer's own personal XP bar only actually updates via `loadFeed()`'s own `scheduleRewardProfileRefresh(150)` call (see below) - meaning every site-wide activity trigger was firing the viewer's own 150ms-delayed personal-bar tween and the App/Avg-Level bars' tween from the exact same instant, every time. Since those bars sit stacked directly next to the viewer's own bar and have wildly different durations (the App/Avg bars' duration comes from their own low level; the personal bar's is `viewerLevel * 100ms`, e.g. 3.7s at level 37), starting them in lockstep read as a single bar doing a fast burst then a slow crawl rather than two independent bars. The 1.2s stagger breaks that lockstep without meaningfully increasing how stale the App/Avg-Level numbers can look.

`_refreshAppXpStaggered()` is also called from the app-xp SSE stream's own `onmessage` (both the leader tab's direct handler and the follower-tab relay via `_broadcastLiveEvent('app_xp_event', ...)`) - originally that stream only drove the floaters (`handleAppXpEvent`), leaving the bar's own numbers stale until the next 60s poll or feed-SSE debounce even though the stream had already proven them out of date. `_refreshAppXpStaggered()` internally debounces via a single tracked timer (`clearTimeout` before rescheduling) rather than firing one `setTimeout` per call - necessary specifically for this trigger, since unlike the poll interval and feed-SSE debounce (which each already only invoke it once per window), the app-xp stream can fire multiple times in quick succession if several players earn XP close together, and each would otherwise have queued its own independent refetch.

**Live "someone else earned XP/GC" floaters:** admin-only, and only rendered while the Books/landing screen is visible (`_isBooksScreenVisible()` in `app-xp.js`). Backed by a dedicated SSE stream, `GET /api/app-xp/stream` (token via `?token=` query since `EventSource` can't set headers, same as `/api/user/stream`; 403 unless `db.isUserAdmin`). Server side: `db.setAppXpHook(fn)` registers a callback that fires from inside `_awardXpTx`/`_awardCoinsTx` on every successful award (any user, any event) with `{ userId, xpDelta }` or `{ userId, coinDelta }` - distinct from the older `_xpFeedHook`, which only fires on level-up and carries no amount. `server.js`'s hook implementation short-circuits immediately if `_appXpClients.size === 0` (no lookups at all when nobody's watching), otherwise resolves the admin's own user ID to skip their own gains (already shown in their personal floaters) and looks up the acting user's display name before pushing `{ username, xpDelta, coinDelta }` to every connected admin client.

Client side, `livetab.js` owns the connection lifecycle exactly like `_connectUserBadgeSSE`/`_disconnectUserBadgeSSE` (leader-tab-only `EventSource`). `boot.js` calls `_connectAppXpSSE()`/`_disconnectAppXpSSE()` directly right after `_isAdmin`/logout resolve, for a prompt connect the moment admin status is known - but until 2026-07-25, `_connectLeaderLiveServices()`/`_disconnectLeaderLiveServices()` (the functions that run on every *leader-election* transition, not just login/logout) didn't include the app-xp SSE at all, unlike the other three leader-owned services. That meant a tab that lost leadership (e.g. because a different tab was focused, triggering `_takeLiveLeadership()`) never closed its app-xp connection - a leaked `EventSource` that lived until logout or the tab closed - while a newly-leading tab never automatically opened one, leaving its App XP widget stalled until an unrelated navigation happened to call `_connectAppXpSSE()` again. Fixed by adding both calls to the two leader-service functions, matching Feed/PublicCatalog/UserBadge; both already no-op safely for non-admin/logged-out tabs via their own internal guards. Messages are handed to `_hooks.onAppXpEvent` and also fanned out to follower tabs via `_broadcastLiveEvent('app_xp_event', payload)` → `_applyFollowerLiveEvent`. `app-xp.js`'s `handleAppXpEvent(payload)` is the single hook implementation for both the leader and follower paths - it re-checks `getIsAdmin()` and screen visibility itself, then queues a floater (amount first, username last: `+N XP <username>`) into `#app-reward-float-layer` via the same `chip` + `setTimeout(5000)` drain pattern as `rewards.js`'s personal floater queue, just with its own independent queue/state. Horizontal position is recomputed per floater (`_positionAppRewardLayer`) as the midpoint between `#covers-panel` and `#feed-panel` - deliberately **not** the same gap `rewards.js`'s `_positionRewardLayer` centers in (that one uses `#feed-panel`→`#landing-right`, i.e. feed-to-books - a different pair of panels entirely). Colors: violet for XP gains, pink for coin gains (`.app-reward-float`/`.app-reward-float--coins`), versus the personal floaters' cyan/gold - reuses the same `@keyframes reward-float-rise` rise-and-fade animation.

### Avg User Level widget (`app-xp.js`)

`#avg-lvl-summary` sits above `#app-xp-summary` (same admin-only visibility rules, same fetch/refresh cadence - both are painted from the single `GET /api/app-xp` response, no separate endpoint). Same bar shape again, but teal/lime instead of violet/pink (App) or gold/cyan (personal), so all three read as distinct at a glance.

This is deliberately **not** "level of the average XP" (that's what the App bar's `level` already is - a single pooled-XP figure that a few high-XP users skew heavily upward, since the level formula is a concave square-root curve). This widget is the average of each user's *own already-computed level* - `db.getAppXpSummary()`'s `avgLevel` field, computed the same way as `getSiteStats()`'s existing "Avg player level" Stats-for-Nerds figure (`SUM`/`COUNT` of the same per-row quadratic-level SQL expression used everywhere else in this file), just floored and exposed with more surrounding context here:
- `avgLevel`/`avgLevelTitle`: `floor(sumLevels / users)` and its title.
- Top-right tag (`#avg-lvl-users`): user count, replacing the heartbeat-rate tag (heartbeat has no meaningful "average" analog).
- Bar fill: the *fractional part* of the raw average (`avgLevelFraction = sumLevels/users - floor(...)`) - e.g. 1.977 → 97.7% filled - showing how close the whole app is to ticking the average up by one, not an XP-based fill like the other two bars.
- Sub-text (`#avg-lvl-text`): `sumLevels` (every user's level added together) and `levelsNeededForNextAvg` - literally `(floor(avgLevel) + 1) * users - sumLevels`, i.e. how many more total user-levels (summed across everyone) need to be gained before the average ticks over. Since `avgLevel = floor(sumLevels/users)` by construction, this is always ≥ 1 by definition (the sum can never already be at or past the next threshold while still flooring to the current level).
- Bottom line (`#avg-lvl-range`): `minLevel`-`maxLevel` spread across all users, replacing the boost line (no boost analog here either).

No XP-count animation on this bar (unlike the other two) - it only moves when someone actually levels up, which is infrequent and moves the average by a tiny fraction, so an instant snap reads better than a near-invisible tween would.

### Book list (`renderBooksList`)

Each `.book-item` card has a progress bar background: `rgba(107,114,128,0.18)` fills `(visited / effective_sections) × 100%` left-to-right, where `effective_sections = discoverable_sections ?? total_sections`. Zero-visited cards have no background.

**Completion percentage floor rule:** every "N out of total (X%)" display in the app (books-list progress bars, the play-area mapped/discovered counter, and every ratio in the Stats for Nerds modal) shows `100%` only when `n >= total` exactly; otherwise the percentage is floored and capped at 99% (`Math.min(99, Math.floor(n / total * 100))`), never rounded up. This prevents e.g. 318/319 sections from displaying as a misleading "100%". Implemented independently in `books.js` (`_bookItemHtml`, `_aggregateProgress` consumers, stash aggregate), `play.js` (`updateStats › pct`), and `stats.js` (the shared `pct` helper) - not centralized, since the fix predates any shared completion-percentage utility and the three call sites live in different self-contained modules.

**Server hardware info (Stats for Nerds):** `_serverHardwareInfo()` in `server.js` reads `os.cpus()` once per request and returns `cpuModel`/`cpuArch`/`cpuGhz`/`cpuAgeYears`/`cpuCores`/`totalRamBytes`, spread directly into `/api/site-stats`'s response with no allowlist to update on either side. `cpuCores` is `cpus.length` - added after shipping without it, since the panel already computed CPU load percentages using that same length (`os.cpus().length`) elsewhere in `server.js` but never surfaced the count itself as its own row.

**Compact number formatting (Stats for Nerds):** `stats.js`'s `fmt` - the shared formatter used for essentially every plain count in the modal - switches to the compact `fmtCompact` form (K/M/B/T/Qa/Qi suffixes) once the absolute value reaches 10,000; below that it's the plain comma-separated form. Decimal precision increases one place per tier (K = 1 decimal, M = 2, B = 3, T = 4, …) so bigger numbers keep roughly the same relative precision instead of losing more digits as they grow. This is universal rather than an allowlisted set of fields - any stat that happens to grow past 10,000 (user counts, GC totals, whatever) picks up the compact form automatically, not just the ones that already run high today (Total XP earned, XP events, Total pages/sections, Mapped/Discovered sections). Percentage suffixes from `pct()` are computed from the raw underlying values and unaffected by the compact display. Guards against a rounding-boundary edge case where e.g. `999999` would naively format to `"1000.0K"` at the K tier - if `.toFixed(tier)` rounds the value up to `1000` or more, the tier bumps up one level and redivides (so it correctly shows `"1.00M"` instead). **Lines of code** used to have its own hand-rolled `(n/1000).toFixed(1)+'K'` formatting that bypassed `fmt` entirely - always dividing by 1000 and always showing "K" regardless of scale, so it ignored the 10,000 floor and would never roll over to "M". Switched to plain `fmt(s.linesOfCode)` for consistency with everything else in the modal.

**Render order:** series header rows → series books → no-series containers → standalone books.

**Create modals:** three amber buttons at the top - Create Book (`#add-book-overlay`, `cb-` prefixes), Create Anthology (`#add-comp-overlay`, `cc-` prefixes), Create Series (`#add-series-overlay`, `csr-` prefixes). Edit modals: ✎ on anthology → `#edit-comp-overlay` (`ecc-`); ✎ on book → Edit Book modal; ✎ on series → `#edit-series-overlay` (`esr-`).

**Name autocomplete:** name inputs in both create modals source from `GET /api/public/books` (books: non-containers; anthologies: containers). Selecting an existing entry pre-fills all metadata and switches the save button to **Add to library** (`POST /api/books/:id/add`). Shared helper: `_setupNameAutocomplete(inputId, dropdownId, saveBtnId, filterFn, onSelect)`. Cache `_allPublicBooks` is loaded once on first open.

**Sorting within series (`_sortSeriesBooks`):** recently played (non-null `last_run_at`, descending) → `series_number` parsed as float (ascending, NaN/null sorts last) → alphabetical. **Sorting anthology children:** same priority order using `book_order` instead of `series_number`. Both sorts ensure that a user's active reading bubbles up while unnumbered books fall to alphabetical at the bottom.

**Series header rows:** amber collapsible rows. Each shows series name, book count, aggregate sections, and a progress bar. Clicking the name collapses/expands the group. State persisted in `localStorage` as `sr_expanded_<seriesId>`. Header has ✎ (owner/admin only, disabled for non-owners) and ✕ buttons. Series with no books show "no books yet" + **Browse series** button. Books whose series isn't in `user_series` render as standalone (not hidden).

**Container expand/collapse:** the entire `.book-item--container` row is clickable (except the ✎/✕ buttons on the right). A CSS `::before` chevron on the `.book-name-text` element rotates from `▶` to `▼` via `data-expanded="0|1"` attribute and a CSS transition. Expanded state is persisted in `localStorage` under `bk_expanded_<bookId>`.

**Container progress:** aggregated from children client-side: sum of `visited` and sum of `effectiveSections` across all child books. Displayed in the subtitle as "N books · M sections".

**Container cards** have `.book-item--container` class (purple left border + subtle purple background tint), show child count + aggregate sections, and do not have an **Open** button. **Child cards** have `.book-item--child` class (indented). The card helper `_bookItemHtml(b, isChild, containerExpanded, childCount, aggrStats)` is extracted at module level. In the covers panel (public discovery), anthology thumbnails receive the `.cover-thumb--anthology` class (purple border) and a small `.cover-anthology-badge` chip in the top-left corner.

### Activity feed (`loadFeed`)

`loadFeed()` fetches `GET /api/feed` → `{ entries, pinned }`.

- Authenticated viewers use `apiFetch()`; unauthenticated use `publicFetch()`.
- `pinned` non-null → `<fieldset class="feed-pinned-card">` with amber border rendered above all day groups.
- `entries` grouped by local date: "Today", "Yesterday", or full date string. Each entry is `<div class="feed-entry">`.
- Empty result → `<p class="feed-empty">` placeholder.
- Errors silently ignored - feed failure never breaks login.
- Authenticated refreshes award `idle_heartbeat` XP (at most once per minute). Client schedules a short profile refresh afterwards so the XP floater updates.

`#feed-toggle` (`▴ / ▾`) is a feed-collapse tab centered above the feed. Feed hidden state is **session-only** - not persisted across reloads. Hidden on mobile. Position computed via JS `_syncFeedTogglePos` (not pure CSS) so it stays centered on `#feed-panel` when side panels expand/collapse. Called on panel toggle, resize, and landing reveal.

- `userPublicProfile = true` → username renders as `<button class="feed-user-pub">` (opens profile modal).
- `runIsPublic = true` → verb renders as `<button class="feed-verb-pub">` (opens public run modal).
- **Verb by result:** `success` → "won", `battle` → "died", `death` → "lost". CSS class matches.
- **Party entries:** `usernames.length > 1` adds class `feed-entry--party` (teal left border) + `<span class="feed-party-badge">party</span>`.

**Feed entry types** produced by `getFeed()` in `db.js`:

| `type` | Shown when | Notable fields |
|--------|------------|----------------|
| `run_completed` | Run ends with `death`, `battle`, or `success` | `result`, `runIsPublic`, `userPublicProfile` |
| `run_started` | Run begins | `runIndex` |
| `book_created` | User starts tracking a book | `bookName` |
| `level_up` | User gains a level | `level`, `levelTitle`, `gainedAbility`, `newAbilityCount` |
| `all_visited` | All sections visited in a book | `bookName` |
| `all_discovered` | All sections discovered in a book | `bookName` |
| `first_win` | First run ever won on a book | `bookId`, `bookName`, `bookIsPublic`, `runIndex` - rendered as "won in [book] run N for the first time" |
| `first_loss` | First death run on a book | `bookId`, `bookName`, `userId`, `runIndex`, `runIsPublic` - rendered as "lost in [book] for the first time"; verb is a clickable `feed-verb-pub` button when `runIsPublic && runIndex != null` |
| `first_battle_death` | First battle-death run on a book | same shape as `first_loss` - rendered as "fell in battle in [book] for the first time"; verb is clickable when run is public |
| `won_all_series` | User has won every book in a series | `seriesId`, `seriesName` |
| `won_all_anthology` | User has won every child book in an anthology | `bookId`, `bookName` (anthology) |
| `visit_all_series` | All sections visited in every book of a series | `seriesId`, `seriesName` |
| `discover_all_series` | All sections discovered in every book of a series | `seriesId`, `seriesName` |
| `visit_all_anthology` | All sections visited in every child of an anthology | `bookId`, `bookName` (anthology) |
| `discover_all_anthology` | All sections discovered in every child of an anthology | `bookId`, `bookName` (anthology) |
| `party_formed` | First party invite is accepted (party now has 2+ members) | `bookId`, `bookName`, `usernames[]` (all current members) |
| `announcement` | Admin-published announcement within 30-day window (non-pinned only) | `id`, `title`, `body` |
| `user_joined` | A user registered on the site | `username`, `joinTemplateText` - rendered with a subtle amber left border (`.feed-entry--join`, `#f59e0b`); uses the user's permanently assigned `join_template_id` so the text is stable across feed refreshes |
| `book_rated` | First time a user rates a book or anthology | `bookId`, `bookName`, `isContainer`, `rating`, plus the usual parent/series fields - rendered "rated book/anthology [name] ★★★★☆" via `_starsHtml` |
| `series_rated` | First time a user rates a series | `seriesId`, `seriesName`, `rating` - rendered "rated series [name] ★★★★☆" |

`party_formed` is the only feed event that pre-populates `usernames` from the server (all current party members) rather than relying on the client-side party-merge step. If the party is disbanded before the feed is queried, the entry is suppressed (member lookup returns < 2 rows). Group series/anthology milestone events are deduplicated by the `xp_events` UNIQUE constraint; they never appear more than once per user per entity.

**`book_rated`/`series_rated` (2026-07-25):** sourced from the `rate_book`/`rate_series` XP award (`xp_events`), not a raw scan of `user_books.rating`/`user_series.rating` - since `xp_events` has a `UNIQUE(user_id, event, ref)` index, it only ever holds ONE row per user+book/series no matter how many times the rating is changed, so re-rating something never re-appears in the feed, only the first time. Requires the row's CURRENT rating (joined in, not stored on the XP event) to still be non-null - if a user later clears their rating entirely, the historical XP event still exists but the feed entry is suppressed rather than showing "rated X" with zero stars filled in. `user_books.rated_at`/`user_series.rated_at` (added the same day, backfilled from this same `xp_events` match) track the most recent rating time generally - a separate, always-current signal from the feed's "was this ever rated" one, which only ever reflects the *first* rating. `setBookRating`/`setSeriesRating` also now call `feedPush({type:'feed_changed', ...})` when `xpAwarded` is true (first rating only) so other viewers see it live rather than waiting for the 60s poll - re-rating never triggers this push since it can't produce a new feed entry anyway.

Note: the no-JS `GET /feed` SEO page (`servePublicFeedPage()`, `server.js`) has its own separate, smaller `renderEntryText()` switch that only handles 8 of the ~17 event types (silently renders nothing for the rest) - `book_rated`/`series_rated` join that same pre-existing "not handled there yet" list alongside `book_added`, `series_created`, `first_win`, and others; this is not a new gap, the SEO page has always lagged the main feed.js renderer.

**`getFeed()` full-table-scan fix (2026-07-26):** `getFeed()` runs roughly a dozen queries of the shape `WHERE xe.event = '...' AND xe.created_at > ?` against `xp_events`, but the table's only index was `UNIQUE(user_id, event, ref)` - useless here since none of these queries filter on `user_id`. `EXPLAIN QUERY PLAN` confirmed a full `SCAN e` on all of them, against a table that (at time of writing) already held 112k+ rows and grows with every XP award, site-wide. Since `better-sqlite3` is synchronous, each of these scans blocked Node's entire single-threaded event loop for their duration - including flushing outgoing SSE frames to every connected client (party/feed/app-xp/badge streams alike), not just feed requests. This surfaced as "SSE has gotten kinda slow" - an organic slowdown tracking table growth, not a step-change regression. Fixed by adding `idx_xp_events_event_created ON xp_events(event, created_at)`, which turns those scans into `SEARCH ... USING INDEX` seeks (verified via `EXPLAIN QUERY PLAN` on a copy of the live DB before shipping).

**Follow-up SSE audit, same day - 3 more missing indexes found the same way:** a broader pass over every SSE-triggering code path (party live-sync, public catalog, badge pushes, app-xp floaters - not just `getFeed()`) turned up three more unindexed hot-path queries, all confirmed via `EXPLAIN QUERY PLAN` before and after:
- `user_books.party_id` (added by an old `ALTER TABLE` migration with no accompanying index) - `getPartyForBook()`'s member join, `getPartyMemberIds()`, and `fanOutState()` all did a full `SCAN` of `user_books` (1,514 rows) on every single state save while in a party, not just occasionally like a feed poll. Fixed with `idx_user_books_party_id`.
- `books.series_id` / `books.parent_book_id` - `_checkGroupMilestone()`/`_checkGroupWonAll()` (`server/db/xp.js`, called from `processStateXp`) scan the full `books` table (1,292 rows; 871 have `series_id` set, 228 have `parent_book_id` set - the common case, not an edge case) at the exact moment a user completes 100% of a series or anthology. Fixed with `idx_books_series_id`/`idx_books_parent_book_id` - both the outer scan and each query's correlated `xp_events` subquery confirmed index-backed afterward.
- `user_books.book_id` - `_getAggregateRating()` scanned all of `user_books` on every rating view/set (`WHERE book_id = ?`; the existing unique index leads with `user_id`, so it doesn't apply). Fixed with `idx_user_books_book_id`.

Every other SSE-adjacent path checked out clean against real `EXPLAIN QUERY PLAN` output (not just row-count guessing) - party tables, notifications, feedback, and forum tables are all small enough and/or already PK/index-backed that no further fix was needed.

**Admin panel vs. profile "total runs" mismatch, same day:** `adminGetUsers()` (`server/db/admin.js`) counted every entry in a user's `playthroughs` array unconditionally, including runs still in progress with no result yet. `getProfileStats()` (`server/db/feed.js`), which powers the user's own profile page, only ever counted completed runs (`result` is `death`/`success`/`battle`). Same underlying data, two different definitions of "runs" shown in two different places. Fixed `adminGetUsers()` to only increment `runs` (alongside `wins`/`deaths`/`battles`, which were already completed-only) on a completed result, matching `getProfileStats()` exactly.

`level_up` entries include `gainedAbility: boolean` and `newAbilityCount: number | null`. These are set when the new level crosses a threshold where `maxUndos`/`maxFastTravels` increase (levels 31, 41, 51, 61, 71, 81, 91 - each grants +1, from a base of 3 up to a max of 10). When `gainedAbility` is true, the feed renders an additional suffix styled as `.feed-ability` (purple): `· +1 undo & fast travel unlocked (N per run)`. Respects `hide_from_feed` - users who have opted out do not appear in level-up entries.

**Author/Contributor/Admin badges in the feed:** every entry type's SQL in `getFeed()` selects `u.is_author, u.is_contributor, u.display_name` (and, for multi-user entries, per-member in `usernames[]`) so the client can register badge state directly from the feed payload (`feed.js` calls `registerAuthor`/`registerContributor` for every entry before rendering). This matters specifically for **private profiles**: the client's `_authorMap`/`_contributorSet` caches in `user.js` are otherwise only populated by viewing your own profile or someone else's *public* profile, so without per-entry badge fields a private-profile author/contributor would never show their star in the feed at all. All ~13 event-type queries were audited and brought in line with this - previously only the series/series-run/book-run queries carried these fields, so `level_up`, `all_visited`, `all_discovered`, `first_win`, `first_loss`, `first_battle_death`, `won_all_series`, `won_all_anthology`, `visit_all_series`/`discover_all_series`, `visit_all_anthology`/`discover_all_anthology`, `party_formed`, and `user_joined` were silently missing badges for private-profile users.

`registerAuthor`/`registerContributor` (`user.js`) also now actually clear a username's cached entry when passed `false`, instead of only ever adding. All 5 call sites (`feed.js`, `public-profile.js`, `boot.js` ×3) previously guarded with `if (isAuthor)`/`if (isContributor)` *before* calling, so a revoked author/contributor status never reached the function at all - the star would linger for the rest of the session once granted. Fixed by having every call site always call with the real boolean (`registerAuthor(username, !!isAuthor, ...)`) and letting the function itself decide whether to add or delete the entry. `adminBadge()` was also brought in line with `resolveIsAdmin()`'s exact logic (same case-insensitive compare, same hardcoded `'koldkat'` fallback) - the two were answering the same "is this the admin" question with different rules, which could disagree in the brief window before `/api/config`'s `adminUsername` arrives.

**Day-card cover backgrounds:** each `.feed-day-card` gets a stack of tiles cycling through every *distinct public* book played that day, purely client-side in `feed.js` - no server changes, since `bookId`/`bookIsPublic`/`coverUrl`/`parentCoverUrl` are already present on every entry that has them. `_dayCovers(items)` (previously `_prominentCoverForDay`, which only ever returned a single "winner") tallies entries with `bookId && bookIsPublic` and a resolvable cover (`coverUrl || parentCoverUrl`) per book, then returns **all** distinct qualifying books' covers sorted by entry count descending (ties broken by first-appearance order) - a day with several different books played shows more than just one of them, cycling A, B, A, B, ... down the card rather than repeating a single book. At render time, when a day has at least one qualifying cover, its cover list is pushed onto `_lastDayCoverLists` (reset each `loadFeed()` call) and the card gets `data-day-index="<index into that array>"` plus an empty `<div class="feed-day-cover-stack">` as its first child; the actual entries/header are wrapped in a sibling `<div class="feed-day-content">`.

This is **not** implemented as a repeating CSS background - `background-repeat` can only tile a single image, and cycling through different covers per tile means each tile needs its own distinct image, so `_applyDayCoverFlows(root)` builds real DOM elements instead. For each `.feed-day-card[data-day-index]`, it loads every listed cover's natural width/height via `_loadDayCoverMeta` (a small `new Image()` loader cached by URL), then places tiles **outward from the vertical center**, not from the top:

- The most-prominent book (`covers[0]`) is placed whole, at full card width and its own true aspect-ratio height (`(naturalHeight / naturalWidth) * card.offsetWidth` - no stretch, no crop), centered so its own vertical middle lands on the card's vertical middle (`topEdge = targetH/2 - anchorH/2`).
- A `pool` of the day's *other* books (every index except the center one; if there truly is only one book all day, the pool falls back to that same single book so it can repeat outward too) is drawn from independently by each side: `downPtr`/`upPtr` are separate counters into `pool`, started half a pool-length apart, each incrementing every time that side places a tile. With exactly one other book the pool has only one entry, so both sides land on it every time (matching a day with two books total: the same "other" book appears both above and below); with two or more other books, the two independent, offset counters mean the two sides draw different books from the pool at any given ring, only converging once every other book has cycled through at least once.
- Each side's loop keeps extending its own edge (`topEdge` shrinking, `bottomEdge` growing) and placing the next pool tile flush against the previous one (no gaps, no overlaps) until that edge has passed the card's own boundary, with a `guard < 400` iteration cap as a hard safety net (a tile whose image fails to load nudges its edge by 1px instead of stalling, so a broken image can't spin the loop forever).
- `centerIdx` normally is `0` (the most-prominent book), but falls back to whichever book's cover actually loaded if that specific one failed - without this, a broken image for just the center book would still reserve its full-height band (`anchorH`) and start the outward tiling from its edges, while never placing anything to fill that band, leaving a blank gap in the middle of the card.

This intentionally does **not** reuse `books.js`'s anthology-stack flow technique verbatim - that one solves a different problem (spanning one image across several *separately positioned* sibling cards of different heights via a `topOffset` computed from each card's position in the stack). A day-card is a single box being filled from within, so no cross-card offset math applies here either way.

Two earlier, wrong attempts at this are worth noting since they were live and reverted rather than just discarded in a draft: the first version sized every tile to the image's full aspect ratio at the *entire card width*, which for a portrait cover produces a tile far taller than most day-cards - so the very first (top-anchored) tile almost always already exceeded the card's height, meaning cycling through multiple books essentially never had room to trigger in practice, and the tile visibly started from the top rather than the middle. The second attempt "fixed" this by shrinking every tile to a small fixed target height and centering it horizontally in a narrower column - but that was never asked for and changed the whole visual character of the feature (small thumbnails instead of a full-width cover), so it was reverted in favor of keeping full-width, natural-aspect-ratio tiles and instead fixing the actual anchor-point bug (top vs. center) directly.

A flat, constant-opacity overlay (`.feed-day-cover-stack::after`, `rgba(31,41,55,0.9)`) sits on top of the tiles for legibility - a top-to-bottom gradient was tried first and reverted, since it only reads sensibly as an overlay for a *short* box: past its final stop the color holds flat, so on a tall stack everything below the gradient's own ramp sat at its darkest stop uniformly, worse the more entries a day had. `.feed-day-content` carries `position: relative; z-index: 1` so the header/entries paint above the absolutely-positioned stack/overlay despite coming after them in paint order otherwise. `.feed-day-header`'s text color/text-shadow were also strengthened (`#6b7280` → `#d1d5db` plus a dark shadow) so the day label stays legible regardless of what's behind it, independent of the overlay's own opacity. Re-applied on every feed render, reading the same `_lastDayCoverLists` array by day index rather than needing a second network round-trip. Days with no qualifying book (all joins/level-ups/announcements, or only private-book activity) get no cover-stack element at all, and are given a `feed-day-card--glass` class instead - rather than drawing a copy of anything, it lets the real rotating landing background (`#landing-bg-a`/`#landing-bg-b`, `position:fixed; z-index:-1`) show through directly, like glass, staying naturally in sync since it's the same live element rather than a snapshot. Since `#landing-bg-a`/`b` is fixed (not scrolling with the feed), a glass card is a window onto whatever part of that image currently sits at its on-screen position - which varies by scroll position and naturally has brighter/darker patches like any photo, so no single opacity value makes every glass card look identical to every cover-day at every moment; a light tint (`rgba(31,41,55,0.25)`) keeps each one reading as "a card" regardless of what's behind it, without being fully see-through.

Getting to that number took three tries, worth recording so it isn't re-litigated: first shipped at `rgba(31,41,55,0.45)` (read as flat black against a real background - far darker than a cover-day, since the *ambient* image already carries its own `~92%`-dark gradient baked in for page-wide legibility, so stacking more darkening on top compounds fast); "fixed" by reusing the *exact same* `rgba(31,41,55,0.9)` value as `.feed-day-cover-stack::after` for what sounded like a principled byte-identical tint, but a cover-tile is the *raw, undimmed* image before that `0.9` overlay applies, while the ambient background is already dimmed *before* any card-level tint - stacking `0.9` on an already-`0.92`-dimmed image compounds to under 1% of original brightness, worse than the first attempt; then dropped to fully transparent (no tint at all), which was too little in the other direction - card boundaries all but disappeared and the fixed-background "different window per scroll position" effect became jarringly obvious rather than blending in. `0.25` is the settled middle ground. Verifying any of this needs care in a test harness: the CSS opacity transition on `#landing-bg-a`/`b` takes 1.5s, and demo mode specifically never activates the ambient rotation at all (both layers sit at `opacity: 0`), so a quick check can easily "confirm" a broken value is fine (or a working one is broken) when it's actually just not had anything real to show through yet.

**Two independent Ctrl+Y toggles govern all of this** - "Show covers in feed" (`_feedDayCovers`/`body.no-feed-day-covers`, pre-existing) and "Transparent background for day cards" (`_feedGlassCards`/`body.no-feed-glass-cards`, added alongside the tint-value fix), persisted the same way (`localStorage` immediately, synced `ui_prefs.feedGlassCards`/`feedDayCovers` when logged in). Four combinations:
- **covers on, glass on** (default): unchanged from the original feature - covers show normally; cover-less days get the glass tint.
- **covers on, glass off**: covers show normally; cover-less days fall back to the flat opaque `#1f2937` card.
- **covers off, glass on**: no covers shown at all (`.feed-day-cover-stack` hidden), but *every* day card - not just the ones that were already cover-less - gets the glass tint (`body.no-feed-day-covers:not(.no-feed-glass-cards) .feed-day-card { background-color: rgba(31,41,55,0.25) !important; }`), since once covers are off there's nothing left to distinguish a "would-have-had-a-cover" day from any other.
- **covers off, glass off**: everything flat, as if neither feature existed.

**Closing the Ctrl+Y panel** (`#cover-tooltip-settings-overlay`): three ways in - pressing Ctrl+Y again, clicking outside the panel (own mousedown/click tracker in `initCoversPanel()`, separate from `main.js`'s `_mousedownOnOverlay` since this predates that being wired up generically), and (as of this fix) an explicit `✕` close button in the panel's heading row - it had none before, `.modal-title-row`/`.modal-close-btn` (the same reusable classes every other modal's close button uses) wired to `_toggleCoverTooltipSettings(false)`. The heading's border/spacing, previously on `.cover-tooltip-settings-heading` itself, moved to a new `.cover-tooltip-settings-heading-row` wrapper so the border-bottom still spans the full row now that the button sits beside the text rather than under it.

**Recompute triggers - `ResizeObserver` is the authoritative one:** every `.feed-day-card[data-day-index]` is `observe()`d by a single module-level `ResizeObserver` (a no-op to re-observe an already-observed element, so this just happens every time `_applyDayCoverFlows` runs) that calls `_scheduleDayCoverRecompute()` whenever that specific card's *rendered size actually changes*, for any reason at all - a CSS-animated panel-collapse transition, a window resize, a font finishing its load and reflowing text, unrelated sibling content shifting the card, anything. This replaced an escalating series of specific-event listeners that each covered one cause but not the next one found live: first `window.resize`/`fullscreenchange` (debounced via `requestAnimationFrame` plus a `setTimeout(..., 400)` follow-up, since a single rAF can land mid-transition on an *animated* fullscreen toggle) - which didn't cover panel-collapse toggles, since those change the feed panel's own width without the window itself resizing at all; then an explicit `refreshDayCoverFlows()` hook wired into `prefs.js`'s `_setLandingPanelCollapsed()` - which didn't cover `applyPrefs()`'s *own* direct class toggle on initial load (used to apply a returning user's *saved* panel state, bypassing `_setLandingPanelCollapsed()` entirely) - then a second hook call added there too - which still didn't cover the fact that `#landing-wrapper`'s padding-left/right (which the feed panel's available width depends on) transitions over 0.25s (`transition: padding-left 0.25s ease, padding-right 0.25s ease`), so even a correctly-fired recompute could measure a size that hadn't finished animating yet. Each of these fixes is individually still in place (they're an immediate, essentially-free nudge for the common cases), but none of them was ever going to be a complete list, which is why `ResizeObserver` - watching the actual rendered outcome rather than guessing at every possible cause of it changing - is what actually closes this class of bug.

`loadFeed()` replaces `#feed-content`'s entire subtree on every call (every 60s poll, every SSE-triggered refresh), which would otherwise leak: `ResizeObserver` doesn't automatically stop observing an element removed from the DOM, so every previous render's day-cards would stay referenced (and un-garbage-collectible) forever as the session goes on. `loadFeed()` calls `_dayCoverResizeObserver?.disconnect()` immediately before replacing `innerHTML`, so each render starts from a clean slate before `_applyDayCoverFlows` re-observes the current cards. (No feedback-loop risk from the observer's own callback, either - the tiles it inserts are absolutely positioned inside `.feed-day-cover-stack`, so they never affect `.feed-day-card`'s own layout size, which is the trigger `ResizeObserver` watches for.)

Skips the image loads entirely (returns early) when `body.no-feed-day-covers` is set, rather than loading covers just to have CSS hide them. Because of this early return, flipping the toggle back on can't just remove the CSS class - the `.feed-day-cover-stack` divs from while it was off were never populated in the first place, so `_persistFeedDayCoversPref()` (`covers.js`) explicitly calls `_hooks.refreshDayCovers` (wired to `refreshDayCoverFlows`) after applying the pref, same as the panel-collapse case already did. Without this, re-enabling the toggle silently did nothing until the next full page load.

Togglable via **"Show covers in feed"** in the cover-tooltip settings panel (Ctrl+Y) - on by default. `covers.js` (which already owns this settings panel, same as "Reduce animations") toggles a `body.no-feed-day-covers` class that CSS suppresses the whole stack with (`.feed-day-cover-stack { display: none !important; }`). Persisted the same way as `reduceMotion`: `localStorage` immediately (works for logged-out feed viewers too, since the feed is public) plus a synced `ui_prefs.feedDayCovers` key when logged in, applied via the existing generic `setCoversPrefsState(p)` path with no additional wiring. Logging out calls `resetFeedDisplayPrefsForLogout()` (`covers.js`), forcing both this and `feedGlassCards` back to their true default (on) - a logged-out visitor has no UI to control either toggle, so they should never inherit whatever a previously logged-in user on that browser had turned off; the account's own saved preference still applies again once that user logs back in, since this reset only touches local/localStorage state, not `ui_prefs` on the server.

### Covers panel (`loadCovers`)

`loadCovers()` fetches `/api/public/covers`, `/api/public/books`, and `/api/public/series`, then renders a mixed wall into `#covers-grid`.

- Books/anthologies use their uploaded covers; series cards are built client-side as composites from up to four book covers.
- Sort modes: Latest, Oldest, A–Z, Z–A, Random. Type filters: All, Books, Anthologies, Series, Favorites.
- Lazy loading in sorted modes.
- Search across titles, child names, authors, and series names.
- Logged-in users get a hover `.cover-fav-btn` on each cover. Clicking it updates `ui_prefs.favoriteBookIds`/`favoriteSeriesIds` and can award the one-time `favorite_cover` XP.

**Public-catalog refresh:** event-driven via `EventSource('/api/public/stream')`. When `public_catalog_changed` arrives and the landing UI is visible, the covers wall refetches immediately. Decoupled from the landing background rotator - sort/filter changes don't swap the background.

**Header badge refresh:** authenticated `EventSource('/api/user/stream?token=...')`. On a refresh hint the client immediately refetches `/api/notifications`, `/api/feedback`, and `/api/forum/latest` - no waiting for the 60-second fallback poll. `handleSetPrefs` (`server.js`) also calls `userBadgePush(userId)` after every successful `PATCH /api/prefs`, so the same stream doubles as a live UI-prefs sync: `_scheduleLiveUiRefresh`'s `prefs` flag (`notif.js`) calls `syncPrefs()` on receipt, reaching any other open tab/device for that user within the same ~100ms debounce as the badge refreshes, rather than only picking up the change on that session's next fresh load.

**Cover thumbnail click** → `openCoverActivity(bookId, bookName)`:
- Fetches `GET /api/public/book/:id/activity`, renders a `.cover-activity-view` in `#public-modal-overlay`.
- Lists each user's avatar + name + visible runs as clickable buttons.
- If the book has an ISBN, the backend aggregates all editions sharing that ISBN; edition differences shown as italic subtitle.
- Username click → `renderPublicProfile` with back button. Run click → `openPublicRun` with back button.

**"Series:" row** in the book info modal is an amber button (`.book-modal-series-btn`). Clicking → `openSeriesActivity(seriesId, seriesName)`:
- Fetches `GET /api/public/series/:id`, renders description + clickable book list.
- Clicking a book navigates to that book's activity modal.
- Back button supports full navigation stack: series → book, book → series, etc.
- Rendered by `renderSeriesActivity(data)`.

### Crawlable feed page (`/feed`)

`GET /feed` is a fully server-rendered, no-JS HTML page built by `servePublicFeedPage()`. It calls `db.getFeed()` and `db.getPinnedAnnouncement()`, groups entries by day (same logic as the client), and returns a self-contained HTML document styled with embedded CSS to match the app's dark theme. The page is publicly accessible with no authentication, cached for 5 minutes (`Cache-Control: public, max-age=300`), included in the sitemap with `changefreq=daily`, and carries its own `<meta name="description">` and `<link rel="canonical">`.

Book names in the feed entries are rendered as `<a href="/book/:id">` links, pointing to the crawlable SSR book pages. Usernames have no standalone URL and are rendered as plain text. The page is discoverable via the sitemap; there is no link to it from the SPA.

### Crawlable book pages

Every non-demo public book is reachable at `/book/:id`. The server intercepts the path before the static file handler, calls `db.getPublicBookMeta(bookId)`, and injects into `index.html`:
- `<title>`, OG tags (`og:title`, `og:description`, `og:image`, `og:url`), Twitter Card, `<link rel="canonical">`
- `<script type="application/ld+json">` with `@type: Book` including `name`, `description`, `author`, `isbn`, `issn`, `numberOfPages`, `image`, `publisher`

If the book is missing or not public, unmodified `index.html` is served (SPA handles it). Client-side: `DOMContentLoaded` matches `/^\/book\/(\d+)$/` and calls `openCoverActivity(bookId, '')`. URL stays `/book/:id` while the modal is open; `closePublicModal` calls `history.replaceState({}, '', '/')`.

**User profiles** (`/user/:username`): `servePublicProfilePage` injects `<title>`, `og:type=profile`, `og:description` (level + book count), `og:image` (avatar), Twitter Card, canonical, JSON-LD (`@type: Person`). If private or missing → plain `index.html`. Client-side: `DOMContentLoaded` matches `/^\/user\/([^/]+)$/` and calls `openPublicProfile(username)`. Closing resets URL to `/`.

**SSR anthology pages** (`/anthology/:id`): `servePublicAnthologyPage()` injects OG (`og:type=book`), Twitter Card, canonical, JSON-LD (`@type: Book`). Client: matches `/^\/anthology\/(\d+)$/`, calls `openCoverActivity(id, '')`. Feed anthology tags render as `<a href="/anthology/:id">` links.

**SSR series pages** (`/series/:id`): `servePublicSeriesPage()` injects OG, Twitter Card, canonical, JSON-LD (`@type: BookSeries` with `hasPart`). Client: matches `/^\/series\/(\d+)$/`, calls `openSeriesActivity(id, '')`. Feed series tags render as `<a href="/series/:id">` links.

**Modal chrome reuse (2026-07-26):** `#public-modal`'s `.pub-modal` class used to hand-define its own background/border/border-radius/flex/overflow instead of reusing `.inv-modal`'s (the project's shared modal-chrome base, already reused correctly by e.g. `battlesim.css`'s `.bsim-modal`). Fixed: `#public-modal` now carries `class="inv-modal pub-modal"`, and `.pub-modal` only keeps the declarations that genuinely differ (width, max-height, box-shadow).

All four deep-link types (`/book/:id`, `/anthology/:id`, `/series/:id`, `/user/:username`) open into the *same* shared `#public-modal-overlay`/`#pub-modal-body` - `covers.js`'s `openCoverActivity`/`openSeriesActivity` and `public-profile.js`'s `openPublicProfile`/`openPublicRun` all render into it, and `boot.js`'s close handlers (`#pub-close-btn`, overlay click, Escape) all call `public-profile.js`'s `closePublicModal()` unconditionally regardless of which one is currently showing. Until 2026-07-25, `closePublicModal()`'s URL-reset only recognized `/book/:id` and `/user/:username` - closing an anthology or series page left the URL bar stuck on `/anthology/:id` or `/series/:id`, so refreshing the page there reopened the same modal unexpectedly even though the user had already closed it. Fixed by adding the two missing patterns to `closePublicModal()`'s cleanup check.

`servePublicBookPage`/`servePublicAnthologyPage`/`servePublicSeriesPage`/`servePublicProfilePage` (`server.js`) each define their own local `escape`/`jsonEsc` helpers rather than sharing one - three of the four didn't wrap their input in `String(s)` before `.replace()`, unlike the profile page's copy. Not a live bug (every current call site already passes a guaranteed string), just inconsistent defensive coding; fixed (2026-07-26) so all four match.

**HTML-escaping consolidated (2026-07-26):** a wider sweep found the same HTML-escaping logic hand-rolled independently in 9+ places across the server: the 4 SSR page functions above, `servePublicFeedPage`'s own `escape`, a 5th one-off `esc()` in `sendReplyEmail`, 4 more one-off `_esc`/`_esc2`/`_esc3`/`_esc4` locals in the feedback/forum-notification-email handlers, and separate copies in `server/export.js` (×2, missing quote-escaping entirely) and `server/forum.js`. Several had already drifted (missing quote-escaping, missing `String()` wrapping) before today's fixes above closed those gaps individually. Extracted a single `escapeHtml()`/`escapeJsonString()` pair into new module `server/html-escape.js`, required everywhere instead. `sendReplyEmail`'s copy (which also converts `\n` to `<br>` for email formatting) now composes `escapeHtml(s).replace(/\n/g, '<br>')` rather than reimplementing the escaping inline. Client-side inline `<script>` blocks embedded in `server/forum.js`'s SSR pages (plain JS strings sent to the browser, not Node code - can't `require()` anything) keep their own local copies where genuinely needed, but two identical copies within the *same* rendered thread page (edit-thread-body and edit-post-body preview) were consolidated into one local `_escBr()` helper.

**Sitemap** (priority / changefreq):

| URL pattern | Priority | Changefreq |
|-------------|----------|------------|
| `/user/:username` (public profiles) | 0.7 | weekly |
| `/book/:id` (public non-demo non-child books) | 0.8 | monthly |
| `/anthology/:id` (public containers) | 0.8 | monthly |
| `/series/:id` (public series) | 0.7 | monthly |

---

## Modal close-on-outside-click, drag-to-close bug (fixed 2026-07-19)

Every modal in the app closes when clicking its backdrop, implemented as a `click` listener checking `e.target === overlay`. The bug: a `click` event fires based on where the mouse *releases*, not where it pressed down - so dragging from inside a modal's content (e.g. panning the graph in the public run viewer) and releasing the mouse button outside the modal registers as a click *on the overlay*, closing the modal even though the drag started on real content. The fix already existed and was already applied to most modals: track `mousedown` separately, and only treat a `click` on the overlay as a real "clicked outside" if the *preceding mousedown* also landed on the overlay (not just the eventual mouseup/click). Several modals were missed when this pattern was rolled out, including the exact one reported - the public run/profile viewer, where dragging the graph and releasing outside was the original bug report.

**Fixed, 7 modals total:**
- `#public-modal-overlay` (`boot.js`) - the reported bug; already-guarded `#public-modal` uses `_mousedownOnOverlay`, a module-level var in `boot.js` set by a single `document`-level `mousedown` listener that checks `e.target.classList.contains('modal-overlay' | 'pub-overlay' | 'inv-overlay')`. This overlay already had the `pub-overlay` class, so it just needed the guard condition added to its click handler.
- `#guide-modal-overlay` (`boot.js`) - same fix, but this element had none of the three recognized classes, so it also needed `class="modal-overlay"` added in `index.html` (harmless - it already has its own complete, ID-selector-scoped positioning CSS in `charsheet.css`, which wins over `.modal-overlay`'s shared rules by specificity regardless).
- `#feedback-modal-overlay` (`feedback.js`), `#stats-modal-overlay` (`stats.js`), the notebook overlay (`notes.js`) - none had any mousedown tracking at all; each got its own local `let _mdOnOverlay` + `mousedown` listener, same pattern `equipment.js`/`inventory.js`'s *main* panel overlays already used.
- The equipment and inventory item-picker overlays (`equipment.js`, `inventory.js`) - both files already had the guard on their *main* panel overlay, but not on their separate picker overlay (a different element) - needed their own separate local tracker (`_mdOnPickerOverlay`), since a `mousedown`/`click` pair only applies to the one element it's attached to.

**Still correctly guarded, no change needed:** `edit-book-modal`, `note-modal`, `start-node-modal`, `alt-start-modal`, `edit-modal`, `forum`, `shortcuts-modal`, `profile-modal`, `shop-modal`, `add-book`/`add-comp`/`add-series` overlays, `add-stash`/`edit-stash`/`edit-comp`/`edit-series` overlays, `inbox-modal`, `cover-tooltip-settings-overlay`, `party` modal, `battlesim8`/`battlesim829`/`equipment`/`inventory` *main* overlays, `play.js`'s confirm/fast-travel/start-picker overlays.

---

## Terminal outcomes

Sections -1 and 0 are **never** added as nodes to the vis graph and **never** pushed onto a `path` array. They exist only as values inside `choices` arrays.

When `navigate(-1)` or `navigate(0)` is called, `endPlaythrough` is called directly with `'death'` or `'success'`.

The `isTerminal(n)` helper returns `true` for -1 and 0. All node-creation and path code filters these out.

---

## Node colour logic (`graph.js › nodeColor`)

The start section is `state.startSection ?? 1`. `allDiscoveredSections()` seeds its set with this value (not a hardcoded `1`), so renaming the start node correctly removes node 1 from the graph and the start colour/label follows the new ID.

Priority order (highest first):

1. **Orange** - `secId === cur` (current position in active run)
2. **Solid red or green** - `secId === finalNode` of the currently viewed/just-ended completed run
3. **Blue** - `secId` is anywhere else in the active or viewed run's path
4. **Overview mode only** (no active run, no viewed run):
   - Solid red/green/amber - confirmed endpoint of one or more completed runs
5. **Red outline** - section has `-1` in choices
6. **Green outline** - section has `0` in choices
7. **Amber outline** - section has both `-1` and `0` in choices
8. **Orange outline** (`battleOutline`) - node flagged as a battle location (`battle: true`); takes priority over visited-run blue, structural death/victory outlines, and overview endpoint colours. Only the current-position gold and run-endpoint solid colours take precedence. Edge colours and tooltips still convey structural paths.
9. **Custom colour** - node has a `color` field set (hex string); overrides the base fill while leaving battle-border orange intact. Does **not** override steps 1–3.
10. **Purple** - mapped (choices recorded, no terminal choices)
11. **Grey** - discovered (referenced but not yet mapped)

If a run ended with `result === 'battle'`, its final node is coloured **solid orange** (`battleDeath`) instead of solid red. In overview mode (no active/viewed run), nodes where only battle-death runs ended are solid orange; nodes where both battle deaths and victories ended are amber.

**Node tooltip terminology:** nodes with a path to a `-1` endpoint show "can lose here" (not "die"); nodes with a path to `0` show "can win here". The legend follows the same wording: "Can lose here", "Lost here" (for death-result run endpoints), "Battle death ended here" (for battle-result endpoints).

**Run labels:** `success` → "★ Victory", `battle` → "⚔ Battle Death", `death` → "✝ Lost". Admin panel playthrough result badges: Victory ★ (green), Battle Death ⚔ (amber), Lost ✝ (red).

The `displayPt` variable is `currentPlaythrough() || viewingPt`. Steps 1–3 use `displayPt.path`; step 4 only fires when `displayPt` is null.

A small green book badge is painted over nodes that have a note, using vis-network's `afterDrawing` event (`drawOverlays` in `graph.js`). This draws directly to the canvas in network coordinate space so it tracks zoom and pan automatically.

Nodes with a `priority` field also get a small triangle badge painted by `drawOverlays` at the top-left of the node (opposite corner from the note badge):
- `'high'` - green upward triangle
- `'low'` - red downward triangle

`priority` is absent when normal. It is stored on the graph node entry. If set on an as-yet-unmapped section (no choices recorded), `state.graph[id]` is auto-created with `{ choices: [] }` so the priority can be stored. The same stub-creation applies when saving a note on an unmapped section.

Nodes with `battle: true` get a small orange **✕** badge painted by `drawOverlays` at the bottom-right of the node. The badge is always visible regardless of what colour the node border is (structural death/victory outlines take precedence over the `battleOutline` colour, but the canvas overlay still renders). `battle` is toggled via "Toggle battle ⚔" in the node context menu; the flag is preserved across choice-edit operations in `handleRecordChoices`. It is also set automatically when the user ends a run via the **Battle Death ⚔** button - the button handler checks `state.graph[sec]?.battle` and sets it to `true` before calling `endPlaythrough('battle')` if it was absent.

**Pinned note labels:** if a node has both `note` and `showNote: true` in `state.graph`, `drawOverlays` renders a semi-transparent rounded text box adjacent to the node showing up to 4 lines of the note text (28 characters per line, truncated with `…`). The box is positioned to the right of the node, tracks pan and zoom, and moves with the node. `showNote` is toggled from the **Show next to node** toggle inside the note modal (`#note-modal`); the state is saved to `state.graph[id].showNote` and persisted server-side.

**Overlay cache (`_buildOverlayCache`):** built once at state-change time (from `syncGraph`) to avoid per-frame `measureText` and full-graph iteration.

| Cache entry | Contents |
|-------------|----------|
| `_overlayNodeIds` | Numeric IDs of nodes with any overlay (note badge, priority, battle, pinned note) |
| `_overlayNodes` | One entry per overlay node: flags + pre-computed `noteLayout` (wrapped lines, box size) |
| `_noteLabelCache` | `Map` from node ID to `noteLayout` for nodes with `showNote: true` |

Text metrics measured once in a detached `_measureCtx`. Per-frame, `drawOverlays` calls `network.getPositions(_overlayNodeIds)` (selective) then iterates only `_overlayNodes` - no `ctx.save()`/`ctx.restore()`, absolute coordinates throughout.

---

## Graph layout and physics

On first load (no saved positions) vis-network runs `forceAtlas2Based` physics until stabilisation, then disables physics and saves all positions to `state.positions`.

On subsequent loads (`state.positions` is non-empty) physics is disabled from the start. `improvedLayout` is also disabled to prevent vis-network from overriding saved positions.

Every node update passes `physics: false` per-node to pin nodes that have a saved position. New nodes (no saved position) get `physics: true` so they are placed by the solver while existing nodes stay put.

When new nodes are added (`handleRecordChoices`), `syncGraph` detects unpositioned nodes, saves the current viewport, re-enables physics with `stabilization: { fit: false }` (prevents vis-network from calling `fit()` after stabilisation, which would zoom out), runs `network.stabilize(300)`, and on `stabilizationIterationsDone` saves all new positions and restores the saved viewport. The `_stabilizeHandler` reference is tracked so any in-flight handler is unregistered before starting a new one.

Both this handler and `initGraph()`'s own equivalent (for a book with no saved layout at all) used to only clear their own `_stabilizeHandler` reference when they fired, without calling `network.off('stabilizationIterationsDone', ...)` to actually detach from the live network instance (2026-07-25 fix) - so the old listener stayed attached forever. Since the "unregister before starting a new one" guard above only ever tracks the *most recently registered* handler, an already-fired-and-self-nulled one could never be cleaned up by it either. In a single long editing session where new sections get recorded more than once, this let listeners silently accumulate on `stabilizationIterationsDone`, so a later stabilization could fire multiple stale handlers at once - each calling `saveState()` redundantly. Not a data-loss bug (`saveState()`'s own request queueing serializes the extra calls, and every handler variant converges on the same final `state.positions`), just wasted saves and a slow memory leak over a long session. Fixed by having both handlers call `network.off()` on themselves right before nulling their own reference, matching the pattern the `dragStart` handler already used correctly.

After every `syncGraph` call where all nodes are already positioned, `network.setOptions({ physics: { enabled: false } })` is called defensively to ensure physics stays off.

Drag positions are saved to `state.positions` on every `dragEnd` event (1000ms debounce) and persisted to the server.

### Viewport save and restore

Pan and zoom are saved to `state.viewport` (`{ x, y, scale }`) with a 500ms debounce on every `zoom` event and on `dragEnd` when no nodes were dragged. On book open, `syncGraph` restores the viewport once (guarded by the module-level `_viewportRestored` flag) via `network.moveTo`. The flag resets to `false` in `destroyNetwork()` so it works correctly each time a book is opened.

---

## Node deletion (`graph.js › subtreeToDelete + deleteNodes`)

`subtreeToDelete(rootId)` performs a BFS from `rootId` collecting all descendants, then removes any node still reachable (without passing through `rootId`) from a known graph root - originally just `state.startSection`, but a book can have more than one real root once the alternate-start button (`play.js`'s "⚑ Start at a specific section") has been used, so the reachability BFS now seeds from `state.startSection` **and** every playthrough's own `path[0]`. Without this, a node with two parents both living only in an alternate-start component (invisible to a BFS rooted at `state.startSection` alone, since the two components are disjoint) could be wrongly swept up as an orphan even though it's still reachable via its other parent in that same component. Returns a `Set` of IDs to delete.

`deleteNodes(ids)`:
1. Removes entries from `state.graph` and `state.positions`
2. Removes `id` from all `choices` arrays
3. Deletes any section left with an empty `choices` array (now unmapped) - **unless** it's part of a playthrough path, or carries a note/priority/battle/color/portals worth not silently discarding (same safeguard as `play.js`'s `_cleanupOrphanedTargets`)
4. Trims **every** playthrough's path at the first deleted node it contains - not just the active run. This retroactively reopens (`completed = false`, `result = null`) any run whose path passed through a deleted node, including previously-completed wins/losses from other runs entirely unrelated to what's currently active. If the active run (`state.activePtIndex`) is one of the trimmed ones, it stops being active (`activePtIndex = null`) - the caller must resume it explicitly to keep playing. The confirmation dialog (`confirm.delete_node`) does not warn about this retroactive effect on other runs.
5. Calls `saveState()` - does **not** call `render()` (caller's responsibility)

The caller (`boot.js`) clears `viewingPt` only if **its own path** intersects the deleted set (checked *before* calling `deleteNodes`, since the mutation may flip `completed` on the same object `viewingPt` references) - not merely because it happens to be incomplete for unrelated reasons, which was a real bug: `viewingPt` and the active run are independent (the delete button only requires an active, incomplete run to be visible at all - `viewingPt` can simultaneously point at any other run, completed or not), so the original `!viewingPt.completed` check could clear an unrelated viewed run's overlay just because a node was deleted elsewhere in an active run's tree.

---

## Playthrough actions (`play.js`)

| Function | Description |
|----------|-------------|
| `startPlaythrough(entrySection?)` | Pushes a new run at `entrySection` if given (and valid), else `state.startSection ?? 1`, sets it active |
| `loadRun(index)` | Completed run → sets `viewingPt`, clears `activePtIndex`. In-progress run → sets `activePtIndex`, clears `viewingPt` |
| `deleteRun(index)` | Splices run from array, adjusts `activePtIndex` |
| `handleRecordChoices(sec, raw)` | Parses input, writes to `state.graph[sec]`, places new nodes, re-renders |
| `navigate(sec)` | Pushes section to path (or calls `endPlaythrough` for terminals) |
| `endPlaythrough(result)` | Marks run completed, sets `viewingPt` to it so trail persists |
| `undoRun()` | Pops the path back to the last genuine decision point - see below |

**Auto-nav:** `render()`'s choices panel auto-advances through a forced passthrough - `secData.choices.length === 1 && !pt.path.includes(secData.choices[0]) && !_suppressAutoNav` - scheduling `navigate(dest)` on a `setTimeout(..., 0)` (deduped per section via `_pendingAutoNavFrom`, so overlapping `render()` calls from side effects like a `saveState`/SSE round trip don't each queue their own hop). This is what makes a long chain of single-choice sections "auto-walk" through in one visual beat instead of requiring a click per node.

**`undoRun()` walking past auto-nav sections:** pops the current node, then keeps popping past forced (single-choice) nodes until landing on a real decision point (`choices.length !== 1`) or the run's start. A single-choice node isn't necessarily a *forced* passthrough though - it could be a real decision the user just recorded (possibly the wrong one, which is exactly what they're undoing), so it's worth stopping at one that carries metadata (`note`/`priority`/`battle`/`color`/`portals`/`showNote`) rather than silently skipping past it. But that's only meaningful if auto-nav (above) won't immediately fire for it: once popped, that node's one recorded destination is no longer in `pt.path`, which is exactly the condition auto-nav checks for - landing there right before its own auto-nav fires just replays the undo's own forward step and sends the user right back where they started (a real bug found live: on a long auto-walked chain, "undo" appeared to do nothing at all). Fixed by computing the same `wouldAutoNav` check (`!pt.path.includes(node.choices[0])`) during the walk-back and only stopping at a metadata node when it's false; otherwise the loop keeps walking back to a genuine decision point regardless of metadata. This does mean `undoRun()`'s stopping logic is coupled to `render()`'s auto-nav condition - if that condition's shape ever changes, this needs to change with it.

**Alternate start ("⚑" button):** next to New Run, hidden for open-world/series books (`_owIsOpenWorld`) since those must go through `_onNewSeriesRun` instead. Opens `#alt-start-modal-overlay` (wired in `boot.js`, mirroring the existing "Edit Start Node" modal exactly - same `.dice-count-row`/`±` stepper pattern, own copy of the increment/validation logic rather than sharing code with `_applyStartNodeRename`, since this doesn't rename anything in the graph, it just picks the entry section for one new run) via `setAltStartHandler(fn)`/`_altStartHandler`, defaulting the input to the book's normal `state.startSection`. On save, calls `startPlaythrough(secId)` directly - bypassing `state.startSection` for just this one run, which is the whole point: gamebooks with a genuine second/alternate beginning (e.g. flip/dos-a-dos print editions with two separate stories bound back-to-back) can be started from either entry point without needing two separate book entries or permanently reassigning the start node.

**New Run picker (2+ known starts):** clicking "New Run" no longer always starts immediately at `state.startSection` - `_knownStartSections()` (`play.js`) builds the set of "known" starts as the book's default `state.startSection` plus every distinct `pt.path[0]` seen across `state.playthroughs`, filtered to sections that still exist in `state.graph` (so a start used once by mistake and then deleted from the graph drops out of the list on its own - no separate cleanup step needed). With fewer than 2 known starts (the overwhelmingly common case), "New Run" behaves exactly as before - `startPlaythrough()` fires immediately, no extra click. With 2+, `showStartPicker()` opens a small dialog (`#start-picker-overlay`, built once and cached the same way `showFastTravelDialog()` already does, reusing its `.ft-dialog-*` classes rather than inventing new ones) listing each known start as its own button, the book's default tagged `(default)`. Picking one calls `startPlaythrough(secId)` directly, same as the existing "⚑" alt-start flow below. A "⚑ Type a section" button inside the picker still falls through to the existing alt-start modal (`_altStartHandler`) for a section that hasn't been used yet, so the picker only replaces the common "pick a start I've used before" case, not the escape hatch for a genuinely new one.

**Public run viewer and alternate starts:** `getPublicRun`/`getPublicSeriesRun` in `server/db.js` send a `startSection` field that `public-profile.js`'s `_buildPubSegNetwork` uses purely for the cosmetic yellow "start" node marker (`isStart`, has no effect on layout/traversal - the full path/graph render regardless). This used to be `s.startSection ?? null` - the *book's* configured default start - which was wrong for any run that didn't actually begin there (e.g. one started via the "⚑" alternate-start button above). Fixed to use that specific run's own `pt.path[0]` instead, so the public view always highlights wherever *that run* actually began, not the book's default.

**Battle-node coloring drift (2026-07-25):** `_buildPubSegNetwork`'s node-color logic is one of three independent reimplementations of the same "color this node" rules (alongside `graph.js`'s `nodeColor()` and `server/export.js`'s `_nodeColor()`), and had drifted from the other two specifically for the battle flag. `graph.js`'s canonical rule: a battle-flagged section keeps whatever fill its other state (visited/mapped/end-node/etc.) already gave it, and just gets its *border* overridden to orange - applied unconditionally last, on top of everything except the start/current-position/final-node "shown as-is" states. `public-profile.js` instead had `isBattle` as one mutually-exclusive branch reachable only if the node wasn't the start, wasn't the final node, wasn't on the run's path, wasn't a historical end-node, and wasn't a portal - so a section that was both flagged battle *and* actually visited during the run showed as a plain "visited this run" blue node, with the battle indicator silently lost for exactly the nodes where it mattered (the ones the player walked through). Fixed to match `graph.js`'s precedence: compute fill/border from the existing rules first, then apply the battle border-override afterward (start/entry/final still excluded, matching `graph.js`'s start/current/final exclusions).

A second, unrelated color drift turned up cross-checking the rest of the branches the same way: `_buildPubSegNetwork`'s `hasDeath && hasWin` case (a section whose own choices include both a death and a win option) used `#b45309`/`#f59e0b` - the color `graph.js`/`server/export.js` both reserve for a *different*, "ends"-based case (a node that's the historical ending point of both a death-run and a victory-run - a completely separate concept `public-profile.js`'s own `endNodeMap` structure can't even represent, since it maps one id to one single result). The canonical color for the choices-based "both" case (`COLORS.bothOutline`/`GRAPH_COLORS.bothOutline`) is `#0f172a`/`#f59e0b`, matching the single-outcome `deathOutline`/`victoryOutline` pattern right next to it. Fixed to match.

**Security note - both endpoints are fully unauthenticated** (no `authenticate()` call in their `server.js` handlers), and both build a multi-book journey by querying every book in the series the run passed through. Each of the two near-identical `seriesBooks` queries (one in `getPublicRun`, one in `getPublicSeriesRun`) must independently filter `b.is_public = 1` - an open-world series being public only means the *series* is public, not every book in it; an author can add a new unpublished/draft book to an already-public series while still working on it. Without the per-book filter, a public run that had portal-traveled through that book would leak its graph/path to any unauthenticated caller. Fixed in both copies (2026-07-24) - if a third copy of this journey-building pattern is ever added, it needs the same filter.

**Own graph view and alternate starts:** the same "book default vs. this run's actual start" mismatch existed in three more places, all fixed alongside the public-viewer one above: `graph.js`'s `nodeColor()`/`nodeLabel()`/`syncGraph()` (the private graph's yellow "start" highlight, "START" label, and bold start-node font all now follow `_effectiveStartSec(displayPt)` - the currently-displayed run's own `path[0]` when there is one, falling back to `state.startSection` only when no run is being viewed); `graph.js`'s `subtreeToDelete()` and `play.js`'s `_cleanupOrphanedTargets()` (see "Node deletion" below - both used to treat `state.startSection` as the *only* protected root when deciding whether a node is a safe-to-remove orphan, which could wrongly sweep up a node that's actually still in use from an alternate-start run's own component).

**Onboarding pulse on `#choices-input`:** new players often don't realize the empty choices box needs typing into. `play.js` tracks `_choicesRecordedCount` (module-level, exported via `setChoicesRecordedCount`/read via `CHOICES_PULSE_THRESHOLD = 50`) and applies a `choices-input--pulse` CSS class (amber box-shadow ring, mirrors `.new-run-btn.pulse`) whenever the count is still below the threshold. The count increments only on a genuine submission through the original "record choices for an undecided section" input (the `#record-btn` click handler) - not through the separate "edit choices" modal, which reuses the same underlying `handleRecordChoices` function but shouldn't count toward this onboarding metric. Persisted via `ui_prefs.choicesRecordedCount` through the normal `savePrefs`/`syncPrefs` mechanism (`prefs.js`), so it survives across sessions and devices rather than resetting each load. Respects `body.reduce-motion` (`animation: none !important`), per the app's no-GPU-animation convention. Because `syncPrefs()` (triggered from `showBooks()`) and the play area's first `render()` (triggered from `showMain()`) are independent async flows, `applyPrefs()` directly toggles the class on the live `#choices-input` element (if already rendered) the moment the server value arrives, rather than waiting for the next natural `render()` to pick it up - otherwise a returning veteran user could see a stale pulse for a while if they navigate straight into a book before the pref sync resolves.

---

## Dice roller (`dice.js`)

Per-run dice state, stored on `pt.diceState` (`{ count, die, lastResult, previousResult }`) and persisted via `saveState()`, mirroring `pt.charSheet`'s per-run scoping. `_legacyDiceState()` migrates older/malformed shapes on read. `state.dicePrefs` remembers the last-used count/die at the book level so new runs start with the same setup.

`getRunPt()` returns `viewingPt || currentPlaythrough()`, same as the compact display logic elsewhere - so browsing a completed past run via the trail shows *that* run's dice state, not the active run's. Until 2026-07-25, this had no read-only gate at all: rolling dice, changing the count, or picking a die while viewing a non-active (completed) run wrote straight into that historical run's `diceState` and persisted it, silently overwriting its last-known roll - the only per-run widget without the read-only handling `charsheet.js`/`inventory.js`/`equipment.js` all have. Fixed with `isDiceReadOnly()` (`!!getRunPt() && !currentPlaythrough()`, same condition as `charsheet.js`'s `_readOnly`): the throw button, ±count buttons, count input, and die-shortcut buttons are all `disabled` (visible-but-disabled, not hidden - `_applyDiceReadOnly()`, re-run from the same `setAfterRenderFn` hook that repaints the dice UI after every render) and each handler also early-returns as defense-in-depth. Styled via `.dice-shortcut-btn:disabled`/`.dice-adj-btn:disabled`/`#dice-count-input:disabled`/`#dice-throw-btn:disabled` in `dice.css`.

## Character sheet (`charsheet.js`)

A self-contained module for tracking book-specific character stats per book. Imports only `state.js` and `i18n.js`. To remove: delete `charsheet.js`, remove its import line from `boot.js`, and delete `public/css/charsheet.css` (and its `<link>` in `index.html`).

Until 2026-07-25, this file's `i18n.js` import had no `?v=N` cache-busting query string at all (`import { t } from './i18n.js';`). Since static `.js` files are served with `Cache-Control: public, max-age=3600`, and the query string is the only thing that gives the browser a new URL to force a fresh fetch, this meant charsheet.js's copy of `i18n.js` could serve stale translation strings for up to an hour after any `i18n.js` update - and every version-bump cascade run against `i18n.js` this session silently skipped this file, since cascades match on `i18n\.js\?v=N`. A codebase-wide grep afterward turned up two more instances of the exact same gap - `graph.js`'s imports of both `constants.js` and `i18n.js`, and `play.js`'s import of `i18n.js` - all unversioned for the same reason (likely never updated since whenever these files were first split out). Fixed all three the same way; `constants.js` had never had a version at all (only ever imported from this one now-fixed spot), so it was started at `?v=1`. Confirmed via `grep -rnE "from ['\"]\./[a-zA-Z0-9_-]+\.js['\"]" public/js/*.js` (matches any local import with no `?v=` at all) that no other unversioned imports remain anywhere in the codebase.

**Exports:**
- `initCharSheet()` - call once from `DOMContentLoaded`. Injects the modal overlay into `document.body`, and the open button + compact display into `#main-screen`.
- `renderCharSheetDisplay()` - called at the end of `render()` in `play.js`. Refreshes the compact text overlay from `state.charSheet.fields`.
- `setCharSheetVisible(bool)` - called by screen-routing functions in `boot.js`. Hides/shows the button and display; closes the modal when hiding.

**Button and display** are appended to `#main-screen` as `position: fixed` children. They are invisible whenever `#main-screen` has `display: none` (login/books screens), and explicitly hidden/shown via `setCharSheetVisible`.

**Scope:** the character sheet is **per run**. Each playthrough carries its own `charSheet: { fields: [] }`. There is one **template** per book (`state.charSheetTemplate`, `null` if unset). When a new run is started, its sheet is deep-copied from the template if one exists, otherwise starts empty.

**Reordering:** each field row has a `⠿` drag handle. Dragging is gated by a `_dragFromHandle` flag (set on `mousedown` of the handle, cleared on `mouseup`/`dragend`) so inputs and buttons within the row remain interactive. On drop, the source field is spliced out of `_draft.fields` and inserted at the target index; `renderModal()` is called to rebuild the list.

**Modal behaviour:** opening the modal deep-copies the active run's sheet into a module-level `_draft`. All edits are local to `_draft` until an explicit button press:
- **Save** - writes `_draft` to `activePt.charSheet` and calls `saveState()`
- **Save as template** - writes `_draft` to `state.charSheetTemplate` and calls `saveState()` (does not save to the run)
- **Cancel** - discards `_draft`, closes modal

**Read-only mode:** when viewing a completed past run (`viewingPt` is set and `currentPlaythrough()` is null), the button is enabled and opens the modal in read-only mode - fields are rendered as plain text, and no writes occur. When no run is loaded at all, the button and display are hidden. Until 2026-07-25, the footer (Add field / Save / Save as template / Cancel) was hidden entirely in read-only mode - inconsistent with this app's standing "read-only means visible-but-disabled, not hidden" rule. Fixed: the footer stays visible, and Add field/Save/Save as template are individually `disabled` (styled via `.cs-btn-add:disabled`/`.cs-btn-template:disabled`/`.cs-btn-save:disabled` in `charsheet.css`) while Cancel stays enabled so the view can still be dismissed.

**Field types:** `number`, `boolean`, `text`, `list` (comma-separated, stored as `string[]`), `enum` (fixed option set defined per-field). Each field has a `visible` toggle controlling whether it appears in the compact display overlay.

**Number field formatting:** displayed values (compact overlay, read-only modal, and the editable field when not focused) are comma-formatted via `fmtNum()` (`Number(n).toLocaleString()`). The editable input is `type="text" inputmode="numeric"` rather than a native number input - native number inputs cannot display thousands separators at all - with focus/blur handlers swapping between the raw digit string (for easy editing) and the comma-formatted string. Because a text input accepts any keystroke (unlike the native number input it replaced), `readVal`'s `number` case live-filters input to `[0-9.\-]` on every keystroke and falls back to `0` on an unparseable result, so garbage input can't get stored or displayed as a literal "NaN". The `±` stepper buttons strip commas before parsing and reformat with commas afterward (unless the input is still focused, in which case they leave it as a raw digit string for continued editing).

This convention was violated in `battlesim8.js` (2026-07-25) - its `_statField()`-generated stat inputs (player/enemy skill, life, lifeMax) and the arrows counter all used bare `type="number"`, despite already sitting inside the same `.inv-qty-wrap`/`±`-button markup as charsheet's/inventory's correctly-built steppers. Fixed to `type="text" inputmode="numeric"` with a live `[^0-9]` filter on input (no comma-formatting needed here, since these are always small values - skill 2-5, life/arrows rarely more than double digits). Same violation found the same way in `battlesim829.js` (its `_statField()`-generated inputs, `bsim-ranged-attempts`, and `bsim-heal-amount`) - fixed identically; `bsim-heal-amount` had no `input` listener at all before this, relying entirely on the native number input's own behavior, so one was added.

**Display** is plain unstyled text at bottom-right with `pointer-events: none`. Only fields with `visible: true` and a non-empty name are shown. Reads from the active run if one exists, otherwise the viewed run.

---

## Inventory (`inventory.js`)

A self-contained module for managing per-run item slots. Imports `state.js`, `play.js` (for `showConfirm`), and `charsheet.js` (for `getPlayBtnRow`). To remove: delete `inventory.js`, remove its import from `boot.js` and `equipment.js` - its CSS lives in `public/css/equipment.css` alongside equipment's own (the two sections were adjacent and small enough to combine when split out).

**Exports:**
- `initInventory()` - call once from `DOMContentLoaded`. Injects the inventory button into `#main-screen`.
- `preloadItems()` - fetches the active/viewed run's items on demand; called by `boot.js` after `setOnViewingPtChange` fires.
- `setExtraDisplayItemsProvider(fn)` - registers an async callback (set by `boot.js`) that supplies extra items to merge into `#inv-display` on every grid refresh. Used to inject equipped "show on screen" items from `equipment.js` without creating a direct import (avoiding a deeper cycle).

**Item data loading:** inventory never fetches all items upfront. Instead:
- On picker open, `GET /api/items?meta=1` fetches a lightweight list (id, name, type) - no SVG data.
- SVGs are loaded lazily per tile via `IntersectionObserver` (`GET /api/items/:id`) only when the tile scrolls into view.
- Individual item SVGs are cached in a module-level `Map` (`_itemCache`) keyed by id. The cache persists for the session.

**Scope:** the inventory is **per run**. Each playthrough carries its own `inventory: []` - an array of slot objects `{ itemId, label }`. There is one **template** per book (`state.inventoryTemplate`, `null` if unset). When a new run is started, its inventory is deep-copied from the template if one exists.

**Drag-and-drop reordering:** grid tiles have `draggable="true"` (when not read-only). `dragstart` stores the source index; `dragover` highlights the target tile; `drop` splices and re-saves. CSS classes: `.inv-slot--dragging` (source tile), `.inv-slot--drag-over` (target tile).

**Read-only mode:** when `viewingPt` is set and `currentPlaythrough()` is null, the inventory opens in read-only mode - the Add button and Save as Template button are hidden, drag handles are disabled, and the context menu is suppressed.

**Save as Template:** clicking the button writes a deep-copy of the current run's inventory to `state.inventoryTemplate` and calls `saveState()`.

**View refresh:** `boot.js` registers a `setOnViewingPtChange` callback that calls `preloadItems()` and `renderCharSheetDisplay()` whenever the viewed run changes (including when the user switches between runs).

---

## Equipment (`equipment.js`)

A self-contained module for a per-run equipment panel - a character silhouette with fixed slots (head, chest, weapon, off-hand, back, rings, etc., defined in `SLOTS`) plus five extra `ITEM_SLOTS` for consumables. Visual only, no stat effects. Available to all users (not gated).

Imports `state.js`, `inventory.js` (to move items between inventory and equipment - see the dependency-cycle note above), and `charsheet.js` (for `getPlayBtnRow`).

**Exports:**
- `initEquipment()` - call once from `DOMContentLoaded`. Injects the equipment button into `#main-screen`.
- `setEquipmentVisible(visible)` - show/hide the panel; closes any open context menu/dialogs when hiding.
- `instantiateLoadout()` - given `state.inventoryTemplate` and `state.equipmentTemplate`, returns `{ inventory, equipment, equipmentVisible }` for seeding a new playthrough (removes templated equipment items from the starting inventory).
- `getVisibleEquippedItems()` - returns the equipped items currently marked "show on screen", for merging into `#inv-display`. Each entry now also carries `equipped: true` and `slotLabel` (looked up from `ALL_SLOTS` by key) so the display can render a slot badge distinguishing it from a plain inventory item.

**Data model:**
- `pt.equipment = { slotKey: { itemId, label, note, qty } | itemId (legacy), ... }` - per-playthrough equipped items.
- `pt.equipmentVisible = { slotKey: true }` - which equipped slots are pinned to the on-screen display.
- `state.equipmentTemplate = { slotKey: { itemId, label, note, qty } }` - one template per book, used by `instantiateLoadout()`.
- `state.equipmentVisibleTemplate = { slotKey: true }`.
- `_eqItemId(entry)`, `_eqMeta(entry)`, `_eqQty(entry)` - helpers that normalize both the legacy bare-itemId form and the current object form for `pt.equipment`/`equipmentTemplate` entries.

**Equipping/unequipping:** clicking an empty slot opens a picker sourced from `getInventorySlots()`; picking an item moves the whole stack from inventory into the slot via `_equipItem()`, carrying over its label/note/qty/visible flag. Clicking the **✕** on a filled slot unequips it back to inventory via `addItemToInventory()`.

**Context menu:** right-clicking a filled slot opens `.inv-ctx-menu` (reusing inventory's CSS) with **Show/Hide on screen**, **Rename** (`.inv-rename-dialog`-styled `#eq-rename-dialog`), and **Edit** (`.inv-edit-dialog`-styled `#eq-edit-dialog`, for qty/note/visible).

**Drag-and-drop between slots:** native HTML5 drag-and-drop (`draggable` + `dragstart`/`dragover`/`drop`), wired in `_wireSlotEvents`. Only filled slots are `draggable`; every slot (filled or empty) accepts drops. Works across both the body-slot grid and the item row - the source slot key is tracked in a module-level `_dragSourceKey`, not container-scoped, so dragging e.g. a ring into an item slot works same as within one group. `_swapEq(fromKey, toKey)` moves the dragged item into the target slot; if the target was already filled, the two entries (and their independent `equipmentVisible` flags) trade places instead of overwriting. No slot-type restriction, consistent with the picker - this system is visual-only. The remove (**✕**) button has `draggable="false"` so clicking it can't be misread as a drag start. `.eq-slot--dragging` (dimmed) and `.eq-slot--drag-over` (amber highlight) give visual feedback. Like the character sheet's field-reorder drag handle, this is native HTML5 DnD with no touch/mobile fallback - desktop/mouse only.

**Read-only mode:** when `viewingPt` is set and `currentPlaythrough()` is null, slots are not clickable, remove buttons and the context menu are hidden, and Save as Template is hidden. Drag-and-drop is also disabled (`_wireSlotEvents` returns early on `ro`).

**Save as Template:** clicking the button writes `state.equipmentTemplate`/`equipmentVisibleTemplate` as full `{itemId, label, note, qty}` objects from the current loadout and calls `saveState()`.

**On-screen display:** `boot.js`'s `_refreshInvDisplay()` and the `setExtraDisplayItemsProvider()` callback both call `getVisibleEquippedItems()` so equipped "show on screen" items appear in `#inv-display` alongside visible inventory slots, and survive inventory grid re-renders. `#charsheet-display` and `#inv-display` share identical plain-text styling (stacked in `#stats-hud`), so `inventory.js`'s `_invLineHtml(item, displayName, note, qty, badgeText, kind)` renders a `.inv-line-slot` badge distinguishing all three kinds of line that can appear there: a charsheet field gets no badge (existing grey `.cs-label`), a plain inventory item gets a blue "ITEM" badge (`kind: 'item'`), and an equipped item gets its slot name as the badge, amber (`kind: 'equipped'`, e.g. "WEAPON"/"HEAD").

---

## Render pipeline (`play.js › render`)

```
render()
  ├── syncGraph()               - updates vis-network nodes/edges to match state
  ├── updateStats()             - updates sidebar stat counters
  ├── renderPlaythroughPanel()  - rebuilds sidebar HTML and re-attaches events
  │     └── renderPathTrail()  - updates #run-trail-float element
  └── renderCharSheetDisplay()  - refreshes the character sheet compact overlay
```

`renderPlaythroughPanel` replaces `panel.innerHTML` on every call. Event listeners are re-attached after each replacement.

`#run-trail-float` and `#legend` are both `position: fixed` overlays rendered on top of the graph area. The trail floats at the top-left of the graph area (just right of the sidebar); the legend floats top-right. Both have `pointer-events: none` and use a frosted glass style (`backdrop-filter: blur`). `#legend` is hidden automatically when `#main-screen` has `display: none`.

Two CSS custom properties in `:root` coordinate the layout:

| Property | Default | Used by |
|----------|---------|---------|
| `--sidebar-w` | `270px` | `#run-trail-float` left offset |
| `--legend-w` | `195px` | `#legend` width; `#run-trail-float` max-width calculation |

`#run-trail-float` is content-sized (no explicit width) and grows with the run trail up to `max-width: calc(100vw - var(--sidebar-w) - var(--legend-w) - 36px)`, which keeps it clear of the legend at all viewport sizes.

**Graph background image:** when a book has a cover, `showMain` sets `#graph-container`'s `backgroundImage` to the cover wrapped in `linear-gradient(rgba(15,23,42,0.92), …), url(…)`. `background-attachment: fixed` keeps it pinned when the sidebar collapses. Initial `background-position-y` restored from `user_books.bg_pos_y` (default 50%). Anthology children without their own cover fall back to the parent's cover via a `data-parent-cover` attribute.

**Background context menu** (right-click on graph background, not on a node) → `#bg-ctx-menu`:
- **Hide / Show background** - toggles `_bgHidden`; saves immediately via `PATCH /api/books/:id/bg`.
- **Move background** - `_bgInMove = true`, cursor = `ns-resize`. `mousemove` adjusts `_bgPosY` via `e.movementY * 0.15`, clamped 0–100. Click or Esc exits move mode and saves. Stored in `user_books.bg_hidden` / `user_books.bg_pos_y`.
- **Connectors** - submenu (`.ctx-submenu-wrap` / `.ctx-submenu-panel`) listing five edge styles: `curvedCW` (Curved), `curvedCCW` (Curved opposite), `cubic` (Cubic bezier), `horizontal` (Horizontal), `straight` (Straight). Clicking an item writes `state.connectorStyle`, calls `saveState()`, and calls `applyConnectorStyle(style)` from `graph.js` to apply the change immediately via `network.setOptions()`. The submenu re-opens with the current style checked (`.ctx-connector-item.active` → `✓` badge). `_updateConnectorMenu()` in `bg.js` syncs the active class each time the menu opens. `_setupCtxSubmenuFlip()` positions the submenu panel to avoid viewport overflow.

**Context menu positioning** (`_positionMenu(menu, x, y)`): sets `left`/`top`, then clamps both axes to viewport bounds (4px padding). Must be called after all item visibility is set so `offsetWidth`/`offsetHeight` are final.

**Sidebar book cover** (`#sidebar-book-info`): shown only at `min-width: 1921px` and only when `_bgHidden === true`. 2:3 aspect ratio, full-width. Updated by `_updateSidebarBookInfo()` - called from `_applyBgPref()` and from the book-open flow after `render()`. `img.src = ''` triggers the `[src=""]` CSS rule to hide it.

**Main page background:** `#landing-bg-a` and `#landing-bg-b` are two `position: fixed; z-index: -1` divs outside `#landing-wrapper`. On load, `_rotateLandingCover()` picks from a shuffled queue of the user's books with covers and crossfades between layers (fade next layer in over 1.5s, then fade old layer out). Rotates every 60 seconds via `window._landingCoverInterval`.

Two separate call sites request an immediate rotation on every return to the landing page: `_showCachedCoversPanel()` (synchronous, uses whatever covers are already cached) and `loadCovers()` (fires once the fresh `/api/covers` fetch resolves, a few hundred ms later). Both exist because of an earlier fix - without both, the background sat blank for up to 60s after navigating Home until the next interval tick. But calling `_rotateLandingCover()` twice in quick succession has no coordination on its own: the function starts a `setTimeout` chain (1.5s to fade the next layer in, then another 1.6s before marking the old layer's `willChange` clean) and flips which of `a`/`b` is "active" *before* that chain finishes - so a second call landing mid-crossfade reads a layer the first call is still mid-transition on, and the two calls' cleanup timeouts fight over the same two elements. Symptom: the background flickers a couple of times then both layers end up at `opacity: 0` until the next natural 60s tick. Fixed with an in-flight guard (`_rotationInFlight`/`_rotationQueued` module vars in `covers.js`) - a rotation request that arrives while one is already running just sets a flag and gets replayed once the in-flight one finishes, instead of stomping it.

---

## Data migration (`state.js › loadState`)

`loadState` applies these fixes to data loaded from the server:

- Adds missing fields (`positions`, `activePtIndex`, `bookName`) for data saved before those fields existed
- Removes self-referential choices (section pointing to itself)
- Migrates old path endings: if a path ends with -1 or 0 (pre-terminal-model data), pops it and sets `completed`/`result` instead
- Deletes `state.graph[-1]` and `state.graph[0]` (old data may have stored them as real nodes)
- Strips legacy `tagDefs` root key and per-node `tags` arrays left over from a removed feature

---

## Identifier validation (`edit-book.js`)

### `validateIsbn(raw)`

Strips hyphens and spaces, uppercases the result, then:

- **Empty string** → returns `''` (field is optional)
- **10 characters** → ISBN-10: checks each of the first 9 digits, allows `X` as the 10th digit (value 10), validates that `Σ d[i] × (10−i) mod 11 === 0`
- **13 characters** → ISBN-13: all digits, alternating weights 1/3 on the first 12, check digit = `(10 − (sum mod 10)) mod 10`
- **Any other length or bad characters** → returns `null` (invalid)

Returns the normalised string (digits only, no hyphens). `null` triggers an inline error; `''` is stored as `NULL`.

### `validateIssn(raw)`

Strips hyphens and spaces, uppercases the result, then:

- **Empty string** → returns `''` (optional)
- **8 characters, digits + optional trailing X** → mod-11 check: weights 8–2 on the first 7 digits; check digit is `(11 − (sum mod 11)) mod 11`, where 10 maps to `X` and 11 maps to `0`
- **Any other input** → returns `null` (invalid)

Returns the formatted string `XXXX-XXXX`. `null` triggers an inline error.

### `validateAsin(raw)`

Strips spaces, uppercases the result, then:

- **Empty string** → returns `''` (optional)
- **Exactly 10 alphanumeric characters (`[A-Z0-9]`)** → valid; returns the normalised string
- **Anything else** → returns `null` (invalid)

No checksum exists for ASINs - format-only validation. `null` triggers an inline error.

---

## Internationalisation (`i18n.js`)

Only English is active. The infrastructure supports additional languages; no UI switcher is exposed.

### Core API

| Export | Description |
|--------|-------------|
| `t(key, params)` | Returns the translated string for `key` in the current language; falls back to English then to the key itself. `{param}` placeholders are replaced from `params`. Checks `_overrides` first (see below). |
| `applyTranslations()` | Walks the DOM: sets `textContent` for `[data-i18n]` elements, `placeholder` for `[data-i18n-placeholder]` elements, `title` for `[data-i18n-title]` elements, and updates `document.title` and `document.documentElement.lang`. |
| `setTranslationOverride(key, value)` | Sets a runtime override for a single translation key. Overrides take priority over both the current language and the English fallback. Used by `boot.js` to inject the server-chosen tagline into `app.tagline` without changing the translation table. |

`_lang` currently only ever resolves to `'en'` (read once from `localStorage`'s `gamebook_lang` key at module load, with no other language actually implemented) - there is no `setLang()`/language-switcher UI. `getLang()` (2026-07-25) was a dead export with zero callers anywhere in the codebase, removed during a dead-code sweep; `setLang(lang)` had already been removed from the code entirely at some earlier point without this doc being updated to match - fixed now.

### Dynamic content

Static HTML elements use `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` attributes. Dynamically-built HTML (books list, playthrough panel, node tooltips) calls `t()` directly at render time. A `lang-changed` listener in `boot.js` triggers `renderBooksList` (if books screen is visible) or `render()` (if main screen is visible) so all dynamic content updates when the language switches.

### Adding a new string

1. Add the key to the `en` object in `i18n.js`.
2. Use `data-i18n="key"` in HTML or `t('key')` in JS.

### Adding a new language

Add a new key at the same level as `en` in the translations object (e.g. `fr: { ... }`) with a full copy of all keys from `en`. A comment in `i18n.js` marks the insertion point. Then add a UI trigger that calls `setLang('fr')`.

---

## Automated backups (`server/backup.js`)

`backup.start()` is called once at server startup (before the listen call). It immediately attempts a startup backup, then schedules **hourly** runs on the hour using a self-resetting `setTimeout`.

Each run:
1. Creates `backups/` at the project root if it does not exist.
2. Skips if this hour's ZIP (`backup-YYYY-MM-DD_HHh.zip`) already exists.
3. Calls `db.backupDb(destPath)` - better-sqlite3's online backup API - to produce a consistent point-in-time snapshot safe to read while WAL mode is active.
4. Zips the snapshot with `zip -j`, then deletes the raw `.sqlite` temp file in a `finally` (2026-07-25) - so a failed/hung zip (disk pressure, missing `zip` binary, etc.) can't leave the temp file behind. Previously the delete only ran after a successful zip, meaning a zip failure both silently skipped that hour's backup *and* left a junk `.sqlite` file that made a disk-pressure cause of the failure worse on every subsequent hourly attempt. The error still propagates to the caller's `console.error` either way.
5. Deletes any `backup-*.zip` files in `backups/` whose `mtime` is older than 15 days.

Files are named `backup-YYYY-MM-DD_HHh.zip` so they match the `*backup*` glob used by the admin Backups tab - rolling backups appear there alongside any manual backups.

## Open World

An **open world series** is a series in which every book is part of one shared adventure - runs span all books simultaneously, a character sheet travels with the player between books, and special **portal nodes** allow travel from one book to another mid-run.

### Core concepts

- **Series run (`series_runs` table):** A run that is shared across all books in the series. Run 1 in Book A and Run 1 in Book B are the same run - numbering is global to the series.
- **Series character:** Each series run carries a `char_data` JSON blob (same structure as a per-book `charSheet`) that travels with the player.
- **Portals:** Special nodes rendered as teal diamonds (◇) in the graph. A portal links to a specific section in another book in the same series. Clicking a portal travel button saves progress and resumes (or starts) the run in the target book at the specified entry section.
- **Placeholder runs:** When a run is actively being played in one book, all other books in the series display a placeholder entry (`another book ⇒`) so run numbering stays consistent.

### Schema additions (`server/db.js`)

```sql
-- Added via ALTER TABLE migration at server startup:
series.is_open_world  INTEGER DEFAULT 0

-- New table: series-level character (legacy; mostly superseded by series_runs.char_data)
series_characters (
  user_id   → users CASCADE,
  series_id → series CASCADE,
  char_data TEXT,
  PRIMARY KEY (user_id, series_id)
)

-- New table: series-level runs
series_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      → users CASCADE,
  series_id    → series CASCADE,
  run_index    INTEGER NOT NULL,
  char_data    TEXT,
  started_at   TEXT,
  last_book_id INTEGER,
  last_section INTEGER,
  completed    INTEGER DEFAULT 0,
  result       TEXT,      -- 'portal' | 'success' | 'death' | 'battle'
  is_public    INTEGER DEFAULT 0,
  completed_at TEXT,
  UNIQUE (user_id, series_id, run_index)
)
```

`result = 'portal'` is a transient state meaning "paused at a portal, continuing in another book". It is not a terminal outcome - the run is still considered active until it ends with `success`, `death`, or `battle`.

### API endpoints (`server.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/series/:id/runs` | Fetch all series runs for the authenticated user + series |
| POST | `/api/series/:id/runs` | Create a new series run → `{ runIndex }` |
| PUT | `/api/series/:id/runs/:index` | Update `char_data`, `completed`/`result`, or `is_public` |
| DELETE | `/api/series/:id/runs/:index` | Delete the row and decrement `run_index` for all subsequent rows (transactional). Mirrors the client-side `state.playthroughs.splice(index, 1)`. The client blocks deletion of placeholder/portal-paused runs to prevent cross-book state corruption. |
| POST | `/api/series/:id/reset` | Reset the entire series for the authenticated user: deletes all `series_runs` rows and resets every book's `state_data` in a single transaction. Returns `{ ok: true, bookIds }`. Called when the user presses "Reset Book" on any book in an open-world series - resets the whole series because `series_runs` is the canonical source of truth and a per-book reset would be immediately overwritten by `_syncSeriesRuns` on next open. |
| GET | `/api/series/active-runs` | Returns `[{ series_id, run_index, last_book_id, last_section, series_name }]` for every active (non-completed) series run in an open-world series the user is in. Used by the Books screen to render the "▶ Run N" badge on whichever book currently hosts each run. |
| GET | `/api/series/:id/character` | Get series character blob (legacy) |
| PUT | `/api/series/:id/character` | Save series character blob (legacy) |
| GET | `/api/public/series/:id/user/:userId/run/:runIndex` | Public journey viewer data for one open world series run |

The public run endpoint returns `{ seriesName, segments: [{ bookId, bookName, graph, positions, path, totalSections }], result }`. Each segment represents one book visited during the run, in order.

### State model additions

**`node.portals[]` (in `state.graph[sectionId]`):** An array of portal objects stored alongside `node.choices[]`. Portals do not affect the choices array. Each portal:

```js
{
  targetBookId:    number,
  targetSection:   number,
  label?:          string   // optional display name
}
```

**Per-run portal-pause fields (in `state_data.playthroughs[i]`):**

| Field | Purpose |
|-------|---------|
| `isPortalPaused` | `true` when the run is paused mid-portal-travel |
| `portalRunIndex` | Series run index this playthrough belongs to |

**`state_data.seriesRunIndex`** - top-level field on the book's `state_data`. Records which series run index each per-book run slot corresponds to (keyed by playthrough array index).

### Graph rendering

Portal nodes are rendered as teal diamonds only in books that belong to an open world series. Non-open-world books are completely unaffected - the `nodeColor` and `nodeShape` logic in `graph.js` checks `state.isOpenWorld` before applying portal styling.

### Recording portals (`play.js`)

In the play area of an open world book, an **Add Portal** button appears below the choices input (always visible). Clicking it opens a modal to select:
- Target book (dropdown, limited to books in the same series the user has in their library)
- Target section number
- Optional label

Portals are written to `node.portals[]` in `state.graph[sectionId]` and saved via `saveState()`. They are entirely separate from `node.choices[]` and do not affect graph edges or run logic.

### Travelling through a portal (`play.js`)

When the active section has one or more portals, **Portal destinations** buttons appear in the sidebar. Clicking one shows a themed confirm dialog. On confirmation:

1. The current run's character sheet is written to `series_runs` via `PUT /api/series/:id/runs/:index` with the updated `char_data`.
2. The current playthrough is marked `completed: true, result: 'portal'` and saved to the book's state.
3. The app navigates to the target book (`showMain(targetBookId, …)`).
4. In the target book, `_resumeOrStartSeriesRun(seriesRunIndex, targetSection)` either resumes an existing in-progress playthrough at the portal entry section or starts a new one.

### Cross-book behaviours

- **Fast travel / Center on current section:** both work cross-book. If the active run's last position is in a different book, the relevant button navigates to that book first, then performs the action.
- **`_syncSeriesRuns(seriesId)`:** called on every open-world book open. Fetches `GET /api/series/:id/runs` and propagates `completed`, `result`, `is_public` to local `state_data` playthroughs. Edge cases: (a) local terminal playthrough with no `series_runs` record → pushes completion up; (b) active run's `last_section` absent from local path → restored; (c) surplus portal-paused or empty-placeholder runs beyond series run count → pruned (prevents phantom recreation after cross-book deletes).
- **`completeSeriesRun(seriesRunIndex, result)`:** called from `handleSaveState` on newly-terminal playthroughs. Writes `{ completed: true, result }` to `series_runs`, then calls `_syncSeriesRuns` to propagate immediately to all books.

### Run list in open world books

- **Placeholder runs** - show as `"another book ⇒"` with a teal label. These are synthetic entries inserted by `_syncSeriesRuns` so run numbers stay in sync when a run is active in a different book.
- **Completed runs** - show Load and Public/Private buttons (same as normal books).
- **Portal-paused runs** - treated as active (resumable) in the target book; shown as placeholder in all other books in the series. **Cannot be re-activated by clicking Load in their original book** - `loadRun` routes them through the view-only branch (no change to `state.activePtIndex`) because the run actually lives in another book. They can only be resumed by portalling back via `startPortalRun`.
- **Public run view button (⤢)** - appears next to Public runs in open world books. Opens the journey viewer dialog.
- **Run deletion:** `deleteRun` allows deletion of any run from any book regardless of status (completed, portal-paused, placeholder, or in-progress). The server's `handleDeleteSeriesRun` calls `db.patchSeriesRunDeletion(userId, seriesId, runIndex)` after `db.deleteSeriesRun`, which patches every book's `user_books.state_data` in the series to splice out the deleted playthrough and adjust `activePtIndex`. This keeps cross-book state consistent without requiring the user to navigate to the "home" book first. The client-side `_syncSeriesRuns` also prunes stale portal-paused or empty-placeholder extras (rather than re-registering them) to prevent phantom recreation after a cross-book deletion.

### Client-side series-run cache (`_cachedSeriesRuns` in `open-world.js`)

`_syncSeriesRuns` caches its server response in `_cachedSeriesRuns`. The `onRunActivated` callback calls `_computeCrossBookReachability(_cachedSeriesRuns, currentBookId)` to recompute cross-book context. Operations that mutate `series_runs.last_book_id`/`last_section` must also update the local cache:

| Operation | Cache update |
|-----------|-------------|
| `_handlePortalTravel` | `_cachedSeriesRuns[runIndex].last_book_id = targetBookId`, clears `_owSrc*` |
| `_doJumpCrossBook` | `_cachedSeriesRuns[activeIdx].last_book_id = currentBookId`, clears `_owSrc*` |
| `_handleNewSeriesRun` | Fills/extends `_cachedSeriesRuns[run_index]` with new run location |
| `deleteRun` → `onRunDeleted` | Splices `_cachedSeriesRuns` to mirror server-side DELETE + renumber |

### Public journey viewer (`public-profile.js › openPublicSeriesRun`)

For public open world series runs, the ⤢ button fetches `GET /api/public/series/:id/user/:userId/run/:runIndex` and renders a multi-segment journey dialog:

- Each segment shows a vis-network graph with the path for that book visit highlighted.
- Portal transitions between segments display the target book name.
- The final result (Victory / Loss / Battle Death) is shown at the end.
- A legend overlay (`div.pub-run-legend`) is injected into `#pub-modal-body` top-right, explaining node colours. Open-world runs include a portal diamond entry; single-book runs do not. Built by `_pubLegendHtml(isOpenWorld)` in `public-profile.js`.

The dialog reuses the same `vis-network` graph rendering code as the regular public run viewer, applied per-segment.

### Activity feed (open world)

Open world series runs emit different feed events from per-book runs:

| Event | When | Display |
|-------|------|---------|
| `series_run_started` | Any book in the series starts run N for the first time | `username began series run N in [Series Name]` |
| `series_run_completed` | A run ends (victory/loss/battle) in any book | `username won/lost/died series run N of [Series Name]` |

Standard `run_started` and `run_completed` events are **suppressed** for books that belong to an open world series, so only the series-level events appear. The verb follows the same mapping as regular runs (`success` → "won", `death` → "lost", `battle` → "died"). When `is_public` is true on the series run, the verb is a clickable button that opens the journey viewer.

### Key functions and files

| Function / area | File | Purpose |
|-----------------|------|---------|
| `isOpenWorld` flag, portal rendering | `graph.js` | Checks `state.isOpenWorld`; renders portal nodes as teal diamonds |
| **Add Portal** modal, portal travel buttons | `play.js` | Renders portal UI; handles travel confirm + state save |
| `_resumeOrStartSeriesRun` | `play.js` | Finds or creates the correct per-book playthrough after portal travel |
| `_syncSeriesRuns`, `_computeCrossBookReachability` | `open-world.js` | Reconciles `series_runs` ↔ local `state_data`; cross-book reachability |
| `doJumpCrossBook`, `clearOpenWorldState` | `open-world.js` | Cross-book fast travel; state teardown on book close |
| `completeSeriesRun` | `play.js` | Pushes a terminal result from a book playthrough up to `series_runs` |
| `openPublicSeriesRun` | `public-profile.js` | Fetches and renders the multi-segment public journey viewer |
| `getSeriesRuns`, `createSeriesRun`, `updateSeriesRun` | `server/db.js` | CRUD for `series_runs` |
| `getSeriesCharacter`, `setSeriesCharacter` | `server/db.js` | Legacy character blob helpers |
| `getPublicSeriesRunData` | `server/db.js` | Assembles segment data for the public journey viewer |
| `handleSeriesRuns*`, `handleSeriesCharacter*` | `server.js` | Route handlers for the series runs and character APIs |

---

## Play Together (parties)

Two or more users can link their copies of a book and play it together in shared real-time. The feature is built around three concepts: parties, invites, and SSE live-sync.

### Schema

`book_parties` holds one row per group per book. `party_invites` tracks pending/accepted/declined invitations. `user_books.party_id` links a user's book to a party (NULL when not in any party). A user can only be in one party per book (enforced at application level).

### Invite flow

1. User A clicks **Play Together** → `POST /api/books/:id/party` with usernames.
2. Server creates a `book_parties` row, sets User A's `user_books.party_id`, inserts `party_invites` rows. If a `party_id` already exists for this book, `createParty` returns the existing party (allows re-inviting).
3. Invitees see a pending invite card in their library (from `GET /api/party-invites`).
4. **Accept:** existing `user_books` row is `UPDATE`d (party state replaces it, no UNIQUE error). Library XP (`add_book`) skipped if already owned. Awards: `join_party` (50 XP) to the accepter, `create_party` (75 XP) to the creator when first invite turns the party into a multi-user party. Client calls `_refreshBooksListOnly()` + `loadPartyInvites()` (no full `showBooks()` reload).
5. **Decline:** status set to `'declined'`, no further action.
6. Members can add more invites any time via `POST /api/books/:id/party/invite`.

### Rejection rules

- The `already_tracking` block has been removed from `inviteToParty` - users can be invited regardless of whether they already have the book or have existing runs. Accepting the invite merges the party state into their existing `user_books` row if one exists.
- Invitee cannot already have a pending invite for the same party.

### State fan-out

On `PUT /api/books/:id/state` by any party member:
1. `db.fanOutState(partyId, sourceUserId, stateData)` writes the state JSON to all other members' `user_books` rows in one transaction.
2. `ssePush(partyId, sourceUserId, payload)` sends `state_updated` SSE to all other connected clients.

### SSE live-sync

- In-memory `Map<partyId, Set<{userId, res}>>` tracks connections.
- `GET /api/books/:id/stream` opens a persistent `text/event-stream`. Token via `?token=` (EventSource can't set headers). Cleaned up on `close`. No external pub/sub.

### Client-side

- `connectPartySSE(bookId)` - called after `loadState` in `showMain`. Fetches `/api/books/:id/party`, updates the Play Together button, opens `EventSource` if in a party.
- On `state_updated`: calls `loadState` + `render()`. `suppressAutoNav(true)` set for the duration so single-choice sections don't auto-navigate and create a feedback loop.
- On `party_changed` (2026-07-25): re-runs `connectPartySSE(bookId)` to refresh membership, and re-renders the party modal if it's currently open. Pushed server-side (`ssePush(partyId, actingUserId, { type: 'party_changed' })`) from `handleAcceptPartyInvite` and `handleLeaveParty` so existing party members see someone join/leave live instead of only on next reload - previously the SSE channel only ever carried `state_updated`, so an open party modal never reflected a membership change until manually closed and reopened. Not pushed on decline, since a declined invite doesn't change `getPartyForBook`'s membership result - there'd be nothing new to show. The re-render preserves whatever the user was mid-typing in the "Invite more" box (the live update would otherwise silently wipe an in-progress invite, since `_renderPartyModal` replaces the modal body wholesale). Guarded against a race with an actual navigation happening mid-refresh via the same `_connectGen` counter `connectPartySSE` itself uses.
- `disconnectPartySSE()` - called in `showBooks()` when navigating away.

### Leaving a party

`DELETE /api/books/:id/party` sets the caller's `party_id = NULL`. If only one member remains, the party is dissolved: their `party_id` is cleared and the `book_parties` row is deleted (cascading to all `party_invites`). Each ex-member keeps the current shared state.

### Activity feed

Run events (`run_started`, `run_completed`) from party members are merged into a single feed entry. After building the raw entry list, `getFeed` groups entries by `(partyId, bookId, runIndex, type)` and collapses duplicates into one entry with a `usernames` array. The frontend renderer checks for `e.usernames` and renders comma-joined names: **"koldkat, sashii began run 3 of Book X"**.

## Export (`server/export.js`)

All export logic lives in `server/export.js`. No additional npm dependencies - ZIP is built using Node's built-in `zlib.deflateRawSync` with a hand-rolled CRC-32 and ZIP format writer.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/export/all` | Bearer | Full account export |
| POST | `/api/export/book/:id` | Bearer | Single-book export |

Both respond `application/zip` with `Content-Disposition: attachment`. Awards XP on first use (`export_all` 200 XP; `export_book` 50 XP per book).

**Graph snapshots are SVG, generated entirely server-side** (`buildGraphSvg` in `server/export.js`) from each book's already-saved `state.positions`/`state.graph`/`state.playthroughs`/`state.startSection` - no browser, canvas, or headless renderer involved, and no client round-trip. An earlier version of this rendered a live `vis.Network` off-screen in the browser and POSTed a captured PNG back to the server; that was dropped for two reasons: a `<canvas>` capture is only ever as sharp as its pixel size (blurry vs. an SVG, which is resolution-independent), and positions/colors are just data - there was never an actual need for a browser to lay anything out, since the positions are already stored from normal play. Removing the round-trip also let `/api/export/all` go back to being a single GET request instead of a fetch-render-POST sequence.

Node/edge coloring in `buildGraphSvg` is a parameterized reimplementation of `graph.js`'s `nodeColor()`/`edgeColor()` (specifically the "no specific run being viewed" aggregate-coloring branch, since a static snapshot has no single displayed run) - not imported from `graph.js`, which is tightly coupled to the single live `state` singleton on the client and has no server-side equivalent anyway. `GRAPH_COLORS` in `server/export.js` must be kept in sync with `public/js/constants.js`'s `COLORS` if either changes. Returns `null` (no graph file) for a book that's never been laid out (`Object.keys(positions).length === 0`).

**Graph legend (2026-07-25):** unlike the live app, where the graph always sits next to a legend panel, the exported HTML used to embed the graph image with no explanation of what any color meant - a real gap, since the whole point of exporting is for the file to stand on its own outside the app, potentially opened much later or shared with someone who's never seen the live UI. Fixed by adding `_exportLegendHtml()`, embedded directly under the graph image in `buildBookHtml()` whenever `book._hasGraph` is set. Includes the death-and-victory-both-available color (`GRAPH_COLORS.bothOutline`, amber) that isn't currently explained in either of the app's own live legends either.

Edges honor the book's own `connectorStyle` (`_curveControlPoint` mirrors `graph.js`'s `CONNECTOR_STYLES` - curvedCW/CCW bow perpendicular to the line via a quadratic Bézier control point; `cubic`/`horizontal` are approximated as a CW curve rather than left straight, since neither has a clean single-curve SVG equivalent; `straight` draws a plain line). Node labels render *below* the node, matching vis-network's actual default for dot-shaped nodes in the live graph (never inside the dot) - text can't overflow a small circle that way. The root `<svg>` sets explicit `width` and `height` (not just `viewBox`), scaled down so whichever dimension is larger is capped at 1600 - a tall, narrow graph gets its height capped instead of stretching width to 1600 and leaving height for the viewer to guess at, which is what produced huge blank margins/scrollbars when opening the file directly rather than through the HTML's `<img>` wrapper.

### ZIP structure

**Export Everything** (`buildFullExportZip(username, books, items)`):
```
<username>/
  backup.json
  books/
    <Book Title>.html              ← never laid out, no graph.svg
    <Another Book>/
      <Another Book>.html          ← has a graph.svg
      graph.svg
    …
```
A book with a renderable graph gets its own folder (same layout as the single-book export) so its HTML's `<img src="graph.svg">` resolves; a book that's never been laid out stays a flat `.html` file. Filename deduplication (`usedFilenames`) is shared across both cases.

**Export This Book** (`buildBookExportZip`):
```
<Book Title>/
  <Book Title>.html
  <Book Title>.json
  graph.svg          ← only if the book has been laid out
```

### `backup.json` format

```json
{
  "app": "Gamebook Tracker",
  "version": 1,
  "exportedAt": "<ISO timestamp>",
  "user": { "username": "…" },
  "books": [ <book objects> ]
}
```

Each book object contains: `id`, `name`, `total_sections`, `discoverable_sections`, identifiers (`isbn`, `issn`, `asin`), `pages`, `authors`, `description`, `cover_path`, `is_public`, `created_at`, `rating`, `notebook`, and the full `state` object (graph, playthroughs, positions, charSheetTemplate, etc.).

### HTML generator (`buildBookHtml(book, username, itemsById)`)

Produces a self-contained, print-friendly HTML file. Inline CSS only - no external dependencies. `itemsById` is a `Map<id, {name, type}>` used to resolve item names in inventory/equipment; defaults to an empty map (shows "Item #N" fallback). Contains:

- Book metadata table (authors, identifiers, pages, description, discoverable sections if set)
- Summary stats: mapped sections, discovered-only sections, total runs, wins, losses, battle deaths, in-progress runs
- Playthroughs table: run number, result, date, full section path (`→`-separated; `✝` for death, `★` for victory)
- Per-run `<details>` blocks (collapsed by default): charsheet fields, inventory slots with qty and note, equipment slots with item name, qty, label, and note
- Section map table: every known section with its outgoing choices, priority flag, battle flag, and note (if any)

A section counts as **mapped** if it has real recorded choices, not merely a `discovered: true` stub (a section can be flagged `discovered` and still pick up real choices later - checking the flag alone would undercount). This definition is shared between the "Mapped: N" stat and the section map table split (mapped rows vs. greyed "not yet visited" rows), and mirrors the client's own `mappedCount()` (`state.js`) so the exported numbers always match what the app showed at export time. Works correctly for both numeric and alphanumeric section IDs. Filenames in the full export are deduplicated if two books share the same safe name (appends ` (2)`, ` (3)`, etc.). All strings are HTML-escaped.

`safeFilename` also rejects Windows-reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`, `LPT1`-`9`, case-insensitive, with or without an extension) and caps the result at 150 characters - a book titled exactly "Con" or with a very long name would otherwise produce a zip entry that fails to extract, or a path near filesystem limits, on some platforms/tools.

### ZIP builder (`buildZip(files)`)

Accepts `[{ name, data }]`. For each file: computes CRC-32, deflates with `zlib.deflateRawSync`, falls back to STORE method if deflated size ≥ raw size. Writes local file headers, file data, central directory, and end-of-central-directory record into a single `Buffer`. Includes a Unicode Path Extra Field (`0x7075`) for correct UTF-8 filenames on all platforms.

## Email (`server.js`)

Email is opt-in via SMTP settings configured in the admin Tools tab (stored in `admin_settings`). `nodemailer` is the transport layer. On startup, `reinitTransporter()` reads SMTP settings from `admin_settings` (falling back to `SMTP_*` env vars) and initialises `_transporter`. Any save to an `smtp_*` key via `POST /api/admin/settings` re-calls `reinitTransporter()` immediately.

### Admin notifications (`sendAdminEmail`)

Sent to the configured `smtp_user` address (admin inbox) when:

| Event | Subject |
|-------|---------|
| User submits feedback | `New feedback from {username}` |
| User replies to a feedback thread from inbox | `Feedback reply from {username}` |
| User creates a forum thread | `New forum thread: {title}` |
| User posts a forum reply | `New forum reply from {username}` |

All are fire-and-forget (`.catch(() => {})`). Forum body is truncated to 500 chars in the notification.

### User reply notification (`sendReplyEmail`)

Triggered by `handleAdminReply` when the admin replies to a feedback thread **and** the thread has an email address on record. Sends an HTML email to the user with the original message quoted, the admin reply highlighted, and a link back to the app.

### HTML template

Both `sendAdminEmail` and `sendReplyEmail` use the same template: dark amber header, content in a grey quoted block, CTA button linking to `https://koldkat.net`, footer note. Plain-text fallback is always included.

### Admin SMTP settings (`/api/admin/smtp/test`)

`POST /api/admin/smtp/test` sends a test email to `smtp_user` to verify configuration. Returns `{ ok: true }` on success or `{ error: message }` on failure.
