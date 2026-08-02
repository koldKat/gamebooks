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
      battlesim/         All 8 battle simulator modules, one file per book, grouped in their own
                         subfolder (imported only by boot.js, never by each other)
        battlesim829.js    Battle simulator for book 829
        battlesim8.js      Battle simulator for book 8
        battlesim286.js    Battle simulator for book 286 (flat weapon min-hit model, tech gadgets, sleep/dream table)
        battlesim198.js    Battle simulator for book 198, The Warlock of Firetop Mountain (standard Fighting Fantasy SKILL/STAMINA/LUCK system)
        battlesim199.js    Battle simulator for book 199, The Citadel of Chaos (same SKILL/STAMINA/LUCK combat as book 198, plus a MAGIC/spell system unique to this book, no Provisions, Items panel for its two fixed-bonus weapons)
        battlesim200.js    Battle simulator for book 200, The Forest of Doom (SKILL is 1d6+5 here, not the usual 1d6+6; no MAGIC, no Provisions mechanic; adds paired-attacker fights and a Luck-event queue - see below)
        battlesim186.js    Battle simulator for book 186, Starship Traveller (no unified combat system - hand-to-hand/phaser/ship-to-ship selected via a mode toggle; 7-person crew each individually rolled, one shared LUCK box, no LUCK-based combat swing at all - see below)
        battlesim201.js    Battle simulator for book 201, City of Thieves (standard SKILL/STAMINA/LUCK system, reuses book 200's attackModifier and pairedFight/sideEnemy mechanics; adds an enemyWoundDamage knob for non-standard wound amounts)
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
  notes.js, battlesim829.js, battlesim8.js, battlesim286.js, battlesim198.js, battlesim199.js, battlesim200.js, battlesim186.js, battlesim201.js, auth.js, add-book.js, edit-book.js,
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

## CSS file structure

`style.css` holds only genuinely shared/base rules (tooltips, buttons, inputs, scrollbars, generic layout not owned by any one module). Everything else is a per-module file (one per like-named JS module, e.g. `shop.css` for `shop.js`). `public-profile.css` is shared by both `public-profile.js` and `covers.js` (cover activity view lives in the same `#public-modal` markup both use).

**No import-cascade on the CSS side** - each stylesheet is an independent `<link>` in `index.html`, so a changed CSS file only needs its own `?v=N` bumped, never a chain of importers.

**Load order matters for two files:** `reduce-motion.css` and `mobile.css` are cross-cutting overrides (`body.reduce-motion .foo`, `@media` blocks, several with `!important`) rather than one module's own styling, so they're the last two `<link>` tags in `index.html`, after every per-module file.

Each JS module's own "how to remove this module" header comment points at its own CSS file.

`server.js`'s `computeCodeStats()` (feeds "Lines of code"/"Code size" in Stats for Nerds) scans the `public/css/`/`public/js`/`admin` directories dynamically, not a hardcoded file list - a new file needs a server restart to be picked up.

---

## Server file structure

`server.js` and `server/db.js` hold requires/bootstrap/Router/DDL only; per-domain logic is split module-by-module (see the frontend module dependency graph). Same process for any future extraction: build each new module fully, verify it, wire it in, delete the old code from
the monolith last - never a bulk line-range removal.

**`server/db.js`** is a thin barrel: every raw `CREATE TABLE`/`ALTER TABLE`/one-time-migration
block stays physically in `db.js`, in its original relative order (some migrations reference
tables/functions defined later in the file - reordering the DDL is unsafe against production's
live database). Only the *function definitions* live in `server/db/*.js` domain modules (see
project structure above), each `require()`-d back into `db.js`. `db.js`'s `module.exports`
re-exports all of them - nothing outside `server/db.js` needs to change a `db.xxx(...)` call site.

**`server.js`** holds requires, one-time bootstrap (dir creation, XP migrations, geoip update),
the Router (regex route-pattern constants + dispatch function), `attachClientErrorHandler`, and
`httpServer.listen(...)`. Everything else is in `server/*.js` (cross-cutting: SSE, email, request
helpers, runtime/process state, static file serving) and `server/routes/*.js` (per-domain HTTP
handlers). Mutable process state (maintenance-mode flag, traffic byte counters, CPU/memory
rolling averages, uptime/session timestamps) lives in `server/runtime-state.js` behind
getter/setter accessor functions, since raw `let` variables can't be shared across CommonJS
modules by reference.

## Admin panel JS structure

`admin/index.html` loads `admin/js/boot.js` as a module entrypoint; per-domain logic is split
into 10 modules under `admin/js/` (see project structure above).

**Serving mechanism:** `server/routes/admin.js`'s `serveAdminFile()` infers `Content-Type` from
the filename extension (`.js` → `text/javascript`, else `text/html`) - required, since browsers
reject `<script type="module">` if the response's MIME type isn't a JS type. `server.js` has
`GET /admin/js/:file` (regex-restricted to `[a-zA-Z0-9_-]+\.js`, no path-traversal risk), gated
by the same `requireLocalhost` as the rest of the admin panel; these files stay reachable during
maintenance mode too, same as the rest of the admin panel.

`admin/index.html`'s script tag is `<script type="module" src="/admin/js/boot.js">` -
same pattern as `main.js`. `users-books.js` (Users tab, Books tab, both detail views,
Gift modal) is deliberately not split further: the user-detail and book-detail views call
back into each other constantly, so they stay one module rather than being forced into
`users.js`/`books.js`. It imports `loadAll`/`loadTools` from `dashboard.js`, which itself
imports `loadUsers`/`loadBooks` back from `users-books.js` - a circular import, safe in ES
modules as long as the imported bindings are only read inside function bodies that run
later, never at module-evaluation time.

`feedback.js` is the one module with a real gotcha: its feed-card HTML uses inline
`onclick="toggleFeedbackCard(this)"` (built via `innerHTML` templates), which resolves
against `window`, not module scope - so it needs an explicit `window.toggleFeedbackCard = ...`
at the bottom of the file (and two more for its sibling handlers). Everything else in the
codebase uses `addEventListener` instead.

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

**Main app CSP** (`addSecurityHeaders`, `server.js`): `script-src 'self'` only - `vis-network` is vendored locally at `/vendor/vis-network/vis-network.min.js`, nothing loads from unpkg.com or any other external host.

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
| POST | `/api/books` | Create book → `{ id, name, total_sections, isbn, issn, asin, pages, authors, description }`. Sets `books.created_by` to the creating user's ID. Accepts optional `is_public`, `series_name` (string, resolved to `series_id` via `getOrCreateSeries` with `addToLibrary=true`), `series_number`, `is_container`, `parent_book_id`, `book_order`. Normal books require a minimum of 5 sections; when `is_container` is true, `total_sections` is stored as 0 and the minimum is skipped. |
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
| POST | `/api/books/:id/reset` | Reset the caller's saved state for a book and return the cleared state. Does not revoke already-earned XP; clears the per-book progress XP locks (`discover`/`visit`/`notes`/`priority`/`color`/`add_charsheet_field`/`inventory_started`/`add_item`/`equipment_started`/`equip_item`) so reruns can earn progress XP again. Client-side, `resetBookProgress()` resolves `true`/`false` based on the server's confirmation; the reset button only rebuilds the graph on success. |
| POST | `/api/books/:id/cover` | Upload raw JPEG body as book cover → `{ coverUrl }`. Deletes previous cover file. **Creator-only** (or localhost/admin) - silently no-ops if caller is not the book's creator. When called from localhost (admin panel), no auth required and no XP awarded. |
| POST | `/api/books/:id/cover/delete` | Remove cover from a book. **Localhost-only**. Deletes the cover file and sets `cover_path = NULL`. |
| GET | `/api/books/:id/rating` | Get the current user's rating for a book → `{ rating, userBookId, avgRating, voteCount, canRate }`. `rating` is the user's own vote (null if unrated). `canRate` is false if the user has not yet completed at least one run of the book (for standalone books) or at least one run of every child (for anthologies). 404 if not in library. |
| PATCH | `/api/books/:id/rating` | Set rating → body `{ rating }` (0.5–5.0 in 0.5 steps, or null to clear) → `{ rating, xpAwarded, avgRating, voteCount }`. Returns 403 if `canRate` is false (no run completed). `xpAwarded` is true only the first time a rating is set. XP: 25. Stored on `user_books.rating`. Clearing a rating (null) is always allowed. Aggregate is recomputed and returned immediately. |
| GET | `/api/series/:id/rating` | Get the current user's rating for a series → `{ rating, avgRating, voteCount, canRate }`. `canRate` is false if the user has not yet completed all books/anthologies in the series. 404 if not in library. |
| PATCH | `/api/series/:id/rating` | Set series rating → body `{ rating }` → `{ rating, xpAwarded, avgRating, voteCount }`. Returns 403 if `canRate` is false. XP: 25 (`rate_series`). Stored on `user_series.rating`. |
| GET | `/api/books/:id/notebook` | Get the user's notebook for a book → `{ text }`. `text` is an empty string if no notes saved yet. 404 if not in library. |
| PUT | `/api/books/:id/notebook` | Save notebook text → body `{ text: string, ptIdx?: number }` (text max 100 000 chars) → `{ ok: true, xpAwarded: bool }`. Stores in `user_books.notebook`. Awards `notebook_saved` XP (65) once per run if `ptIdx` ≥ 0. |
**Gotcha:** `notes.js`'s document-level Escape listener checks `#confirm-overlay` (the alert/confirm dialog's overlay) first and yields to it if active - otherwise Escape-to-dismiss a `showAlert()` error also closes whatever modal sits underneath it (e.g. the notebook editor), discarding unsaved text.
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

`renderBody()` in `server/forum.js` supports `[label](url)` links, `\n`→`<br>`, and the same `**bold**`/`*italic*`/`__underline__`/`~~strikethrough~~`/`{color:name}...{/color}` markup as the announcement system's `formatAnnBody()`. It exists in two independent implementations (server-side initial render, client-side re-render after edit) that must be kept in sync by hand.

Announcements and forum posts can link to a book (`[Label](/book/:id)`) and open its in-app detail dialog instead of navigating away. **Book links must always be relative** (`/book/:id`), never an absolute hardcoded domain - the app is served from multiple domains (koldkat.net, pathmap.net, bookplay.net), and a baked-in absolute URL resolves to the wrong domain everywhere else.

**Forum modal** (`#forum-modal-overlay`, `z-index: 3000`) sits above the public-catalog modal and edit-book modal. Opening a book/series detail dialog from inside the forum layers it above the forum rather than closing the forum. Navigating to a book/edit-book dialog from elsewhere in the app always closes the forum modal first.

**Demo mode has no real account or token** - every authenticated call reachable from a demo-mode code path is guarded with `isDemoMode` and shows a "not supported in demo" message instead of firing the request (an unguarded 401 would silently log the demo session out).

**Reduce Animations in the forum iframe:** the forum is a separate document in its own `<iframe>`, so it can't see the parent app's `body.reduce-motion` class - it reads the same `localStorage` flag directly and applies the class itself.

**Battle-sim enemy-name fields** use a custom combobox dropdown, not a native `<datalist>`, and avoid the substring "name" in their id/label to dodge Chromium's contact-autofill heuristic.

**`BATTLE_SIM_BOOK_IDS`** (`util.js`) is a plain array of the numeric book IDs with a battle sim, duplicating the per-book panel-visibility gating in `boot.js`. Used by `covers.js` for the covers-wall battle-sim badge/filter. Adding a new battle sim requires updating both places.

**Sitemap:** `/forum`, all category pages, and every thread URL are included. Book pages (`/book/:id`) are included for every non-demo public book.

**Social preview image:** `og:image`/`twitter:image` point to a pre-rendered `og-image.png` (1200x630) rather than rasterizing SVG at request time, used as a site-wide fallback wherever a book/user has no cover/avatar.

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
- Client-side image compression (`util.js › compressImage`): if an image file exceeds a caller-given byte budget (defaults to 512 KB/1200px; `add-book.js`/`edit-book.js` pass 256 KB/900px for book/anthology covers) the client iterates JPEG quality from 0.92 down to 0.1 via canvas until the blob fits or quality bottoms out - at the floor it returns the smallest blob it managed rather than giving up, so a caller always gets something to upload. `profile.js` imports this same implementation rather than keeping its own copy, and only keeps `compressToBlob` directly for `confirmCrop`'s already-drawn avatar canvas.

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
- `last_domain` - which of the app's domains (e.g. koldkat.net/pathmap.net/bookplay.net) the user was last seen on, read from `req.headers.host` in `authenticate()`/`authenticateOptional()` via `updateUserLastDomain()` (equality check only, no time throttle). `NULL` until first write. Admin panel **Domain** column sources from this, stripping a leading `www.`.

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
- `getBookActivity()` returns `parentId`, `parentName`, `isContainer`, `children[]`, and `authorRatings[]` in the `book` object.
- `_getAuthorRatings()` (`server/db/books.js`) derives a per-author rating from the free-text `authors` field (not a normalized author table) by pooling every individual rating across every public book crediting that exact name. It does a full scan of all public non-demo books on every call to `getBookActivity()` - same synchronous-full-scan cost class as `getFeed()`'s queries, worth revisiting if the catalog grows large enough for it to matter.
- The activity modal shows an `Anthology: AnthologyName` chip for children (navigates to the anthology modal) and a "Books in this anthology" list for containers.

**Public books search** (`getAllPublicBooks()`):
- Excludes child books (`parent_book_id IS NOT NULL`).
- Includes containers that have at least one public child, even if the container itself isn't `is_public`.
- Each entry carries `childNames[]` so the covers panel search can match on child titles.
- Carries `isContainer`, `totalSections`, `description`, `isbn`, `issn`, `asin`, `pages`, `seriesName`, `seriesNumber` - used for the autocomplete pre-fill on Create Book / Create Anthology.
- Covers-panel search recognises keywords `anthology`/`anthologies` (shows only containers) and matches against `seriesName`.

`state_data` (in `user_books`) stores the full per-user client state object as a JSON string. `name`, `total_sections`, `discoverable_sections`, `isbn`, `issn`, `asin`, `pages`, `authors`, and `description` are stored as columns on `books` so the books list can be rendered without parsing state blobs. `cover_path` on `books` stores the filename only (not the full URL path).

**`book_enemies`** - reference enemy stat blocks feeding the enemy-name autocomplete inside a book's battle simulator (`GET /api/books/:id/enemies`). No admin UI exists yet; rows are seeded by hand via direct SQL. Column semantics (`attack`/`defense`/`hp`/`pb`) are repurposed per book to match whatever combat model that book's own simulator implements (opposed Attack/Defense, SKILL/STAMINA/LUCK, flat weapon min-hit, etc.), not a single fixed meaning across the table.

All `.bsim-modal` battle-sim dialogs use a fixed `height: min(760px, 90vh)` rather than the shared `.inv-modal`'s `max-height: 90vh`, so internal scroll panels shrink instead of stretching the whole modal.

### XP and levelling system

Users earn XP through gameplay activity. XP is stored incrementally in `users.xp`; every awarded event is recorded in `xp_events` with a UNIQUE constraint on `(user_id, event, ref)` so XP can never be double-awarded regardless of how many times the same action fires. The XP amount and event semantics are never exposed to users - they see only level, title, and a progress bar.

**Level formula**
```
xpForLevel(n)  = 1000 × n × (n+1) / 2
computeLevel(xp) = min(floor((-1 + sqrt(1 + 8·xp/1000)) / 2), 100)
```
Level 1 = 1,000 XP · Level 2 = 3,000 · Level 10 = 55,000 · Level 100 = 5,050,000 (cap)

`server/forum.js` keeps its own copy of `computeLevel()` (for the forum's user-panel level badge, since it's a separate SSR page with no access to `server/db.js`) - it must match the canonical version's `if (xp <= 0) return 0` guard, since nothing in the schema prevents `users.xp` from going negative (no CHECK constraint, and XP revocation is a real mechanism).

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
| `equipment_started` | 25 | `bookId` | Once per book, first time any playthrough's equipment becomes non-empty |
| `equip_item` | 5 | `bookId:itemId` | Once per book per distinct item ID, first time that item appears equipped in any playthrough |
| `battlesim_win` | 10 | `simKey:ts` | Per battle simulator win, any of the 7 sims |
| `battlesim_loss` | 5 | `simKey:ts` | Per battle simulator loss, any of the 7 sims |

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

**Reward dedup refs:** `death_run`/`battle_run`/`win_run`/`share_run`/`charsheet_run`/`charsheet_saved` key their `xp_events` dedup ref off the run's `startedAt` timestamp (`newPt?.startedAt ?? i`, array index only as a fallback for runs that predate this field) - `startedAt` is assigned once at creation and never reused, so it can't collide the way an array index can once a run at that slot is deleted and a new one takes its place.

**`run_depth` is the deliberate exception - stays index-based (`${bookId}:${i}` / `series:${owSeriesId}:${i}`), do not "fix" it to match the others.** `run_depth` (~25 XP) fires the instant any run has a non-empty path, i.e. essentially on creation - a guaranteed-unique ref would make it directly farmable (create a run, get the XP, delete it, repeat). Plain index-based dedup is intended: re-creating a run at the *same* slot after deleting it does not re-earn `run_depth`, while a genuinely new slot does. Do not run the one-time correction scripts in `scripts/` (`revoke_duplicate_run_depth.js`, `restore_run_depth_correction.js`, `backfill_run_reward_refs.js`) again.
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

The floater layer's horizontal position is computed at runtime from measured element positions rather than pure CSS, since the correct centering gap depends on which screen is showing (books/landing vs. the play area).

---

### Password hashing

`crypto.scrypt` (Node built-in, promisified) with a random 16-byte hex salt. Stored as `{ password_hash, salt }`. Verification uses `crypto.timingSafeEqual`.

### Sessions

Random 32-byte hex token stored in the `sessions` table. Sent to the client on login/register; client stores it in `localStorage` under `gamebook_auth_token`.

Sessions expire 7 days after creation (`expires_at = created_at + 604800`). `getSession` rejects any token whose `expires_at` is in the past - the client receives a 401 and is redirected to the login screen. `expires_at` is added via an `ALTER TABLE` migration on startup; existing rows receive a default of `created_at + 7 days`. Expired rows are deleted on server startup and whenever the admin runs a Vacuum.

**Impersonation sessions must stay invisible to activity tracking and rewards.** Sessions carry an `is_impersonation` flag (`createSession(userId, { impersonation: true })`, set from the admin panel's impersonate link). `authenticate()`/`authenticateOptional()` (`request-helpers.js`) skip `updateUserLastActive()` for these sessions, but that alone isn't enough - `adminGetUsers()`'s `last_active` column falls back to `MAX(user_books.updated_at)` for users with no `last_active_at` yet, and ordinary state saves while impersonating bump that timestamp too. `handleSaveState` checks `isRequestImpersonating(req)` and passes `{ skipTimestamp: true }` to `saveBookState()` to close that gap, and skips `processStateXp()` entirely so an admin's own actions while impersonating can't earn the impersonated user real XP. Any new route that writes a timestamp an admin view could read as "last active," or that awards XP/rewards, needs the same check.

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

**Convention: every client request goes through `apiFetch` (authenticated) or `fetchPublic`/`publicFetch` (public), never a raw `fetch()`.** These wrappers are what give a request its 401 (expired/invalid session → ejection flow) and 503 (maintenance mode → ejection flow) handling; a raw `fetch()` silently skips both, degrading to a generic error message instead of the normal ejection UX. Applies uniformly across the app - `export.js`, `demo.js`, `auth.js`'s pre-login flows, `party.js`, `stats.js`, `boot.js`'s config/tagline loaders, `tips.js`. `covers.js`'s two raw `fetch()` calls (streaming cover-image bytes with a progress bar) are the deliberate exception - image/blob requests don't need JSON-oriented 401/503 handling.

Attachment upload (`/api/attachments`) is consolidated into `util.js`'s `uploadAttachment()`/`isImageFilename()`/`addAttachmentItem()`, used by both `feedback.js` and `inbox.js` rather than each keeping its own copy.

**Gotcha:** `autocomplete.js`'s `_currentTokenBounds()` computes both the backward (previous comma) and forward (next comma / end of string) boundary of the author-name token under the caret - `_applyAuthor()` replaces the whole token span. Computing only the backward boundary breaks when a suggestion is picked after clicking into the *middle* of an existing token (a reachable case, since the `input` field's `click` listener re-renders suggestions on click).

`party.js`'s `connectPartySSE(bookId)` uses a generation counter (`_connectGen`, same idiom as `app-xp.js`'s `_xpAnimGen`) to guard against overlapping calls for different books racing each other - `disconnectPartySSE()` bumps it, and a stale call whose generation no longer matches after its `await` discards its result instead of applying it.

**Security: the forgot-password reset link must never be built from `req.headers.host`** - it's attacker-controlled, and this link is emailed to the account owner, so a spoofed `Host` header would poison the reset link toward an attacker's domain (Host Header Injection / password-reset poisoning, a real account-takeover path). The link is built from `db.getAdminSetting('app_url')`, hardcoded to `'https://koldkat.net'` if unset - never a header-derived fallback. Also: `handleForgotPassword`'s `429` rate-limit response must be checked via `res.ok` before assuming success, same as the other three auth handlers in this file.

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

**Demo button auto-hide:** `_updateDemoBtnVisibility()` (`boot.js`) is called from `showBooks()` whenever the user is authenticated. It fetches `GET /api/profile` (`getProfileStats(userId)`, returning `wins`/`deaths`/`battles` as three separate counts) and hides `#demo-btn` once `wins >= 1 && deaths >= 1`. Deliberately `deaths` (`result === 'death'`) alone, not `battles` - a battle death doesn't count toward this. `showLogin()` resets `#demo-btn`'s inline style back to visible, since the hidden state is per-account.

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

**Heartbeat XP rate:** each XP bar shows the current idle rate: `rate = 1 + (bonusHeartbeatXp + max(0, level-10)) * 0.1` per minute.

**Animated XP gain:** the books-screen and play-area bars tween to the new value when XP changes (profile modal always snaps instantly). Duration scales with level. A level-up crossed mid-animation fills to 100%, resets, and continues in the new level.

### App-wide XP widget (`app-xp.js`)

`#app-xp-summary` sits above the personal XP summary on the Books screen, admin-only, showing an app-wide level/XP/boost bar (same quadratic level formula as a per-user bar, scaled by user count so it doesn't dwarf individual levels as the base grows). Refreshed on login, on a 60s poll, and pushed live via `GET /api/app-xp/stream` (admin-only SSE).

**Live "someone else earned XP/GC" floaters:** admin-only, rendered on the Books screen or in the play area (mutually exclusive - only one screen is visible at a time). Backed by the same SSE stream; a separate floater layer/queue from the personal reward floater, positioned in the gap between panels appropriate to whichever screen is showing.

### Avg User Level widget (`app-xp.js`)

`#avg-lvl-summary` shows the average of each user's own level (`floor(sumLevels / users)`), painted from the same `GET /api/app-xp` response as the App XP widget above it. Distinct from "level of the average XP" (which is the App widget's own `level` figure, skewed upward by a few high-XP users).

### Book list (`renderBooksList`)

Each `.book-item` card has a progress bar background: `rgba(107,114,128,0.18)` fills `(visited / effective_sections) × 100%` left-to-right, where `effective_sections = discoverable_sections ?? total_sections`. Zero-visited cards have no background.

**Completion percentage floor rule:** every "N out of total (X%)" display in the app shows `100%` only when `n >= total` exactly; otherwise the percentage is floored and capped at 99% (`Math.min(99, Math.floor(n / total * 100))`), never rounded up - prevents e.g. 318/319 sections displaying as a misleading "100%". Implemented independently (not centralized) in `books.js` (`_bookItemHtml`, `_aggregateProgress` consumers, stash aggregate), `play.js` (`updateStats › pct`), and `stats.js` (the shared `pct` helper) - a new completion display needs the same floor applied by hand.

**Server hardware info (Stats for Nerds):** `_serverHardwareInfo()` in `server.js` reads `os.cpus()` once per request and returns `cpuModel`/`cpuArch`/`cpuGhz`/`cpuAgeYears`/`cpuCores`/`totalRamBytes`, spread directly into `/api/site-stats`'s response with no allowlist to update on either side. `cpuCores` is `cpus.length`.

**Compact number formatting (Stats for Nerds):** `stats.js`'s `fmt` switches to the compact `fmtCompact` form (K/M/B/T/Qa/Qi suffixes) once the absolute value reaches 10,000, applied universally rather than to an allowlisted set of fields. Decimal precision increases one place per tier. Guards a rounding-boundary edge case where e.g. `999999` would naively format to `"1000.0K"` - the tier bumps up one level and redivides instead.

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
| `run_completed` | Run ends with `death`, `battle`, or `success` | `result`, `runIsPublic`, `userPublicProfile`, `pathLength`, `lastSection` |
| `run_started` | Run begins | `runIndex` |
| `book_created` | User starts tracking a book | `bookName` |
| `level_up` | User gains a level | `level`, `levelTitle`, `gainedAbility`, `newAbilityCount` |
| `all_visited` | All sections visited in a book | `bookName` |
| `all_discovered` | All sections discovered in a book | `bookName` |
| `first_win` | First run ever won on a book | `bookId`, `bookName`, `bookIsPublic`, `runIndex`, `pathLength`, `lastSection` - rendered as "won in [book] run N for the first time" |
| `first_loss` | First death run on a book | `bookId`, `bookName`, `userId`, `runIndex`, `runIsPublic`, `pathLength`, `lastSection` - rendered as "lost in [book] for the first time"; verb is a clickable `feed-verb-pub` button when `runIsPublic && runIndex != null` |
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

`pathLength`/`lastSection` feed the client's plain-text hover tooltip on a run's won/lost/battle-death link - not sent for `series_run_completed`, since `completeSeriesRun()` nulls `series_runs.last_book_id`/`last_section` on completion (that pair only tracks an in-progress run's position), so no last-section value survives to be read.

`party_formed` is the only feed event that pre-populates `usernames` from the server (all current party members) rather than relying on the client-side party-merge step. If the party is disbanded before the feed is queried, the entry is suppressed (member lookup returns < 2 rows). Group series/anthology milestone events are deduplicated by the `xp_events` UNIQUE constraint; they never appear more than once per user per entity.

**`book_rated`/`series_rated`:** sourced from the `rate_book`/`rate_series` XP award (`xp_events`), joined with the CURRENT rating from `user_books`/`user_series` - a rating later cleared to null suppresses the entry. Only the first rating ever produces an entry (one `xp_events` row per user+book/series). `setBookRating`/`setSeriesRating` call `feedPush` on every rating change so live viewers stay in sync.

Note: the no-JS `GET /feed` SEO page (`servePublicFeedPage()`, `server.js`) has its own separate, smaller `renderEntryText()` switch that only handles 8 of the ~17 event types (silently renders nothing for the rest, including `book_rated`/`series_rated`, `book_added`, `series_created`, `first_win`).

**`getFeed()`** runs roughly a dozen queries of the shape `WHERE xe.event = '...' AND xe.created_at > ?` against `xp_events`, backed by `idx_xp_events_event_created ON xp_events(event, created_at)` (the table's other index, `UNIQUE(user_id, event, ref)`, doesn't help here since none of these queries filter on `user_id`). Since `better-sqlite3` is synchronous, a full-table scan here blocks Node's entire event loop, including outgoing SSE frames to every connected client - this index matters at scale, not just for feed latency.

`idx_user_books_party_id`, `idx_books_series_id`/`idx_books_parent_book_id`, and `idx_user_books_book_id` (see schema above) back the same class of SSE-triggering hot-path queries: party live-sync member lookups, `_checkGroupMilestone()`/`_checkGroupWonAll()` (`server/db/xp.js`, called from `processStateXp`), and `_getAggregateRating()` respectively.

`adminGetUsers()` (`server/db/admin.js`) and `getProfileStats()` (`server/db/feed.js`) both count a user's completed runs the same way: only entries whose `result` is `death`/`success`/`battle`, never in-progress runs. `adminGetUsers()` separately counts in-progress runs (`!pt.result`) as `active`, shown in the users table's own "Active" column - `runs + active` is the same total the individual-user detail page's `totalRuns` shows for the same user (that page counts every playthrough regardless of result), just split into the two categories.

`getProfileStats()` and `getPublicProfile()` (both `server/db/feed.js`) also agree on `totalBooks`/`createdBooks`: anthology children are excluded, so an anthology counts as one book regardless of how many of its children the user has added.

`getSiteStats()`'s `levelUps` (Stats for Nerds' "Total levels") and `getAppXpSummary()`'s `sumLevels` (the App-wide XP widget) are both a live `SUM` of every user's current level, computed identically - deliberately not a `COUNT` of `level_up` xp_events, since that log is deduped per `(user, level)` to block farming the level-up coin bonus and can undercount after any XP correction.

`level_up` entries include `gainedAbility: boolean` and `newAbilityCount: number | null`. These are set when the new level crosses a threshold where `maxUndos`/`maxFastTravels` increase (levels 31, 41, 51, 61, 71, 81, 91 - each grants +1, from a base of 3 up to a max of 10). When `gainedAbility` is true, the feed renders an additional suffix styled as `.feed-ability` (purple): `· +1 undo & fast travel unlocked (N per run)`. Respects `hide_from_feed` - users who have opted out do not appear in level-up entries.

**Author/Contributor/Admin badges in the feed:** every entry type's SQL in `getFeed()` selects `u.is_author, u.is_contributor, u.display_name` (and, for multi-user entries, per-member in `usernames[]`) so the client can register badge state directly from the feed payload (`feed.js` calls `registerAuthor`/`registerContributor` for every entry before rendering). This matters specifically for **private profiles**: the client's `_authorMap`/`_contributorSet` caches in `user.js` are otherwise only populated by viewing your own profile or someone else's *public* profile, so without per-entry badge fields a private-profile author/contributor would never show their star in the feed at all.

`registerAuthor`/`registerContributor` (`user.js`) clear a username's cached entry when passed `false`, not just add it - all 5 call sites (`feed.js`, `public-profile.js`, `boot.js` ×3) always call with the real boolean (`registerAuthor(username, !!isAuthor, ...)`) and let the function itself decide whether to add or delete the entry. `adminBadge()` matches `resolveIsAdmin()`'s exact logic (same case-insensitive compare, same hardcoded `'koldkat'` fallback).

**Day-card cover backgrounds:** each `.feed-day-card` gets a stack of tiles cycling through every distinct public book played that day, purely client-side in `feed.js`. `_dayCovers(items)` tallies entries with `bookId && bookIsPublic` and a resolvable cover per book, returning all distinct qualifying books' covers sorted by entry count descending. Each qualifying day's cover list is pushed onto `_lastDayCoverLists` (reset per `loadFeed()` call); the card gets `data-day-index` plus an empty `.feed-day-cover-stack` first child, with entries/header wrapped in a sibling `.feed-day-content`.

`_applyDayCoverFlows(root)` builds real DOM tiles per `.feed-day-card[data-day-index]` (not a repeating CSS background, since each tile is a distinct image) - the most-prominent book centered at true aspect ratio, with the day's other books tiled outward above/below to fill the card. A flat overlay (`.feed-day-cover-stack::after`, `rgba(31,41,55,0.9)`) sits on top for legibility; `.feed-day-content` is `position: relative; z-index: 1` so header/entries paint above it. Days with no qualifying book get a `feed-day-card--glass` class instead, letting the real rotating landing background (`#landing-bg-a`/`#landing-bg-b`, fixed position) show through with a light tint (`rgba(31,41,55,0.25)`).

**Two independent Ctrl+Y toggles:** "Show covers in feed" (`_feedDayCovers`/`body.no-feed-day-covers`) and "Transparent background for day cards" (`_feedGlassCards`/`body.no-feed-glass-cards`), persisted via `localStorage` plus synced `ui_prefs.feedGlassCards`/`feedDayCovers` when logged in. With covers off, every day card (not just cover-less ones) gets the glass tint, since there's nothing left to distinguish them. Logging out resets both to their default (on) via `resetFeedDisplayPrefsForLogout()`.

**Recompute:** a module-level `ResizeObserver` on each `.feed-day-card` calls `_scheduleDayCoverRecompute()` on size changes, plus `window.resize`/`fullscreenchange` listeners and an explicit `refreshDayCoverFlows()` hook from panel-collapse toggles. `loadFeed()` disconnects the observer before replacing `#feed-content`'s subtree on every render to avoid leaking observers on removed elements. Image loads are skipped entirely while `body.no-feed-day-covers` is set; toggling back on calls `refreshDayCoverFlows()` explicitly since the skipped tiles were never populated.

### Covers panel (`loadCovers`)

`loadCovers()` fetches `/api/public/covers`, `/api/public/books`, and `/api/public/series`, then renders a mixed wall into `#covers-grid`.

- Books/anthologies use their uploaded covers; series cards are built client-side as composites from up to four book covers.
- Sort modes: Latest, Oldest, A–Z, Z–A, Random. Type filters: All, Books, Anthologies, Series, Favorites.
- Lazy loading in sorted modes.
- Search across titles, child names, authors, and series names.
- Logged-in users get a hover `.cover-fav-btn` on each cover. Clicking it updates `ui_prefs.favoriteBookIds`/`favoriteSeriesIds` and can award the one-time `favorite_cover` XP.

**Filter chips:** Battle sim only, Open world only, and Not in my books (logged-in non-demo only) stack on top of the sort/type filters, state persisted to `localStorage`. All filter/library-state changes re-render the wall immediately, including adding a book/series to your library from within the modal.

**Public-catalog refresh:** event-driven via `EventSource('/api/public/stream')`. When `public_catalog_changed` arrives and the landing UI is visible, the covers wall refetches immediately. Decoupled from the landing background rotator - sort/filter changes don't swap the background.

**Landing background rotation (`covers.js`):** a single `setInterval`, once started, ticks `_rotateLandingCover()` every 60s - nothing else touches it. `_startLandingCoverRotation()` is a no-op whenever the interval already exists; the only things allowed to force an out-of-cycle repaint are the interval's own first-ever creation (nothing would show otherwise) and an explicit cover-source setting change. Routine calls (returning to the landing screen, a background data refresh, a transient empty-pool/fetch-failure blip) just call the parameterless `_startLandingCoverRotation()` and get nothing. `_stopLandingCoverRotation()` (which actually blanks both layers) is reserved for the explicit Ctrl+X hide toggle only. `_rotateLandingCover()` itself is always safe to call - it silently no-ops if there's no cover available, leaving whatever's currently showing untouched - and guards against overlapping crossfades with an in-flight flag (`_rotationInFlight`/`_rotationQueued`): a request arriving mid-transition queues instead of stomping the layer the current transition is still animating.

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

`#public-modal` carries `class="inv-modal pub-modal"`, reusing the shared modal-chrome base (background/border/border-radius/flex/overflow) - `.pub-modal` only holds the declarations that genuinely differ (width, max-height, box-shadow). Same base class reused by `battlesim.css`'s `.bsim-modal`.

All four deep-link types (`/book/:id`, `/anthology/:id`, `/series/:id`, `/user/:username`) open into the *same* shared `#public-modal-overlay`/`#pub-modal-body` - `covers.js`'s `openCoverActivity`/`openSeriesActivity` and `public-profile.js`'s `openPublicProfile`/`openPublicRun` all render into it, and `boot.js`'s close handlers all call `closePublicModal()` unconditionally regardless of which one is showing. `closePublicModal()`'s URL-reset must recognize all four path patterns, or closing that specific type leaves the URL bar stuck and reopens the modal unexpectedly on refresh.

**HTML escaping is centralized in `server/html-escape.js`** (`escapeHtml()`/`escapeJsonString()`), required everywhere server-side rather than each page hand-rolling its own copy. Client-side inline `<script>` blocks embedded in `server/forum.js`'s SSR pages (plain JS strings sent to the browser, not Node code - can't `require()` anything) keep their own local copies where genuinely needed (e.g. `_escBr()`, shared across the edit-thread-body and edit-post-body preview within the same rendered page).

**Sitemap** (priority / changefreq):

| URL pattern | Priority | Changefreq |
|-------------|----------|------------|
| `/user/:username` (public profiles) | 0.7 | weekly |
| `/book/:id` (public non-demo non-child books) | 0.8 | monthly |
| `/anthology/:id` (public containers) | 0.8 | monthly |
| `/series/:id` (public series) | 0.7 | monthly |

---

## Modal close-on-outside-click convention

Every modal closes when clicking its backdrop, via a `click` listener checking `e.target === overlay`. Since a `click` fires based on where the mouse *releases* rather than where it pressed down, dragging from inside a modal's content (e.g. panning a graph) and releasing outside would otherwise register as a click on the overlay and close the modal mid-drag. The fix: track `mousedown` separately, and only treat an overlay `click` as a real "clicked outside" if the *preceding mousedown* also landed on the overlay.

`#public-modal-overlay` and `#guide-modal-overlay` (`boot.js`) share one module-level `_mousedownOnOverlay` tracker, set by a single `document`-level `mousedown` listener checking `e.target.classList.contains('modal-overlay' | 'pub-overlay' | 'inv-overlay')` - any overlay needs one of those three classes to participate. `#feedback-modal-overlay`, `#stats-modal-overlay`, the notebook overlay, and the equipment/inventory item-picker overlays each keep their own local `let _mdOnOverlay` + `mousedown` listener instead, since a `mousedown`/`click` pair only applies to the one element it's attached to.

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

**Gotcha:** every `stabilizationIterationsDone` handler must call `network.off('stabilizationIterationsDone', ...)` on itself right before nulling its own `_stabilizeHandler` reference, not just null the reference - the "unregister before starting a new one" guard only tracks the *most recently registered* handler, so an already-fired-and-self-nulled one that skipped `network.off()` stays attached forever and can fire again alongside future handlers.

After every `syncGraph` call where all nodes are already positioned, `network.setOptions({ physics: { enabled: false } })` is called defensively to ensure physics stays off.

Drag positions are saved to `state.positions` on every `dragEnd` event (1000ms debounce) and persisted to the server.

### Viewport save and restore

Pan and zoom are saved to `state.viewport` (`{ x, y, scale }`) with a 500ms debounce on every `zoom` event and on `dragEnd` when no nodes were dragged. On book open, `syncGraph` restores the viewport once (guarded by the module-level `_viewportRestored` flag) via `network.moveTo`. The flag resets to `false` in `destroyNetwork()` so it works correctly each time a book is opened.

---

## Node deletion (`graph.js › subtreeToDelete + deleteNodes`)

`subtreeToDelete(rootId)` performs a BFS from `rootId` collecting all descendants, then removes any node still reachable (without passing through `rootId`) from a known graph root - the reachability BFS seeds from `state.startSection` **and** every playthrough's own `path[0]`, since a book can have more than one real root once the alternate-start button (`play.js`'s "⚑ Start at a specific section") has been used, and each alternate-start component is otherwise disjoint from a BFS rooted at `state.startSection` alone. Returns a `Set` of IDs to delete.

`deleteNodes(ids)`:
1. Removes entries from `state.graph` and `state.positions`
2. Removes `id` from all `choices` arrays
3. Deletes any section left with an empty `choices` array (now unmapped) - **unless** it's part of a playthrough path, or carries a note/priority/battle/color/portals worth not silently discarding (same safeguard as `play.js`'s `_cleanupOrphanedTargets`)
4. Trims **every** playthrough's path at the first deleted node it contains - not just the active run. This reopens (`completed = false`, `result = null`) any run whose path passed through a deleted node, including already-completed wins/losses. If the active run (`state.activePtIndex`) is one of the trimmed ones, it stops being active (`activePtIndex = null`) - the caller must resume it explicitly. The confirmation dialog (`confirm.delete_node`) does not warn about this effect on other runs.
5. Calls `saveState()` - does **not** call `render()` (caller's responsibility)

The caller (`boot.js`) clears `viewingPt` only if **its own path** intersects the deleted set (checked *before* calling `deleteNodes`, since the mutation may flip `completed` on the same object `viewingPt` references), not merely because it happens to be incomplete for unrelated reasons - `viewingPt` and the active run are independent (the delete button only requires an active, incomplete run to be visible at all; `viewingPt` can simultaneously point at any other run, completed or not).

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

**Auto-nav:** a section with exactly one choice not yet in the run's path is auto-walked through without requiring a click, so a long chain of single-choice sections advances in one visual beat.

**`undoRun()`** pops back past auto-nav'd (forced single-choice) sections to the last real decision point, but stops early at a passthrough section carrying its own metadata (note/priority/battle/color/portal) rather than silently skipping it.

**Alternate start:** a book can be started from a section other than its configured default (e.g. flip/dos-a-dos print editions with two beginnings), via a dedicated modal. Hidden for open-world/series books, which use the series-run picker instead. With 2+ previously-used start sections, "New Run" opens a picker instead of starting immediately.

**Node-color logic exists in three independent reimplementations** (`graph.js` canonical, `public-profile.js`, `server/export.js`) of the same rules. All three must stay in sync or a node's battle indicator can be silently lost.

`_buildPubSegNetwork`'s `hasDeath && hasWin` case (a section whose own choices include both a death and a win option) uses `COLORS.bothOutline`/`GRAPH_COLORS.bothOutline` (`#0f172a`/`#f59e0b`), matching the single-outcome `deathOutline`/`victoryOutline` pattern - distinct from the separate "ends"-based case (a node that's the historical ending point of both a death-run and a victory-run), which `public-profile.js`'s `endNodeMap` structure can't represent since it maps one id to one single result.

**Security note - both endpoints are fully unauthenticated** (no `authenticate()` call in their `server.js` handlers), and both build a multi-book journey by querying every book in the series the run passed through. Each of the two near-identical `seriesBooks` queries (`getPublicRun`, `getPublicSeriesRun`) must independently filter `b.is_public = 1` - an open-world series being public only means the *series* is public, not every book in it, and a public run that portal-traveled through an unpublished book would otherwise leak its graph/path to any unauthenticated caller. Any future copy of this journey-building pattern needs the same filter.

**Own graph view and alternate starts:** `graph.js`'s `nodeColor()`/`nodeLabel()`/`syncGraph()` (the private graph's yellow "start" highlight, "START" label, and bold start-node font) follow `_effectiveStartSec(displayPt)` - the currently-displayed run's own `path[0]` when there is one, falling back to `state.startSection` only when no run is being viewed. `graph.js`'s `subtreeToDelete()` and `play.js`'s `_cleanupOrphanedTargets()` (see "Node deletion" below) use a separate multi-root mechanism for the same underlying concern - since orphan-detection has to consider every alternate-start run's component simultaneously, not just whichever one is currently displayed.

**Onboarding pulse on `#choices-input`:** `play.js` tracks `_choicesRecordedCount` (exported via `setChoicesRecordedCount`, threshold `CHOICES_PULSE_THRESHOLD = 50`) and applies a `choices-input--pulse` CSS class below the threshold. Increments only via `#record-btn`'s submission path, not the "edit choices" modal. Persisted via `ui_prefs.choicesRecordedCount` (`prefs.js`). Respects `body.reduce-motion`. `applyPrefs()` toggles the class directly on the live `#choices-input` element as soon as the server value arrives, independent of the play area's own `render()` cycle.

---

## Dice roller (`dice.js`)

Per-run dice state, stored on `pt.diceState` (`{ count, die, lastResult, previousResult }`) and persisted via `saveState()`, mirroring `pt.charSheet`'s per-run scoping. `_legacyDiceState()` migrates older/malformed shapes on read. `state.dicePrefs` remembers the last-used count/die at the book level so new runs start with the same setup.
`getRunPt()` returns `viewingPt || currentPlaythrough()`, same as the compact display logic elsewhere - so browsing a completed past run via the trail shows *that* run's dice state, not the active run's, gated by `isDiceReadOnly()` (`!!getRunPt() && !currentPlaythrough()`, same condition as `charsheet.js`'s `_readOnly`): the throw button, ±count buttons, count input, and die-shortcut buttons are all `disabled` (visible-but-disabled, not hidden - `_applyDiceReadOnly()`, re-run from the same `setAfterRenderFn` hook that repaints the dice UI after every render), and each handler also early-returns as defense-in-depth. Styled via `.dice-shortcut-btn:disabled`/`.dice-adj-btn:disabled`/`#dice-count-input:disabled`/`#dice-throw-btn:disabled` in `dice.css`.

## Character sheet (`charsheet.js`)

A self-contained module for tracking book-specific character stats per book. Imports only `state.js` and `i18n.js`. To remove: delete `charsheet.js`, remove its import line from `boot.js`, and delete `public/css/charsheet.css` (and its `<link>` in `index.html`).
**Gotcha:** every local ES module import needs a `?v=N` query string, even ones that feel like they'll never change (`constants.js`, `i18n.js`) - static `.js` files are served with `Cache-Control: public, max-age=3600`, and the query string is the only thing that forces a fresh fetch after an update. It's also the only thing the version-cascade bump script matches on (`i18n\.js\?v=N`), so an unversioned import silently escapes every future cascade forever, not just the current one. Verify with `grep -rnE "from ['\"]\./[a-zA-Z0-9_-]+\.js['\"]" public/js/*.js` (matches any local import with no `?v=` at all).

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
**Read-only mode:** when viewing a completed past run (`viewingPt` is set and `currentPlaythrough()` is null), the button is enabled and opens the modal in read-only mode - fields are rendered as plain text, and no writes occur. When no run is loaded at all, the button and display are hidden. The footer (Add field / Save / Save as template / Cancel) stays visible in read-only mode - Add field/Save/Save as template are individually `disabled` (`.cs-btn-add:disabled`/`.cs-btn-template:disabled`/`.cs-btn-save:disabled` in `charsheet.css`) while Cancel stays enabled, matching this app's "read-only means visible-but-disabled, not hidden" rule.

**Field types:** `number`, `boolean`, `text`, `list` (comma-separated, stored as `string[]`), `enum` (fixed option set defined per-field). Each field has a `visible` toggle controlling whether it appears in the compact display overlay.

**Number field formatting:** displayed values are comma-formatted; the editable input is a filtered text field (native number inputs can't show thousands separators).
**Convention: never a bare `<input type="number">`** - always the `.inv-qty-wrap`/±-button stepper markup with `type="text" inputmode="numeric"` and a live `[^0-9]` input filter, matching `charsheet.js`/`inventory.js`'s pattern.

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

**Drag-and-drop between slots:** native HTML5 drag-and-drop, desktop/mouse only (no touch fallback, same as the character sheet's field reorder). No slot-type restriction - the system is visual-only. Dropping onto a filled slot swaps the two entries rather than overwriting.

**Read-only mode:** when `viewingPt` is set and `currentPlaythrough()` is null, slots are not clickable, remove buttons and the context menu are hidden, and Save as Template is hidden. Drag-and-drop is also disabled (`_wireSlotEvents` returns early on `ro`).

**Save as Template:** clicking the button writes `state.equipmentTemplate`/`equipmentVisibleTemplate` as full `{itemId, label, note, qty}` objects from the current loadout and calls `saveState()`.

**On-screen display:** equipped items marked "show on screen" merge into the same `#inv-display` overlay as visible inventory items and character sheet fields, each distinguished by a small kind badge (item/equipped slot name/none for charsheet).

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

**Main page background:** `#landing-bg-a` and `#landing-bg-b` are two `position: fixed; z-index: -1` divs outside `#landing-wrapper`. `_rotateLandingCover()` picks from a shuffled queue of the user's books with covers and crossfades between layers (fade next layer in over 1.5s, then fade old layer out). See "Landing background rotation" under Covers panel below for the full timer/trigger design.

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
`_lang` currently only ever resolves to `'en'` (read once from `localStorage`'s `gamebook_lang` key at module load) - there is no `setLang()`/language-switcher UI implemented.

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
4. Zips the snapshot with `zip -j`, then deletes the raw `.sqlite` temp file in a `finally` - so a failed/hung zip (disk pressure, missing `zip` binary, etc.) can't leave the temp file behind. The error still propagates to the caller's `console.error` either way.
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
- On `party_changed`: re-runs `connectPartySSE(bookId)` to refresh membership, and re-renders the party modal if it's currently open (preserving whatever the user was mid-typing in the "Invite more" box, since `_renderPartyModal` replaces the modal body wholesale). Pushed server-side from `handleAcceptPartyInvite`/`handleLeaveParty`, not on decline (a declined invite doesn't change membership). Guarded against a race with an actual navigation happening mid-refresh via the same `_connectGen` counter `connectPartySSE` itself uses.
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

**Graph snapshots are SVG, generated entirely server-side** (`buildGraphSvg` in `server/export.js`) from each book's already-saved `state.positions`/`state.graph`/`state.playthroughs`/`state.startSection` - no browser, canvas, or headless renderer involved, and no client round-trip. `/api/export/all` is a single GET request.

Node/edge coloring in `buildGraphSvg` is a parameterized reimplementation of `graph.js`'s `nodeColor()`/`edgeColor()` (specifically the "no specific run being viewed" aggregate-coloring branch, since a static snapshot has no single displayed run) - not imported from `graph.js`, which is tightly coupled to the single live `state` singleton on the client and has no server-side equivalent anyway. `GRAPH_COLORS` in `server/export.js` must be kept in sync with `public/js/constants.js`'s `COLORS` if either changes. Returns `null` (no graph file) for a book that's never been laid out (`Object.keys(positions).length === 0`).
**Graph legend:** the exported HTML embeds `_exportLegendHtml()` directly under the graph image in `buildBookHtml()` whenever `book._hasGraph` is set, so the export stands on its own outside the app - includes the death-and-victory-both-available color (`GRAPH_COLORS.bothOutline`, amber).

Edges honor the book's own `connectorStyle`, approximated in SVG where no clean equivalent exists. Node labels render below the node, matching the live graph. Output is scaled so the larger dimension is capped at 1600px.

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
