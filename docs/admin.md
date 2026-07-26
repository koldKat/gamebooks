# Gamebook Tracker - Admin Panel

The admin panel is a localhost-only interface for server operators. It is not accessible to regular users.

---

## Access

Open `http://localhost:3000/admin` in a browser on the same machine as the server.

All `/api/admin/*` routes and the panel itself reject any connection that is not from localhost (`127.0.0.1`, `::1`, or `::ffff:127.0.0.1`). No login is required - the localhost restriction is the sole access control. `X-Forwarded-For` and similar headers are never trusted.

---

## Stats cards

The top of the panel shows aggregate stats across all users and books:

| Card | What it shows |
|------|---------------|
| **Users** | Total registered accounts (active only). Shows admin count separately. |
| **Sessions** | Current live sessions (logged-in browsers) |
| **PDFs** | Number of non-demo books that have a PDF attached |
| **Books** | Total non-demo books across all accounts |
| **Mapped Sections** | Sections where choices have been recorded, summed across all books - shown with percentage of total sections |
| **Discovered Sections** | All sections ever seen (mapped + referenced but unmapped), summed across all books - shown with percentage of total sections |
| **Playthroughs** | `active \| finished` - active runs (green), finished runs (aqua). Pipe is orange. |
| **Wins / Losses** | Split card; wins green, losses red. Battle deaths are counted separately in the users/books tables. |
| **Heap Used / Total** | Node.js process heap memory in use and total heap allocated. |
| **RSS / CPU** | Resident set size (total process memory). |
| **Traffic In / Out** | Cumulative bytes received/sent since tracking was enabled. Flushed to DB every 50 requests and on clean shutdown. Sits in the same column as Heap/RSS. |
| **Database Size** | Size of the SQLite database file. Vacuum button below - purges expired sessions then rewrites the file. |
| **Application Size** | Total on-disk size of the app directory. Excludes entries matching `size_ignore_patterns`. |
| **Session Uptime** | How long the current server process has been running. |
| **Uptime %** | Percentage of total app lifetime that the server has been up. |
| **App Age** | Total time since the app was first started (persisted across restarts). |

**Stats for Nerds** (expandable section):
- Users: total accounts, admin count, undos performed, fast travels performed
- Books / Series / Anthologies: separate unique-count and library-count totals, plus unique authors and average sections per playable book
- Gameplay: total runs, finished runs, wins, losses, battle deaths
- XP events: total event records, distinct event types
- Gold Coins & Shop: earned/spent/in-circulation plus purchased upgrades, including Heartbeat XP, with in-circulation totals also reflecting extra milestone GC rewards
- Forum: active posts, active threads

**Live header badges:** the main app now uses `/api/user/stream` (authenticated SSE) to nudge the Inbox, Forum, and notification-bell badges immediately when their state changes. The stream sends only a lightweight refresh event; the client refetches the relevant badge endpoints when it receives one. The old 60-second polling remains as a fallback. The same event also triggers a UI-prefs re-sync (`GET /api/prefs`), so a pref changed on one device/tab (e.g. the feed's cover toggles) reaches any other open session for that user live, instead of only on its next fresh page load.

---

## Users tab

Lists all registered accounts. Columns: Username, Joined, Last Active, Inactive (days), Books, Runs, Wins, Loss, Battle, Lvl, Coins, Gifted, Sess, Location, Domain, Actions.

Username badges: **ADMIN**, **PROTECTED**, **AUTHOR**, **CONTRIBUTOR**, **LOCKED**.

- **Location** - country flag + approximate city from the last login, resolved via offline GeoIP database.
- **Domain** - which of the app's domains (e.g. koldkat.net / pathmap.net / bookplay.net) the user was last seen on, read from the `Host` header on their most recent authenticated request (`last_domain` column, `-` until their first request after this was added). Unlike Location, this isn't throttled - it just no-ops when the domain hasn't changed since the last write.
- **Level** - shown with XP progress bar.

Clicking a username opens a **user detail** view: meta bar (Joined, Books, Sessions, Last Location, Domain, Level) and a table of all their books with per-book stats.

### User actions

| Action | Description |
|--------|-------------|
| **Clear sessions** | Forces logout on all devices immediately |
| **Lock** | Sets `locked_until` far in future; user cannot log in. Not available for protected accounts. |
| **Unlock** | Clears the lock; restores login access |
| **Edit** | Directly update username, display name, is_admin, is_protected, is_author, is_contributor |
| **Author** | Toggle `is_author` flag and optionally set a display name |
| **Contributor** | Toggle `is_contributor` flag |
| **Grant/Revoke PDF Access** | Toggle `pdf_access` flag - allows the user to download book PDFs via `GET /books/:path`. Button shows "Grant PDF Access" when the user does not have access, "Revoke PDF Access" when they do. |
| **Impersonate** | Generate a one-time login URL to log in as the user without their password |
| **Refund** | Refund a shop item: specify item key such as `xp_boost`, `heartbeat_xp`, `undo`, or `fast_travel`, and whether to refund all purchases or just the latest |
| **Delete** | Permanently remove user and all their data (cascades). Not available for protected accounts. |

---

## Books tab

Lists every non-demo, non-container book across all users (standalone books and anthology children - anthology containers themselves are listed separately in the **Anthologies tab**, since a container has no playthroughs of its own and the Wins/Losses/Battle columns would be meaningless for it). Columns: Book, Owner, Sections, Wins, Losses, Battle, Last Updated, Actions. Paginated at 50 rows/page.

Clicking a book name opens the **book detail view** with three sections:

- **Stats** - section counts, run totals, wins/losses, full playthroughs table
- **Ratings** - all ratings with username, score, and delete button per rating
- **PDF** - upload (max 256 MB, must start with `%PDF`); awards `pdf_available` XP to the uploader (or all library holders when uploaded from localhost) on **first upload only** - re-uploading to replace an existing PDF does not award XP again. Delete removes the file (XP not revoked). Existing PDF is shown as a `PDF (X MB)` link with size and a Remove button.

The **Edit** form in the book detail view includes all metadata fields:

- **Name**, **Total Sections**, **Pages**, **ISBN**, **ASIN**, **ISSN**, **Author(s)**, **Description**
- **Make public** - `is_public` toggle
- **Is anthology (container)** - marks this book as a parent container. `total_sections` is stored as 0 when checked.
- **Series** - text input with datalist autocomplete from `/api/admin/series`. Resolved to `series_id` on save via `getOrCreateSeries`.
- **Note:** unlike the main app, which shows users only their own series in the edit dropdowns, the admin panel intentionally exposes the global series list here.
- **# in series** - free text (e.g. `12` or `XII`).
- **Part of anthology** - dropdown of all container books (`is_container = 1`), populated from `GET /api/admin/anthologies`. Selecting a parent links this book as a child.
- **Order** - integer sort order within the parent anthology.
- **PDF upload/remove** - upload a PDF (max 256 MB); existing PDF shown as a `PDF (X MB)` link with size; XP only awarded on first upload per book.
- **Cover upload/remove** - upload/replace/remove cover image.

**Saving** sends a `PATCH /api/books/:id` from localhost, which bypasses the per-user creator check and minimum section count (admin can set sections to 1).

**Anthology behaviour:** the stats view for a container book shows aggregate child-book stats. Deleting a container orphans its children - handle children separately.
**Reset semantics:** the normal user-side **Reset Book** flow does not revoke XP. It clears saved state and run history for that user/book and removes only the per-book progress XP locks so future reruns can earn progress XP again.

### Book actions

| Action | Description |
|--------|-------------|
| **Gift** | Add the book to another user's library. Blocked if target already has it. |
| **Delete rating** | Remove an individual user's rating |
| **Delete book** | Permanently remove book and all run data. Blocked with `409` if other users have it in their library. |

---

## Series tab

Lists all series across all users. Columns: Name, Creator, Books (count), Public, Open World, Created, Description, Actions. Paginated at 50 rows/page.

- **Edit** (inline) - update name, description, public flag, and the **Open world series** checkbox in-place without leaving the tab.
- **Delete** - removes the series entirely, unlinks all books (`series_id = NULL`), and removes all `user_series` rows. Requires confirmation.

## Anthologies tab

Lists all anthology container books (`is_container = 1`) across all users. Columns: Name, Creator, Books (child count), Public, Created, Description, Actions. Paginated at 50 rows/page. Uses `GET /api/admin/anthologies` (`db.getAllAnthologiesAdmin()`), a dedicated query separate from the Books tab's `adminGetBooks()`.

- **Delete** - removes the container row. Children are **not** cascade-deleted; the foreign key (`parent_book_id → books ON DELETE SET NULL`) automatically orphans them (`parent_book_id = NULL`) rather than deleting them. Blocked with the same `has_readers` `409` response as a normal book delete if any `user_books` rows exist for the container itself. Reuses the existing `DELETE /api/admin/books/:id` endpoint - no anthology-specific delete route was needed.

### Open world series

Ticking the **Open world series** checkbox on a series (via the inline Edit form in the admin Series tab, or via the Edit Series modal in the main app) sets `series.is_open_world = 1`. This enables the following for every book in that series:

- Per-series shared runs (`series_runs` table) instead of independent per-book runs.
- Portal nodes on the graph (teal diamonds ◇) that can be created by book authors/trackers to link sections in one book to sections in another book in the same series.
- A series character sheet that travels with the player between books.
- Cross-book activity feed entries (`series_run_started`, `series_run_completed`) instead of the per-book `run_started`/`run_completed` events.

**Schema:** `series.is_open_world INTEGER DEFAULT 0` is added via `ALTER TABLE` migration at server startup. The `series_runs` and `series_characters` tables are also created at startup if absent (see technical.md for the full schema).

---

## Tips tab

Lists all tips from the `tips` table. Filterable by type (real/silly) and active status.

- **Active toggle** (checkbox) - enable/disable a tip without deleting it. Inactive tips are never shown in the app.
- **Click text** - inline edit: replaces the text cell with an input + Save button.
- **→ Silly / → Real** - flips the type between real and silly in one click.
- **Delete** - removes the tip permanently. Requires confirmation.
- **Add New Tip** form at the bottom - enter text, select type (real/silly), click **Add Tip**.

Tip counts (real vs. silly) are shown in the tab. The app alternates real and silly in a shuffled deck; changing the ratio here affects the displayed sequence after the next server restart or `/api/tips` cache refresh.

---

## Feedback tab

Shows all user feedback threads. Unread threads (new user messages) are highlighted; the tab shows a red count badge.

Feedback also appears in **koldKat's inbox** in the main app: koldKat's inbox loads all threads (not just his own), with `admin_unread` mapped to `user_unread` so the inbox badge lights up for new submissions. Replying from koldKat's inbox sends as 'admin' and triggers an email if the thread has an email address. Threads with email addresses can also be handled from this tab.

Users can attach files to their initial feedback submission and to inbox replies. Attached images appear inline in the message; other files appear as download links - the admin feedback tab renders them the same way (`fmtAttachments()` in the panel's inline script, mirroring `inbox.js`'s `_renderAttachments`). `GET /api/admin/feedback` already returned an `attachments` array per message via `db.getAllThreads()`/`_attachMessages()` - the tab just wasn't reading it before. The admin reply (`POST /api/admin/feedback/:id/reply`) does not support attachments; use the inbox for attachment-enabled replies.

- **Mark as read** - clears the unread highlight for that thread
- **Reply** - appends an admin message; if SMTP is active, also emails the user
- **Delete** - soft delete (`deleted_by_admin = 1`); the thread and its attachments are not actually removed, just hidden from this tab

---

## Announcements tab

Announcements are notices shown to all users in the app. Workflow: draft → published → pinned.

| Action | Description |
|--------|-------------|
| **New** | Create a draft with title + body (both required) |
| **Edit** | Update title/body (works in any state) |
| **Publish** | Make visible to users |
| **Unpublish** | Hide from users (returns to draft) |
| **Pin** | Mark as pinned (only one pinned at a time; pinning another auto-unpins the previous) |
| **Unpin** | Remove pin (stays published) |
| **Delete** | Permanently remove |

---

## Admin GC pool

The admin panel shows two GC figures: **GC Earned** and **GC Available** (`GET /api/admin/gc-supply`).

**Earned** is a running total calculated from site-wide metrics - it grows automatically as the site is used:

| Contribution | Rate |
|---|---|
| Users | 1 GC each |
| Books (non-demo, non-anthology) | 1 GC each |
| Series | 1 GC each |
| Anthologies | 1 GC each |
| `visit_all` XP events (any user) | 1 GC each |
| Level-ups across all users (capped at level 100 per user) | 1 GC each |
| Distinct author names on books | 1 GC each |
| PDFs attached to books | 1 GC each |
| Days since app birth | 1 GC per day |
| Series fully-visited completions (`visit_all_series` coin events) | N GC each (N = child book count) |
| Anthology fully-visited completions (`visit_all_anthology` coin events) | N GC each (N = child book count) |

**Available** = Earned − total GC gifted so far (`admin_gc_gifted` in `admin_settings`).

Gifting a user GC (`POST /api/admin/users/:id/gift-gc`) increments `users.bonus_coins` and `admin_gifted_coins`, increments `admin_gc_gifted`, and sends a `gc_gift` notification.

---

## Tools tab

| Section | Persisted | Description |
|---------|-----------|-------------|
| App Version | `app_version` | Version string shown in app banner; served via `GET /api/config` |
| Notepad | `notepad` | Free-text scratchpad, admin-only |
| SMTP / Email | `smtp_*` keys | Email transport settings; see SMTP section below |
| Backups | filesystem | Lists all `*backup*` files with sizes; supports multi-select delete |
| Size Ignore Patterns | `size_ignore_patterns` | Glob patterns excluded from Application Size and Backup finder |

---

## SMTP / email

Configure outbound email for feedback replies. Settings stored in `admin_settings` table; override `.env` variables. Changes take effect immediately without restart.

| Setting | Default | Description |
|---------|---------|-------------|
| `smtp_host` | env `SMTP_HOST` | SMTP server hostname |
| `smtp_port` | `465` | Port: 465 for implicit TLS, 587 for STARTTLS |
| `smtp_secure` | `true` | `true` = implicit TLS (port 465); `false` = STARTTLS (port 587) |
| `smtp_user` | env `SMTP_USER` | Login username; also default To/From address |
| `smtp_from` | falls back to `smtp_user` | Explicit From address |
| `smtp_pass` | env `SMTP_PASS` | Password (blank save is a no-op; DB takes precedence over env) |

**Test SMTP** button sends a test email to `smtp_user`. Status indicator shows whether a transporter is currently active.

---

## Admin settings keys (`admin_settings` table)

| Key | Default | Description |
|-----|---------|-------------|
| `notepad` | `''` | Free-text scratchpad |
| `app_version` | `'0.8.8.1'` | Version string in app banner |
| `size_ignore_patterns` | (see Tools tab) | Newline-separated glob patterns |
| `smtp_host` | `''` | SMTP hostname |
| `smtp_port` | `'465'` | SMTP port |
| `smtp_secure` | `'true'` | Implicit TLS flag |
| `smtp_user` | `''` | SMTP login / From address |
| `smtp_from` | `''` | Explicit From address |
| `smtp_pass` | `''` | SMTP password (write-only via UI) |
| `is_public_migrated` | `'1'` | One-time migration guard: sets pre-existing books to public |
| `level_boost_backfilled` | `'1'` | One-time migration guard: XP boost back-fill for existing users |
| `pdf_xp_backfilled` | `'1'` | One-time migration guard: 200 XP for users with PDF books in library |
| `library_add_xp_backfilled` | `'1'` | One-time migration guard: XP for existing library additions |
| `level_up_coin_backfilled` | `'1'` | One-time migration guard: 1 GC per level already earned |
| `playtime_coin_backfilled` | `'1'` | One-time migration guard: 1 GC per 24h of tracked playtime already earned |
| `book_complete_coin_backfilled` | `'1'` | One-time migration guard: 1 GC for each book already at 100% visited |
| `group_complete_coin_backfilled` | `'1'` | One-time migration guard: N GC for each series/anthology already fully visited |

---

## Feed event types reference

The activity feed (`getFeed()`) produces the following event types. The two newest are generated only for open world series:

| `type` | When generated | Notes |
|--------|----------------|-------|
| `run_started` | Per-book run begins (non-open-world books only) | Suppressed for books in open world series |
| `run_completed` | Per-book run ends (non-open-world books only) | Suppressed for books in open world series |
| `series_run_started` | First time any book in an open world series starts a given series run index | One entry per series run, regardless of how many books are played |
| `series_run_completed` | A series run ends with `success`, `death`, or `battle` in any book | One entry per series run end; clickable if `is_public` |
| `book_created` | User starts tracking a book | - |
| `level_up` | User gains a level | - |
| `all_visited` | All sections visited in a book | - |
| `all_discovered` | All sections discovered in a book | - |
| `announcement` | Admin-published announcement within 30-day window | - |
| `user_joined` | A user registered on the site | Uses the user's permanently assigned `join_template_id` from the `join_templates` table; rendered with an amber left border (`.feed-entry--join`). `feedPush` fires at registration so live-connected clients see it immediately. |

Every event type's query also selects `is_author`/`is_contributor`/`display_name` so Author/Contributor stars show up correctly next to a user's name even when their profile is private (private profiles never get a page view that would otherwise populate the client's badge cache). See `docs/technical.md` for the full audit.

---

## App-wide XP widget

Shown only when the logged-in account is the admin (`db.isUserAdmin`), a small panel sits above the personal XP summary on the **Books** screen (in a violet accent to distinguish it from the player's own gold/cyan bar). It mirrors the same shape - level, title, heartbeat rate, XP bar, XP text, boost line - but the numbers are aggregated across every account: total XP earned app-wide (same number Stats for Nerds shows as "Total XP earned", just not compact-formatted), an "app level" scaled by user count (same formula as the "App level" figure in Stats for Nerds), every user's active boost rate added together, and a combined heartbeat rate as if every player were online at once. It refreshes on login, shortly after any site activity (deliberately staggered by ~1.2s so it doesn't animate in lockstep with your own XP bar), and every 60 seconds as a fallback while the tab is visible. Backed by `GET /api/app-xp` (token auth + admin check, not a localhost-only `/api/admin/*` route, since it needs to render inside the normal logged-in app).

**Live floaters:** whenever any other user earns XP or GC, a small floater pops up showing their username and the amount, in the same violet/pink theme, centered between the activity feed and the covers panel. Only shown while you're on the Books screen (never during play), and only for other users - your own gains as admin still show through your normal personal floaters. Backed by `GET /api/app-xp/stream`, an admin-only SSE stream.

## Avg User Level widget

Sits directly above the App-wide XP widget, same shape again but in teal/lime. Unlike the App widget's level (which is a single pooled-XP figure that a few high-XP users can skew upward), this is the **average of each user's own level** - the same metric behind Stats for Nerds' "Avg player level" figure. The top-right tag shows total user count instead of a heartbeat rate. The bar fill shows how close the *whole app* is to ticking the average level up by one (the fractional part of the raw average, e.g. 1.98 → 98% full). The text line shows the sum of every user's level and exactly how many more total levels need to be gained (by anyone) to cross into the next average level. The bottom line shows the lowest-to-highest level spread across all users. It doesn't animate like the other two bars - it only moves on an actual level-up and by a tiny amount, so it just snaps to the new value.

---

## API endpoints

All endpoints require a localhost connection. No auth token.

### Stats & tools

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin panel HTML |
| GET | `/api/admin/stats` | Aggregate stats object |
| POST | `/api/admin/vacuum` | Purge expired sessions and VACUUM; returns updated stats |
| GET | `/api/admin/settings` | All editable settings including SMTP fields |
| POST | `/api/admin/settings` | Save one setting: `{ key, value }` |
| POST | `/api/admin/smtp/test` | Send a test email via current transporter |
| GET | `/api/admin/appsize` | App directory size in bytes: `{ bytes }` |
| GET | `/api/admin/backups` | List backup files: `[{ rel, name, size, mtime }]` newest-first |
| DELETE | `/api/admin/backups` | Delete backup files: `{ paths: string[] }` |
| GET | `/api/admin/heap` | Node.js process heap statistics |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | All users with book, session, run, wins, losses counts |
| GET | `/api/admin/users/:id` | Single user detail with per-book breakdown |
| POST | `/api/admin/users/:id/edit` | Update user fields: `{ username?, display_name?, is_admin?, is_protected?, is_author?, is_contributor? }` |
| POST | `/api/admin/users/:id/clear-sessions` | Invalidate all sessions |
| POST | `/api/admin/users/:id/lock` | Lock account (403 on protected accounts) |
| POST | `/api/admin/users/:id/unlock` | Unlock account |
| POST | `/api/admin/users/:id/author` | Set author flag: `{ isAuthor: bool, displayName?: string }` |
| POST | `/api/admin/users/:id/contributor` | Set contributor flag: `{ isContributor: bool }` |
| POST | `/api/admin/users/:id/impersonate` | Generate one-time impersonation URL: returns `{ url }` |
| POST | `/api/admin/users/:id/refund` | Refund shop item: `{ item: string, all?: bool }` |
| POST | `/api/admin/users/:id/pdf-access` | Toggle PDF access: `{ pdfAccess: bool }` → `{ ok: true }` |
| DELETE | `/api/admin/users/:id` | Delete user and all data (403 on protected accounts) |

### Books

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/books` | All non-demo, non-container books across all users (standalone + anthology children only - containers excluded, see Anthologies below) |
| GET | `/api/admin/books/:id/stats` | Per-book stats and full playthroughs list (includes `series_name`, `series_number`, `is_container`, `parent_book_id`, `book_order`) |
| GET | `/api/admin/series` | All series → `[{id, name, description, is_public}]` - used for datalist autocomplete in book edit form |
| GET | `/api/admin/books/:id/ratings` | All ratings: `[{ userBookId, username, rating }]` |
| POST | `/api/admin/books/:id/gift` | Add book to library: `{ targetUserId: int, sourceUserId?: int }` |
| DELETE | `/api/admin/books/:id/ratings/:userBookId` | Delete a specific rating |
| DELETE | `/api/admin/books/:id` | Delete book (409 if other users have it in library) |

PDF upload/delete use `POST /api/books/:id/pdf` and `DELETE /api/books/:id/pdf`. Cover upload uses `POST /api/books/:id/cover`. These routes are not under `/api/admin/` but accept localhost connections without creator checks.

### Anthologies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/anthologies` | All anthology containers (`is_container = 1`) with creator username and child-book count: `[{id, name, description, is_public, created_at, created_by_username, child_count}]` (`db.getAllAnthologiesAdmin()`) |
| DELETE | `/api/admin/books/:id` | Same delete route as regular books - reused rather than duplicated. Children are orphaned (`parent_book_id = NULL`) via foreign key, not cascade-deleted. |

### Series

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/series/all` | All series with creator username and book count: `[{id, name, description, is_public, is_open_world, created_at, created_by_username, book_count}]` |
| PATCH | `/api/admin/series/:id` | Update series: `{ name, description?, is_public, is_open_world? }` |
| DELETE | `/api/admin/series/:id` | Delete series - orphans all linked books, removes all `user_series` rows, removes all `series_runs` and `series_characters` rows |

### Tips

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/tips` | All tips: `[{id, text, type, active, created_at}]` |
| POST | `/api/admin/tips` | Create tip: `{ text, type: 'real'\|'silly' }` |
| PATCH | `/api/admin/tips/:id` | Update tip: `{ text?, type?, active? }` (partial update) |
| DELETE | `/api/admin/tips/:id` | Delete tip permanently |

### Feedback

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/feedback` | All feedback threads with full message history |
| POST | `/api/admin/feedback/:id/reply` | Append admin reply (and email user if SMTP active): `{ reply }` |
| POST | `/api/admin/feedback/:id/read` | Mark thread as read |
| DELETE | `/api/admin/feedback/:id` | Delete thread and all messages |

### Announcements

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/announcements` | All announcements (drafts and published) |
| POST | `/api/admin/announcements` | Create draft: `{ title, body }` |
| PATCH | `/api/admin/announcements/:id` | Update title/body: `{ title, body }` |
| POST | `/api/admin/announcements/:id/publish` | Publish (visible to users) |
| POST | `/api/admin/announcements/:id/unpublish` | Unpublish (back to draft) |
| POST | `/api/admin/announcements/:id/pin` | Pin (auto-unpins previous) |
| POST | `/api/admin/announcements/:id/unpin` | Unpin (stays published) |
| DELETE | `/api/admin/announcements/:id` | Delete permanently |
