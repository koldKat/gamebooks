# Gamebook Tracker - Technical Reference

This reference covers application architecture, data ownership, security boundaries, and maintenance. Player controls belong in the [Guide](/guide.html); operator workflows belong in the [Admin Guide](/admin/guide).

## Project structure

```text
gamebooks/
  server.js                 HTTP entry point and route registration
  package.json              Dependencies and development commands
  database.sqlite           Application database; not tracked by Git
  server/
    routes/                 HTTP handlers grouped by domain
    db/                     Database operations grouped by domain
    db.js                   Schema initialization and database exports
    request-helpers.js      Authentication, request limits and response helpers
    sse.js                  Live-update registries and broadcasts
    static.js               Static assets and sitemap delivery
    public-seo.js           Server-rendered public catalog pages
    reading-image-storage.js Protected reading-image storage
    backup.js               Automatic database snapshots
    export.js               Player export archives
    email.js                Outbound email
  public/
    index.html              Desktop application shell
    startup.js              Startup status and recovery
    js/                     Desktop and shared ES modules
    css/                    Shared and feature styles
    mobile/                 Mobile shell, styles and feature modules
    books/                  Book attachments, served with access checks
    guide.html              Generated player guide
  admin/
    index.html              Localhost-only operator interface
    js/                     Admin feature modules
    admin-guide.html        Generated admin guide
    technical.html          Generated technical reference
  docs/                     Markdown sources for the three guides
  scripts/                  Maintenance and documentation commands
  test/                     Unit, persistence and browser checks
  reading-images/           Protected per-book artwork
  backups/                  Automatic database archives
```

The server uses Node.js and `better-sqlite3`. Browser code uses ES modules without a frontend framework. See `package.json` for the current dependencies rather than maintaining a second dependency list here.

## Server and database boundaries

`server.js` registers routes and supplies shared dependencies. Route modules parse requests, enforce access, call database operations, and send responses. Business transactions belong in `server/db/`; HTML rendering, filesystem access, and email transport remain in their corresponding server modules.

| Area | Main owners |
|------|-------------|
| Accounts and sessions | `server/routes/auth.js`, `server/db/auth.js` |
| Catalog, libraries, series and runs | `server/routes/books.js`, `server/db/books.js` |
| Public activity and profiles | `server/routes/public.js`, `server/db/feed.js` |
| Ratings and aggregate statistics | `server/db/rating-stats.js`, `server/db/gameplay-stats.js` |
| XP and shop purchases | `server/db/xp.js`, `server/db/shop-purchases.js`, `server/routes/shop.js` |
| Currency accounting | `server/db/heartbeat-coins.js`, gem and exchange modules in `server/db/` |
| Reading access and ownership | `server/db/reading-access.js`, `server/db/reading-ownership.js` |
| Simulator rosters | `server/db/enemy-rosters.js` |
| Seasonal participation and payouts | `server/db/season-participation.js`, `server/db/season-payouts.js` |
| Open-world notebooks | `server/db/series-notebooks.js` |
| Parties | `server/db/parties.js` |
| Feedback and forum | Corresponding modules in `server/routes/` and `server/db/` |
| Admin operations | `server/routes/admin.js`, `server/db/admin.js`, `server/db/admin-user-books.js` |

`server/db/connection.js` owns the shared SQLite connection. `server/db.js` initializes schema and migrations and exports the domain operations. Schema definitions and migration guards in those modules are authoritative; this guide does not duplicate every table and column.

### Data ownership

- `books` holds shared bibliographic and reading metadata.
- `user_books` holds library membership and each player's saved `state_data` for a book.
- Series and anthology relationships describe the catalog. Removing one player's library entry must not remove another player's progress or attachments.
- Anthology containers do not have independent playthroughs. Their playable children retain their own state.
- Open-world series use shared series runs and character data while retaining each book's graph and local encounter state.
- `book_enemies` stores simulator opponents, charts, and encounter metadata. There is no duplicate application-side roster catalog.
- Settings, preferences, notifications, rewards, and accounting records have separate storage and access rules.

Transactions protect related writes such as purchases, gifts, rewards, and role changes. Retry identifiers and uniqueness constraints prevent duplicate financial operations and once-only awards. Migration markers must remain intact; deleting one can replay a historical operation.

## HTTP API and access

Routes are registered in `server.js` and implemented in `server/routes/`. Those handlers define the current request and response contracts.

| Route group | Responsibility | Access |
|-------------|----------------|--------|
| Authentication routes | Register, sign in, sign out, password recovery | Public entry points with validation and rate limits |
| `/api/books` and book-specific routes | Library, metadata, saved state, ratings and attachments | Authentication and operation-specific ownership checks |
| Profile and preferences routes | Account details, avatar, UI preferences | Authenticated account |
| Public profile, run and catalog routes | Public metadata and activity | Public data only |
| Shop routes | Purchases, exchanges and reward snapshots | Authenticated account; transactional checks |
| Reading routes | Access status, matter, sections and protected artwork | Reading policy and book-specific permission checks |
| Party routes | Invitations, membership and shared progress | Authenticated party participants |
| Feedback and notification routes | Private messages and notification state | Authenticated recipient or authorized operator |
| Forum routes | Categories, threads, posts and attachments | Public reads; authenticated writes and moderation checks |
| `/api/admin/*` | Operator tools and management | Real localhost connection |
| `/api/app-xp` and its stream | Aggregate admin XP display | Authenticated administrator |

Localhost-only access uses the socket address. Forwarded IP headers do not grant admin access. An authenticated Gamemaster in the main app and a localhost operator are distinct access paths; do not substitute one check for the other.

Request helpers enforce body limits, validate attachments, and apply response security headers. File routes validate paths and permissions before serving data. Public queries must not expose private catalog labels or another account's saved state.

## Authentication and roles

Passwords use Node's `crypto.scrypt` with a random salt and timing-safe verification. Sessions use random tokens stored in the database. The browser retains its token under `gamebook_auth_token`; invalid or expired sessions return through the normal login flow.

Sessions renew during authenticated activity. Renewal must not revive an expired or deleted session. Optional presence bookkeeping can defer when SQLite is busy without turning an otherwise valid request into a logout.

Password-reset links use the configured application URL, not an untrusted request `Host` header. Auth forms must check failed responses before showing success.

### Roles

| Display name | Stored flag | Responsibility |
|--------------|-------------|----------------|
| Gamemaster | `is_admin` | Main-app administrator permissions |
| Lorekeeper | `is_moderator` | Metadata and cover moderation of public catalog entries |
| Pathmaker | `is_contributor` | Contributor identity |
| Fateweaver | `is_author` | Author identity and display name |
| Squire | `is_squire` | Independent badge and reward qualification; no additional permissions |

Creator permissions still apply to owned private entries. Lorekeepers cannot edit another creator's private entries or make that creator's public entries private. Library removal remains scoped to the authenticated account regardless of role. Attachment-upload access is separate from metadata moderation.

### Impersonation

Impersonation sessions carry an explicit flag. `server/impersonation-context.js` supplies request-scoped context, and central award functions suppress XP and coin awards in that context. Presence and activity timestamps also remain unaffected. Do not rely on individual UI buttons to enforce this boundary.

## Browser modules and routing

`public/js/core/state.js` owns live application state, API persistence, authentication state, and shared caches. `core/sort.js` owns search and ordering helpers; `core/util.js` owns common DOM and utility behavior. Feature modules should import these responsibilities directly.

The `boot/` modules coordinate login, the books screen, and the play area. Routing recognizes public book, anthology, series, and profile links. Closing a public dialog restores the normal app URL. Switching books or accounts must invalidate pending work tied to the previous context.

`public/startup.js` displays startup status before the main module graph loads. Bounded retry recovery applies to failed startup, pauses while offline, and offers manual retry after automatic attempts are exhausted. It does not restart an active reading session.

### State and rendering

Saved book state contains the graph, section choices and notes, playthroughs, current run, character sheets, inventory, equipment, notebook, layout, and feature state. Transient DOM references, request handles, animation timers, and active dialogs remain in memory.

`play.js` coordinates rendering through feature modules. A render must not reset a saved fight, grant inventory, start a new campaign sequence, or overwrite unrelated state. Features that retain drafts or delayed confirmations must verify the same account, book, run, and item before saving.

The client persists graph viewport and node positions separately from temporary network layout. Existing layouts should survive routine refreshes and incremental discoveries. Invalid or missing positions are handled by the graph layout modules rather than by rewriting the player's graph.

### Graph

`graph.js` is a compatibility facade. Modules under `graph/` own network lifecycle, viewport, appearance, overlays, layout, interactions, deletion, and outcome analysis.

`graph/camera-motion.js` tracks animated camera moves and releases deferred reward feedback after camera position and zoom settle, including interrupted or overlapping moves. Saved-move library and reward refreshes also wait for the camera to settle; hidden landing covers are not refreshed by those moves. Reward layers measure their anchors on layout changes rather than when each floatie appears. Disabling floaties skips their markup, queues, timers and layout observers while preserving balance and XP updates.

- The effective start section comes from saved state, not a hardcoded node number.
- Outcome analysis and appearance determine death, victory, visited, mapped, and current-node cues.
- Custom node colors must preserve matching hover and selection colors.
- Dragging and incremental layout preserve established positions where possible.
- Node deletion and choice editing update dependent edges and saved history consistently.
- Manual map navigation retains player-selected connections rather than inventing adjacency.

Player-facing graph colors, controls, and shortcuts are documented in the Guide.

## Live updates and caching

`server/sse.js` owns separate registries for party state, public catalog changes, feed changes, aggregate XP, and account-specific updates. Clients use event notifications to refresh the relevant resource; a private account event must not be broadcast to other accounts.

`core/livetab.js` coordinates tab leadership and fallback polling. Streams and timers belong to a lifecycle: close or pause them when their owning view or tab is inactive, and refresh stale data when it resumes. Reconnecting must not duplicate award notifications or discard an active run.

Catalog invalidation refreshes affected metadata and covers. Preference updates synchronize the account's open sessions. Feed updates preserve unchanged day cards, expanded groups, and reading position where possible. Badge updates refresh inbox, forum, and notification counts.

Static JavaScript and CSS use `Cache-Control: no-cache` with ETags, allowing revalidation without URL version suffixes. Protected reading images use private delivery rules. Public server-rendered pages have their own cache policy.

Version-change recovery belongs to the main app lifecycle. It must not refresh the canvas or interrupt an active player. Startup failure recovery and ordinary data refreshes are separate mechanisms.

## Feed, covers, and public pages

The feed combines public activity, announcements, and account-visible events. Privacy filtering belongs in the server queries. Template assignments remain stable across feed reads; rendering must not randomly rewrite past activity.

Cover and background modules own image loading, visibility, preview cleanup, and object URLs. Replacing content must release obsolete listeners and resources. Lazy loading should defer offscreen images; hiding a panel should not trigger unnecessary redraws.

`server/public-seo.js` renders crawlable public catalog metadata into the application shell. Client enhancement retains useful content and normal link behavior while loading. Registration, login, and recovery retain their existing forms and handlers.

Public book, anthology, and series pages have canonical URLs, metadata, safe structured data, and links to public related entries. Missing or private records return the appropriate response without leaking private relationships. `/catalogue` supports paginated public browsing, and `/feed` provides a server-rendered activity page.

Sitemap entries include public content and reliable modification dates. Do not fabricate modification timestamps. Robots rules and cover allowances are derived from current public records. Server-side HTML and JSON-in-script escaping use the shared escaping helpers.

## Shared UI and styles

Feature CSS files own their domains; shared styles own reusable buttons, inputs, dialogs, tooltips, and layout primitives. Cross-cutting mobile and reduced-motion rules load after the relevant base styles.

Dialogs share modal chrome, focus handling, close controls, and backdrop behavior. Escape dismisses autocomplete before the containing dialog. Saving can temporarily disable dismissal. Closing a top dialog must not also close one underneath it.

Character-sheet edits use a local draft until Save. Inventory and equipment operations belong to the original run and item. Finished runs remain visible but read-only. Failed transfers, including an unequip into a full inventory, must preserve the item.

UI preferences are account-scoped where supported. Feature-specific settings take precedence where a feature intentionally has its own visibility control.

## Live reading

| Module | Responsibility |
|--------|----------------|
| `reading/access.js` | Reading availability and unlock controls |
| `reading/content.js` | Shared safe rendering of matter and section content |
| `reading/liveread.js` | Desktop reader lifecycle and navigation |
| `reading/liveread-shared.js` | Shared reader behavior |
| `reading/map-entry.js` | Explicit map-marker navigation |
| `reading/previous-entry.js` | Previous-entry behavior |
| `reading/source-flipbook.js` | Source-image page presentation |
| `reading/source-sheet.js` | Responsive source sheets with protected native image layers, independent luminance masks, and bounded PDF transforms |

The mobile reader uses the same access and content rules with its own shell. Opening a readable book resumes the active run or starts one when allowed. A failed progress load must not create an empty replacement run.

Matter and section HTML pass through an inert allowlist. Supported structure includes headings, paragraphs, emphasis, lists, tables, safe section links, bounded layout, and the owning book's protected images. Executable content and arbitrary attributes are rejected before insertion.

Counted sections and navigation labels are separate concepts. Sparse numeric and alphanumeric IDs must retain their labels and valid destinations. Frontmatter, backmatter, and noncounting reference entries must not inflate completion totals.

Marker-entry forms require an active matching book, run, section, and render. Preview controls remain disabled. Selected map connections persist as manual navigation; the reader does not generate routes or automatically solve map decisions.

### Access and artwork

Reading policy is owned by `server/db/reading-access.js`. Access checks apply to matter, sections, and images. Unlocks are durable and must survive retries and normal library changes. Locked previews do not create runs before access is granted.

Artwork is stored in `reading-images/<book-id>/<hash>.png`, not database blobs or public bypass routes. Each asset is limited to 256 KiB. Per-book ownership and content hashes are validated before delivery. The image endpoint checks reading permission, unlock status, and that the image is referenced by that book.

Image elements authenticate through a scoped HttpOnly session cookie rather than session tokens embedded in image URLs. Protected responses use `private, no-store`.

The storage API is `storeImage(format, base64, bookId)` and `externalizeImages(html, bookId)`. Native archival artwork must preserve its original pixels; adjoining image bands can satisfy the per-file limit.

## Battle simulator architecture

Simulators are optional encounter tools. Book navigation, story rewards, travel, recruitment, and campaign progression remain in the reader. Opponents, combat charts, and encounter metadata live in `book_enemies`.

```text
public/js/battlesim/
  battlesimNNN.js           Compatibility exports
  books/NNN/definition.js   Book identity and declarative options
  books/NNN/panel.js        Book-specific application wiring
  books/NNN/state.js        Optional book-specific state adapter
  books/NNN/combat.js       Optional book-specific combat adapter
  books/NNN/effects.js      Optional book-specific effects adapter
  engines/<family>/        Shared rules, state, actions and UI
  opponents.js             Shared editable opponent controls
  roster-data.js           Database roster loading
  loader.js                Desktop lazy loading
```

`definition.js` and `panel.js` are required. Other book modules exist only when they own behavior that the shared family does not already provide. Every entry exports `definition`, `init`, `render`, and `setVisible`, retaining required compatibility exports.

Desktop and mobile load simulator modules and translations lazily. Launcher registration, the database availability flag, and XP-history registration must agree. `scripts/check-battlesim-registration.js` checks installed registration.

The Way of the Tiger engine separates attack rolls, damage rolls, blocking, throws, and follow-up attacks. Database encounter profiles supply printed defenses, counterattacks, round limits, nonlethal outcomes, and explicit combat exceptions such as gripping opponents or untargetable counterattacks. Profiles can also declare exhaustion, protection, fixed damage, opening counterattacks, a single automatic opening shuriken, and hit, casualty or disarm objectives that return control to the reader without recording a win. A separate mirror resolver handles a duplicate's copied combat values, automatic blocks and matching attacks. Switching a round profile preserves current Endurance and pending follow-up bonuses; scripted story outcomes remain in the reader.

Shared engines accept declarative rules rather than branching on book IDs. Fighting Fantasy combat accepts database-defined weapon damage, doubles, opponent traits, limited poison and item charges, active opponent limits and printed stopping thresholds. These rules affect only an entered combat encounter and its saved combat resources. Panels own DOM and lifecycle; state and combat modules receive live application context through callbacks. Pending actions must reject stale account, book, or run contexts.

The Grey Star engine shares combat, character state, recovery, and panel behavior across editions. Book wrappers supply identity, translations, starting scores, potion strength, encounter rules, and the edition's combat table. Existing saved fights retain their captured settings; new configurations can enable per-round staff spending and lock setup during combat. Encounter rules can specify weapon restrictions, companion bonuses, optional protection, conditional passing damage, evasion windows, and round-dependent continuations. Combat outcomes and printed story continuations remain separate, including encounters whose final round stops before a victory can be recorded. Printed continuation gaps remain unresolved, and the tool never navigates the story.

The percentile solo-combat engine tracks explicit attacks, opposed defenses, wounds, and combat conditions using database encounter profiles. It preserves the shared units die for advantage and disadvantage, supports optional coin checks, and keeps simultaneous wounds separate until the round ends. Combat phases retain casualties and current stats. Unprinted defensive values remain unavailable; abstract defeat thresholds do not appear as invented hit points. Travel, campaign clocks, narrative choices, and scripted outcomes remain in the reader.

The Shinté engine resolves separate CS-versus-DS attacks through database-backed combat charts. Encounter adapters supply initiative, modifiers and the recipient of damage. Undefined chart results wait for explicit manual resolution without advancing the turn.

The Horror Classic engine resolves dice-based strikes, combat powers and explicitly completed rounds. Its presets and encounter exceptions come from the database. Effects with undefined timing require an explicit ruling; separate fatal-shot encounters do not invent ordinary combat stats. Flight and healing preserve distinct printed rule profiles without automating travel. The same database rule profile supplies panel options and created combat allies.

The Lost Jedi engine resolves one-hit combat through explicit turns and pending die rolls. Players confirm Jedi Point adjustments before a roll takes effect. Database presets supply allies, reinforcement timing and combat phase limits; a phase ending does not generate a victory. Shared encounter controls expose printed combat actions and optional setup modifiers. Combat continuations preserve casualties and spent resources, while story destinations return to the reader. Pending rolls and spent resources persist with the current run.

The Super Endless Quest engine resolves single-hit encounters, declared book experience and optional precombat saves. An explicit staged mode supports successive combat checks with one or two dice, skill and equipment modifiers, opening damage acknowledgment and combat continuations confirmed by the player. Database presets supply targets, damage, HP restrictions, combat steps and printed exit options. Intermediate checks keep the encounter in progress and award no battle outcome. Saved actions are validated by replay without generating dice; story destinations and noncombat checks remain manual. Existing saved single-hit fights retain their original rules.

The martial quest engine resolves database-defined combat procedures using one die, current skills and experience declared before rolling. Separate damage instructions, HP gates, tactical choices and terminal outcomes require explicit actions. Training defeat preserves the distinction between unconsciousness and death. Saved fights are validated by replay, and the shared encounter state store accepts the family validator while preserving run identity checks. Panels accept custom opponent names without requiring a preset; they do not advance the reader or manage story progression.

The Kingfisher engine resolves alternating two-dice attacks with database-defined opponent profiles and encounter exceptions. Groups and reinforcements use compact counters, missing numeric stats require player input, and source-defined single-hit opponents use a hit counter without displaying invented Life Points. Encounter data selects weapon sequences, lethal hits, fixed damage, capture thresholds and round limits. Optional combat tools track current charges, healing and weapon cooldowns. Bounded combat logs and revision checks keep long encounters small and reject stale actions; equipment acquisition, puzzles and story progression remain in the reader.

The d20 engine separates dice, typed damage, conditions, encounter rules, spell resources, and panel controls. Opponent profiles and encounter parameters come from database datasets. Source-defined attack checks handle visibility, cover, and opportunity attacks; separate effect modules resolve ongoing damage, environmental hazards, and escape sequences. Printed spell tactics and reflection reactions use explicit database features, including their resource and timing limits. Prepared spells spend slots before resolution; explicitly adjudicated effects commit together, and only unresolved casts can be canceled for a refund. Character forms support companions and editable custom opponents. Positioning and class-feature decisions remain manual. The shared run-state boundary rejects stale controls and delayed confirmations after book or run changes, while bounded logs retain combat results.

The procedural quest engine resolves database-defined combat actions with one or two dice, current stats, resource counters and conditional combat options. Each roll, stat adjustment, continuation and outcome requires an explicit action. Expressions use a bounded arithmetic vocabulary; they cannot execute code. Saved fights are validated by replay, and damage, casualties and drain effects remain separate where the rules require separate actions. Neutral encounter completion does not count as a win or loss. The shared state store can retain unused combat fields when switching between procedures; existing families keep their original behavior. Custom opponent groups use database-owned templates and produce one result after the group is resolved. Hidden panels skip rendering, while unchanged updates retain manual dice. Database rules can disable book experience, hiding its spending controls and counters while retaining the same validated combat core. Individual combat rolls can also cap experience spending; the controls and replay validation enforce the same limit. The engine does not navigate the reader or manage campaign progression.

The first-hit engine alternates two-dice attacks against the target's current skill. The first successful attack ends the encounter; it does not introduce HP or opposed attack-strength modifiers. Database profiles supply opponent skills and printed combat notes. Custom opponents use the same editable setup. The shared run-state boundary rejects stale actions and records each result once; narrative wounds, rescues and story progression stay manual.

The Golden Dragon engine resolves each combat round from a database-defined two-dice chart. It tracks chosen targets, wounds, psychic losses, venom, paralysis and permitted escapes, including explicit failed-escape damage. Encounter rules can require a separate saved PSI roll after a wound, enforce sequential opponents or retain defeated profiles during a continuation. Optional combat setup supports net modifiers, a first-round modifier, progressive round bonuses and replacement wound damage. Modified totals outside the printed chart require an explicit recorded ruling. Other declarative rules support surrender after wounding hits, victory when one opponent falls, defeat below a health threshold and printed immediate wins or pauses without invented damage. Group and round limits pause an encounter without recording a full victory, retaining the remaining combat stats for manual continuations. Source presets retain fixed group sizes and can require current opponent health; custom encounters use editable opponents and a compact ordinary combat chart. Setup remains in the left column, with results and bounded history on the right.

The Magnakai encounter engine uses database-owned combat charts and presets with shared combat, run-state, and panel modules. Book definitions select discipline controls, numeric combat modifiers, ENDURANCE precision, elapsed-round setup and optional tournament controls. Stable encounter keys distinguish opponents sharing a printed section and link consecutive opponents with their own modifiers. Psychic costs and pre-round damage, conditional psychic bonuses and damage, fixed combat scores, temporary equipment restrictions, timed modifiers, evasion windows, consecutive opponents, nonfatal ENDURANCE thresholds, and nonfatal round limits resolve inside the encounter. Captured rank profiles can change psychic bonuses, costs and minimum ENDURANCE. Definitions can add distinct psychic powers with their own costs, thresholds, immunities and damage draws, choose starting-stat rolls, and make evasion depend on remaining enemy ENDURANCE. Weapon flames add damage only on successful weapon rounds. Alternative weapon effects share one multiplier instead of stacking. Captured weapon choices can select a victory route or return the player to the reader before combat, without recording a fight outcome. Encounter data can restrict opening-round weapon damage and make later wounds permanent; equipment ENDURANCE bonuses remain separate when checking basic-ENDURANCE death. Optional combat healing consumes an explicit readiness flag; calendar eligibility stays with the player. Temporary combat boosts expire once when an encounter ends, preserving permanent losses and never reviving a defeated character. Full-round ENDURANCE protection remains distinct from table-only damage protection. Round limits carry across consecutive opponents. Single-round limits can compare actual ENDURANCE lost by both sides, including combat costs, with separate continuations for greater, lesser and equal losses. Printed gaps in continuation rules remain unspecified. Tournament target points remain separate from character ENDURANCE. Nonfatal reader continuations do not become killing victories; an explicit automatic-kill continuation can record a victory separately. Story choices and travel remain manual.

Encounter metadata can fix the Combat Ratio and derive an opponent's starting ENDURANCE from the player's current score. Derived setup fields remain unavailable until combat starts. Noncombat table challenges do not record battle outcomes.

An explicit combat continuation preserves remaining ENDURANCE, elapsed rounds, captured effects and unconsumed recovery instead of starting a new fight. Round-specific enemy adjustments apply once and persist with that fight. Definitions can configure opening costs, first-round weapon costs, conditional wound multipliers and psychic-mode restrictions. Equipment and psychic damage both respect a printed prohibition on injuring the opponent.

Psychic powers can deal fixed damage and have a once-per-fight limit. Their consumed uses persist in the saved fight and reset only when a new encounter starts. Definitions may allow changing psychic attacks between rounds; only the selected attack applies, and an evasive round does not consume a limited attack. Encounter vulnerabilities can multiply selected psychic attacks without multiplying weapon bonuses.

Saved fights retain their rule version, turn, participants, resources, pending decisions, and history. Rendering does not migrate or reset them. Each completed outcome is recorded once; canceled or incomplete encounters must not be reported as victories.

Custom encounters use the common opponent editor. Missing or derived source attributes remain explicitly unavailable until the appropriate engine resolves them; setup must not invent substitute values. Ordinary custom fights do not require a preset.

Controls and setup remain in the left column; results and history remain in the right. Panels use shared button styles and `--bsim-text-size`. Verify both lazy loaders and the architecture browser fixture when adding a simulator.

Family-specific file layout is documented by each module's responsibility header. Dispatchers select shared combat modules from declarative encounter metadata; book adapters supply identity and application wiring.

## XP, currencies, and seasonal events

The database owns XP awards, level calculations, shop validation, currency balances, and reward uniqueness. Browser bars and floaters display server results; they do not authorize awards.

`server/db/xp.js` processes saved-state achievements and heartbeat XP. Fractional heartbeat carry persists between ticks. Reward caps and impersonation rules are enforced centrally. Changes to future rates must not silently recalculate already-earned XP.

Currency mutations use transactional accounting and retry protection. Purchased, earned, spent, and shared-market balances remain distinct. Some internal gem identifiers retain legacy names for compatibility; use the current player-facing labels rather than renaming stored fields or historical records.

Job XP and its level events have their own storage and progression rules. Event templates are assigned when earned rather than chosen during feed rendering. Current prices and reward amounts belong in the relevant database modules and configuration, with player explanations in the Guide.

Season definitions supply calendar windows and reward eligibility. Live activation uses Europe/Sofia dates and updates connected clients at event boundaries. Account-specific previews affect presentation only; actual rewards continue to follow the server calendar.

Participation records and payout reports are persisted. End-of-event payouts debit the admin pool atomically only when the complete payout can be funded. A permanently skipped payout must not be retried as a later partial payment. Reports retain the processed recipients and amounts.

## Open-world series

Open-world series share run identity, character data, possessions, and a notebook across member books. Per-book graphs, encounter instances, logs, and local progress remain associated with their books.

Portal travel saves the departing context, records the transition, and opens the destination with the shared run. Compatible simulator character values can travel; ongoing fights and local encounter state do not. Incompatible rule families retain separate simulator character data.

Journey views and feed events use series-run identity to avoid counting one cross-book adventure as unrelated starts. Shared-state writes must preserve the histories and local state of books that are not being updated.

## Parties, feedback, forum, and email

Parties synchronize the participants' shared book state. Invitation acceptance and membership changes enforce ownership and active-party restrictions. SSE fan-out reaches authorized participants, and stopping a party leaves each player with the current progress.

Feedback threads and attachments have independent visibility for each side. Deletion is permanent only after both sides delete the thread; new replies can make a hidden conversation visible again. Failed file cleanup is queued for retry.

Forum modules separate HTTP handlers, database operations, and server-rendered pages. Posting and moderation checks remain server-side. Attachment validation and escaping apply to both user and operator content.

`server/email.js` owns transport configuration and feedback emails. Saved SMTP settings override environment defaults. A blank password save retains the existing secret. Delivery failures must not discard the stored feedback message.

## Exports, backups, and restoration

Player exports are generated by `server/export.js`. Full exports contain account-owned JSON data and readable per-book HTML, with graph snapshots where available. Per-book exports are restricted to that account's copy. Filenames are sanitized before archive creation.

`server/backup.js` creates a consistent SQLite snapshot daily at server-local midnight and catches up at startup if that day's archive is missing. It compresses snapshots and retains 30 days of automatic archives. Successful compression removes the temporary raw snapshot. Failed creation preserves earlier recovery archives.

Automatic ZIPs contain the database only. A full restoration also requires protected reading images, covers, avatars, book attachments, and feedback attachments from the corresponding filesystem backup. Preserve configuration separately. A player export is not a replacement for a server backup.

Use SQLite's backup facility for a live database rather than copying only the main database file while writes are in progress. Maintenance tools that change catalogs or schema must preserve player state and unrelated records. Filesystem migrations need reference and ownership checks before removing old locations.

## Configuration and maintenance

| Setting or source | Responsibility |
|-------------------|----------------|
| `PORT` | HTTP port; defaults to 3000 |
| `.env` | Server environment defaults and secrets |
| `admin_settings.app_version` and `VERSION` | Release version; keep synchronized |
| `admin_settings.app_url` | Trusted public URL for generated account links |
| SMTP settings | Mail transport; saved values override environment defaults |
| `size_ignore_patterns` | Admin application-size and backup-file listing exclusions |
| `xp_config` | Configurable XP event amounts |
| Migration markers | Once-only schema/data operations; not ordinary editable settings |

Admin tools expose version, notes, SMTP, XP configuration, backups, and maintenance actions. Their operational instructions are in the Admin Guide. The running process and configuration should be managed through the project's established deployment procedure; editing documentation does not require a restart.

## Internationalization

`i18n.js` is the compatibility entry point; `i18n/runtime.js` owns language selection, lookup, interpolation, and DOM application. English core tables are grouped by domain under `i18n/en/`.

Simulator translations load separately through `i18n/battlesim.js`. Preserve established translation keys and source-language behavior when extracting modules. The admin interface is English-only.

Add new user-facing strings to the appropriate domain table and use the shared translation functions. Keep source-book text unchanged rather than translating or rewriting it as interface copy.

## Tests and documentation

Use Node.js 22 for the current test runner and ESM helpers.

```text
npm test
npm run docs:build
npm run docs:check
node scripts/check-battlesim-registration.js
```

`npm test` runs the configured unit and persistence tests. Standalone browser launchers run explicitly. Use the relevant desktop/mobile fixtures for DOM behavior, lazy loading, layout, and saved-state recovery.

Generic combat tests use synthetic values. Roster checks use `test/helpers/roster-db.cjs`, which opens the installed catalog read-only without application initialization or migrations. `GAMEBOOKS_TEST_DATABASE` selects an alternative catalog for those checks. Persistence tests use isolated databases.

Tests must distinguish data coverage, rendered browser coverage, and personal visual review. A passing helper does not prove source fidelity or live installation. Preserve saved-state compatibility and once-only outcomes when changing shared engines.

The documentation sources and generated outputs are:

| Source | Generated output |
|--------|------------------|
| `docs/user-guide.md` | `public/guide.html` |
| `docs/admin.md` | `admin/admin-guide.html` |
| `docs/technical.md` | `admin/technical.html` |

Edit the Markdown sources, regenerate with `npm run docs:build`, and verify with `npm run docs:check`. Do not hand-edit the generated HTML. Keep each guide focused on its audience; temporary audits, rollout notes, source-book rules, and repair histories belong elsewhere.
