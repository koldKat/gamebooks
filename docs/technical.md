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
    impersonation-context.js  AsyncLocalStorage: is the current request impersonated (checked by xp.js's awardXp/awardCoins)
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
      confirm.css        Confirm/alert dialog. Linked separately from play.css so mobile/index.html
                          can use it without play.css's much larger desktop-only ruleset
      autocomplete.css   Enemy-picker autocomplete dropdown, same standalone-linking reason
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
      util.js            Shared utility helpers: escapeHtml, compressImage, compressToBlob (client-side JPEG quality iteration), setPreviewImgBlob (revokes an <img>'s previous blob: src before assigning a new one, used by add-book.js/edit-book.js's cover-preview file pickers), registerPanelShortcut (single-key panel toggle shared by charsheet/inventory/equipment/battlesim*), shortcutLabel (first-letter shortcut hint span)
      autocomplete.js    Shared name-autocomplete helpers for add/edit modals
      auth.js            Login, register, forgot-password, reset-password forms
      confirm.js         showConfirm()/showAlert(). Linked separately from play.js so battlesim*.js
                         and the mobile reader can import just this, not play.js's whole tree
                         (graph.js, charsheet.js, equipment.js). Reuses index.html's static
                         #confirm-overlay markup when present; builds an equivalent overlay
                         dynamically when it isn't (mobile has no such markup). play.js re-exports
                         both names for its own existing callers.
      notes.js           Notebook modal and pinned notes overlay
      battlesim/         All battle simulator modules, one file per book, grouped in their own
                         subfolder (imported only by boot.js, never by each other)
        battlesim829.js    Battle simulator for book 829
        battlesim8.js      Battle simulator for book 8
        battlesim286.js    Battle simulator for book 286 (flat weapon min-hit model - damage = max(0, 2d6 - minHit) - tech gadgets, sleep/dream table; enemy.fixedDamage covers the handful of enemies whose text states a flat per-hit amount instead of the usual roll-minus-minimum; enemy.extraAttackers generalizes the app's "unwoundable second attacker" pattern to N simultaneous/sequential attackers for the book's four multi-enemy fights, secs 13/15/29/173)
        battlesim198.js    Battle simulator for book 198, The Warlock of Firetop Mountain (standard Fighting Fantasy SKILL/STAMINA/LUCK system)
        battlesim199.js    Battle simulator for book 199, The Citadel of Chaos (same SKILL/STAMINA/LUCK combat as book 198, plus a MAGIC/spell system unique to this book, no Provisions, Items panel for its two fixed-bonus weapons)
        battlesim200.js    Battle simulator for book 200, The Forest of Doom (SKILL is 1d6+5 here, not the usual 1d6+6; no MAGIC, no Provisions mechanic; adds paired-attacker fights and a Luck-event queue - see below)
        battlesim186.js    Battle simulator for book 186, Starship Traveller (no unified combat system - hand-to-hand/phaser/ship-to-ship selected via a mode toggle; 7-person crew each individually rolled, one shared LUCK box, no LUCK-based combat swing at all - see below. Not modeled: section 245, "Eagle vs Ganzigite," a spectator battle between two NPCs - its "continue reading" link leads into unrelated hand-to-hand combat text, confirming the player never participates, same "resolved and read, not fought" exclusion book 210 documents for its own spectator battle)
        battlesim201.js    Battle simulator for book 201, City of Thieves (standard SKILL/STAMINA/LUCK system, reuses book 200's attackModifier and pairedFight/sideEnemy mechanics; adds an enemyWoundDamage knob for non-standard wound amounts)
        battlesim202.js    Battle simulator for book 202, Deathtrap Dungeon (standard SKILL/STAMINA/LUCK system, reuses book 201's core; adds instaKillEnemyAS, instaKillOnEnemyWin, winAfterHits and luckyKillOnWin knobs for its instant-death/weak-point encounters)
        battlesim203.js    Battle simulator for book 203, Island of the Lizard King (standard SKILL/STAMINA/LUCK system, reuses attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits verbatim; adds a first-round-of-battle override chain - Sog's Helmet auto-win > Potion of Clumsiness 1d6 curse-roll > plain enemyAutoWinFirstRound knob > normal roll - plus a LUCK floor for Sama's Bone Charm and two mutually-exclusive weapon toggles)
        battlesim83.js     Battle simulator for book 83, Войната на Понтиак / War of Pontiac - a Bulgarian chitanka.info-family book with its own "random-number combat" appendix, scoped to single combat (the book's separate mass-battle/board-game system isn't modeled). Each exchange is two number-picks by the acting side, not an opposed roll: attacker picks a number for themself (+ STRENGTH + a free-entry WEAPON bonus, since usable weapons vary by episode) and a number for the defender (+ the defender's stat); ties go to the attacker. book_enemies' attack/defense/hp columns hold the book's own 12-entry roster (rules p.6). The player has no stated DEFENSE stat on the character sheet; the sim uses STRENGTH alone (no weapon bonus) when the enemy strikes back.
        battlesim86.js     Battle simulator for book 86, Гората на демона / Forest of the Demon - same chitanka.info-family random-number combat as book 83, fully symmetric (a single STRENGTH stat both sides use, no attack/defense split); ties deal no damage. STRENGTH/LIFE are dice-rolled at chargen, not player-allocated. book_enemies (37 rows, read from all 503 sections, no front-matter roster) stores STRENGTH in .attack and LIFE in .hp; .defense is unused. The demon Зардинакс has 7 stat-lines (STRENGTH 14/15/16) for different weapon/item choices at that story beat, each disambiguated by section number in the name.
        battlesim114.js    Battle simulator for book 114, Огнена пустиня / Fiery Desert - same symmetric-STRENGTH chitanka.info formula as book 86, LIFE = pick + 20 (book 86 uses pick + 30). Owning the "бързоходни ботуши" (fast boots) lets the player pick two numbers each exchange and use the higher one - a toggle, not tied to a specific enemy, since it's inventory state carried across fights. book_enemies (40 rows, read from all 420 sections) uses the same .attack/.hp convention as book 86; the final boss Агамор has two separate fights (§278, §400).
        battlesim115.js    Battle simulator for book 115, Окото на дявола / Eye of the Devil (same symmetric-STRENGTH chitanka.info formula as books 86/114: STRENGTH (12) and LIFE (32) are fixed starting values here, not dice-rolled, so there's no roll step, just pre-filled fields; damage is the difference between the two totals rather than a flat 2, so a tie deals 0 damage with no special-case needed. 6 combat encounters across the book's 310 sections)
        battlesim123.js    Battle simulator for book 123, Прокълнатата земя / Damned Land (same author and rules template as book 115: fixed STRENGTH (10)/LIFE (30), difference-based damage). 4 combat encounters (5 book_enemies rows) in the book's 269 sections. §224 is a three-way round (first enemy strikes, then you, then the second enemy) rather than the 1-on-1 exchange this sim runs - both enemies are in book_enemies individually, approximated by running two consecutive 1-on-1 rounds rather than modeled as a bespoke three-party mode
        battlesim130.js    Battle simulator for book 130, Тайната на светещия мъх / Secret of the Glowing Moss (same fixed-2-damage chitanka.info formula as book 86, dice-rolled STRENGTH/LIFE at chargen, but book 130's own STRENGTH roll is max(0, pick - 6) + 10, not book 86's ceil(pick/2) + 10 - read from this book's own rules rather than assumed from the shared author/template). 9 combat encounters across the book's 252 sections
        battlesim92.js     Battle simulator for book 92, Замъкът на таласъмите / Castle of the Goblins - table-driven combat rather than the formula-based approach of the other chitanka.info-family sims. STRENGTH = pick + 10, LIFE = pick + 20, both rolled once at chargen. ratio = playerStrength - enemyStrength is computed once when an enemy is selected and stays fixed for the fight; each round, a 1-12 pick is added to it (clamped to -12..+12) to get the attack level, which indexes a fixed 25-row table giving simultaneous life loss to both sides, including instant-death rows at the two extremes. book_enemies (18 rows, read from all 375 sections) uses the same .attack/.hp convention as the other single-stat sims; every row is disambiguated with its section number. §199 is a three-headed dragon (three book_enemies rows fought as consecutive picks) and §32 is six identical dwarves (one row fought six times); §324/§374 are the same final boss reached via two different branches, both winning to §375.
        battlesim108.js    Battle simulator for book 108, Ледените пирати / The Ice Pirates - a two-dimensional table lookup rather than book 92's single summed index. attackLevel = effective player skill - enemy skill, bucketed into the 7 printed columns (+5/+6 .. -5/-6, outer buckets absorbing anything beyond); chance is a uniform 1-10 pick, bucketed into the 3 printed rows (1-3, 4-8, 9-10); the cell gives (player loss / enemy loss) directly, including instant-death cells. No dice-rolled starting stats - chargen is profession-based and external to the book, so the 3 combat skills (Ръкопашен бой / Бой с кинжал / Бой с меч) and the fixed 30 LIFE are entered once rather than rolled. Effective skill applies two penalties before the level is computed: weapon-tier mismatch (max(0, enemyTier - playerTier) on the golia raka=0/kinjal=1/mech=2 scale) and a life penalty (-1 below 20 life, another -1 below 10). book_enemies.attack holds the enemy's weapon skill, .hp holds LIFE, .defense holds their weapon tier - a different repurposing than the single-stat Bulgarian sims since this table needs a real tier number. 9 rows read from all 478 sections; one recurring dagger-armed encounter with verbatim identical text at 8 different sections is stored as a single row rather than eight duplicates.
        battlesim193.js    Battle simulator for book 193, Flight from the Dark (Lone Wolf book 1) - Lone Wolf's own Combat Ratio + Combat Results Table system, a 2D table lookup like books 92/108 rather than the FF sims' simultaneous-exchange engine. Combat Ratio (effective COMBAT SKILL minus enemy COMBAT SKILL) is computed once when an enemy is selected and stays fixed for the fight; each round, a 0-9 pick is bucketed against the ratio's 13 printed columns (-11 or less .. 11 or greater) to index the table, which gives both sides' ENDURANCE loss simultaneously, including a 'K' (automatically killed) sentinel at the extremes - transcribed from the book's own two-page-half printed table and cross-checked against its own duplicated "0" column. COMBAT SKILL = pick+10, ENDURANCE = pick+20, both rolled once at chargen; no LUCK mechanic (that's Fighting Fantasy, not Lone Wolf). attackModifier is a free-form +/- field covering every one-off COMBAT SKILL change this book describes by hand (Weaponskill/Mindblast Kai Disciplines, terrain penalties, the Potion of CS) rather than a dedicated toggle per source. One single-use Healing Potion consumable (+4 ENDURANCE, after combat only). Every multi-enemy fight in this book is explicitly fought one at a time in the text, unlike the FF sims' simultaneous paired fights, so no pairedFight/sideEnemy mechanic is needed - re-pick the next roster enemy after defeating the current one. book_enemies (39 rows, read from all 350 sections) uses the same .attack/.hp convention as every other sim; several same-named/close-stat encounters go to different destinations on checking and are kept as separate rows rather than merged.
        battlesim217.js    Battle simulator for book 217, Trial of Champions (Fighting Fantasy 21) - a plain FF SKILL/STAMINA/LUCK sim with none of the book-specific extras other FF sims in this app needed. attackModifier/enemyWoundDamage/winAfterHits kept as generic hand-applied knobs for one-off cases (the Liche Queen's -3 SKILL during combat, magic weapon bonuses). No Provisions - the book's own rules are explicit it starts with none. No pairedFight/sideEnemy mechanic - every multi-enemy encounter in this book is explicitly fought one at a time in the text, so the sim just re-picks the next roster enemy after each kill. book_enemies (45 rows, read from all 400 sections) uses the same .attack/.hp convention as every other FF sim; two same-name/same-stat/same-destination pairs (Giant Centipede §154/§270, Slave §73/§349) are merged into one row each.
        battlesim526.js    Battle simulator for book 526, GrailQuest 1: The Castle of Darkness - a single-roll LIFE POINTS system, no opposed-roll comparison. Each round both sides roll 2d6 independently against a hit threshold (7 by default); a hit deals (roll - 6) damage plus a flat weapon bonus, reduced by the target's flat armour value. At 5 or fewer LIFE POINTS a combatant is unconscious (a distinct, non-fatal loss state); at 0, dead. Weapon/armour toggles are plain numeric fields (hit threshold, damage bonus, armour) rather than named per-item checkboxes, since this book's bonuses are flat modifiers rather than the FF sims' opposed-SKILL bumps. book_enemies (13 rows) holds a partial roster gathered from the book's own stat-block sentences, not mapped to section numbers - this book's live-reading text was not imported, only its game mechanics.
        battlesim322.js    Battle simulator for book 322, Fire on the Water (Lone Wolf book 2) - reuses book 193's COMBAT_TABLE and Combat Ratio system unchanged, since Project Aon's "Game Rules" text and worked example are verbatim identical between the two books. book_enemies (41 rows, read from all 350 sections) uses the same .attack/.hp convention; three same-name/same-stat/same-destination groups (Street Thief Leader/1/2 §131=§298, Watchtower Guard §110=§157, Giaks §34=§146) are merged into one row each.
        battlesim323.js    Battle simulator for book 323, The Caverns of Kalte (Lone Wolf book 3) - reuses book 193's COMBAT_TABLE and Combat Ratio system unchanged, verbatim-identical rules text confirmed the same way as book 322. book_enemies (38 rows, read from all 350 sections) uses the same .attack/.hp convention; §138's 2-Kalkoth fight reuses §263's full 3-Kalkoth fight's first two rows rather than adding a separate pair, per the book's own note that it's the same encounter with one already killed via a different path. Two Akraa'Neonor encounters (§164/§200) share a destination but have different stats and are kept as separate rows, matching book 322's precedent.
        battlesim324.js    Battle simulator for book 324, The Chasm of Doom (Lone Wolf book 4) - reuses book 193's COMBAT_TABLE and Combat Ratio system unchanged, verbatim-identical rules text confirmed the same way as books 322/323. book_enemies (52 rows, read from all 350 sections) uses the same .attack/.hp convention; three same-name/same-stat/same-destination pairs (Stoneworm §26=§88, Giant Meresquid §194=§234, Barraka §122=§325) are merged into one row each.
        battlesim325.js    Battle simulator for book 325, Shadow on the Sand (Lone Wolf book 5) - reuses book 193's COMBAT_TABLE and Combat Ratio system unchanged, verbatim-identical rules text confirmed the same way as books 322/323/324. The §4 Palace Gaoler fight's special rule (ignore enemy ENDURANCE loss in round 1, destination depends on total round count) is not modeled and is handled by hand. book_enemies (38 rows, read from all 350 sections) uses the same .attack/.hp convention; one same-name/same-stat/same-destination pair (Itikar §240=§370) is merged into one row.
        battlesim122.js    Battle simulator for book 122, Проклятието на меча (Curse of the Sword) - structurally unlike every other sim in this app: the book offers three independent, switchable combat systems built around a per-fight "БОЕН КОД" (Battle Code) rather than a fixed stat. System 1 (the book's primary method) is a single static Battle-Code-vs-threshold comparison stated directly in each fight's own text - not simulated, shown only as a reference number. Systems 2/3 ARE modeled: each round both sides roll 2d6 added to their own total (player: roll + Battle Code; enemy: roll + БОЙНИ КАЧЕСТВА), and the difference is applied to the loser's ИЗДРЪЖЛИВОСТ (System 2) or to the player's own Battle Code instead (System 3, leaving ИЗДРЪЖЛИВОСТ untouched) - switchable round to round, per the book's own rules. Chargen/skill-journal tracking is not modeled; the player enters their externally-computed Battle Code directly, same free-form-entry precedent as attackModifier elsewhere. book_enemies.attack holds БОЙНИ КАЧЕСТВА, .hp holds ИЗДРЪЖЛИВОСТ, .defense holds the informational System-1 threshold - a third distinct repurposing of that column. 35 rows read from 74 flagged sections (most flagged sections turned out to be chargen/training branches, not fights); three same-name/same-stat/same-destination pairs (kenjutsu master §110=§120, Uesugi warband §260=§270, Kenshin Uesugi's duel §302=§306) are merged into one row each.
        battlesim80.js     Battle simulator for book 80, Бойците на Орм (The Fighters of Orm) - a single clean dice system ("Стандартна схватка"), unlike book 122's three switchable ones. Each round both sides roll 1d6 added to their own Интерактивен статус; the higher total strikes first, and gets two consecutive strikes if the gap is 3 or more. Each strike is Офанзивен статус + a fresh 1d6, minus the defender's Дефанзивен статус (floored at 0), subtracted from Живот. A tied order roll defaults to player-first with no double strike - the book's own text doesn't cover ties. Closed 5-fighter tournament cast rather than a growing per-section roster; both the player's and the current opponent's stats are plain editable fields since prize money permanently raises them between fights. book_enemies.attack holds Офанзивен статус, .hp holds Живот, .defense holds Дефанзивен статус, .pb holds Интерактивен статус (a 4th numeric column, same repurposing precedent as battlesim829.js). 5 rows, seeded directly from the book's own introduction rather than read section by section.
        battlesim82.js     Battle simulator for book 82, Варварският бог (The Barbarian God) - Life points (start = 50 + a table-pick) fall into four Levels (I "healthy" 62-41 +5, II "wounded" 40-16 +3, III "maimed" 15-1 +1, IV "dead" 0), each with its own Strength bonus. Two combat skills (unarmed / melee weapon) are ALSO tiered by the same four Levels (1/0/0 and 2/1/0) rather than independently trained - the fight text states which one applies, so both the player's Strength and skill tier are fully derived from current Life, not tracked as separate numbers. Each round only the player picks a random number 1-12 added to their Strength; the enemy's Strength is a fixed value with no roll of its own - higher total costs the enemy 2 ЖИЗНЕНИ ТОЧКИ, lower costs the player 2, a tie costs both 1. book_enemies.attack holds the enemy's fixed Strength, .hp holds their Life points (or the stated loss-threshold for the handful of encounters that give only one number). 15 rows read from all 777 sections - this book's combat is a minor thread against exploration/dialogue, hence the thinner roster than most sims; one same-name/same-stat/same-destination pair (mounted barbarian §120=§454) is merged into one row.
        battlesim118.js    Battle simulator for book 118, Полет от мрака - a separate, independently created Bulgarian translation of the same underlying book as battlesim193.js (book 193, the English Project Aon "Flight from the Dark"), not a duplicate import (different created_by, non-identical section text). Section numbering matches 1:1 between the two editions and this book's own worked example is identical to book 193's, so the Combat Ratio + Combat Results Table system and COMBAT_TABLE are reused unchanged from battlesim193.js. book_enemies (39 rows) cross-referenced directly against book 193's already-verified roster (same numbers at every matching section) with Bulgarian names read from this book's own text.
        battlesim218.js    Battle simulator for book 218, Robot Commando (Fighting Fantasy 22) - standard SKILL/STAMINA/LUCK core plus this book's own second combat mode: "Robot Combat", used whenever piloting a robot against a foe with SKILL/ARMOUR/SPEED instead of SKILL/STAMINA. A mode toggle switches the active life pool (STAMINA vs a separate, freely-editable ARMOUR pool, since each robot piloted has its own ARMOUR and there's no dedicated robot-garage UI) and turns on SPEED comparison (+1 Attack Strength to whichever side's robot is faster: Slow/Medium/Fast/VeryFast) plus a free-form robot Combat Bonus field. pairedFight/sideEnemy (reused unchanged from books 200-216) covers the two "choose your target, the other attacks you passively and can't be wounded back" fights (2 Triceratops §117, 2 Tripods §169) - this book's other multi-enemy fights are all fought one at a time with no paired mechanic. book_enemies.attack holds SKILL, .hp holds ARMOUR (robot-mode rows) or STAMINA (personal-mode rows), .defense holds SPEED (0-3) for robot-mode rows. 41 rows read from all 400 sections; one same-destination trio (Giant Lizard §232=§328) kept as three rows (a 3-enemy sequential fight, not one enemy); the two paired encounters are two rows each, labeled "(paired)".
        battlesim219.js    Battle simulator for book 219, Masks of Mayhem (Fighting Fantasy 23) - a plain FF SKILL/STAMINA/LUCK sim matching book 203's core mechanics verbatim (Test Your Luck, Provisions, single-dose 3-choice potions), confirmed against this book's own printed rules pages. attackModifier/enemyWoundDamage/pairedFight/sideEnemy reused unchanged, covering the five paired-enemy fights (Pygmy Orcs §129/§220, Spriggans §171, Blackhearts §254, Tribesmen §282/§318, Skeletons §386). Adds one new generic field, playerWoundDamage (default 2, also scales the Test-Your-Luck lucky-hit bonus), for the three fights with non-standard win damage: the Shadow Monster (§55), the Hellfire Spirit (§93/§281), and Morgana (§295), all normally 1 STAMINA per hit instead of the usual 2. The three five-tentacle sequences (§207/§330/§379) and the alternating two-Mordida fight (§375) are not modeled as bespoke multi-enemy mechanics - fought as a sequence of ordinary single-target fights, re-picking the next enemy after each falls. Not modeled: the §308 narrative full-restore fountain, the Chimera's (§145) always-wounds-every-round effect, and the Sabre-toothed Tiger's (§371) "if not defeated within four rounds" narrative branch - all applied by hand. book_enemies (48 rows, read from all 400 sections) uses the same .attack/.hp convention as every other FF sim; paired encounters are two rows each, labeled "1st"/"2nd (paired)".
        battlesim220.js    Battle simulator for book 220, Creature of Havoc (Fighting Fantasy 23) - a plain FF SKILL/STAMINA/LUCK sim; unlike most FF sims in this app there is no Provisions/potion mechanic (confirmed absent from this book's own text - the player character is an amnesiac monster, not a conventional armed adventurer), so that UI is omitted entirely rather than left dead. attackModifier covers the book's small set of found-item SKILL bonuses (a magical silvery coating, a metal breastplate) in place of a real inventory. Generalises book 219's single pairedFight/sideEnemy into extraAttackers (0-3) + sideEnemies[], each an independent simultaneous exchange, covering 2 Goblins (§341), 3 Hobbits (§42), 3 Flesh-Feeders (§447), 2 Brigands (§429), 4 Zombies (§411), and Warrior+Thief (§320); §258's Warrior-then-Fighter is sequential, fought as two ordinary re-picked single fights. New enemyDefeatThreshold field (default 0) covers Thugruff (§82, win at STAMINA 4) and the Master of Hellfire (§143, win at STAMINA 2), the only two non-zero win conditions. Not modeled: the Ophidiotaur's (§238) tail-sting bonus damage on enemy doubles, the Manic Beast's (§263) escalating rage bonus, the Giant Hornet's (§332) double-roll-death mechanic, and two narrative round-count branches (§205, §425) - all applied by hand. A "Grog companion" mechanic reroutes ~8 sections by a fixed §−52 offset when a companion is present; this is navigation, not combat, and isn't modeled. book_enemies (58 rows, read from all 460 sections) uses the same .attack/.hp convention as every other FF sim; recurring creature types (Chaos Warrior ×5, Quimmel Bone ×3, Blood Orc, Carrion Bug, Armoured Knight) are separate fights at different sections, kept as separate rows.
        battlesim221.js    Battle simulator for book 221, Beneath Nightmare Castle (Fighting Fantasy) - a plain FF SKILL/STAMINA/LUCK sim, reusing attackModifier/enemyWoundDamage/playerWoundDamage/enemyDefeatThreshold unchanged from books 219/220. No Provisions/Potions UI - this book's meal recoveries are one-off narrative section events rather than a flat Portions pool, and its single printed potion (a one-use Potion of Berserk Rage, §263) is a one-off item, both hand-applied with the existing steppers rather than a dead system. No simultaneous-multi-enemy mechanic is needed (unlike book 220) - the six Swordsmen at §41 are fought one at a time via re-picking the dropdown, and the Giant Spiders (§204) are explicitly "fought as if one opponent", a single stat-block row. enemyDefeatThreshold covers Vitriol Essence's (§10) win-at-STAMINA-2 condition. Two new generic per-fight fields, both zero by default: talismanSkillReduction (Talisman of Loth's enemy-SKILL reduction, varies -2/-1/0 by fight) and tridentBonusDamage (Trident of Skarlos's bonus wound damage, +5 vs Xakhaz §167, +4 vs Luminous Warrior §241, 0 elsewhere). Not modeled: Vlodblad's (§76) enemy-SKILL escalation while unwounded and the Luminous Warrior's (§241) passive per-round STAMINA drain (both dynamic always-on passives, same precedent as book 220's Ophidiotaur/Manic Beast/Giant Hornet), the Runic Axe's Escape-disabling effect, and several narrative round-count/Escape branches (§76, §96, §161, §186, §187, §193, §314, §390) - all applied by hand. book_enemies (30 rows, read from all 400 sections) uses the same .attack/.hp convention as every other FF sim; recurring creature types (three separate Southern Swordsman fights, two Vitriol Essence encounters) are kept as separate rows disambiguated by section number. A first extraction pass missed four encounters whose stat-block text was too garbled to match a plain "SKILL N, STAMINA N" pattern (Mutated Woman §128, Senyakhaz §160 - the book's climactic named villain, printed as the split "SEN YAKHAZ" - and two stat-blocks sharing one paragraph at §361, Page-boy Gnome and Orc Cook); a second full-book sweep for any remaining "SKILL"+digit occurrence caught all four and added them. Nine STAMINA/SKILL values across eight encounters (Vitriol Essence's 2nd encounter §224, Young Man §226, Bakk-Ruman §272, Crate of Limbs §314, Unknown Assailant/Ogre §394, Mutated Woman §128, Senyakhaz §160, Orc Cook §361) are best-guess reconstructions rather than confirmed print values - this book's PDF text layer is unreadable/OCR-garbled at those pages, so they could not be cross-verified against the original. Each is marked inline in the affected book_sections prose itself (not just in book_enemies) with a "[best guess — original source scan illegible here]" note, since the garbled text was part of what the reader sees, not only sim-seed data.
        battlesim222.js    Battle simulator for book 222, Crypt of the Sorcerer (Fighting Fantasy) - a plain FF SKILL/STAMINA/LUCK sim, reusing attackModifier/enemyWoundDamage/playerWoundDamage/enemyDefeatThreshold unchanged from books 219-221. No Provisions/Potions UI - this book's own rules text states outright that, unlike other Fighting Fantasy gamebooks, the reader does not start with Provisions, and there is no printed multi-use potion system either. extraAttackers (capped at 1, rather than book 220's 3) + a single sideEnemy cover this book's one simultaneous encounter, the two Orcs at §8 - only the "main" Orc can be wounded through the sim; the un-targeted Orc only deals damage each round, same precedent as book 220's larger version of the mechanic. Several per-encounter special rules are deliberately not modeled as bespoke toggles, matching this app's existing precedent for narrative-adjacent round-count/consecutive-outcome mechanics: the Ape Man's (§83, §219) fixed 3-round fight that continues to §254 regardless of outcome, the Demonic Servant's (§68, §81) instant-collapse on 2 consecutive player wins, Razaak's (§271) instant-loss on 2 consecutive Razaak wins, the Clay Golem's (§299) post-round 1d6 check, the Iron-Eater's (§296) win-on-a-single-round-and-cumulative-SKILL-loss mechanic, the Chameleonite's (§239) on-horseback Attack Strength bonus, and the Werewolf's (§252) wounded-vs-unwounded outcome branch - all readable directly from the round log and applied by hand. book_enemies (65 rows, read from all 400 sections) uses the same .attack/.hp convention as every other FF sim; recurring creature types (five separate Goblin-quartet fights, three Orc encounters, two Rat Man/Wood Demon/Hellcat/Zombie/Dwarf pairs) are kept as separate rows disambiguated by section number. One STAMINA value is a source-scan defect rather than a best-guess reconstruction: the Vampire Bat (§257) prints literally as "STAMINA &" in the supplied scan (an ampersand where the digit should be); seeded as STAMINA 6, in line with the book's other low-tier single encounters.
        battlesim370.js    Battle simulator for book 370, Узурпатор! (The Usurper, Way of the Tiger 1) - not a Fighting Fantasy SKILL/STAMINA/LUCK sim; this book's own rules text ("ПРАВИЛА НА ИГРАТА"/"СРАЖЕНИЯ") uses three independent technique scores (удар с ръка/Hand, удар с крак/Kick, хвърляне/Throw, each starting at 0 and boosted once by an on-paper 1d6 chargen roll, free-entry rather than re-rolled here) plus a separate 5-count Shuriken resource with no score of its own. To-hit is 2d6 + the chosen technique's score against a per-encounter, per-technique enemy Defense value (the same named enemy is fought via different techniques on different branches, each with its own stated Defense, so all four Defense fields are free-entry per fight rather than looked up automatically beyond an initial autocomplete fill). On a Hand/Kick/Shuriken hit, damage is a re-rolled 1d6 added to the raw 2d6 to-hit roll (Kick adds a further flat +2); Throw deals no direct damage on a hit but grants an immediate free follow-up Hand or Kick attack (that attack's own Defense field, +2 damage on top of Kick's own +2 if it lands). Inner Force (starts at 5) may be spent before any roll to double the damage sum if the attack lands, lost regardless of outcome. Block, offered only after being hit, avoids the hit entirely on a 2d6 roll under the player's per-battle Defense; whether it succeeds or fails, the next attack's technique score takes a one-shot -2 penalty. Съдба (Fate) is explicitly narrative-only per the book's own text and isn't modeled. The rules state that a failed Throw reduces the player's defense for the enemy's counterattack but never give a number anywhere in the text or its two worked examples, so that reduction is left unquantified - the counterattack uses the player's normal per-battle Defense field. book_enemies (11 rows, read from ~30 in-story encounters across the rules' two worked examples and the full story text) reuses its four numeric columns non-standardly for this book's shape: .hp holds Издръжливост (confirmed identical across every branch of a given named enemy), .attack holds a representative starting Hand-strike Defense (an autocomplete-fill default only, re-entered per encounter), and .pb/.defense together reconstruct the enemy's damage formula as dice-count/flat-bonus. Призрак Бандит (§307/§313) never prints a damage line in the source text for either encounter; seeded at 1 die + 0 pending a source re-check.
        battlesim375.js    Battle simulator for book 375, Убиец! (The Assassin, Way of the Tiger 2) - same combat system as battlesim370.js (this book prints no rules section of its own, opening directly into story at §1 and assuming the reader already owns book 1's rules), confirmed identical from the in-story stat-block format itself ("[name] Защита срещу [техника] «[име]»: N Издръжливост: N Щети: N зар[+N]") rather than a rules recap. book_enemies (13 rows, read from all 25 in-story stat blocks): Първо/Второ бойно псе's Endurance is genuinely inconsistent across its three re-tellings (§268 gives 14/12, §284 gives 14/16, §327 gives a single dog at 12) despite all three branches leading to the same §353 - seeded at §268's 14/12 rather than guessing which telling is authoritative. Древен бог similarly shows 22 (§321) vs 26 (§333) across its two branches; seeded at 22. Хання, the story's antagonist, is deliberately NOT seeded - she has no Endurance/Defense stat block anywhere in the text and is defeated via a scripted Luck-gated mind-control check (§293/§390) followed by one specific dagger or Inner-Force-punch attack (§247/§298), not round-based combat. Крал на таласъмите's companion "Танцуващ меч" has a stated damage line but "-" for Defense/Endurance (can't be targeted directly); folded into the King's own encounter as a second passive attack rather than seeded as its own row.
        battlesim376.js    Battle simulator for book 376, Властелин! (The Overlord, Way of the Tiger 3) - same combat system as battlesim370.js/battlesim375.js, confirmed from this book's own ~20 in-story stat blocks (this book also prints no rules section of its own). book_enemies (10 rows): Първи/Втори телохранител is a simultaneous two-enemy fight (same shape as battlesim375.js's Battle Dogs) - player Defense drops to 6 while both are alive (blocking only one attack per round) and rises to 8 once one falls. "Рогат циклоп" appears as two distinct encounters under the same displayed name with different damage formulas and a different-named Kick move (§250/262 → §298, 2 dice damage; §322/334 → §70, 1 die+3 damage) - kept as two separate book_enemies rows ("Рогат циклоп" and "Рогат циклоп (втора среща)") rather than merged, since they lead to different destinations and aren't retellings of the same fight. Жрец на Немезида's Throw option (§128) is a scripted magical interrupt that always fails for a flat 2-damage cost, not a normal Defense-gated roll - left unmodeled (Def Throw=0, unused field) rather than forced into the roll-based shape. Нинджа с кусаригама's Throw option (§280) is a scripted instant win with no roll at all - same reasoning, unmodeled.
        battlesim377.js    Battle simulator for book 377, Завоевател! (The Conqueror, Way of the Tiger 4) - same combat system as battlesim370.js/battlesim375.js/battlesim376.js, confirmed from this book's own 17 in-story stat blocks (this book also prints no rules section of its own). One book-specific addition, a "нервнопаралитичен удар" (paralytic-strike) skill on the Хонорик fight adding a flat +2 damage on hit, explicitly mutually exclusive with Inner Force - not modeled as a separate toggle, since Inner Force's damage-doubling is strictly better whenever both are available, so a player holding both skills would never pick the weaker one; the sim's existing manual enemy-dmgBonus field can represent it by hand for that one fight if needed. book_enemies (5 rows): Пещерен трол appears as two distinct encounters under the same displayed name (§173/195/211 → §19; §337/347/357 → §411) kept as separate rows, same reasoning as book 376's двата Рогат циклоп. Both Пещерен трол rows and Изчадие на процепа reuse a single defKick field for two differently-named Kick moves each (e.g. «тигров скок» vs «вършачка на Куон») that share the same UI field - populated with the more frequently offered branch's value, the other branch's slightly different Defense must be hand-adjusted if simulating that specific branch. Старец's alternate "Скиптър" weapon option is folded into the Hand Defense field the same way, since the two options never differ in outcome shape. Изчадие на процепа's fight rules forbid Block entirely ("Не можеш да използваш блок") - not hard-enforced by the UI, a player simulating this fight should choose Take Hit instead of Block each time. Мардолх (§223) is excluded from the roster - an infinite-retry single opposed-roll check with no Mardolh Endurance value printed at all (unlike book 375's Мардолх, which has a full 30-Endurance stat block - the two are not the same encounter shape despite the shared name).
        battlesim378.js    Battle simulator for book 378, Пъкъл! (Hell!, Way of the Tiger 5, final book) - same combat system as battlesim370.js/battlesim375.js/battlesim376.js/battlesim377.js, confirmed from this book's own 20 stat-block-bearing sections (this book also prints no rules section of its own); no new climactic mechanic found. book_enemies (6 rows): Лорд Сайл, Вожд на Орковете (End 18, Dmg 1d+2, Def Kick=5/Hand=7). Кочияш орк/Втори орк/Трети орк - three orcs fought simultaneously as one scene (§162, same shape as book 376's paired bodyguards), kept as three separate rows since each has genuinely different stats (End 10/8/7, Def 6/5/5, Dmg 1d+1/1d/1d); the player's own combined Defense against all three (8) isn't stored in book_enemies, same as every other multi-enemy fight in this series - set manually per fight. Касандра (End 18, Dmg 1d+3 - source printed "1 зар + З", the "З" a Cyrillic/Latin-lookalike OCR misread of "3", corrected here) has Defense given only for Hand («ухапване на кобра») and Throw («водовъртеж»), both 8; a third Kick branch is offered in-story but never gets its own printed Defense value, so defKick is left at the field default rather than guessed. Тютчев (End 20, Dmg 2d+2) is fought across three narrative retellings of the same "three battles in a row" climactic duel (same shape as book 375's recurring Старец) with a single generic "Защита срещу Пътя на тигъра" Defense that applies to any of the three techniques equally - seeded into defHand only, since book_enemies has no all-technique column; defKick/defThrow must be set to match by hand if simulating those techniques specifically. Two of the three retellings state Defense 8, the third states 7 (with the player's own counter-defense listed as 9 instead of 8) - a minor source inconsistency, seeded at the majority value. Excluded from the roster: a recurring silver serpent-headed spear dodge/block sequence and every generic "Джудже-трол" (dwarf-troll) axe-fighter skirmish, neither of which ever prints an Endurance value - single opposed-roll checks, not HP-tracked fights, same judgment as book 377's Мардолх.

        battlesim78.js     Battle simulator for book 78, Бойните ровове на Крарт (The Battlepits of Krarth, "Кървав меч"/Blood Sword book 1 by Dave Morris & Oliver Johnson) - a genuinely different mechanic from every other sim in this app, read from this book's own "ПРАВИЛА НА ИГРАТА" rules section (frontmatter/source PDF, not reprinted in book_sections). Four attributes (Бойно майсторство/Fighting Prowess, Психически способности/Psychic Ability, Нюх/Awareness, Издръжливост/Endurance); only Fighting Prowess and Endurance are modeled - Psychic Ability (spell-resist checks) and Awareness (team-combat turn order) are both irrelevant to this app's solo 1v1 shape. Round is a single choice, not a per-hit reactive block like the Fighting-Fantasy-style sims: Attack rolls 2d6, hits if ≤ Fighting Prowess, then rolls 1-2 fixed damage dice + a flat bonus and subtracts the target's Armour Class (floor 0); Defend skips the player's own attack but forces the enemy to roll 3d6 (not 2d6) to hit instead, since three dice skew higher against the same Fighting Prowess threshold. Whichever side doesn't act still attacks back normally after an Attack round. Solo play uses this book's own fixed rank-VIII (lone-Adventurer) pre-generated character tables, one per class (Воин FP9/Dmg 3d+1/End48/Armour3, Тарикат FP8/Dmg 3d/End48/Armour2, Мъдрец FP8/Dmg 3d/End40/Armour2, Магьосник FP7/Dmg 2d+2/End40/Armour2) as a class-picker convenience default, not a randomly-rolled character - every field remains hand-editable after picking, same as every other sim here. book_enemies (26 rows, read from all 51 stat-block-bearing sections of 540 total) reuses its four columns non-standardly for this book's shape: attack = Fighting Prowess (the enemy's own to-hit stat, not a "Defense" value like every prior sim), hp = Endurance, pb = damage dice count, defense = damage flat bonus. Armour Class has no column to live in and is never autocomplete-seeded - it always resets to 0 on enemy pick and must be entered by hand per fight (documented per-enemy in the file's own header comment). Recurring generic encounters (the same named group fought at several different points in the dungeon crawl - Варвари, Убийци, both tiers of Скиапири, Лешояди-човеци, Гигантски паяк) are seeded once at a representative value rather than duplicated per section. Гигантът Скраймир is fought three times at genuinely different strength (70/28dmg-4d, 55/4d, 55/5d+6, the story reviving him twice at reduced power) - seeded at the first, strongest encounter; the two weaker rematches need manual adjustment. Имрагарн (§124, a resurrected NPC with a full stat block who joins the player's side) is excluded - a companion, not an enemy. Several enemies' special abilities (paralysis touch, poison bite, instant-kill critical, per-round spell checks) are documented in the header but not modeled, since this sim only tracks Fighting Prowess/Endurance/Armour/damage.

        battlesim107.js    Battle simulator for book 107, Демонски нокът (The Demon's Claw, "Кървав меч"/Blood Sword book 4 by Dave Morris & Oliver Johnson) - same mechanic as battlesim78.js (Fighting Prowess to-hit, Endurance hp, Attack-vs-Defend round choice, damage minus Armour Class), confirmed from this book's own book_frontmatter rules_text rather than assumed from book 78. Solo play uses this book's own rank-XVI pre-generated character tables (Воин FP10/Dmg 5d+1/End96/Armour3, Тарикат FP9/Dmg 5d+2/End96/Armour2, Мъдрец FP9/Dmg 5d+2/End80/Armour2, Магьосник FP9/Dmg 4d+2/End80/Armour2) - the intro text's prose statement of rank XVI for a solo Adventurer was trusted over a second, internally-inconsistent summary table a few lines later in the same OCR'd source (its numbers don't match the prose for any player count, not just solo); starting Armour Class per class carried over from book 78's equipment convention, not re-derived. book_enemies (26 rows, read from all 24 stat-block-bearing sections of 588 total) uses the same four-column reuse as book 78 (attack=Fighting Prowess, hp=Endurance, pb=damage dice, defense=damage bonus; Armour Class has no column, hand-entered per fight). Recurring named encounters retold at different strengths across the story (Седем-в-один, a 7-stage splitting idol boss with genuinely different stats at each of 7 tellings; Великанка; Хангак; Демон) are seeded at their first/most representative encounter, with the full spread documented in the file's own header comment for manual adjustment. Азидахака's printed damage ("12", no dice-count word, consistent across all 4 tellings unlike every other stat block in the book which always states "N зара") is a genuine data gap - seeded as 1 die + 11 flat rather than guessed as a specific dice count. Сузуриен and Язир's per-round random-action tables (sword vs. spell options) aren't modeled - seeded stats represent their plain melee option only.
        battlesim135.js    Battle simulator for book 135, Царство Уирд (Kingdom of the Weird, "Кървав меч"/Blood Sword book 2 by Dave Morris & Oliver Johnson) - same mechanic as battlesim78.js/battlesim107.js (Fighting Prowess to-hit, Endurance hp, Attack-vs-Defend round choice, damage minus Armour Class), confirmed from this book's own book_frontmatter rules_text, which explicitly cross-references book 78 as series book one and names book 107 as series book three in its own closing page. Solo play uses this book's own rank-XII pre-generated character tables (Воин FP9/Dmg 4d+2/End72/Armour3, Тарикат FP8/Dmg 4d+1/End72/Armour2, Мъдрец FP8/Dmg 4d+1/End60/Armour2, Магьосник FP8/Dmg 3d+2/End60/Armour2) - unlike book 107, this book's rank table is internally consistent, no garbled duplicate to cross-check against; starting Armour Class for non-Warrior classes still carried over from book 78/107's equipment convention since this book doesn't restate it per-class. book_enemies (31 rows, read from all 47 stat-block-bearing sections of 570 total) uses the same four-column reuse as books 78/107 (attack=Fighting Prowess, hp=Endurance, pb=damage dice, defense=damage bonus; Armour Class has no column, hand-entered per fight). Сталкер (the Stalker) is a recurring supernatural pursuer independently statted at nearly every encounter since the book's own text says its Endurance regenerates by magic between fights (End 50/40/31/30 across different tellings) - seeded at its most common value (40) with the spread documented in the file's own header comment. Дама в сиво (the Grey Lady) is a spell-only target with Psychic Ability/Armour/Endurance printed but no Fighting Prowess anywhere in the text - excluded from the roster entirely rather than seeded with a fabricated to-hit stat, since she can't be targeted by this sim's plain melee-attack shape.
        battlesim430.js    Battle simulator for book 430, Пламък над водата - a separate, independently created Bulgarian translation of the same underlying book as battlesim322.js (book 322, the English Project Aon "Fire on the Water"), not a duplicate import. Imported directly from a raw PDF (unlike most sims, which come from a pre-cleaned HTML draft) via a custom section-header parser - pdftotext's page-break form-feeds and line-wrapped choice text both produced false section-boundary matches, resolved by requiring a real header line to be heavily indented/centered (30+ leading spaces), which cleanly separated the 350 genuine headers from 18 false positives. Section numbering matches 1:1 with book 322 and this book's own worked example is identical to every other Lone Wolf sim's canonical one, so the Combat Ratio + Combat Results Table system and COMBAT_TABLE are reused unchanged. book_enemies (41 rows) cross-referenced directly against book 322's already-verified roster (same numbers at every matching section) with Bulgarian names read from this book's own text.
        battlesim204.js    Battle simulator for book 204, Scorpion Swamp (standard SKILL/STAMINA/LUCK system, reuses attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits verbatim, no Provisions mechanic since the source gives no starting quantity; adds an enemyStaminaFloor knob for the Giant's 6-STAMINA fight cap, a third simultaneous attacker for the Swamp Orc trio, three weapon/helmet SKILL toggles and two single-use consumables)
        battlesim216.js    Battle simulator for book 216, Sword of the Samurai (standard SKILL/STAMINA/LUCK system, reuses attackModifier/enemyWoundDamage/pairedFight/sideEnemy/sideEnemy2/winAfterHits/enemyStaminaFloor verbatim from books 200-204; sideEnemy2 covers the six-Skeleton fight, fought as two consecutive three-at-a-time rounds; winAfterHits=3 covers the Silver Samurai duel). Provisions ARE modeled here (10 meals, +4 STAMINA each, capped at Initial) since this book's own rules give both numbers. Two warrior-skill toggles from the book's own Special Rules: Iaijutsu (round 1 only, guaranteed 3-STAMINA hit, no roll, enemy doesn't strike back that round) and Ni-to-Kenjutsu (a raw 2d6 roll of 9+ on a landed hit earns one bonus attack that can miss but never risks a counter-wound, capped at one bonus per round). Honour is tracked as a plain counter alongside SKILL/STAMINA/LUCK, applied by hand per-section same as any other stat change. book_enemies (65 rows, read from all 400 sections) uses the same .attack/.hp convention as every other FF sim; several recurring encounters reached via more than one section share one row, confirmed by checking each pair's actual "if you win" destination.
        battlesim205.js    Battle simulator for book 205, Caverns of the Snow Witch (standard SKILL/STAMINA/LUCK system with Provisions and the potion-of-three-choices starting item, reuses attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits/enemyStaminaFloor verbatim; adds three recurring per-round checkboxes - a Banshee fear check every round, Ice Demon freezing gas, White Dragon freezing breath gated by a Gold Ring toggle - plus seven persistent SKILL/LUCK equipment toggles)
        battlesim206.js    Battle simulator for book 206, House of Hell (breaks from every other sim's Adventure Sheet shape: starts unarmed, Starting SKILL = Initial SKILL - 3, weapon bonuses added on top with no cap enforced either way per a flagged printed-rule ambiguity; adds a fourth stat, FEAR, Maximum = 1d6+6 with an instant-death check at Current >= Maximum; no Provisions/Potion, no paired-attacker mechanic - every multi-enemy encounter is sequential; two recurring per-fight checkboxes - Fire Sprite's baseline-3-STAMINA optional Test Your Luck wound override, Ghoul's 4th-wound-this-fight paralysis counter tracked independently of STAMINA; five persistent weapon toggles including a Kris Knife whose bonus is auto-selected from the currently picked enemy's name rather than a flat number)
        battlesim207.js    Battle simulator for book 207, Talisman of Death (standard SKILL/STAMINA/LUCK system with Provisions and the potion-of-three-choices starting item, reuses attackModifier/enemyWoundDamage/pairedFight/sideEnemy/winAfterHits/enemyStaminaFloor verbatim, plus book 204's sideEnemy2/tripleFight extension for its one three-way encounter; adds one recurring per-round checkbox - every landed hit also costs the enemy 1 SKILL, covering five separate encounters that print this rule explicitly; four persistent SKILL toggles for its ring/chainmail/sword/spear)
        battlesim208.js    Battle simulator for book 208, Space Assassin (no unified combat system - hand-to-hand/gunfire selected via a mode toggle, same shape as book 186; adds a fourth stat, ARMOUR, tested on every hit received in gunfire mode - 2d6 <= current ARMOUR negates the wound, ARMOUR always drops by 1 after the test regardless of outcome, identical mechanic to Test Your Luck; LUCK is tracked but never used by either combat system, also same as book 186; gunfire damage depends on the firing side's weapon - electric lash flat 2, assault blaster 1d6, unarmed 1; a "Deity fight (§308)" checkbox switches the enemy to a fixed six-weapon random-per-round table instead of one flat SKILL/weapon, including an instant-destruction weapon that still goes through the normal ARMOUR test rather than bypassing it; does not model the ~33-section vehicle wargame side-branch starting at §381 - a genuinely separate SHIELDS/STATUS/map mini-game the user chose to skip entirely)
        battlesim209.js    Battle simulator for book 209, Freeway Fighter (three combat types via a mode toggle - Hand Fighting/Shooting/Vehicle Combat - all sharing the same opposed 2d6+SKILL-or-FIREPOWER Attack Round; Hand Fighting alone has a dual win condition, 0 STAMINA (dead) or 6 cumulative STAMINA lost this fight (knocked out), tracked via playerHandLoss/enemyHandLoss separately from current STAMINA; Hand damage is an editable field, not fixed, since weapons override the book's default of 1 per-section; Shooting/Vehicle damage is automated 1d6; two independent stat pools - person (SKILL/STAMINA/LUCK, shared by Hand+Shooting) and car (FIREPOWER/ARMOUR) - shown side by side rather than toggled, each with its own round counter (roundsPerson/roundsVehicle) so switching modes mid-fight can't silently bypass the Med-Kit's mid-combat lock via the *other*, untouched pool, and Reset only rewinds whichever pool the current mode is using rather than wiping unrelated damage on the other one; a Fire Rocket button is an instant-kill alternative to a normal Attack Round in Vehicle Combat (4 carried); Med-Kit (10 packs, +4 STAMINA, blocked mid-fight) is the only combat-relevant consumable modeled - spike/oil canisters are tracked as plain use-counters since the book gives them no fixed combat formula, narrative-only like every other book's page-specific items)
        battlesim210.js    Battle simulator for book 210, Temple of Terror (standard SKILL/STAMINA/LUCK system, identical Test Your Luck table to book 198, closely reuses book 201's engine rather than inventing one fresh since the rules are the same shape; no potions or toggleable equipment in this book - checked explicitly, no "while worn/carried" persistent bonus exists anywhere in the text; a plain attackModifier knob covers the Mutant Orc's -2 Attack Strength penalty (sec 249, unless carrying a dagger); pairedFight/sideEnemy (reused verbatim from book 201) covers the Skeleton Warriors (sec 274) and the Sand Snapper's two Tentacles (sec 377) - both explicitly "attack separately, choose which one to fight," the side attacker never woundable; two toggleable per-round side-effects - Fiend's fiery breath (sec 216, 1d6 every round regardless of the main exchange, 1-2 costs 1 extra STAMINA) and Giant Firefly's electric shock (sec 339, 1d6 only on rounds the Firefly's own attack already won, 1-3 costs 2 extra STAMINA) - both Luck-eligible; Provisions (10, +4 STAMINA) and a plain Gold stepper, neither combat-relevant beyond Provisions' healing. Not modeled: sections 311/363, "Giant Eagle vs Pterodactyl," a spectator battle between two NPCs the player never participates in - resolved and read, not fought, so it doesn't fit a player-vs-enemy sim)
        battlesim211.js    Battle simulator for book 211, The Rings of Kether (three combat systems, none the plain single-opposed-roll shape most other sims use: Hand-to-Hand is the one exception, standard opposed 2d6+SKILL/flat 2 damage, but this book never ties Luck to combat at all - no Luck-queue mechanism exists in this sim, unlike most others, LUCK is tracked purely for narrative page prompts; Blaster Combat and Ship-to-Ship both use independent rolls instead of an opposed roll - each side rolls 2d6 against their own SKILL/WEAPONS STRENGTH separately (roll < stat = hit), not "higher wins" - Blaster flat 4 STAMINA, Ship flat 1 SHIELDS; Smart Missiles are an alternative to a normal round with an editable damage field (default effectively "always destroys") rather than a hardcoded instant-kill, since the one stationary-target fight in the book (Asteroid Defences, sec 312) explicitly caps missile damage at 2 SHIELDS instead; two independent stat pools - person (SKILL/STAMINA/LUCK, shared by Blaster and Hand-to-Hand) and ship (WEAPONS STRENGTH/SHIELDS) - each with its own round counter and Reset scope, applying book 209's fix for that bug class from the start instead of finding it the hard way again; Energy Tablets (4, +6 STAMINA) and a plain Money/kopecks stepper. Not modeled: section 50's one-off "if your ship is destroyed, roll a die - even means eject and survive" - a single narrative branch, not a repeatable mechanic)
        battlesim212.js    Battle simulator for book 212, Seas of Blood (one combat engine reused across two independent stat pools rather than a mode-specific engine per pool - the book's own rules explicitly state Individual Combat and Large-scale Battles are the same procedure, substituting CREW STRIKE/CREW STRENGTH for SKILL/STAMINA: simultaneous opposed 2d6+attack roll each side, higher wins, flat 2 damage to the loser, ties miss both ways; no Test Your Luck anywhere in combat, LUCK is narrative-only, same situation as book 211; person (SKILL/STAMINA/LUCK) and crew (CREW STRIKE/CREW STRENGTH) pools each have their own enemy tracker and round counter so Reset/mode-switch can't touch the untouched pool; a permanent Awkmute's-staff toggle (won sec 63, kept sec 125) changes a landed personal-combat hit: 1d6, 1-2 costs the opponent 1 SKILL instead of the normal 2 STAMINA, hidden in Crew Battle mode since it's a personal weapon; an Escape button in Crew Battle mode costs a flat 2 CREW STRENGTH per the book's own rule, no equivalent exists in Individual Combat)
        battlesim213.js    Battle simulator for book 213, Appointment with F.E.A.R. (standard SKILL/STAMINA/LUCK system, no Potions/Provisions at all - not in this book's rules; two things unique to it: an enemy reduced to exactly 0 STAMINA in one blow is an automatic kill (-1 Hero Point, no choice offered), but one reduced to 1-2 STAMINA instead pauses the fight (pendingSurrender) with a real choice - Capture (win, no penalty), Finish (win, -1 Hero Point), or Keep Attacking (clears the pause, a later hit landing on 0 triggers the automatic-kill case) - Hero Points otherwise a plain running counter awarded by hand for narrative "+N Hero Points" text; a Super Power picked once at roll time (not a branching chargen system) - Super Strength fixes Initial SKILL to 13 instead of rolling it, Energy Blast gets a pre-fight-only "Attempt" button (-2 STAMINA, 2d6 vs SKILL, hit = instant win/stun) and Psi-Powers gets an anytime-outside-combat "Use" button (-2 STAMINA), ETS has no described combat mechanic; a forceLossAfterRounds knob is note-only (no auto-resolution, the actual consequence is book-text-dependent and varies by encounter) for three fights that force a non-combat story branch after a fixed round count and one (unarmed Titanium Cyborg, sec 87) that's unwinnable by design; the Radiation Dogs' d6 hit-effect table, the Serpent's poison bite, the Ice Queen's SKILL-freeze, and Sidney Knox's mind-battle (a temporary 6-point "mental STAMINA" pool distinct from the player's real one) are all noted in that enemy's book_enemies name rather than built as bespoke mechanics, same "apply narrative one-offs by hand" precedent as every other sim; §87's SKILL 15 is unverified - never appeared in the user's scan-verified combat report, only in an earlier OCR read ("SKILLIS") - flagged in its own book_enemies name)
        battlesim214.js    Battle simulator for book 214, Rebel Planet (standard SKILL/STAMINA/LUCK system, no Potions/Provisions or Hero Points/Super Powers - not in this book's rules, one of the leaner sims as a result; two things worth real mechanics rather than a one-off note - a Tail attack toggle (several Arcadians can swipe regardless of the round's normal result: an extra d6/round, 5-6 = flat 2 STAMINA, independent of the main Attack Strength roll since the book describes it as happening "whatever the result of that Attack Round otherwise"; §136's variant only fires every OTHER round, noted in its own book_enemies name rather than a second toggle) and an Escalating damage toggle (the Street Fighter robot, sec 190 only - each successive successful hit costs 1 more STAMINA than the last, 2/3/4/..., tracked via enemyHitStreak; LUCK still reduces each hit by 1 through the same Test Your Luck queue every other sim uses, no separate handling needed). Not modeled, all noted in book_enemies names instead: the Scabrok's three pre-fight-modified stat lines (sec 106 full, sec 133/341 reduced by a Luck test the player takes before opening the sim), the Central Arcadian's one-time post-first-wound SKILL debuff (sec 243), the Brawler's unarmed "sudden death rule of p. 24" (rule text unavailable to cross-check), and several fights whose book-text outcome branches on wound *count* rather than STAMINA reaching 0 (sec 17, 298) - all book-text-dependent, informational-only in the log, same "sim is convenience, not enforcement" precedent as every other sim)
        battlesim215.js    Battle simulator for book 215, Demons of the Deep (standard SKILL/STAMINA/LUCK system, its 37 combat sections split into 53 book_enemies rows - the densest roster built so far, since sequential "First X, Second X..." fights need zero extra code: the player just re-picks the next enemy from the autocomplete after each kill, same as switching enemies mid-session in any other sim, and STAMINA-threshold alternate endings need none either since the enemy's live STAMINA is already visible on screen. The genuinely one-off puzzle mechanics - the Bone Demon's three-arm target-choice fight, the Sea Ogre's STAMINA carryover between its two encounters, the ally Dolphin's die-roll targeting, the "always 2 active" pirate gauntlet, Cyrano's win-by-3-wounds duel, and the Sea Hag's d6-branching curse - are all noted in their book_enemies names rather than built as bespoke mechanics, same "apply narrative one-offs by hand" precedent as every other sim. One thing did get real code: Swiftstinger, a one-time-use thrown dagger (found sec 263, usable in any later fight) that auto-wins its round with no dice rolled and deals a flat 10 STAMINA, modeled as a toggle plus its own button since it's a discrete numeric mechanic reusable across the whole book)
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
      main.js            Single-line entry point: `import './boot.js'`
    avatars/         Uploaded user avatar images (auto-created, git-ignored)
    covers/          Uploaded book cover images (auto-created, git-ignored)
    attachments/     Uploaded message/post attachments (auto-created, git-ignored)
    mobile/          Separate reading-only frontend, served by GET /mobile (open to any logged-in
                     user - see server.js). Its own index.html/css, deliberately doesn't import
                     boot.js or most of public/js/ - see "Mobile reader" below for the reuse boundary.
      index.html       Shell: login screen + #screen mount point. Links confirm.css/autocomplete.css/
                       equipment.css/battlesim.css from public/css/ directly (reused as-is, not
                       copied) alongside its own mobile/css/style.css. Has a hidden #m-sim-btn-row
                       sink div for getPlayBtnRow()'s fallback (see charsheet.js). Links its own
                       manifest.json (start_url: "/mobile") rather than public/manifest.json
                       (desktop's own, start_url: "/"); both are display: "standalone". Both
                       manifests' icons array pairs a plain "any"-purpose favicon.svg with a
                       "maskable"-purpose icon (public/mobile/icon-maskable.svg, shared via an
                       absolute path) - the maskable icon's artwork is scaled to ~65% and centered
                       to stay within the spec's 80%-diameter safe zone.
      css/style.css    Mobile-first styles: login, book reader panes, tool row, notebook modal, toast.
                       html/body set overscroll-behavior-x: none, opting the whole page out of
                       Chromium/Brave-on-Android's built-in edge-swipe back/forward gesture, since
                       graph-view.js's own canvas panning competes with the browser's native
                       gesture recognizer for the same horizontal touch-drags.
      js/
        app.js             Tiny screen router (login/reader), admin-gate check via GET /api/profile
                           (same response also feeds currentUserLevel/bonusUndos/bonusFastTravels
                           into state.js, same fields boot.js's own profile fetch sets). Shows a
                           spinner (.m-loading-full) immediately, before its two sequential round
                           trips (GET /api/profile, then GET /api/books).
        auth.js            Login form
        reader.js          The "double-screen" play view - top pane is in-app reading (own
                           minimal commitChoices/startPlaythrough/undoRun/fast-travel/
                           endPlaythrough, not play.js's), bottom pane is always the graph. Owns
                           pane orchestration, section navigation, and playthrough lifecycle only -
                           the long-press context menu, its note editor, and the toolbar's Fast
                           Travel dialog are each their own module (context-menu.js/note-modal.js/
                           fast-travel-dialog.js below), wired in via a `hooks` object
                           ({ checkXpReward, maxFastTravels, doFastTravel }) passed on each call
                           rather than those files importing reader.js back, avoiding an import
                           cycle. Two tool rows between the panes hold Undo/Fast Travel (own local
                           reimplementations, same level-based credit formula as play.js) above
                           Notebook (always) and Battle Sim (only if battlesim-dispatch.js has one
                           for this book); a third row (Win/Loss/Battle Death, hidden until the run
                           has taken its first step) mirrors play.js's endPlaythrough() - for when
                           the book's own text ends a run without linking a numbered 0/-1 choice, or
                           for Battle Death specifically, which never has an in-text link at all
                           (the outcome comes from a battle sim, not the book). Battle Death's own
                           click handler also sets the current node's battle flag directly (same as
                           play.js's battle-death-btn handler) before calling
                           _endPlaythrough('battle'), which makes the node get graph-view.js's
                           battle-cross overlay. A plain tap on the graph never advances pt.path,
                           even onto an adjacent already-known choice - real navigation only ever
                           happens by tapping a choice's in-text link (or via the context menu's
                           Fast Travel). Tapping the node the reader is actually standing on just
                           shows that section live (same as _returnToCurrent) - anything else opens
                           a read-only preview, and only for a node in pt.mVisited (every section
                           ever actually read this run, permanent - unlike pt.path, which undo
                           shrinks); tapping an unvisited node is a no-op, and an in-text link
                           inside a preview that points at an unvisited section previews it in turn
                           rather than chaining straight into it.
                           mVisited is mobile-only - desktop's play.js never touches it - so it's
                           reconciled against the live pt.path (which both platforms do keep
                           current) on every load.
                           _showSection() commits and saves the newly-discovered section's own
                           choices itself (a second saveState(), separate from _navigate's own
                           save which fires before the section fetch resolves).
                           Two topbar icon toggles (text-lines/graph-nodes) switch between
                           the default 50/50 split and a single pane at full height (_paneMode:
                           'both'|'text'|'graph', toggling itself off returns to 'both') - the tool
                           rows stay visible in every mode. Switching out of text-only mode re-runs
                           refreshGraph() to recenter against the graph pane's now-visible size.
                           Reveal-on-arrival XP is awarded server-side fire-and-forget, and desktop
                           learns about it via a live SSE push (livetab.js) reader.js deliberately
                           doesn't import - reader.js instead caches the last-known XP total (seeded
                           on mount via GET /api/profile) and re-checks it 750ms after any save that
                           could have earned XP, firing toast.js if it went up, including after
                           priority/battle/note edits and Win/Loss/Battle Death, not just navigation.
                           Multiple checks within the same 750ms window collapse into one poll
                           (_xpFlushTimer); if a second award resolves while the toast from an
                           earlier one is still visible, the new amount is added to it and the
                           display timer restarts, rather than one replacing the other - same
                           accumulate-then-show pattern rewards.js's own floater queue uses on
                           desktop, adapted to toast.js's single-message display. The accumulated
                           total and its display-window deadline both reset at the top of
                           renderReader(), scoped per book session rather than persisting globally.
                           Section cache and prefetch: mirrors liveread.js's own _sectionCache/
                           _prefetchChoices pattern (see that entry below for the full reasoning) -
                           a plain in-memory Map keyed by section id (bare id, not bookId:sec, since
                           renderReader() already clears the whole cache on every fresh book open
                           instead of scoping the key itself). _showSection()/_previewSection() both
                           check it before fetching, and _showSection() fires an unawaited
                           _prefetchChoices() after every successful render for whatever the section
                           links to next - so the loading spinner only shows on a genuine cache miss
                           (in steady state, only the very first section of a run) rather than on
                           every single navigation.
        context-menu.js    Long-press node context menu (vis-network's 'oncontext', which mobile
                           browsers already raise on touch-and-hold - same event desktop's own
                           right-click menu uses). Same 4 actions as desktop's #node-ctx-menu that
                           make sense read-only: Edit note (opens note-modal.js), Priority, Fast
                           Travel, Toggle battle - own local reimplementations of play.js's/boot.js's
                           note/priority/battle logic. Unlike the toolbar's own Fast Travel dialog
                           (fast-travel-dialog.js, still the full high/shortest/normal/low + manual
                           section entry), this menu's Fast Travel is a one-tap shortcut straight to
                           the shortest route to the held node, no submenu. The menu clamps itself
                           on-screen against the viewport on open, and re-clamps whenever the
                           Priority submenu expands. Exports pruneDiscovered() (same "worth keeping"
                           check as boot.js's own _pruneDiscovered/play.js's
                           _cleanupOrphanedTargets/graph.js's orphan-pruning pass) - note-modal.js
                           imports it for the same reason its own save handler needs it.
        note-modal.js      Per-node note editor, opened from context-menu.js's Edit note action.
                           Desktop's openNoteModal (play.js) targets #note-modal-* elements that
                           don't exist here, so this is its own small modal rather than an import,
                           same reasoning as fast-travel-dialog.js.
        fast-travel-dialog.js  The toolbar's Fast Travel dialog: numeric section entry +
                           high/shortest/normal/low path-preference modes, same shape as desktop's
                           showFastTravelDialog()/doJump() rather than a mobile-native tap-to-arm
                           flow - desktop's dialog is genuinely the wanted UX here, not a
                           compromise. Reuses graph.js's canReach/findPathTo indirectly (via
                           reader.js's own doFastTravel, passed in as a parameter - this file
                           doesn't import graph.js itself) behind .inv-overlay/.inv-modal (already
                           linked via equipment.css) and its own .ft-qty-* stepper instead of
                           desktop's .cs-num-wrap/.ft-dialog-* (neither of which mobile links).
        graph-view.js      Mobile's own vis-network wrapper - graph.js isn't reused (desktop-DOM-
                           coupled, reads localStorage at module top level). _bfsDepth() (backs
                           _layout()'s BFS-depth grid) stores depth in a plain object, not a Map -
                           a Map's has()/get() are type-strict (number 88 and string "88" are
                           different keys) where a plain object's key access always coerces to
                           string, same reasoning _computeOutcomes() below already uses. Belt-and-
                           suspenders alongside state.js's own discoveredSectionsFor() normalizing
                           every choices-array entry through parseSecId before it reaches this
                           file's sections list. Node colour uses
                           pt.mVisited for the "visited" state, not the live pt.path, so undoing a
                           step doesn't un-paint a node the reader already actually read. Its own
                           fallback color for a node not otherwise highlighted mirrors graph.js's
                           mapped-vs-discovered branch exactly (state.graph[id].discovered, set only
                           by a context-menu/note-modal action creating a metadata-only placeholder
                           node, never by commitChoices itself) - COLORS.mapped (purple) is the
                           normal color for a genuinely-read node, COLORS.discovered (grey) the rare
                           placeholder-only exception, same as desktop. Priority/
                           battle/note markers are a separate 'afterDrawing' canvas overlay, same
                           split as desktop's own drawOverlays() (graph.js) - vis-network's own
                           node `color` never reflects them on either platform. Reuses graph.js's
                           exact glyph geometry/colours (triangle/cross/book-icon) so a node reads
                           the same regardless of which platform its metadata was set on. Node
                           dragging is enabled (`interaction.dragNodes: true`) and always snaps to
                           GRID_SIZE (40, matching graph.js's own constant) on drop - no toggle, one
                           behavior always. A drag's own start hides the long-press context menu
                           (initGraphView's 4th param), since the same touch that opens the menu can
                           continue straight into a drag. The zoom-reset signature (_computeSig,
                           shared between refreshGraph and the drag handler) is refreshed
                           immediately after a drag, so a manual reposition keeps the player's
                           current zoom level rather than being read as a map-shape change on the
                           next refreshGraph() call.
        notebook.js        Plain per-book notebook - same GET/PUT /api/books/:id/notebook data as
                           desktop's notes.js, deliberately without desktop's "pin to play area"
                           toggle (nothing to pin to on mobile). Reads the save response's
                           xpAwarded flag and fires toast.js on success - desktop's own feedback
                           for this same event is quieter still (just refreshes the header XP/coin
                           counter via notes.js's setOnXpAwarded), but mobile has no persistent
                           counter to refresh, so a toast is the closer equivalent.
        toast.js           Minimal auto-dismissing toast - mobile's reward-feedback mechanism,
                           used both by notebook.js's own xpAwarded flag and by reader.js's
                           polled XP-diff check for ordinary reveal-on-arrival XP while reading,
                           not an attempt at porting rewards.js's full floater animation
        battlesim-dispatch.js  bookId → battle-sim lookup table, one entry per book that has a
                           sim. Dynamically imports the specific battlesim*.js module, calls its
                           init function once, then clicks its already-wired trigger button
                           (found by id) rather than needing each file's differently-named "open"
                           function. Add one line here per future battlesim*.js.
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
  confirm.js     ← i18n.js
  autocomplete.js ← state.js
  user.js        ← state.js

Layer 2:
  inventory.js   ← state.js, play.js*, charsheet.js
  equipment.js   ← state.js, inventory.js, charsheet.js
  play.js          ← state.js, graph.js, charsheet.js, inventory.js*, equipment.js*, i18n.js, confirm.js

  * three-way cycle: equipment.js → inventory.js → play.js → equipment.js
    Works because none consume each other's exports at module-evaluation time.

Layer 3 (feature modules - import from layers 0–2 as needed):
  notes.js, battlesim829.js, battlesim8.js, battlesim286.js, battlesim198.js, battlesim199.js, battlesim200.js, battlesim186.js, battlesim201.js, battlesim202.js, battlesim203.js, battlesim83.js, battlesim86.js, battlesim114.js, battlesim115.js, battlesim123.js, battlesim130.js, battlesim92.js, battlesim108.js, battlesim216.js, battlesim193.js, battlesim217.js, battlesim526.js, battlesim322.js, battlesim323.js, battlesim324.js, battlesim325.js, battlesim122.js, battlesim80.js, battlesim82.js, battlesim118.js, battlesim218.js, battlesim219.js, battlesim220.js, battlesim221.js, battlesim222.js, battlesim430.js, battlesim204.js, battlesim205.js, battlesim206.js, battlesim207.js, battlesim208.js, battlesim209.js, battlesim210.js, battlesim211.js, battlesim212.js, battlesim213.js, battlesim214.js, battlesim215.js, auth.js, add-book.js, edit-book.js,
  books.js, covers.js, feed.js, open-world.js, shop.js, profile.js,
  public-profile.js, prefs.js, livetab.js, notif.js, rewards.js, bg.js,
  stats.js, party.js, tips.js, inbox.js, dice.js, tooltip.js, export.js,
  feedback.js, demo.js

  All 48 battlesim*.js files import confirm.js (for showAlert) and
  charsheet.js (for getPlayBtnRow) - never play.js directly, even though
  every trigger button they create still ends up in the same #play-btn-row
  play.js's other panels use. This is what lets public/mobile/'s reader
  dynamically import a single battlesim*.js module in isolation without
  pulling in play.js/graph.js/vis-network at all - see public/mobile/js/
  battlesim-dispatch.js below.

Layer 4 (top):
  boot.js   ← imports all of the above
  main.js   ← imports boot.js only (single line)
```

`index.html` loads `js/main.js` as `type="module"`. The vis-network library is loaded via CDN as a global (`vis`) before the module script runs.

**No cache-busting query strings.** Static `.js`/`.css` are served with `Cache-Control: no-cache` (see `server/static.js`) - the browser revalidates with the server on every load (an ETag-backed 304 if unchanged), so a plain refresh always picks up a new deploy. No `?v=N` versioning scheme is needed or used.

---

## CSS file structure

`style.css` holds only genuinely shared/base rules (tooltips, buttons, inputs, scrollbars, generic layout not owned by any one module). Everything else is a per-module file (one per like-named JS module, e.g. `shop.css` for `shop.js`). `public-profile.css` is shared by both `public-profile.js` and `covers.js` (cover activity view lives in the same `#public-modal` markup both use).

**Load order matters for two files:** `reduce-motion.css` and `mobile.css` are cross-cutting overrides (`body.reduce-motion .foo`, `@media` blocks, several with `!important`) rather than one module's own styling, so they're the last two `<link>` tags in `index.html`, after every per-module file.

**"Something's waiting for you" pulse convention:** every decorative infinite pulse that means "you have something to claim/read/check" runs at the same `4s ease-in-out infinite` rate - `#notif-btn`/`#forum-btn`/`#inbox-btn`'s `notif-pulse`, `#bonus-gc-btn`'s `bonus-gc-pulse`, `.shop-btn--spendable`'s `shop-btn-pulse`, and `#covers-sort-label`/`#covers-kind-label`'s `covers-sort-flash` (the original rate all the others were synced to). Each is its own `@keyframes` (different visual effect - box-shadow ring, glow, opacity flash) but the timing is deliberately shared so multiple pulsing elements on screen at once feel like one consistent UI language rather than a handful of independently-tuned animations. All are gated behind `body.reduce-motion` in `reduce-motion.css`, **except** `#mobile-books-btn`'s `mobile-books-pulse` and `#mobile-addbook-btn`'s `mobile-addbook-pulse` (both mobile-only, `mobile.css`) - those two are the only way into My Books/Add Book on mobile at all, not a decorative extra, so they deliberately keep pulsing with animations otherwise turned off; `reduce-motion.css` never references either id. `mobile-guest-pulse` and `create-public-pulse` already ran at 4s independently (separate CTA-style pulses, not "something's waiting") and weren't touched; the login-page's 60s background-graph animation is unrelated decoration and also untouched.

**Full-viewport mobile modals** declare `height: 100vh` (or `max-height`) followed immediately by `100dvh` (dynamic viewport height, which tracks the browser's actual visible area as the address bar shows/hides). Applies to `#forum-modal` (`charsheet.css`) and `.pub-modal`/`.pub-modal--run`/`.modal-inner`/`#stats-modal` (`mobile.css`).

Each JS module's own "how to remove this module" header comment points at its own CSS file.

`server/runtime-state.js`'s `computeCodeStats()` (feeds "Lines of code"/"Code size"/"JS modules" in Stats for Nerds) scans `server/`, `public/js/`, `admin/js/`, `test/`, `public/mobile/js/`, `public/css/`, `public/mobile/css/`, plus `server.js` and the top-level HTML files (`public/index.html`, `public/guide.html`, `public/mobile/index.html`, `admin/*.html`), dynamically rather than from a hardcoded file list. `walkJsFiles()` matches both `.js` and `.mjs` (so `test/*.test.mjs` counts). `test/` and `public/mobile/` each have their own inner `try/catch`, separate from the outer one wrapping the rest of the function.

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

`feedback.js`'s feed-card HTML uses inline `onclick="toggleFeedbackCard(this)"` (built via
`innerHTML` templates), which resolves against `window`, not module scope - the file exposes
`window.toggleFeedbackCard = ...` at the bottom (and two more for its sibling handlers).
Everything else in the codebase uses `addEventListener` instead.

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
| GET | `/api/app-xp` | Auth required, and 403 unless `db.canSeeAppXp(userId)` (true for the admin, plus a standing one-off exception for sashii) - powers both the "App" XP widget and the "Avg User Level" widget on the Books screen. → `{ users, level, title, xp, levelXp, nextLevelXp, xpFromBoost, xpBoostPct, heartbeatRatePerMin, sumLevels, minLevel, maxLevel, avgLevel, avgLevelTitle, avgLevelFraction, levelsNeededForNextAvg }`. See `db.getAppXpSummary()` and `app-xp.js`. |
| GET | `/api/app-xp/stream` | Admin-only SSE stream (token via `?token=`, 403 unless `db.isUserAdmin`) - pushes `{ username, xpDelta? , coinDelta? }` whenever any other user earns XP or GC, powering the live floaters. See `db.setAppXpHook()` and `app-xp.js`. |
| GET | `/api/public/books` | All public non-demo top-level books and anthologies → `[{ id, name, coverUrl, createdAt, authors, isContainer, totalSections, description, isbn, issn, asin, pages, seriesName, seriesNumber, childNames[] }]`. No auth required. Used for the public covers search and the Create Book / Create Anthology autocomplete. |
| GET | `/api/public/user/:username` | Public profile for a user (only if `public_profile` is set) → `{ username, avatarUrl, books: [{ id, name, runs }] }` |
| GET | `/api/public/book/:id/run/:index` | Public run data - only accessible if the run has `isPublic: true` → `{ bookName, graph, positions, totalSections, run, allVisited, endNodes }`. `allVisited` is the union of all sections visited in any of the user's runs for this book (so nodes from other runs appear in the chart). `endNodes` is `[{ id, result }]` for the final node of each other completed run (for overview-mode coloring). `run.result` can be `'death'`, `'battle'`, or `'success'`. |
| GET | `/api/public/covers` | Public cover-backed items used by the covers wall. Returns books and anthology containers that have uploaded covers → `[{ id, name, isbn, issn, asin, coverUrl }]`. Series cards are built client-side from `GET /api/public/books` + `GET /api/public/series`. |
| GET | `/api/public/stream` | SSE stream for public catalog changes. Emits `public_catalog_changed` when a public book, anthology, or series is created, updated, or deleted so the public covers wall can refresh without polling. |
| GET | `/api/user/stream` | Authenticated SSE stream for live badge refresh hints. Token is accepted as `?token=<bearer>` because `EventSource` cannot set headers. The client refetches badge endpoints when an event arrives. |
| GET | `/api/public/book/:id/activity` | Public activity for a book and all ISBN/ISSN siblings → `{ book: { id, name, totalSections, coverUrl, isbn, issn, asin, pages, authors, description, isPublic }, entries: [...] }`. Only runs explicitly marked `isPublic: true` are included. `isPublic` indicates whether the book can be added to other users' libraries. |
| GET | `/api/books` | List user's books → `[{ id, name, total_sections, discoverable_sections, isbn, issn, asin, cover_path, pages, authors, description, created_at, created_by, is_public, visited, series_id, series_number, series_name, is_container, parent_book_id, book_order, bgHidden, bgPosY, extra_anthology_ids, extra_anthology_orders }]`. `visited` is the count of unique (normalized) section numbers across every playthrough's `path` plus any mapped graph node - see the Books List progress bar section below for the exact computation. Computed server-side by parsing `state_data`. `series_name` is joined from the `series` table. `bgHidden`/`bgPosY` come from `user_books.bg_hidden`/`user_books.bg_pos_y`. `extra_anthology_ids` is the book's *secondary* anthology memberships (see `book_anthology_memberships` below) - `parent_book_id` remains the one primary anthology. `extra_anthology_orders` is `{anthologyId: book_order}` - each secondary membership has its own order scoped to that anthology, distinct from the book's own `book_order` column (which is only its position within its *primary* parent). |
| POST | `/api/books` | Create book → `{ id, name, total_sections, isbn, issn, asin, pages, authors, description }`. Sets `books.created_by` to the creating user's ID. Accepts optional `is_public`, `series_name` (string, resolved to `series_id` via `getOrCreateSeries` with `addToLibrary=true`), `series_number`, `is_container`, `parent_book_id`, `book_order`. Normal books require a minimum of 5 sections; when `is_container` is true, `total_sections` is stored as 0 and the minimum is skipped. |
| PATCH | `/api/books/:id` | Update book metadata (name, total_sections, isbn, issn, asin, pages, authors, description, discoverable_sections, is_public, series_name, series_number, is_container, parent_book_id, book_order). **Creator-only** (or admin). `series_name` is resolved to `series_id` via `getOrCreateSeries`; pass `null`/empty to clear. When `is_container` is true, `total_sections` is stored as 0 regardless of the sent value. When `discoverable_sections` changes, retroactive XP is awarded to all users of the book. |
| POST | `/api/books/:id/anthology-members` | Add a book as a *secondary* member of anthology `:id` → `{ book_id, book_order? }`. **Anthology creator-only** (or admin). |
| DELETE | `/api/books/:id/anthology-members/:bookId` | Remove `:bookId`'s secondary membership in anthology `:id`. **Anthology creator-only** (or admin). |
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
| POST | `/api/notifications/seen` | Mark the most recent 25 unseen notifications as seen (same window `GET /api/notifications` returns) → `{ ok: true }`. |
| POST | `/api/attachments` | Upload a file attachment (auth required). Body: raw binary; `Content-Type: application/octet-stream`; original filename in `X-Filename` header (percent-encoded). Max 64 MB. Returns `{ id, filename, original_name }`. The file is written to `public/attachments/` as `att_{userId}_{timestamp}{ext}`. Accepted types: images (JPEG/PNG/GIF/WebP/AVIF), PDF, ZIP/7z/RAR/GZIP by magic bytes; plain text extensions (.txt .md .csv .json .xml) by extension. Client images larger than 512 KB are JPEG-compressed before upload. JPEG magic bytes override extension to `.jpg`. The returned `id` must be included in a subsequent submit call's `attachment_ids` to link the file; unlinked uploads are orphaned. |

`notes.js`'s document-level Escape listener checks `#confirm-overlay` (the alert/confirm dialog's overlay) first and yields to it if active, rather than closing whatever modal sits underneath it (e.g. the notebook editor).

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
| POST | `/api/shop/purchase` | Purchase a shop item. Body: `{ item: 'xp_boost' \| 'heartbeat_xp' \| 'undo' \| 'fast_travel' \| 'gc_chance' }`. Returns `{ ok, newBalance, ...profileFields }` with full updated XP/shop info. `402` if insufficient coins, `400` if invalid item, `403` if purchase cap reached. |
| POST | `/api/shop/claim-gc` | Claim a pending bonus GC (see "Bonus GC lottery" below). `404` if none is currently pending, `403` if impersonating. Returns `{ ok, ...profileFields }`. |

**Gold Coins:** `floor(xp / 1000) + bonus_coins - coins_spent`. Base GC is still derived from XP, but `bonus_coins` stores one-time extra GC rewards that do not affect XP. Balance is shown in the books screen header and in the shop modal.

**Shop items:**

| Item | Cost | Effect | Purchase cap |
|------|------|--------|--------------|
| `xp_boost` | dynamic: next purchase costs `purchased_count + 1` GC | +0.1% to all future XP permanently (`xp_boost_pct += 1` tenth) | `lvl` purchases (= `lvl × 0.1%`) |
| `heartbeat_xp` | dynamic: next purchase costs `current bonus + 1` GC | +0.1 base idle heartbeat XP permanently per purchase (`bonus_heartbeat_xp += 1` purchase counter) | `lvl` purchases (= `lvl × 0.1 XP`) |
| `undo` | dynamic: `(bonus_undos + 1) * 3` GC | +1 undo per run permanently (`bonus_undos += 1`) | 1 per 10 levels |
| `fast_travel` | dynamic: `(bonus_fast_travels + 1) * 5` GC | +1 fast travel per run permanently (`bonus_fast_travels += 1`) | 1 per 10 levels |
| `gc_chance` | dynamic: next purchase costs `purchased_count + 1` GC | +0.01% chance per XP event of a bonus GC appearing (`bonus_gc_chance_purchased += 1`) | `lvl` purchases (= `lvl × 0.01%`, same ceiling as the base level-based chance - see below) |

Caps are enforced in `purchaseShopItem` - returns `{ error: 'cap_reached', cap, level, item }` (→ `403`) when the user's purchased count equals the cap. Existing purchases above the cap are grandfathered. XP boost cap uses `xp_boost_pct - level` (purchased tenths). Heartbeat XP and bonus GC chance caps use their own purchased-count column directly (`bonus_heartbeat_xp`, `bonus_gc_chance_purchased`). Undo and fast travel cap uses `undoFastTravelCap(level)` - 1 purchase per 10 levels (level 0-10 → 1, 11-20 → 2, 21-30 → 3, etc: `floor((max(level,1)-1)/10)+1`). Mirrored client-side in `shop.js` as `_undoFastTravelCap` for correct "Max" button state - keep both in sync if the formula changes.

**Bonus GC lottery** (`_rollBonusGc`/`claimBonusGc` in `xp.js`): every genuine XP event (gated on the same `xp_events` dedup insert's `r.changes > 0` that guards level-up processing - so repeated calls for an already-recorded event/ref never roll twice) rolls a chance of a bonus gold coin appearing: `(level + min(bonus_gc_chance_purchased, level)) × 0.0001` - 0.01% per level, plus up to another 0.01% per level from purchases, uncapped on the level side (deliberately - the purchased half is what's capped, at parity with the free half). Rolls happen for every event type including `idle_heartbeat`, and the roll itself is skipped entirely (not just discarded) while a coin is already pending - only one can be waiting at a time. A successful roll just sets `users.pending_bonus_gc = 1`; nothing else changes about the current request. `_rollBonusGc` takes `pending`/`gcChancePurchased` as arguments rather than running its own `SELECT` - `_awardXpTx` already fetches both in its own `before` row at the top of the transaction, and this fires on every single XP event (idle_heartbeat alone ticks once a minute per active user, on top of every discover/visit/etc.), so it deliberately reuses that instead of adding a second query to an already-hot path. `claimBonusGc(userId)` (one transaction: clear the flag, then `awardCoins(userId, 'bonus_gc_claim', Date.now(), 1)` - the `Date.now()` ref is unique per claim by construction, feeding the normal `coin_events` dedup table) is the only way it turns into an actual coin. No position/on-screen-appearance state is tracked server-side at all - `pending_bonus_gc` is a pure boolean, and the client (`#bonus-gc-btn`, fixed spot in the app banner, greyed out until `getUserXpInfo().pendingBonusGc` is true) is the only place "where" it visually shows up. The ready state pulses (`bonus-gc-pulse`, 4s `ease-in-out infinite` - same rate as `#notif-btn`/`#forum-btn`'s own `notif-pulse`, gated behind `body.reduce-motion` in `reduce-motion.css` the same way those are) rather than just glowing statically, matching the app's existing "something's waiting for you" convention. While nothing's pending, the button's tooltip shows the player's current total chance (`shop.js`'s `_bonusGcChancePct()`, a display-only mirror of the server formula above) via a separate i18n key (`bonus_gc.tooltip_empty_pct`, distinct from the plain `bonus_gc.tooltip_empty` used as the static HTML fallback) - `applyTranslations()`'s generic `data-i18n-tooltip` pass calls `t()` with no params, so a `{pct}` placeholder in that same key would render as the literal string `{pct}%` until the first real data fetch overwrote it; keeping them separate means the boot-time static text is never at risk of that. The tooltip also shows the player's lifetime claimed count (`{claimed}` in the same key), sourced from `getUserXpInfo()`'s `bonusGcClaimed` (a `SUM(amount)` over `coin_events` filtered to `event = 'bonus_gc_claim'`).

**Lucky-coin generated/claimed tracking:** `users.bonus_gc_generated` (added alongside `pending_bonus_gc`) is a lifetime counter incremented every time `_rollBonusGc` actually rolls a coin into existence, separate from `coin_events`' `bonus_gc_claim` rows which only track successful claims - the gap between the two (generated minus claimed) is coins currently sitting unclaimed across all players. `server/db.js` backfills it once on boot (idempotently, via `MAX()` so it only ever raises the floor) to `claimed + pending_bonus_gc` for every user - a claim always implies a prior generation, and a currently-pending flag implies one more generation that hasn't been claimed yet, so that's a safe floor even though the exact original generation count isn't otherwise recoverable. Both `adminGetStats()`'s `luckyGcGenerated`/`luckyGcClaimed` (admin dashboard's "Lucky coins generated / claimed" card) and `adminGetUsers()`'s per-user `luckyClaimed` (Users table's "Lucky" column) read from these same two sources - the per-user value reuses `getUserXpInfo()`'s already-computed `bonusGcClaimed` rather than running a second identical query.

**Base cost/target-column config is DB-backed** (`shop_items` table, same `CREATE TABLE` + seed-once + module-level cache pattern as `xp_config` in `xp.js`) - `purchaseShopItem`/`adminRefundShopItem` read `{cost, stepCost, col, delta}` per item from a `_shopItemsCache` Map, via `getShopItems()`/`setShopItemCost(id, cost, stepCost)`, the single source of truth server-side. The **client copy** (`SHOP_ITEMS` in `shop.js`) stays hardcoded separately - it's UI/i18n-bound presentation logic (translated labels, formatted descriptions via `t()`), not plain data, and the server always re-validates the real cost on purchase regardless of what the client displayed, so client/server staying in sync is a display-polish concern, not a security one. No admin UI exists to call `setShopItemCost()` - changing a price means a direct DB write.

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

`renderBody()` in `server/forum.js` supports `[label](url)` links, `\n`→`<br>`, and the same `**bold**`/`*italic*`/`__underline__`/`~~strikethrough~~`/`{color:name}...{/color}` markup as the announcement system's `formatAnnBody()` (`public/js/feed.js`, mirrored server-side in `server/routes/public.js` for the no-JS SEO render, and again in `admin/js/announcements.js` for the compose-preview - four independent implementations total, kept in sync by hand). `[label](url)` accepts an `https://` URL, `/book/N`, or `/series/N` - the first two are the only in-app targets recognized; anything else falls through unconverted (literal bracket text). `renderBody()` and its client-side re-render twin additionally split `/book/` vs `/series/` into `data-book-id`/`data-series-id` attributes, each intercepted client-side to `postMessage` the parent frame into opening the real in-app dialog (`gamebooks-open-book`/`gamebooks-open-series`, handled in `boot.js`) instead of navigating the forum iframe away - the admin preview has no such handling since there's nowhere in-app to open into from a separate admin bundle, so its links always open in a new tab regardless of target.

Announcements and forum posts can link to a book (`[Label](/book/:id)`) and open its in-app detail dialog instead of navigating away. **Book links must always be relative** (`/book/:id`), never an absolute hardcoded domain - the app is served from multiple domains (koldkat.net, pathmap.net, bookplay.net), and a baked-in absolute URL resolves to the wrong domain everywhere else.

**Forum modal** (`#forum-modal-overlay`, `z-index: 3000`) sits above the public-catalog modal and edit-book modal. Opening a book/series detail dialog from inside the forum layers it above the forum rather than closing the forum. Navigating to a book/edit-book dialog from elsewhere in the app always closes the forum modal first.

**Demo mode has no real account or token** - every authenticated call reachable from a demo-mode code path is guarded with `isDemoMode` and shows a "not supported in demo" message instead of firing the request.

**Reduce Animations in the forum iframe:** the forum is a separate document in its own `<iframe>`, so it can't see the parent app's `body.reduce-motion` class - it reads the same `localStorage` flag directly and applies the class itself.

**Battle-sim enemy-name fields** use a custom combobox dropdown, not a native `<datalist>`, and avoid the substring "name" in their id/label to dodge Chromium's contact-autofill heuristic.

**`books.has_battle_sim`** (DB column) is the source of truth for "does this book have a battle sim," used by `books.js`/`covers.js` for the library/covers-wall badge and filter (`getBooks()` returns it straight through; `getAllPublicBooks()` also returns a container-aware `hasBattleSim` that's true if the book itself or any of its anthology children has the flag, via `MAX(c.has_battle_sim)` in the same `GROUP BY` query). `boot.js`'s per-book panel-visibility gating (`setBattleSimVisible(bookId === 829)`, `setSim8Visible(bookId === 8)`, etc., one line per sim) is a separate, still-hardcoded registration point - the DB flag only tells you *whether* a book has a sim, not *which* module handles it. Adding a new sim means adding a `setSimNVisible()` line in `boot.js` plus setting `has_battle_sim = 1` for that book (currently via a manual `UPDATE`, no admin UI toggle).

**Sitemap:** `/forum`, all category pages, and every thread URL are included. Book pages (`/book/:id`) are included for every non-demo public book.

**Social preview image:** `og:image`/`twitter:image` point to a pre-rendered `og-image.png` (1200x630) rather than rasterizing SVG at request time, used as a site-wide fallback wherever a book/user has no cover/avatar.

All `/api/admin/*` routes and `GET /admin` are localhost-only (`403` otherwise, no auth token required). Admin UI, API reference, and settings are documented in `docs/admin.md` and `admin/admin-guide.html`.

**Admin stats endpoints:**
- `GET /api/admin/stats` - full payload: `users`, `books` (non-demo non-container top-level), `anthologies` (`is_container=1` top-level non-demo), `series` (all rows), `sessions`, `pdfCount`, sections, playthroughs, wins, deaths, DB size, coins, uptime, traffic. Battle deaths counted separately but not in top-level `deaths` card. Expensive.
- `GET /api/admin/live` - cheap 1-second-poll subset: `{ heapUsed, heapTotal, rss, cpuPct, sessionUptime, appAge, trafficIn, trafficOut }`. CPU% is a one-decimal float from `process.cpuUsage()` delta. Drives the Heap, RSS/CPU, and uptime cards. `admin/js/dashboard.js`'s `loadLive()` is single-flight (an in-flight boolean guard) - at a 1-second poll interval, a slow/stalled response would otherwise let calls pile up rather than the next tick just skipping.

**App version:** `admin_settings.app_version` is a free-form string (e.g. `v. 0.9.17.0 β`), set manually via the admin Tools tab's version field (`POST /api/admin/settings` with `key: 'app_version'`) and shown in the app footer (`#app-version`, fed by `GET /api/config`'s `handlePublicConfig`). Deliberately never auto-bumped by anything - the admin sets it by hand alongside each changelog. That same save also mirrors the value into a `VERSION` file at the repo root (`server/routes/admin.js`'s `VERSION_FILE`/`_readVersionFileFallback()`), purely so it shows up in git history as a human-curated version log - the file itself is never read except as the fallback `admin_settings.app_version` seeds from on a fresh database. The same save also `feedPush`es a `config_changed` SSE event to every connected tab (`/api/feed/stream`'s handler), which every tab (leader directly, followers via `_broadcastLiveEvent`/BroadcastChannel in `livetab.js`) uses only to update `#app-version`'s displayed text live - deliberately not a forced reload, which would risk yanking a page out from under someone mid-run; a real refresh (or the next natural navigation) is what actually gets a tab onto the new JS/CSS bundle.

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
book_anthology_memberships (book_id → books CASCADE, anthology_id → books CASCADE, book_order INTEGER, created_at; PRIMARY KEY (book_id, anthology_id))
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
- Can never be locked or deleted. Flag set once at migration (`server/db.js`, `WHERE id IN (1, 17)` - koldKat and sashii - `AND is_protected = 0`, so it's a no-op once already set), survives username renames.
- Matched by id, not username, on purpose - the migration reruns unconditionally on every boot, and a username match would risk silently granting the flag to an unrelated future user who registers a vacated username (same reasoning as `db.canSeeAppXp()`/`resolveIsAdmin()`/`adminBadge()` elsewhere in this doc - none of the id/flag-based admin or trust checks in this app key off a literal username).
- Protected users skip all lock logic in `verifyUser`.
- `adminLockUser` and `handleAdminDeleteUser` refuse to act on them. Lock/Delete buttons hidden in the admin UI.
- Also lets a protected non-admin account (i.e. sashii) upload/delete a book's PDF (`handleUploadPdf`/`handleDeletePdf` in `profile.js`, `403 Admin only` unless `user.is_protected || user.is_admin`) - same admin-adjacent trust level as the `canSeeAppXp` exception (see the `/api/app-xp` row above), just for a different capability.

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

When `discoverable_sections` is changed on an existing book, `handleUpdateBook` (`server/db/books.js`) retroactively re-checks `discover_all`/`visit_all` for every user tracking that book against the new threshold, so users who were already at/past the new (lower) bar get the achievement immediately rather than waiting for their next state save. This check unions `_visitedSet(playthroughs)` with `_mappedSet(graph)`, same as the live per-save check (see `visit_all` above) - a manual node already counted toward the threshold there is honoured here too.

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

**Secondary anthology memberships** (`book_anthology_memberships`, composite PK `(book_id, anthology_id)`, `ON DELETE CASCADE` both ways): a book can be reprinted in more than one anthology (e.g. a "best of" compilation reprinting stories from several magazines) without duplicating the book row. `parent_book_id` stays the single *primary* anthology - the one used for series inheritance and `won_all_anthology`/`discover_all_anthology`/`visit_all_anthology` milestones. This table only adds *secondary* memberships, which affect nothing except "list this anthology's children for display": progress/state is keyed by `book_id` alone, so a book shared across anthologies automatically shares its progress everywhere it appears.
- **Cover inheritance**: `books.js`'s library-list rendering (`_bookItemHtml`) resolves a childless-cover book's inherited cover from whichever anthology it's actually being rendered under (`containerId` param, passed by `_renderContainerItem`/the stash-section loop as the container's own `b.id`), not always `b.parent_book_id` - the same book with no cover of its own correctly shows anthology A's cover when listed under A and anthology B's cover when listed under B. This is intentionally *not* mirrored everywhere: `boot.js`'s "open this book directly" cover fallback and `getFeed()`'s `parentCoverUrl` have no browsing-context anthology to resolve against, so both stay `parent_book_id`-only by necessity, not oversight.
- `addAnthologyMember(userId, anthologyId, bookId, bookOrder, isAdmin)` / `removeAnthologyMember(userId, anthologyId, bookId, isAdmin)` (`server/db/books.js`) - creator-of-the-anthology-or-admin gate, same rule as `updateBook()`'s primary-parent editing. `addAnthologyMember` rejects (`already_primary`) if `anthologyId` is already the book's primary `parent_book_id` - the two relationships must never overlap for the same book/anthology pair, since combined children queries would then double-list it. `handleUpdateBook` calls `_pruneRedundantAnthologyMembership(bookId, resolvedParentBookId)` after every save so a secondary membership left over from before a book's primary parent was changed to match it gets cleaned up automatically.
- `getAnthologyExtraMembers(anthologyId)` - a single anthology's secondary members only; callers combine this with their own primary `parent_book_id` children query. The edit-book modal's "Also appears in" list is instead derived client-side from `extra_anthology_ids` (see `GET /api/books` below) rather than a dedicated per-book endpoint.
- Children-listing sites extended to combine primary + secondary members: `getBookActivity()` (the interactive app's book-detail dialog), `getPublicBookMeta()` (public/SSR anthology page), `getAllAnthologiesAdmin()`'s `child_count` (admin Anthologies tab), and `books.js`'s client-side `childrenMap` building (`_containerIdsFor()` helper, used everywhere the library list groups children under a container). `getAllPublicBooks()` (covers-wall listing) and `getPublicSeriesInfo()` were **not** extended - still primary-only.
- Not extended: the feed's anthology badge (`.feed-collection-tag`) still shows only a book's primary anthology, never its secondary memberships.
- **Ordering**: a book's `book_order` column is only its position within its *primary* `parent_book_id` - a secondary membership has its own order scoped to that one anthology (`book_anthology_memberships.book_order`, surfaced client-side as `extra_anthology_orders`). `getBookActivity()`/`getPublicBookMeta()`'s combined-children sort already reads the right column per source (`b.book_order` for primary rows, `m.book_order` from `getAnthologyExtraMembers()` for secondary ones). `books.js`'s client-side sort resolves order per-container via `_orderForContainer()`/`_sortChildrenMap()` rather than reading `b.book_order` directly, since the same book object can be a child of more than one container with a different order in each.
- `POST /api/books/:id/anthology-members` `{ book_id, book_order }` / `DELETE /api/books/:id/anthology-members/:bookId` - add/remove a secondary membership, or update its order (re-POST with a new `book_order`; `INSERT OR REPLACE` keyed on `(book_id, anthology_id)`). `:id` is the anthology.
- `GET /api/books` includes `extra_anthology_ids: number[]` and `extra_anthology_orders: {anthologyId: order}` per book for the client-side `childrenMap` extension above.
- **XP**: adding a secondary membership reuses the primary anthology's own events - `add_book_to_anthology` (10, first time `addAnthologyMember` creates a new row for that book/anthology pair) and `add_anthology_order` (5, whenever `book_order` is set on that call) - paid to the *book's* creator (`result.bookCreatedBy`), not whoever's adding it (usually the anthology's creator, who may not own the book). Both events are deduped per `(user, event, ref)` with `ref = "${bookId}:${anthologyId}"`, distinct from the bare-`bookId` ref the primary attachment (`handleCreateBook`/`handleUpdateBook`) uses for these same two events. Re-editing a membership's order via the edit-book chip doesn't re-award `add_anthology_order` after the first time for that same anthology pair.

**Anthology feed and activity modal:**
- `getFeed()` joins with the parent book and includes `parentBookId`, `parentBookName`, `parentCoverUrl`, and `isContainer` on every feed entry.
- `book_created`/`book_added` events display "created anthology" / "added anthology" vs "created book" / "added book" based on `isContainer`.
- Child book feed entries show the book name + a purple **anthology tag** (`.feed-collection-tag`) + an amber **series tag** (`.feed-series-tag`) when applicable.
- Series info uses `COALESCE`: if a child has no direct series but its parent anthology does, the parent's series is used. This applies to `getFeed()`, `getBookActivity()`, `all_visited`, and `all_discovered`.
- `getBookActivity()` returns `parentId`, `parentName`, `bookOrder`, `isContainer`, `children[]`, and `authorRatings[]` in the `book` object. Also returns `ownSeriesId`/`ownSeriesName`/`ownSeriesNumber` - the book's own direct `series_id`, never COALESCE'd with the parent's - alongside the regular (parent-inheriting) `seriesId`/`seriesName`/`seriesNumber`. An edit form must use the former: feeding the latter into an editable "Series" field would attach a child directly to its anthology's series just because that series showed up as inherited display context, and saving it would make that attachment real. A read-only display line (e.g. "Series: X" on a book's public detail dialog) should keep using the inheriting version. See `covers.js`'s admin-edit handler for the split.
- `getBookActivity()` also returns `secondaryAnthologies: [{id, name}]` - every anthology the book is a secondary member of (`parentId`/`parentName` above stays the one primary anthology). `covers.js`'s "Anthology: X" chip on the book-detail dialog (`.book-modal-in-collection`) renders one `.book-modal-parent-btn` per entry across primary + secondary, pluralizing the label to "Anthologies:" past one.
- `_getAuthorRatings()` (`server/db/books.js`) derives a per-author rating from the free-text `authors` field (not a normalized author table) by pooling every individual rating across every public book crediting that exact name. It does a full scan of all public non-demo books on every call to `getBookActivity()` - same synchronous-full-scan cost class as `getFeed()`'s queries, worth revisiting if the catalog grows large enough for it to matter.
- **`covers.js`'s public book-detail dialog (`renderCoverActivity()`) needs its own `bookMeta?.isContainer` check on every per-action button it renders - it does not inherit `books.js`'s own container-vs-book split.** `books.js`'s own list rendering treats a container as a fundamentally different card via a separate `_renderContainerItem()` path, so its buttons never need the check. `covers.js` renders one shared dialog for both, so each button (admin edit → `openEditCompModal` vs `openEditBookModal`; "Open Book" → hidden entirely for a container, which has no playthrough of its own to open, only its `children[]` list does) has needed its own explicit branch, added one at a time as each was found missing it - not a single shared gate. Any new per-action button added to this dialog needs the same check considered explicitly.
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

**`.inv-modal-hdr` right-aligns its close button via `.inv-count`'s `margin-left: auto`, not via a rule on the button itself** (`.inv-modal-hdr .inv-close-btn` and `.inv-modal-hdr:has(.inv-count) .inv-close-btn` both explicitly zero out any margin on the button). Fine for inventory's own modal, which always has an `.inv-count` span between the title and the close button, and for the two search-header pickers (`.inv-search` has `flex: 1`, which fills the gap on its own) - but every one of the thirteen `.inv-modal-hdr` headers with only a title and a close button (every `.bsim-modal` battle sim, plus equipment's own main modal) had nothing pushing the button right at all, so it sat immediately next to the title instead of the header's far edge. Fixed with `.inv-modal-hdr:not(:has(.inv-count)) .inv-close-btn { margin-left: auto; }` - a no-op wherever a count or flex-growing search field already fills the gap, a real fix everywhere else. Any future `.inv-modal-hdr` header needs one of these three spacers (a count span, a flex-growing element, or this fallback) or the close button will repeat the same misalignment.

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
| `discover_all` | 30 | `bookId` | Once per book when discovered ≥ effective_sections (`discoverable_sections ?? total_sections`). "Discovered" is `_discoveredSet(graph)`'s union of every graph key plus every choices[] entry across the whole graph - both sides go through the shared `_normSec()` helper (same normalization `_mappedSet`/`_visitedSet` use) before being added to the Set, since an unnormalized string/number pair for the same section (e.g. `'13'` and `13`) would otherwise count as two separate discovered sections and inflate the total past the book's real size, awarding this before the player had actually seen everything. |
| `visit_all` | 40 | `bookId` | Once per book when visited ≥ effective_sections (`discoverable_sections ?? total_sections`). "Visited" is `_visitedSet(playthroughs)` (real `pt.path` traversal) unioned with `_mappedSet(graph)` - a manually-added node (bg.js's "+ Add node", no `discovered` flag - see "Mapped" in the Node colour logic section) counts here too, so a noted-but-never-played bonus episode doesn't block 100% completion. Also grants 1 one-time Gold Coin milestone for that user/book. |
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
| `first_win` | 100 (150 if `first_win_ow`) | `bookId` | Once per book per user, on the first run completed with `result === 'success'`. Uses book-scoped ref (never series-scoped) so it fires regardless of open world - but pays the higher `first_win_ow` amount instead when *this particular* completion happens as part of an open-world series run (`owSeriesId` truthy at award time), since that represents more investment. Still once per book, not once per series - book 1 and book 2 of the same series each get their own. |
| `first_loss` | 50 (75 if `first_loss_ow`) | `bookId` | Same idea as `first_win`, for `result === 'death'`. |
| `first_battle_death` | 25 (40 if `first_battle_death_ow`) | `bookId` | Same idea as `first_win`, for `result === 'battle'`. |
| `won_all_series` | 20 × N | `seriesId` | Once per user per series (N = non-demo non-container book count). Fires inside `processStateXp` after any `win_run` when every book in the series has at least one `win_run` event for this user. Skipped for open-world series (series runs cover that). |
| `won_all_anthology` | 20 × N | `parentBookId` | Once per user per anthology (N = non-demo child count). Same trigger logic as `won_all_series` but scoped to the anthology's `parent_book_id`. |
| `discover_all_series` | 30 × N | `seriesId` | Once per user per series. Fires after a book's `discover_all` award when all non-demo non-container books in the series also have `discover_all`. |
| `visit_all_series` | 40 × N | `seriesId` | Once per user per series. Same trigger as `discover_all_series` but for `visit_all`. |
| `discover_all_anthology` | 30 × N | `parentBookId` | Once per user per anthology. Fires after a child book's `discover_all` when all non-demo children have `discover_all`. |
| `visit_all_anthology` | 40 × N | `parentBookId` | Once per user per anthology. Same trigger as `discover_all_anthology` but for `visit_all`. |
| `idle_heartbeat` | 1 | `minuteBucket` | Once per minute per user, fired by a dedicated 60-second timer hitting `POST /api/heartbeat` - desktop's leader tab (`livetab.js`, fires regardless of `document.visibilityState`, so a leader tab left open in the background or with the screen off keeps earning it) or mobile's own plain per-page interval (`public/mobile/js/app.js`, no leader election needed there). Its own endpoint, not a `GET /api/feed` side effect - see below. |
| `favorite_cover` | 5 | `book:id` / `series:id` | Once per cover item, first time a logged-in user favorites a book, anthology, or series cover from the public covers wall |
| `inventory_started` | 25 | `bookId` | Once per book, first time any playthrough's inventory becomes non-empty |
| `add_item` | 5 | `bookId:itemId` | Once per book per distinct item ID, first time that item appears in any playthrough's inventory |
| `add_charsheet_field` | 5 | `bookId:runIndex:fieldId` | Once per user-added character sheet field. Only fields absent from the book's `charSheetTemplate` at save time are counted - template fields copied to a new run do not award XP. Deduped by `fieldId` so editing or re-saving never double-awards. |
| `equipment_started` | 25 | `bookId` | Once per book, first time any playthrough's equipment becomes non-empty |
| `equip_item` | 5 | `bookId:itemId` | Once per book per distinct item ID, first time that item appears equipped in any playthrough |
| `battlesim_win` | 10 | `simKey:ts` | Per battle simulator win, any sim in `SIM_HISTORY_KEYS` |
| `battlesim_loss` | 5 | `simKey:ts` | Per battle simulator loss, any sim in `SIM_HISTORY_KEYS` |

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

**Reward dedup refs:** `death_run`/`battle_run`/`win_run`/`share_run`/`charsheet_run`/`charsheet_saved` key their `xp_events` dedup ref off the run's `startedAt` timestamp (`newPt?.startedAt ?? i`, array index only as a fallback for runs that predate this field). The ref's **prefix** additionally depends on whether the book was in an open-world series *at the moment that specific run completed*: `bookId:startedAt` normally, `series:seriesId:startedAt` for an open-world one (`processStateXp`) - so a single book's history can contain both formats (e.g. losses from before it joined a series, plus later ones after). `getFeed()`'s `first_win`/`first_loss`/`first_battle_death` resolution (`_getFirstRunRef`/`_runKeyFromRef`) checks both prefixes.

`run_depth` (~25 XP) is index-based (`${bookId}:${i}` / `series:${owSeriesId}:${i}`), unlike the timestamp-based refs above - it fires the instant any run has a non-empty path, essentially on creation. Re-creating a run at the same slot after deleting it does not re-earn `run_depth`; a genuinely new slot does. One-time correction scripts exist in `scripts/`: `revoke_duplicate_run_depth.js`, `restore_run_depth_correction.js`, `backfill_run_reward_refs.js`.
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
| `POST /api/heartbeat` route | `idle_heartbeat` (1 XP max per minute, keyed by a server-side minute bucket, always authenticated - the route 401s otherwise) |
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

**Impersonation sessions stay invisible to activity tracking and rewards.** Sessions carry an `is_impersonation` flag (`createSession(userId, { impersonation: true })`, set from the admin panel's impersonate link). `authenticate()`/`authenticateOptional()` (`request-helpers.js`) skip `updateUserLastActive()` for these sessions. `adminGetUsers()`'s `last_active` column falls back to `MAX(user_books.updated_at)` for users with no `last_active_at` yet; `handleSaveState` checks `isRequestImpersonating(req)` and passes `{ skipTimestamp: true }` to `saveBookState()` so an impersonated state save doesn't bump that timestamp either.

XP/coins are enforced centrally rather than per-route: `server/impersonation-context.js` wraps every request in an `AsyncLocalStorage` context (`runWithImpersonationContext`, applied once in `server.js`'s top-level request handler), and `server/db/xp.js`'s `awardXp`/`awardCoins` both check `isImpersonatingContext()` and no-op if the current request is impersonated - this covers every award call anywhere in that request's async chain (including `processStateXp`, party fan-out, and anything added later) without each one needing its own check. A few call sites also short-circuit earlier as a redundant layer (`handleSaveState`'s `processStateXp` call, the party-state fan-out loop, `POST /api/heartbeat`'s idle-heartbeat award, `acceptPartyInvite`'s `skipXp` option) - the central check makes these optional, not load-bearing.

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
showGrid?: boolean,              // if true, a fixed-spacing grid overlay is drawn across the whole graph; default false; mutually exclusive with fogOfGrid
fogOfGrid?: boolean,             // if true, the grid overlay is only drawn in a fixed-radius halo around each node; default false; mutually exclusive with showGrid
snapToGrid?: boolean,            // if true, dragging a node snaps its dropped position to the grid; only affects future drags, never retroactive; default false

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

If any API call returns `401`, `apiFetch` fires an `auth-expired` DOM event, clears the stored token and username, and redirects to the login screen - `boot.js` on desktop, `public/mobile/js/app.js` on mobile (also stopping its heartbeat interval, see below).

If any call (authenticated or not) returns `503`, both `apiFetch` (`state.js`) and `publicFetch` (`boot.js`) dispatch a `maintenance-mode` window event. A `{ once: true }` listener calls `location.reload()` - the user lands on the maintenance page after the reload. `publicFetch` is a thin wrapper around `fetch` used for all unauthenticated public API calls (feed, public book/series/user activity, public run data) so that maintenance-mode ejection works even for logged-out users browsing the feed.

**Convention: every client request goes through `apiFetch` (authenticated) or `fetchPublic`/`publicFetch` (public), never a raw `fetch()`.** These wrappers are what give a request its 401 (expired/invalid session → ejection flow) and 503 (maintenance mode → ejection flow) handling; a raw `fetch()` silently skips both, degrading to a generic error message instead of the normal ejection UX. Applies uniformly across the app - `export.js`, `demo.js`, `auth.js`'s pre-login flows, `party.js`, `stats.js`, `boot.js`'s config/tagline loaders, `tips.js`. `covers.js`'s two raw `fetch()` calls (streaming cover-image bytes with a progress bar) are the deliberate exception - image/blob requests don't need JSON-oriented 401/503 handling.

Attachment upload (`/api/attachments`) is consolidated into `util.js`'s `uploadAttachment()`/`isImageFilename()`/`addAttachmentItem()`, used by both `feedback.js` and `inbox.js` rather than each keeping its own copy.

`autocomplete.js`'s `_currentTokenBounds()` computes both the backward (previous comma) and forward (next comma / end of string) boundary of the author-name token under the caret; `_applyAuthor()` replaces the whole token span.

`party.js`'s `connectPartySSE(bookId)` uses a generation counter (`_connectGen`) to guard against overlapping calls for different books racing each other - `disconnectPartySSE()` bumps it, and a stale call whose generation no longer matches after its `await` discards its result instead of applying it. `profile.js`/`app-xp.js`'s own `_animGen` is a narrower variant of the same idiom, used only to invalidate in-flight XP-bar tween frames on a hard reset (login/logout/user switch) - normal sequential XP updates never bump it, since those are meant to queue and play back to back rather than cancel each other (see `_animQueue`/`_runAnimQueue` in both files).

**Security: the forgot-password reset link must never be built from `req.headers.host`** - it's attacker-controlled, and this link is emailed to the account owner, so a spoofed `Host` header would poison the reset link toward an attacker's domain (Host Header Injection / password-reset poisoning, a real account-takeover path). The link is built from `db.getAdminSetting('app_url')`, hardcoded to `'https://pathmap.net'` if unset (`koldkat.net` is planned to eventually become a separate personal portfolio site, unrelated to this app, so pathmap.net is the forward-looking default) - never a header-derived fallback. Also: `handleForgotPassword`'s `429` rate-limit response must be checked via `res.ok` before assuming success, same as the other three auth handlers in this file.

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

**Feed scroll position across collapse/restore:** `#feed-panel` collapses to `max-height: 0` (`body.feed-collapsed`) rather than being unmounted, shrinking `#landing-wrapper`'s (the actual scroll container) scrollable content and letting the browser clamp its `scrollTop`. `_setLandingPanelCollapsed()` (`prefs.js`) captures `#landing-wrapper.scrollTop` before collapsing and restores it a double-`requestAnimationFrame` after expanding - safe to do immediately since `max-height` snaps instantly off its default `none` (not an animatable length), so only the opacity/transform entrance animates. Shared by the individual feed-toggle button and the `Ctrl+X` group toggle.

**Keyboard shortcut layout independence:** feed-toggle and charsheet shortcuts use `e.code` (physical key position) instead of `e.key` (character produced). `e.key` breaks on non-Latin layouts (e.g. Bulgarian physical `X` produces a Cyrillic character). `e.code` works correctly on any keyboard.

`showMain(bookId, isbn, issn, asin, cover, pdfPath, pages, authors, ...)` always calls `destroyNetwork()` + `initGraph()` so the graph is rebuilt fresh for each book. Metadata is stored in module-level `currentBook*` variables so the edit-book modal can pre-populate them. Before the `GET /api/books/:id/state` fetch (`loadState()`), both `#graph-container` and `#sidebar` get a loading indicator (`_loadingGraphSvg()`, the same `.feed-loading-graph`/`.flg-*` animated graph icon as the activity feed and live-reading). `#graph-container`'s `.graph-loading` never needs an explicit clear - `initGraph()`'s `new vis.Network(container, ...)` takes ownership of the container's content the instant it constructs. `#sidebar`'s `.sidebar-loading` is different: it's an absolutely-positioned overlay (`#sidebar`'s own stats/playthrough-panel elements already exist in the static HTML shell and `render()` only updates them in place, nothing clears it on its own), removed explicitly right after `render()` + `_updateSidebarBookInfo()` populate the real content.

### App banner

`#app-banner` sits at the top of `#feed-panel` (above the Activity header), matching the width of the feed cards. It shows the app title, tagline, and a "User Guide" button that opens `/guide.html` in a new tab. The banner is only present on the landing page (`index.html`), not in the tracker view.

`#books-tip-bar` sits directly below `#app-banner`. Contains an orange **Tip:** label + rotating tip text. Tips cycle every 15 s with a 500ms fade. A 2px animated progress bar (`#tip-progress-bar`) drains along the bottom, restarting on each change via the `offsetWidth` reflow trick. Tip logic lives in `tips.js`. `nextTip()` alternates between the "real" and "silly" pools, flipping to the other side when the current one is empty - bounded to one flip (a `_triedOtherSide` flag), so if `GET /api/tips` ever returns both pools empty (every tip deactivated, or a fresh install before any are seeded) it returns `''` instead of recursing forever.

`guide.html` is a standalone HTML page (`public/guide.html`) styled to match the app's dark theme. It mirrors the content of `docs/user-guide.md` and should be kept in sync whenever `user-guide.md` is updated.

### Play-area XP panel

`#play-bottom-stack` is the bottom-center tracker stack that now contains both `#play-btns-bar` and `#play-xp-summary`. The XP panel is a live mirror of the books-screen XP summary, rendered through the shared helper `_renderXpSummary(prefix, data)`. It displays level, title, XP bar, current XP text, and boost line, and persists its collapsed state via `ui_prefs.playXpCollapsed`.

**Heartbeat XP rate:** each XP bar shows the current idle rate: `rate = 1 + (bonusHeartbeatXp + max(0, level-10)) * 0.1` per minute.

**Animated XP gain:** the books-screen and play-area bars tween to the new value when XP changes (profile modal always snaps instantly). Duration scales with level. A level-up crossed mid-animation fills to 100%, resets, and continues in the new level.

### App-wide XP widget (`app-xp.js`)

`#app-xp-summary` sits above the personal XP summary on the Books screen, gated by `getCanSeeAppXp` (`boot.js`'s `_canSeeAppXp` - true for the admin, plus a standing one-off exception letting sashii see this and the Avg User Level widget below without any other admin capability), showing an app-wide level/XP/boost bar (same quadratic level formula as a per-user bar, scaled by user count so it doesn't dwarf individual levels as the base grows). Refreshed on login and on the unconditional 60s feed-poll interval (`livetab.js`'s `_feedPollInterval`, not admin-gated). The admin's tab additionally gets a near-instant refresh via `_connectAppXpSSE()` (still `getIsAdmin`-only, not extended to the sashii exception) - the sashii exception is visibility only, not the faster live-nudge.

**Live "someone else earned XP/GC" floaters:** admin-only (`getIsAdmin`, not the sashii exception above), rendered on the Books screen or in the play area (mutually exclusive - only one screen is visible at a time). Backed by `GET /api/app-xp/stream` (admin-only SSE, unaffected by `canSeeAppXp`); a separate floater layer/queue from the personal reward floater, positioned in the gap between panels appropriate to whichever screen is showing.

`handleAppXpEvent` accumulates per-username over a 750ms window (`_appRewardAccum`/`_appRewardFlushTimers`, same window and combining shape as `rewards.js`'s single-user `_queueRewardFloater`, just keyed per-username here since this feed mixes events from every user at once) before spawning one combined chip, rather than one chip per SSE event, so a user racking up several awards in a burst produces one chip, not a spam of them. The admin/visibility gate is checked again at flush time, not just when the event first arrives, since up to 750ms can pass between the two and the admin may have navigated away from either eligible screen in the meantime.

### Avg User Level widget (`app-xp.js`)

`#avg-lvl-summary` shows the average of each user's own level (`floor(sumLevels / users)`), painted from the same `GET /api/app-xp` response as the App XP widget above it. Distinct from "level of the average XP" (which is the App widget's own `level` figure, skewed upward by a few high-XP users).

### Book list (`renderBooksList`)

Each `.book-item` card has a progress bar background: `rgba(107,114,128,0.18)` fills `(visited / effective_sections) × 100%` left-to-right, where `effective_sections = discoverable_sections ?? total_sections`. Zero-visited cards have no background.

`visited` here comes from `getBooks()` in `server/db/books.js`, which builds it as `_visitedSet(playthroughs)` unioned with `_mappedSet(graph)` - the same normalized helpers the `visit_all` XP check uses (see above), so a manually-added/noted node doesn't leave a fully-explored book stuck just short of 100% on this card, and a path/graph mixing string and number section ids for the same section doesn't count it twice. Falls back to `_permanentVisitedCount` when the live count is short (deleted-run undercount, same as the XP check). This is computed fresh on every `getBooks()` call (no caching), so it reflects immediately on next page load - no backfill needed, unlike the `visit_all` XP/coin award which only fires on a state save or an explicit `migrateXpForUser` backfill run.

**Completion percentage floor rule:** every "N out of total (X%)" display in the app shows `100%` only when `n >= total` exactly; otherwise the percentage is floored and capped at 99% (`Math.min(99, Math.floor(n / total * 100))`), never rounded up - prevents e.g. 318/319 sections displaying as a misleading "100%". Implemented independently (not centralized) in `books.js` (`_bookItemHtml`, `_aggregateProgress` consumers, stash aggregate), `play.js` (`updateStats › pct`), and `stats.js` (the shared `pct` helper) - a new completion display needs the same floor applied by hand.

**Server hardware info (Stats for Nerds):** `_serverHardwareInfo()` in `server.js` reads `os.cpus()` once per request and returns `cpuModel`/`cpuArch`/`cpuGhz`/`cpuAgeYears`/`cpuCores`/`totalRamBytes`, spread directly into `/api/site-stats`'s response with no allowlist to update on either side. `cpuCores` is `cpus.length`.

**Compact number formatting (Stats for Nerds):** `stats.js`'s `fmt` switches to the compact `fmtCompact` form (K/M/B/T/Qa/Qi suffixes) once the absolute value reaches 10,000, applied universally rather than to an allowlisted set of fields. Decimal precision increases one place per tier. Guards a rounding-boundary edge case where e.g. `999999` would naively format to `"1000.0K"` - the tier bumps up one level and redivides instead.

**Render order:** series header rows → series books → no-series containers → standalone books.

**Mobile Open button:** `renderBooksList` shows every owned book on mobile same as desktop - a non-container book with no `hasLiveReading` still renders, but its `.book-open-btn` is disabled (`_isMobile() && !b.hasLiveReading` in `_bookItemHtml`) with a tooltip pointing the player back to desktop, rather than being hidden outright. This is unrelated to `covers.js`'s `_visibleCoverItems()`, which forces its own "Book available" filter on for the public/anonymous covers wall regardless of the chip's stored toggle (mobile.css hides the chip there, since it can't be turned off) - that screen still hides non-reading covers, only the owned-books list shows everything.

**Mobile My Books / Add Book full-screen panels (`boot.js`):** on mobile, `#landing-right` (My Books) and `#covers-panel` (Add Book, desktop's search/browse catalog) are toggled full-screen via `body.mobile-books-open`/`body.mobile-addbook-open` instead of the fixed side-column layout they have on desktop - see `mobile.css`. `_openMobilePanel(name)` pushes a `history` entry (`replaceState` instead of `pushState` when switching directly from one panel to the other, so that reads as one back-stack entry, not two) so the phone's real back gesture closes the panel first. A `popstate` listener closes whichever panel is open whenever the popped state has no `mobilePanel` key. Both close buttons are `position: sticky`.

`_openMobilePanel` and its `popstate` listener live at module scope, wired exactly once behind a `_mobilePanelWired` guard inside `showBooks()`, not inline in its body like `covers-toggle`/`right-toggle`/`feed-toggle`/`sidebar-toggle`'s own listeners just above them. `showBooks()` runs many times a session (login, hash routing, every mobile "Open a book" bounce-back in `showMain()`) - those older toggles re-attach harmlessly every call since one extra boolean-toggle roughly cancels out, but N stacked duplicate listeners calling `history.pushState()` do not: a single tap would push N history entries, needing N back-presses to close a panel opened with one tap. Any *new* per-`showBooks()`-call wiring that has a real (non-idempotent) side effect needs the same one-time guard, not the older inline pattern.

**`.pub-overlay` (book/profile/run detail dialog) z-index and history, when nested inside a mobile panel:** desktop's `.pub-overlay` is `z-index: 300` (`public-profile.css`); `mobile.css` overrides it to `z-index: 600` on mobile, above `#covers-panel`/`#landing-right`'s full-screen `z-index: 500` panels, without `!important` - so `boot.js`'s one-off inline `zIndex='3001'` bump (a book link opened from inside the forum modal, `z-index:3000`) still wins when set, since a non-important external rule loses to any inline style. A `MutationObserver` on `#public-modal-overlay`'s `class` attribute (too many open call sites across `covers.js`/`feed.js`/`public-profile.js` to thread a push call through individually) pushes a `{ dialogOpen: true }` history entry only when the dialog opens while a mobile panel is already open underneath, and a `popstate` listener closes the dialog when that entry pops - so back-button leaves the dialog, then the panel, rather than skipping straight past both into real browser history. Scoped to the nested-in-a-mobile-panel case only: opening the same dialog from the plain feed (no panel open) has no history entry of its own.

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
- `pinned` non-null → `<div class="feed-pinned-card">` with amber border rendered above all day groups, its title cut into the top border the same way `.feed-announcement`/`.feed-ann-title` render a regular announcement (`position: relative` card, `position: absolute` title masked by the panel background color).
- `entries` grouped by local date: "Today", "Yesterday", or full date string. Each entry is `<div class="feed-entry">`.
- Empty result → `<p class="feed-empty">` placeholder.
- `#feed-content` shows a `.feed-loading` indicator (`.feed-loading-graph` - an inline copy of `favicon.svg`'s own center-node-plus-4-children graph, opacity/scale-animated only, distinct from the unrelated `.feed-book`/`.feed-book-btn` book-title link - not gated behind `reduce-motion` since it's functional) only when the panel doesn't already contain a `.feed-entry`/`#feed-header` - i.e. a genuinely first/empty load, not `livetab.js`'s 60-second background poll, which swaps fresh entries in directly with no flash.
- Errors silently ignored - feed failure never breaks login. The catch only replaces content with the empty-state placeholder if the spinner is still showing (a first-load failure); a failed background poll leaves whatever entries are already on screen untouched instead of wiping them.
- `GET /api/feed` is a pure read with no side effects; it does not award `idle_heartbeat` XP. On desktop, heartbeat XP only comes from `livetab.js`'s dedicated 60-second leader-tab timer hitting `POST /api/heartbeat` directly - see `idle_heartbeat` in the XP events table above. `loadFeed()` still schedules a short profile refresh after every call (`scheduleRewardProfileRefresh(150)`) so the coin/XP floater picks up whatever the heartbeat timer most recently did.

`#feed-toggle` (`▴ / ▾`) is a feed-collapse tab centered above the feed. Feed hidden state is **session-only** - not persisted across reloads. Hidden on mobile. Position computed via JS `_syncFeedTogglePos` (not pure CSS) so it stays centered on `#feed-panel` when side panels expand/collapse. Called on panel toggle, resize, and landing reveal.

**Per-user "N actions today" collapse group:** `renderDayItems()` in `feed.js` groups a single user's entries for one day behind a `▶ N actions today` toggle once that user has `COLLAPSE_THRESHOLD` (6, i.e. "more than 5") entries that day. `skipTypes` (`level_up`, `user_joined`, `book_rated`, `series_rated`, `book_created`, `series_created`, `all_visited`, `all_discovered`, `first_win`, `first_loss`, `first_battle_death`, `visit_all_series`, `discover_all_series`, `visit_all_anthology`, `discover_all_anthology`) are excluded from both the threshold count *and* the group's body, and are separately given an explicit standalone-render bypass earlier in the same loop (both checks read the same `skipTypes` set, so the two halves can't drift apart) - both halves are required, or a skipped type falls into neither the group body (filtered out) nor a standalone entry (never reached), and silently disappears from the feed entirely for that day. `user_joined` is in the set for the threshold-exclusion half only - its own standalone-render bypass is handled separately by the join-collapse-group logic right after, not the generic bypass.

**Series/anthology creation batch collapse:** a `series_created` event, or a `book_created` event with `isContainer`, absorbs same-day `book_created` children from the same user whose `seriesId`/`parentBookId` points back at it (`batchChildrenByContainer` in `renderDayItems()`) - built as its own pre-pass over `items`, independent of the "N actions today" grouping above (a `book_created`/`series_created` container is already in `skipTypes`, so it always renders as its own standalone entry either way; this only decides whether its children get folded under it). Consumed children are dropped from the main render loop entirely (`batchConsumedChildren`) and re-appear inside a `feed-group-toggle--inline` button's `feed-group-body`, appended as a sibling after the container's own sentence rather than wrapping it - avoids nesting the container's clickable book/series link inside the toggle `<button>`, which the generic collapse group's plain-text `renderGroupLabel` header doesn't have to worry about. A container matching zero children (created with no members yet) renders exactly as before, uncollapsed. If a book's `seriesId` and `parentBookId` both resolve to containers created the same batch, the first container processed (items are already in `completedAt` desc order) claims it and the second container's filter excludes anything already in `batchConsumedChildren`, so it never renders twice.

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
| `first_win` | First run ever won on a book | `bookId`, `bookName`, `bookIsPublic`, `runIndex`, `pathLength`, `lastSection`, `isSeriesRun` - rendered as "won in [book] run N for the first time", or "series run N" instead of "run N" when `isSeriesRun` (set from whether the underlying `win_run` ref was series-scoped - matches the wording `series_run_started`/`series_run_completed` already use) |
| `first_loss` | First death run on a book | `bookId`, `bookName`, `userId`, `runIndex`, `runIsPublic`, `pathLength`, `lastSection`, `isSeriesRun` - rendered as "lost in [book] for the first time"; verb is a clickable `feed-verb-pub` button when `runIsPublic && runIndex != null`; "series run N" instead of "run N" when `isSeriesRun`, same as `first_win` |
| `first_battle_death` | First battle-death run on a book | same shape as `first_loss` (including `isSeriesRun`) - rendered as "fell in battle in [book] for the first time"; verb is clickable when run is public |
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

`first_win`/`first_loss`/`first_battle_death` all skip the feed entry entirely when `_resolveRunIndex` can't find the run in current state (`runIndex == null`, e.g. the run was later deleted) - the XP/achievement itself remains permanent (deleting a run never revokes XP already earned); only the feed entry is filtered out.

`pathLength`/`lastSection` feed the client's plain-text hover tooltip on a run's won/lost/battle-death link - not sent for `series_run_completed`, since `completeSeriesRun()` nulls `series_runs.last_book_id`/`last_section` on completion (that pair only tracks an in-progress run's position), so no last-section value survives to be read.

`party_formed` is the only feed event that pre-populates `usernames` from the server (all current party members) rather than relying on the client-side party-merge step. If the party is disbanded before the feed is queried, the entry is suppressed (member lookup returns < 2 rows). Group series/anthology milestone events are deduplicated by the `xp_events` UNIQUE constraint; they never appear more than once per user per entity.

**`book_rated`/`series_rated`:** sourced from the `rate_book`/`rate_series` XP award (`xp_events`), joined with the CURRENT rating from `user_books`/`user_series` - a rating later cleared to null suppresses the entry. Only the first rating ever produces an entry (one `xp_events` row per user+book/series). `setBookRating`/`setSeriesRating` call `feedPush` on every rating change so live viewers stay in sync.

Note: the no-JS `GET /feed` SEO page (`servePublicFeedPage()`, `server.js`) has its own separate, smaller `renderEntryText()` switch that only handles 8 of the ~17 event types (silently renders nothing for the rest, including `book_rated`/`series_rated`, `book_added`, `series_created`, `first_win`).

**`getFeed()`** runs roughly a dozen queries of the shape `WHERE xe.event = '...' AND xe.created_at > ?` against `xp_events`, backed by `idx_xp_events_event_created ON xp_events(event, created_at)` (the table's other index, `UNIQUE(user_id, event, ref)`, doesn't help here since none of these queries filter on `user_id`). Since `better-sqlite3` is synchronous, a full-table scan here blocks Node's entire event loop, including outgoing SSE frames to every connected client - this index matters at scale, not just for feed latency.

`idx_user_books_party_id`, `idx_books_series_id`/`idx_books_parent_book_id`, and `idx_user_books_book_id` (see schema above) back the same class of SSE-triggering hot-path queries: party live-sync member lookups, `_checkGroupMilestone()`/`_checkGroupWonAll()` (`server/db/xp.js`, called from `processStateXp`), and `_getAggregateRating()` respectively.

**Completed-run counts read from the permanent `xp_events` ledger, not live `state_data`.** `getProfileStats()` (`server/db/feed.js`), `adminGetUsers()`, and `adminGetUserBooks()`'s summary `totals` (all `server/db/admin.js`) each `GROUP BY event` (and, for `adminGetUsers()`, `user_id` too) over `xp_events WHERE event IN ('win_run','death_run','battle_run')` - the same source the runs-milestone GC coin (`server/db/xp.js`, `_anyRunJustCompleted` block) uses. `adminGetUserBooks()`'s **per-book** `playthroughs`/`wins`/`deaths`/`battles` numbers remain state_data-derived (current per-book state); only the page's overall summary header uses the ledger. `adminGetUsers()` separately counts in-progress runs (`!pt.result`) as `active` from live state_data, shown in the users table's own "Active" column, since there's no permanent event logged for "started but not finished." All of these aggregates (plus `adminGetBookStats()`'s `inProgress`/`totalPts` and `adminGetStats()`'s site-wide `activePlaythroughs`/`playthroughs`, which are fully state_data-derived) exclude untouched open-world series-run placeholders (`pt.startedAt == null`) - every book in a series carries one padding slot per series run so numbers line up across books.

**`resetBookProgress`/`resetSeriesForUser` (`server/db/books.js`) `xp_events` cleanup:** deletes rows matching `RESETTABLE_PROGRESS_EVENTS` (a shared list covering `discover_node`/`visit_node`/.../`win_run`/`death_run`/`battle_run`/etc.) with `ref = bookId` or `ref LIKE '<bookId>:%'`. Open-world series books log `win_run`/`death_run`/`battle_run` (and several others) under a series-scoped ref (`series:<seriesId>:...`) instead, since a single run isn't confined to one book - `resetBookProgress` alone can never match that prefix (a single book's reset can't assume no sibling book in the series still needs that run's history). `resetSeriesForUser` additionally deletes `series:<seriesId>:%` rows itself, after resetting every book in the series - the one case where nothing else in the series could still legitimately depend on that history.

`getProfileStats()` and `getPublicProfile()` (both `server/db/feed.js`) also agree on `totalBooks`/`createdBooks`: anthology children are excluded, so an anthology counts as one book regardless of how many of its children the user has added.

`getSiteStats()`'s `levelUps` (Stats for Nerds' "Total levels") and `getAppXpSummary()`'s `sumLevels` (the App-wide XP widget) are both a live `SUM` of every user's current level, computed identically - not a `COUNT` of `level_up` xp_events, which is deduped per `(user, level)`.

**`getSiteStats()`'s Gameplay-section `publicRuns`** (Stats for Nerds' "Public runs") is `base.publicRuns + owRunsPublic`, not either alone. `base.publicRuns` (`adminGetStats()`) is a plain scan of every playthrough's `pt.isPublic` field in `state_data` - the real source of truth for standalone runs, but *not* for open-world series runs: `updateSeriesRunPublic()` only ever writes `series_runs.is_public`, never touching `pt.isPublic` in the JSON, so a series run's own playthrough entry never reflects its real public status there. `owRunsPublic` (already computed separately, straight from `series_runs`, for the Open World section's own "Public runs" line) is the authoritative count for those - added on top rather than relied on alone, since the two counts are disjoint (a series run's `pt.isPublic` is never set true by the real toggle path, so summing them doesn't double-count).

**Sim battle stats** (Stats for Nerds' "Battle simulators available"/"Sim battles fought/won/lost"): `adminGetStats()`'s `_tallyBattles(pts)` scans every playthrough for all sim state keys (`server/db/xp.js`'s exported `SIM_HISTORY_KEYS` - the one canonical list both the XP-award code and this aggregate share, so a newly-added sim can't be silently missing from one but not the other) and sums each `history` array's length plus its win/loss outcome counts. `battleSims` is `COUNT(*) FROM books WHERE has_battle_sim = 1`. Distinct from the older `battleCount`/`winRate` fields, which track playthroughs whose *result* is a scripted in-book battle loss, not simulator usage. `history` arrays are uncapped (no 100-entry trim), so this is a true lifetime total. Book 829's sim uses `pt.sim829`, matching every other sim's `pt.simNNN` shape rather than its original one-off `pt.battleSim` - `server/db.js` migrates any existing `pt.battleSim` data over once, gated on `admin_settings.sim829_key_renamed`.

**Wiring checklist for a new battle sim** - every one of these is a separate registration point, none inherited automatically from the others:
- `public/js/battlesim/battlesimNNN.js` itself (state in `pt.simNNN`).
- `boot.js`: import line, plus `setSimNNNVisible(false)` in both the login-screen and logout reset blocks, `setSimNNNVisible(bookId === NNN)` in the book-switch handler, `initSimNNN()` in the startup init block, and `renderSimNNN()` in the `setOnViewingPtChange` callback - six separate call sites.
- `server/db/xp.js`'s `SIM_HISTORY_KEYS` array - omitting this doesn't break the sim itself, just silently pays zero `battlesim_win`/`battlesim_loss` XP forever. Its own comment documents this recurring across multiple sims already - nothing catches a miss automatically, so it's genuinely worth a deliberate double-check every time. A missed sim can be backfilled after the fact via a one-time gated migration in `server/db.js` (`admin_settings` flag) that scans every already-saved `pt.simNNN.history` entry and re-awards through the normal `awardXp()`, safe to run any time since `xp_events`' unique `(user_id, event, ref)` makes every individual award idempotent regardless of the outer gate.
- `public/css/battlesim.css`'s two combined ID selectors (the base button style block and its `:hover` block) - **the trigger button has no generic `#play-btn-row button` fallback style, only this explicit per-ID list** (same pattern for `#charsheet-btn`/`#inventory-btn`/etc.). Omitting the new sim's `#simNNN-btn` from both doesn't break anything functionally - the button still renders and works - it just displays as an unstyled default HTML button instead of matching every other trigger button's dark pill styling. (The `#bsim-close, #s8-close, ... { margin-left: auto }` list a few lines below looks like a third instance of this pattern but isn't live anymore - `equipment.css`'s generic `.inv-modal-hdr:not(:has(.inv-count)) .inv-close-btn` rule already covers every close button by class regardless of ID, since all of them carry `class="inv-close-btn"`.)
- `public/js/util.js`'s `ALL_PANEL_OVERLAY_IDS` array (`sim{NNN}-overlay`) - used only by `registerPanelShortcut()`'s keyboard-shortcut path to force-close other open panels before opening this one. Omitting a sim here is low-severity in practice (only one sim's trigger button is ever visible per book, and switching books already auto-closes the stale one via that sim's own `setSimNNNVisible(false)`), but still violates the array's documented "every panel overlay ID" invariant - keep it complete anyway.
- `book_enemies` rows seeded for the new `book_id` (via direct SQL, no admin UI) and `books.has_battle_sim = 1` set for that book (in `server/db.js`, one hardcoded idempotent `UPDATE ... WHERE id = NNN` per sim, added to a growing list right after the one-time bulk migration). Nothing fails loudly if this is skipped - the covers-wall badge/filter and Stats for Nerds' "battle simulators available" count just silently undercount by one.
- `public/mobile/js/battlesim-dispatch.js`'s `SIMS` table (`{path, init, btn}` keyed by `book_id`) - omitting a sim here means mobile's Battle Sim button just never appears for that book, no error.

`level_up` entries include `gainedAbility: boolean` and `newAbilityCount: number | null`. These are set when the new level crosses a threshold where `maxUndos`/`maxFastTravels` increase (levels 31, 41, 51, 61, 71, 81, 91 - each grants +1, from a base of 3 up to a max of 10). When `gainedAbility` is true, the feed renders an additional suffix styled as `.feed-ability` (purple): `· +1 undo & fast travel unlocked (N per run)`. Respects `hide_from_feed` - users who have opted out do not appear in level-up entries.

**Author/Contributor/Admin badges in the feed:** every entry type's SQL in `getFeed()` selects `u.is_author, u.is_contributor, u.display_name` (and, for multi-user entries, per-member in `usernames[]`) so the client can register badge state directly from the feed payload (`feed.js` calls `registerAuthor`/`registerContributor` for every entry before rendering). The client's `_authorMap`/`_contributorSet` caches in `user.js` are otherwise only populated by viewing your own profile or someone else's *public* profile.

`registerAuthor`/`registerContributor` (`user.js`) clear a username's cached entry when passed `false`, not just add it - all 5 call sites (`feed.js`, `public-profile.js`, `boot.js` ×3) always call with the real boolean (`registerAuthor(username, !!isAuthor, ...)`) and let the function itself decide whether to add or delete the entry.

`adminBadge()` (`user.js`) takes the already-resolved `isAdmin` boolean directly, matching `authorBadge`/`contributorBadge`'s own calling convention. All 3 callers (`boot.js`, rendering `#books-username` - the currently logged-in user's own header) have `_isAdmin` (`resolveIsAdmin()`'s result) sitting in scope, driven by `profile.isAdmin` the moment `/api/profile` resolves - a single source of truth for admin status, not re-derived per call site from a separate `adminUsername` comparison.

**Day-card cover backgrounds:** each `.feed-day-card` gets a stack of tiles cycling through every distinct public book played that day, purely client-side in `feed.js`. `_dayCovers(items)` tallies entries with `bookId && bookIsPublic` and a resolvable cover per book, returning all distinct qualifying books' covers sorted by entry count descending. Each qualifying day's cover list is pushed onto `_lastDayCoverLists` (reset per `loadFeed()` call); the card gets `data-day-index` plus an empty `.feed-day-cover-stack` first child, with entries/header wrapped in a sibling `.feed-day-content`.

`_applyDayCoverFlows(root)` builds real DOM tiles per `.feed-day-card[data-day-index]` (not a repeating CSS background, since each tile is a distinct image) - the most-prominent book centered at true aspect ratio, with the day's other books tiled outward above/below to fill the card. A flat overlay (`.feed-day-cover-stack::after`, `rgba(31,41,55,0.9)`) sits on top for legibility; `.feed-day-content` is `position: relative; z-index: 1` so header/entries paint above it. Days with no qualifying book get a `feed-day-card--glass` class instead.

This treatment is applied by two separate selectors sharing the same declarations. With day covers showing (`body:not(.no-feed-day-covers)`), only `.feed-day-card--glass` (originally cover-less days) gets it, to match its real-cover neighbors. With "Show covers in feed" off (`body.no-feed-day-covers:not(.no-feed-glass-cards)`), *every* `.feed-day-card` gets it instead, not just originally-`--glass` ones - with covers off, none of the cards show a real per-day cover any more (a card that would have shown one only ever carries the plain `.feed-day-card` class, never `--glass`), so per the four-combination table above ("covers off, glass on: EVERY day card gets the glass tint"), every card needs the same treatment or they'd mismatch against each other, just with the roles reversed.

**Coverless day cards get a card-local copy of the live rotating cover, not genuine transparency:** `.feed-day-card--glass` (and, with "Show covers in feed" off, every `.feed-day-card`) sets its own `background-image: var(--landing-cover-url, none)` with `background-attachment: fixed` (so every card acts as a window onto the same fixed page background instead of each painting its own independent, scrolling copy of the image - removing `fixed` was tried as a GPU-cost reduction and reverted, since without it each card paints an independently-cropped copy that reads as an opaque patch rather than a transparent window), kept live by `covers.js`'s `_rotateLandingCover()`/`_applyLandingBgPosition()` (which also set `--landing-cover-pos`, both on `document.documentElement`), with the *same* `rgba(31,41,55,0.9)` `::after` overlay a real cover-tile card gets, so the two card kinds read identically. This is deliberately a copy, not `background-color: transparent` showing the fixed `#landing-bg-a`/`-b` layers straight through - `#landing-bg-dim` (`landing.css`, `rgba(15,23,42,0.92)`) sits physically between those layers and anything painted on top of them, painted after them in DOM order, so a genuinely transparent card could only ever show the pre-dimmed composite, never the raw cover a cover-tile gets; there's no way to skip one fixed layer while still showing another from the same stack. A card-local copy bypasses `#landing-bg-dim` entirely.

`background-image` can't be transitioned by the browser directly, so a `::before` layer (behind `.feed-day-content` and the `::after` dim overlay in normal source order, no explicit z-index needed) holds the outgoing cover at full opacity via `--landing-cover-url-prev`/`-pos-prev` and fades it out over 1.5s (matching `#landing-bg-a`/`-b`'s own crossfade) by flipping `--landing-cover-fade` from `1` to `0`. `_rotateLandingCover()` captures the outgoing url/pos and pins fade at `1` before swapping the base image, flushes layout, then sets fade to `0` on the next frame. This crossfade is skipped entirely (direct paint, no fade-from-previous) whenever there's no real previous url - both on the very first paint of a session, and right after `_stopLandingCoverRotation()` (the Ctrl+X hide-everything toggle) explicitly clears `--landing-cover-url`/`-url-prev`/`-fade` along with blanking `#landing-bg-a`/`-b`.

**Graph zoom restore floor:** `state.viewport.scale` (`graph.js`) is saved on every `zoom` event (debounced) and reapplied via `network.focus()` in `_focusNodeAfterLoad()` (`open-world.js`) on every book entry, including the open-world cross-book jump. `clampViewportScale()`'s `MIN_VIEWPORT_SCALE` (0.3) bounds it against broken values, but is low enough that a brief accidental zoom-out looks badly broken once auto-restored on a later visit. `RESTORE_MIN_VIEWPORT_SCALE` (0.6) raises the floor only on that auto-restore path (`Math.max(clampViewportScale(...), RESTORE_MIN_VIEWPORT_SCALE)`) - manual in-session zooming can still reach `MIN_VIEWPORT_SCALE`.

**Two independent Ctrl+Y toggles:** "Show covers in feed" (`_feedDayCovers`/`body.no-feed-day-covers`) and "Transparent background for day cards" (`_feedGlassCards`/`body.no-feed-glass-cards`), persisted via `localStorage` plus synced `ui_prefs.feedGlassCards`/`feedDayCovers` when logged in. With covers off, every day card (not just cover-less ones) gets the glass tint, since there's nothing left to distinguish them. Logging out resets both to their default (on) via `resetFeedDisplayPrefsForLogout()`.

**Recompute:** a module-level `ResizeObserver` on each `.feed-day-card` calls `_scheduleDayCoverRecompute()` on size changes, plus `window.resize`/`fullscreenchange` listeners and an explicit `refreshDayCoverFlows()` hook from panel-collapse toggles. `loadFeed()` disconnects the observer before replacing `#feed-content`'s subtree on every render to avoid leaking observers on removed elements. Image loads are skipped entirely while `body.no-feed-day-covers` is set; toggling back on calls `refreshDayCoverFlows()` explicitly since the skipped tiles were never populated.

**`loadFeed()` is single-flight.** The exported `loadFeed()` is a thin wrapper around `_loadFeedImpl()` that reuses the in-flight promise if one is already running, rather than starting a second full DOM rebuild - `livetab.js`'s 60s leader-tab poll and an SSE-triggered `feed_changed` refresh can land in the same tick. `livetab.js`'s poll itself also skips calling `loadFeed()` entirely while `#main-screen` is showing (a book/graph is open) - the feed panel's own toggle button is hidden in that state (`boot.js`'s `showMain()`), so there's nothing to rebuild for; `showBooks()` calls `loadFeed()` directly on return, so nothing goes stale beyond the interval's own cadence.

**Hover image preview (`#feed-img-preview`, desktop only):** hovering a `.feed-user`/`[data-cover]` element shows an avatar/cover thumbnail (plus level/title text for avatars) via `mouseenter`, hidden again on `mouseleave` via a shared `_hideFeedPreview()`. Clicking the hovered element to open a dialog (e.g. a feed avatar → public profile, or a cover → activity view) is also handled by a single module-level `document.addEventListener('click', _hideFeedPreview)`, registered once at import time (not per `loadFeed()` render), same pattern `tooltip.js`'s own `data-tooltip` system uses.

### Covers panel (`loadCovers`)

`loadCovers()` fetches `/api/public/covers`, `/api/public/books`, and `/api/public/series`, then renders a mixed wall into `#covers-grid`.

- Books/anthologies use their uploaded covers; series cards are built client-side as composites from up to four book covers.
- Sort modes: Latest, Oldest, A–Z, Z–A, Random. Type filters: All, Books, Anthologies, Series, Favorites.
- Lazy loading in sorted modes.
- Search across titles, child names, authors, and series names.
- Logged-in users get a hover `.cover-fav-btn` on each cover. Clicking it updates `ui_prefs.favoriteBookIds`/`favoriteSeriesIds` and can award the one-time `favorite_cover` XP.

**Cover blob cache is capped at `_COVER_BLOB_CACHE_MAX` (24) full-size images, FIFO-evicted with `URL.revokeObjectURL()` on the loser.** `_loadCoverWithProgress`/`_preloadCoverBlob` decode every fetched cover into a `Blob` + `URL.createObjectURL`, keyed by URL in a module-level `Map` for the rest of the tab session. An uncapped version of this cache, or one without a `revokeObjectURL` call, scales unbounded memory growth with however much of the library has been scrolled/browsed, not with any single book - `_cacheCoverBlobUrl()` is the shared insert-and-evict entry point both callers go through to prevent that.

This cache only bounds the blob URL table, not the decoded bitmap memory of every `<img>` currently sitting in `#covers-grid`'s DOM - the lazy-append batches (`_appendLazyBatch`) never remove earlier batches. `_ensureThumbVisibilityObserver()` is a separate `IntersectionObserver` (root `#covers-panel`, `rootMargin: 1200px`) that clears a thumb's `img.src` once it scrolls well outside that margin and re-triggers `_enqueueCoverLoad()` (an instant cache hit if the blob is still in `_coverBlobUrlCache`, a normal re-fetch otherwise) once it scrolls back near the viewport. Registered per-thumb inside `_appendLazyBatch` alongside the existing `_enqueueCoverLoad()` call, disconnected and recreated on every `_stopLazy()`/`_startLazy()` cycle. Only book/anthology thumbs get this treatment (identified by their `data-cover-url` attribute) - series thumbs render up to four covers directly via plain `<img src>` (native browser image cache, not this blob pipeline), never observed.

**`books.js`'s My Books list loads covers via a shared `IntersectionObserver`, only fetching a cover once it actually scrolls into view.** `_bookItemHtml()` renders every anthology/series/stash child into the DOM unconditionally with a `data-pending-cover` attribute holding its cover URL - a collapsed group is hidden via CSS (`display:none`), not omitted. The observer itself is rooted on `#landing-right` (the list's actual scrollable ancestor, not `#landing-wrapper` and not the default browser-viewport root). `#landing-wrapper` has its own `overflow-y:auto` (`landing.css`), but `#landing-right` sits inside it as `position:fixed` with its own separate `overflow-y:auto` (`demo.css`, loaded unconditionally - the filename doesn't mean it's demo-mode-gated) - a `position:fixed` element is taken out of normal flow, so `#landing-wrapper`'s own scroll position never changes when the book list scrolls, only `#landing-right`'s own `scrollTop` does. Rooting on the wrong ancestor here doesn't error or warn, it just makes every element's intersection state permanently stuck at whatever it was on the very first check - no scroll or expand/collapse reveal ever updates it again. `rootMargin: 80px` is a small head start (just enough to avoid a hard blank-then-pop-in flash right at the panel edge), not a real preload buffer - a much larger margin made a big library feel like it was eagerly loading everything at once rather than genuinely just what's visible. `[data-pending-cover]` presence is the only "still needs loading" check - `_loadBookCover()` removes the attribute the moment a cover resolves (success or failure), so a loaded element simply stops matching `_queueBookCovers()`'s `container.querySelectorAll('[data-pending-cover]')` on every later call, with no separate observed-elements bookkeeping needed. Every element `_queueBookCovers()` finds gets an explicit `unobserve()` + `observe()` (never a bare `observe()` skipped for "already observed") to force a fresh IntersectionObserver check, rather than relying on an ancestor's `display:none` → `visible` transition (an expand-toggle, or the search filter revealing a match) to reliably re-trigger the observer's own automatic recheck on its own timing - `unobserve()` is a safe no-op for a target not currently being observed, so this costs nothing extra for the normal (never-observed-before) case. `reset: true` (the default, used on a full `renderBooksList()` rebuild) disconnects the observer first, since every existing target belongs to DOM about to be discarded; `reset: false` (used by the three expand-toggle handlers and `_applyBooksSearchFilter()`) does not disconnect.

The actual `new Image()` fetch, once an element becomes intersecting, goes through `_drainBookCoverQueue()` rather than firing immediately - capped at `_BOOK_COVER_MAX_CONCURRENT` (6) simultaneous in-flight loads, with the rest sitting in `_bookCoverPendingQueue` until a slot frees up. Every newly-observed element gets a fresh IntersectionObserver initial notification regardless of prior observation history, and `renderBooksList()`'s own trailing call routinely lands right after `_applyBooksSearchFilter()`'s internal one - so a large library (1000+ covers) re-rendering more than once in quick succession can otherwise trigger repeated bursts of near-simultaneous requests for whatever's currently near the viewport, which is enough to make a meaningful fraction of them fail outright (silently, since `onerror` doesn't throw - it just strips `data-pending-cover` and leaves the card blank). `_bookCoverInFlightUrls` (url → waiting elements) additionally dedups the case where the same not-yet-loaded url gets re-observed again mid-fetch, registering the new element as a waiter on the existing request instead of starting a redundant second one.

**Filter chips:** Battle sim only, Open world only, and Not in my books (logged-in non-demo only) stack on top of the sort/type filters, state persisted to `localStorage`. All filter/library-state changes re-render the wall immediately, including adding a book/series to your library from within the modal.

**Public-catalog refresh:** event-driven via `EventSource('/api/public/stream')`. When `public_catalog_changed` arrives and the landing UI is visible, the covers wall refetches immediately. Decoupled from the landing background rotator - sort/filter changes don't swap the background.

**Landing background rotation (`covers.js`):** a single `setInterval`, once started, ticks `_rotateLandingCover()` every 60s. `_startLandingCoverRotation()` is a no-op whenever the interval already exists; the interval's own first-ever creation and an explicit cover-source setting change are the only things that force an out-of-cycle repaint. Routine calls (returning to the landing screen, a background data refresh, a transient empty-pool/fetch-failure blip) just call the parameterless `_startLandingCoverRotation()`. `_stopLandingCoverRotation()` (which blanks both layers) is called both by the explicit Ctrl+X hide toggle and by `boot.js`'s `showMain()` when opening a book - `#landing-bg-a`/`-b`/`-dim` are siblings of `#landing-wrapper`, not descendants (see "Main page background" below), so hiding the wrapper alone leaves them visible and rotating behind the graph; `showMain()` also sets their `visibility: hidden` directly, mirroring `_revealLanding()`'s own un-hide in reverse. `_rotateLandingCover()` no-ops if there's no cover available, and guards against overlapping crossfades with an in-flight flag (`_rotationInFlight`/`_rotationQueued`) - a request arriving mid-transition queues instead of interrupting the current transition. Runs on mobile too, so the coverless feed day cards' `feed-day-card--glass` tint (above) has something to show through there - `_canDragLandingBg()` still returns `false` on mobile, so the drag-to-reposition affordance stays desktop-only.

**Header badge refresh:** authenticated `EventSource('/api/user/stream?token=...')`. On a refresh hint the client immediately refetches `/api/notifications`, `/api/feedback`, and `/api/forum/latest` - no waiting for the 60-second fallback poll. `handleSetPrefs` (`server.js`) also calls `userBadgePush(userId)` after every successful `PATCH /api/prefs`, so the same stream doubles as a live UI-prefs sync: `_scheduleLiveUiRefresh`'s `prefs` flag (`notif.js`) calls `syncPrefs()` on receipt, reaching any other open tab/device for that user within the same ~100ms debounce as the badge refreshes, rather than only picking up the change on that session's next fresh load. Since `userBadgePush` broadcasts to every connection for that user including the one that made the change, a save can trigger its own tab's `syncPrefs()` too - `syncPrefs()` merges the GET response with `_localPrefOverrides` captured *after* the request resolves (not a snapshot taken before it), so a pref saved again while that GET was still in flight can't get clobbered back to its pre-save value for the moment it takes the next sync to catch up.

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

Every modal closes when clicking its backdrop, via a `click` listener checking `e.target === overlay`, combined with a separately-tracked `mousedown` - an overlay `click` only counts as "clicked outside" if the preceding `mousedown` also landed on the overlay (a `click` fires based on where the mouse releases, so a drag starting inside the modal and releasing outside is not treated as an outside click).

`#public-modal-overlay` and `#guide-modal-overlay` (`boot.js`) share one module-level `_mousedownOnOverlay` tracker, set by a single `document`-level `mousedown` listener checking `e.target.classList.contains('modal-overlay' | 'pub-overlay' | 'inv-overlay')` - any overlay needs one of those three classes to participate. `#feedback-modal-overlay`, `#stats-modal-overlay`, the notebook overlay, and the equipment/inventory item-picker overlays each keep their own local `let _mdOnOverlay` + `mousedown` listener instead, since a `mousedown`/`click` pair only applies to the one element it's attached to.

**Forum modal reveal-after-load (`boot.js`):** `#forum-modal-frame` is a persistent `<iframe src="/forum">` - a link clicked inside it navigates `contentWindow`'s own location without ever touching the `<iframe>` element's `src` attribute, so `openForumModal()` always force-resets it back to `/forum` via `contentWindow.location.replace()` on every open (comparing against `getAttribute('src')` would miss any in-iframe navigation entirely). That reset is only revealed (`forumOverlay.classList.add('active')`) once the iframe's `load` event actually fires, not immediately - revealing right away left whatever thread/category was still rendered from the previous session visible for a brief moment before the reset page replaced it. The pending `load` listener is tracked in a module-level `_forumRevealPending` + `_cancelForumReveal()` (top of file, above `navigateToBook`), and every path that can close or navigate away from the forum modal - `closeForumModal()` (close button/Escape/backdrop), `navigateToBook()`, and `showBooks()` - calls `_cancelForumReveal()`, not just the one wired to the close button. Without that, closing the modal before the reset finished loading didn't actually stop anything: the listener still fired moments later and reopened the modal on its own.

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

**Every colour `nodeColor()` returns includes matching `highlight: {background, border}` and `hover: {background, border}`** (via the `_withHighlight()` wrapper at every return site), copying the node's own colours rather than leaving either unset - vis-network falls back to its own hardcoded default hover/select palette (`#D2E5FF` background, `#2B7CE9` border) for any node color object that doesn't specify these, so a node without an explicit `highlight`/`hover` would repaint with that unrelated generic blue on mouseover or selection instead of its actual colour. `highlight` applies on selection, `hover` on mere mouse-over - vis-network's own option parsing keeps them as two independent sub-palettes, so both need to be set. The portal-specific colour override (further down, `isPortal ? { ...nodeColor(sec), highlight: { ...(nodeColor(sec).highlight || {}), border: ... } } : ...`) spreads `highlight` from the base function but not `hover`, so a portal node's gold cue shows on its base fill and while selected, not while merely hovered. Not reachable in the admin watch prototype (`admin/js/watch.js`'s port of this function) - its network is created with `selectable: false`, so nodes can't be hover/select-highlighted there at all.

`admin/js/watch.js`'s `computeOutcomes()`/`edgeColor()` mirror `graph.js`'s functions exactly (same red/green/orange/grey palette), and `render()` builds a `runEdges` set from `activePt.path` the same way `graph.js` does, keyed to match its own existing `${secId}->${dest}` edge-id format (not `graph.js`'s `${sec}>${dest}` - the two files' edge ID conventions differ, so the set has to be built in whichever format the consuming lookup already uses).

**Certain-death/win detection (`graph.js › computeOutcomes`, mirrored in `admin/js/watch.js` and `server/export.js`'s `_computeOutcomes`):** a section is 'death' only if *every* one of its choices is itself already 'death', and 'win' only if *every* one of its choices is itself already 'win' - same quantifier both ways ("no matter what you pick from here"), not a walk down a single chain. Win is deliberately not "any choice can reach `0`": a section with one path to certain victory and another to certain death promises nothing either way, since the player could still pick the death branch - it stays unresolved, same as any other genuinely mixed branch. A section can also branch into two or more choices that each, independently, still only ever end in death further down their own chains; all three implementations resolve that correctly. Unmapped sections and true cycles (a loop with no escape to `-1`/`0`) stay unresolved rather than guessed - an edge is never painted red/green without proof. Computed once per render/build (not once per edge) and looked up by section id from the resulting map.

`GET /api/admin/watch/:userId/:bookId` (`server/routes/watch.js`) also returns a `bgPref` object (`db.getBookBgPref(userId, bookId)`: `{ bgHidden, bgPosY, coverUrl }`, reading `user_books.bg_hidden`/`bg_pos_y` plus `books.cover_path`) so the watch canvas can show the same background image, in the same moved position (or hidden entirely), that the watched player themselves set via `bg.js`. `admin/js/watch.js`'s `applyBgPref()` mirrors `bg.js`'s `_applyBgPref()` (same gradient overlay, same `background-position-y` math) directly on `#graph-container` rather than `#main-screen`. Keyed off `${bgHidden}|${bgPosY}|${coverUrl}` so a poll with no actual change is a no-op; reset alongside the rest of `resetForNewBook()`'s per-book state when an open-world player portals to a different book mid-watch.

**Node tooltip terminology:** nodes with a path to a `-1` endpoint show "can lose here" (not "die"); nodes with a path to `0` show "can win here". The legend follows the same wording: "Can lose here", "Lost here" (for death-result run endpoints), "Battle death ended here" (for battle-result endpoints).

**Run labels:** `success` → "★ Victory", `battle` → "⚔ Battle Death", `death` → "✝ Lost". Admin panel playthrough result badges: Victory ★ (green), Battle Death ⚔ (amber), Lost ✝ (red).

The `displayPt` variable is `currentPlaythrough() || viewingPt`. Steps 1–3 use `displayPt.path`; step 4 only fires when `displayPt` is null.

A small green book badge is painted over nodes that have a note, using vis-network's `afterDrawing` event (`drawOverlays` in `graph.js`). This draws directly to the canvas in network coordinate space so it tracks zoom and pan automatically.

Nodes with a `priority` field also get a small triangle badge painted by `drawOverlays` at the top-left of the node (opposite corner from the note badge):
- `'high'` - green upward triangle
- `'low'` - red downward triangle

`priority` is absent when normal. It is stored on the graph node entry. If set on an as-yet-unmapped section (no choices recorded), `state.graph[id]` is auto-created with `{ choices: [] }` so the priority can be stored. The same stub-creation applies when saving a note on an unmapped section.

**Grid overlay and snap-to-grid** (`state.showGrid`/`state.fogOfGrid`/`state.snapToGrid`, toggled from the background right-click menu's **Grid** submenu, see `#bg-ctx-menu` in `index.html` and `bg.js`): the grid is drawn by `drawGrid` in `graph.js`, registered on vis-network's `beforeDrawing` event (not `afterDrawing`, unlike the note/priority/battle overlays) so the lines sit *under* nodes and edges instead of on top. `beforeDrawing` fires in the same already-transformed canvas context as `afterDrawing` (pan/zoom translate+scale applied before either fires), so grid lines are drawn in graph/world coordinates via `network.DOMtoCanvas()` on the container's screen corners, and pan/zoom with the map like everything else. Spacing is a fixed constant (`GRID_SIZE` in `graph.js`), not user-configurable.

While `snapToGrid` is on, zoom is floored at `minSnapScale()` (`GRID_SIZE` scaled so one cell is never smaller than `SNAP_MIN_SCREEN_PX`, both in `graph.js`) - enforced by `enforceSnapZoomFloor()`, called on every `'zoom'` event and once immediately after the toggle switches on. Below that floor a grid cell renders smaller on screen than typical touch-drag precision, so a drag intended to land back on its original cell lands on a neighboring one instead. This floor is independent of `MIN_VIEWPORT_SCALE`/`clampViewportScale()` above, which only bounds what gets persisted/restored, not live in-session zooming.

`showGrid` and `fogOfGrid` are mutually exclusive (enforced in `boot.js`'s click handlers - setting one clears the other before `saveState()`), never both true at once. When `fogOfGrid` is on, `drawGrid` first builds a clip region out of a circle (radius `FOG_RADIUS`, also fixed) around every node's current position, via `ctx.clip()`, before drawing the same full-canvas grid line set - so the lines only render where they fall inside a node's halo. `showGrid` skips the clip step and draws across the whole visible canvas.

Fog positions are cached the same way as the note/priority/battle overlay positions just above (`_fogPositions`/`_fogPosDirty`/`_fogDraggingActive` in `graph.js`) - `beforeDrawing` fires on every animation frame during any pan/zoom/drag, so recomputing every node's position and rebuilding the multi-circle clip path from scratch each frame would be wasted work once the map has more than a handful of nodes. Positions only get refetched when something actually moved: right after a drag ends, or continuously while a drag is in progress.

Snapping happens once, in the `dragEnd` handler in `initGraph()`, rounding only the just-dropped node's `x`/`y` to the nearest grid multiple before it's written to `state.positions` - turning `snapToGrid` on never touches any node that isn't actively being dragged. `snapToGrid` is independent of the other two - it can be combined with either, or neither.

`_assignLocalPositions()` (auto-placement for newly-added nodes on a book that already has a saved layout, in `graph.js`) also snaps its output when `state.snapToGrid` is on, after `_chooseLocalPosition()`'s overlap-avoidance scoring runs against the real, unrounded neighbor positions - not before, so rounding doesn't skew the scoring itself. A freshly-added node was never hand-placed by the user, so this doesn't conflict with "snap never retroactive"; there's no existing deliberate placement to disturb. The one accepted trade-off: rounding can occasionally land a new node a little closer to a neighbor than the scoring intended, same as the drag-end snap already accepts.

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

`syncGraph` calls `_assignGridPositions()` instead of `_assignLocalPositions()` whenever `state.gridLayout` is set - a persisted, one-way flag written the first time a book has zero saved positions at sync time, and never cleared afterward. This is a BFS-depth grid - each node's distance (in choices) from the playthrough's start section becomes its column, siblings within a column stack vertically - ported from `public/mobile/js/graph-view.js`'s `_layout()` with the axes swapped (mobile grows down, desktop grows right).

For each missing node, `_assignGridPositions()` first checks `_getPositionedNeighbors()` for an already-positioned choice-neighbor (either direction) and, if one exists, places the new node one grid column past that neighbor's own x, instead of by raw BFS depth. A node with no positioned neighbor falls back to `depth * _GRID_LAYER_GAP`. Mobile's `_layout()` has the equivalent logic via its own local `_positionedNeighbors()`. Every node the grid places gets `physics: false`. `_assignGridPositions` only ever fills gaps, never moves an existing position.

On subsequent loads (`state.positions` is non-empty) physics is disabled from the start. `improvedLayout` is also disabled to prevent vis-network from overriding saved positions.

Every node update passes `physics: false` per-node to pin nodes that have a saved position. New nodes (no saved position) get `physics: true` so they are placed by the solver while existing nodes stay put.

When new nodes are added (`handleRecordChoices`), `syncGraph` detects unpositioned nodes and schedules (debounced 150ms, `RESTABILIZE_DEBOUNCE_MS`) a re-enable of physics with `stabilization: { fit: false }` (prevents vis-network from calling `fit()` after stabilisation, which would zoom out), runs `network.stabilize(300)`, and on `stabilizationIterationsDone` saves all new positions. The `_stabilizeHandler` reference is tracked so any in-flight handler is unregistered before starting a new one.

**Debounced, not immediate:** `render()` calls `syncGraph()` on every invocation, and several distinct user actions can each trigger their own `render()` within a few ms of each other (e.g. losing a run, marking it public, and starting a new one all chain through separate `saveState()`/UI-update callbacks). Restarting the physics solver from scratch on each of those calls would interrupt a not-yet-finished `stabilize(300)` pass before it can ever fire `stabilizationIterationsDone` - the graph would then visibly re-jostle indefinitely, worse the more fixed obstacles (e.g. manually-added nodes, which get a saved position immediately and `physics: false`, but still count toward `avoidOverlap` collision-avoidance) the solver has to route around, since more obstacles means a slower convergence that's more likely to still be running when the next render arrives. `_restabilizeTimer` (a plain `setTimeout`, cleared and rescheduled on every qualifying `syncGraph` call, and cleared in `destroyNetwork()` to avoid a stray callback touching a torn-down network) means only the last call in a tight burst actually kicks off a pass.

**Physics pass concurrency:** a `_stabilizing` flag is true only while a `stabilize(300)` pass is active. If the debounced restabilize callback fires while `_stabilizing` is already true, it reschedules itself to check again instead of starting a second concurrent pass; the in-flight pass's own completion handler clears the flag. `_stabilizing` is also reset in `destroyNetwork()` (book switch mid-pass) and in the `else if (hasSavedPositions)` branch (force-disabling physics while a pass is active).

Every `stabilizationIterationsDone` handler calls `network.off('stabilizationIterationsDone', ...)` on itself right before nulling its own `_stabilizeHandler` reference. The "unregister before starting a new one" guard tracks the most recently registered handler.

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
3. Deletes any section left with an empty `choices` array (now unmapped) - **unless** it's part of a playthrough path, or carries a note/priority/battle/color/portals/showNote/manual worth not silently discarding. Three other places apply the identical "worth keeping" check on their own single node: `play.js`'s `_cleanupOrphanedTargets`, `boot.js`'s `_pruneDiscovered` (runs after toggling priority/battle/color), and the note modal's own save handler in `play.js` (runs after clearing a note). All four must check the same metadata list, or one of them will silently wipe a node - e.g. a handler missing `portals` from its list would delete a node's portal the moment its note or priority/battle/color was cleared if it had no other choices. `manual` (set by the "+ Add node" feature below) has to be in all four for the same reason - a freshly-placed node with nothing else on it yet is otherwise indistinguishable from genuine debris.
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

**Auto-nav:** a section with exactly one choice not yet in the run's path is auto-walked through without requiring a click, so a long chain of single-choice sections advances in one visual beat - with two exceptions, both because `navigate(dest)` calls `endPlaythrough()` immediately for a terminal `dest`, which would resolve the run before the player got a chance to do anything about it:
- **The destination is itself a terminal (`isTerminal(secData.choices[0])`, i.e. `-1`/`0`, death/win):** never auto-navigated into, regardless of portals. Requires a click on the final death/win step.
- **The section has a portal** (`_owIsOpenWorld && secData.portals?.length`): otherwise a section that's both a forced single choice *and* a portal would always auto-resolve the choice before the player ever saw the portal option.

`play.js` exports a single shared `wouldAutoNav(sec, pt)` implementing this exact condition (including the `isTerminal` check), used both to skip a redundant graph-focus animation on ~9 `network.focus()` call sites across `play.js`/`boot.js`/`open-world.js`, and by `undoRun()` (as a locally-renamed `wouldAutoNavHere` to avoid shadowing the import) to decide where to stop popping the path. All callers must go through this one function rather than reimplementing the condition - see "Graph viewport jitter" below for what happened when most `network.focus()` sites didn't.

**`undoRun()`** pops back past auto-nav'd (forced single-choice) sections to the last real decision point, but stops early at a passthrough section carrying its own metadata (note/priority/battle/color/portal/manual) rather than silently skipping it - it has to mirror the render-side auto-nav condition exactly (including the portal exception above), or it can incorrectly decide a portal node *would* auto-nav (when it actually won't anymore) and skip past a node it should have stopped at.

**Graph viewport jitter guard:** `navigate()` skips its `network.focus()` camera-pan call whenever `wouldAutoNav()` says the landed-on section will be immediately auto-navigated away from, because stacking multiple 1s vis.js focus animations back-to-back corrupts vis-network's internal camera-animation state - it can keep bouncing between several distinct viewport positions/scales for several seconds, sometimes not settling until the page is refreshed and the `Network` instance is recreated from scratch. Every `network.focus()` call site that fires right after a `render()` on an active playthrough - `startPlaythrough()`, both `startPortalRun()` sites, `loadRun()`, `undo()` (all `play.js`), fast-travel's `doJump()` (`boot.js`), and three sites in `open-world.js` (series-run-start, `_focusNodeAfterLoad()`, cross-book fast-travel) - must route through the same shared `wouldAutoNav()` export, or it can race against `navigate()`'s own auto-nav chain and reproduce the same corruption. A few call sites are deliberately left unguarded because they're one-off explicit user actions outside any auto-nav chain, not part of the render-then-focus race: `center-current-btn`, find-node's Enter/click handler (both `boot.js`), and the pre-series-run trail viewer (`play.js`).

**Second jitter path - stale `sec` in `_focusNodeAfterLoad()`:** `showMain()` (`boot.js`) reads `currentSection()` synchronously right after `render()` and passes it straight into `_focusNodeAfterLoad(sec)`. If that section starts a straight-path auto-nav chain, the chain resolves asynchronously (`renderPlaythroughPanel()`'s own chained `setTimeout(0)` hops, `play.js`), not within that same synchronous call - so `sec` is captured *before* the chain has moved anywhere. By the time `_focusNodeAfterLoad`'s own 50ms-later `doFocus()` check runs, the chain has usually already advanced `pt.path` past that stale section, which makes `wouldAutoNav(sec, pt)` (checked against the now-stale `sec`) incorrectly read as "not auto-navving" (`pt.path` now already contains what was `sec`'s one next choice) - firing its own `focus()` at the wrong, already-passed-through node at the same moment the chain's own correctly-guarded final-hop `focus()` fires at the real current section, the same viewport corruption as above (e.g. reopening a book whose active run sits at an unresolved chain start). `doFocus()` must re-derive `currentSection()` fresh at fire time (falling back to the passed `sec` only if that's null) rather than trusting the value it was scheduled with.

**Alternate start:** a book can be started from a section other than its configured default (e.g. flip/dos-a-dos print editions with two beginnings), via a dedicated modal. Hidden for open-world/series books, which use the series-run picker instead. With 2+ previously-used start sections, "New Run" opens a picker instead of starting immediately.

**Node-color logic exists in three independent reimplementations** (`graph.js` canonical, `public-profile.js`, `server/export.js`) of the same rules. All three must stay in sync or a node's battle indicator can be silently lost.

`_buildPubSegNetwork`'s `hasDeath && hasWin` case (a section whose own choices include both a death and a win option) uses `COLORS.bothOutline`/`GRAPH_COLORS.bothOutline` (`#0f172a`/`#f59e0b`), matching the single-outcome `deathOutline`/`victoryOutline` pattern - distinct from the separate "ends"-based case (a node that's the historical ending point of both a death-run and a victory-run), which `public-profile.js`'s `endNodeMap` structure can't represent since it maps one id to one single result.

Both endpoints are fully unauthenticated (no `authenticate()` call in their `server.js` handlers), and both build a multi-book journey by querying every book in the series the run passed through. Each of the two near-identical `seriesBooks` queries (`getPublicRun`, `getPublicSeriesRun`) independently filters `b.is_public = 1` - an open-world series being public only means the *series* is public, not every book in it.

**Own graph view and alternate starts:** `graph.js`'s `nodeColor()`/`nodeLabel()`/`syncGraph()` (the private graph's yellow "start" highlight, "START" label, and bold start-node font) follow `_effectiveStartSec(displayPt)` - the currently-displayed run's own `path[0]` when there is one, falling back to `state.startSection` when no run is being viewed *or* when the displayed run's `path[0]` is a portal entry point rather than a deliberate alt-start (`pt.portalEntry`, set by `startPortalRun`/`_syncSeriesRuns` - see "Pre-series runs"/portal-created-playthroughs note above). `graph.js`'s `subtreeToDelete()` and `play.js`'s `_cleanupOrphanedTargets()` (see "Node deletion" below) use a separate multi-root mechanism for the same underlying concern - since orphan-detection has to consider every alternate-start run's component simultaneously, not just whichever one is currently displayed.

**Onboarding pulse on `#choices-input`:** `play.js` tracks `_choicesRecordedCount` (exported via `setChoicesRecordedCount`, threshold `CHOICES_PULSE_THRESHOLD = 50`) and applies a `choices-input--pulse` CSS class below the threshold. Increments only via `#record-btn`'s submission path, not the "edit choices" modal. Persisted via `ui_prefs.choicesRecordedCount` (`prefs.js`). Respects `body.reduce-motion`. `applyPrefs()` toggles the class directly on the live `#choices-input` element as soon as the server value arrives, independent of the play area's own `render()` cycle.

---

## Dice roller (`dice.js`)

Per-run dice state, stored on `pt.diceState` (`{ count, die, lastResult, previousResult }`) and persisted via `saveState()`, mirroring `pt.charSheet`'s per-run scoping. `_legacyDiceState()` migrates older/malformed shapes on read. `state.dicePrefs` remembers the last-used count/die at the book level so new runs start with the same setup.
`getRunPt()` returns `viewingPt || currentPlaythrough()`, same as the compact display logic elsewhere - so browsing a completed past run via the trail shows *that* run's dice state, not the active run's, gated by `isDiceReadOnly()` (`!!getRunPt() && !currentPlaythrough()`, same condition as `charsheet.js`'s `_readOnly`): the throw button, ±count buttons, count input, and die-shortcut buttons are all `disabled` (visible-but-disabled, not hidden - `_applyDiceReadOnly()`, re-run from the same `setAfterRenderFn` hook that repaints the dice UI after every render), and each handler also early-returns as defense-in-depth. Styled via `.dice-shortcut-btn:disabled`/`.dice-adj-btn:disabled`/`#dice-count-input:disabled`/`#dice-throw-btn:disabled` in `dice.css`.

## Character sheet (`charsheet.js`)

A self-contained module for tracking book-specific character stats per book. Imports only `state.js` and `i18n.js`. To remove: delete `charsheet.js`, remove its import line from `boot.js`, and delete `public/css/charsheet.css` (and its `<link>` in `index.html`).

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

**Adding an item (`inv-add-btn` → `_openPicker()`/`_renderPicker()`):** picking a tile from the catalog picker calls `addItemToInventory(itemId)`, which merges into an existing stack (same itemId/note/label/visible) if one exists rather than always creating a new slot - picking the same item repeatedly stacks its quantity instead of producing a separate `qty: 1` line per click, matching every other place items get added (e.g. unequipping back into inventory).

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

## Live reading (`liveread.js`)

A self-contained module that renders a book's actual prose section-by-section inside the play area, with clickable in-text choices. Distinct from everything else in the app: it's the only feature that stores real book prose server-side (`book_sections` table) rather than purely structural/mechanical/user-generated state.

**Gating:** open to every user - `_canLiveRead(userId)` is an always-true stub, kept as its own function (rather than deleted outright) so a future re-gate, if ever needed, has one place to change. `getBooks()`/`getAllPublicBooks()` both return `hasLiveReading` per book (`!!has_live_reading` OR, for an anthology container, `!!` any child's flag) - purely a per-book flag now, no per-viewer computation. `GET /api/books/:id/sections/:secId` (`handleGetBookSection`) still calls `db._canLiveRead(userId)` (now a no-op check) rather than deleting the call site, so re-gating later doesn't require re-adding it. Client-side, `boot.js`'s book-switch call site reads the server-computed `hasLiveReading` flag off the cached book record (`_bk?.hasLiveReading`) - no client-side username or book-ID hardcoding, unlike the per-book battlesim pattern (`setSimNNNVisible(bookId === N)`).

**Discoverability on the covers wall (`covers.js`):** `getAllPublicBooks()` (`server/db/feed.js`) exposes the same per-book `hasLiveReading` (aggregated across anthology children the same way as `hasBattleSim`) to the public/anonymous covers endpoint, no login required. A "Book available" filter chip (`#covers-filter-livereading`, same `_wireCoversFilterChip` pattern and `localStorage` persistence as the battle-sim/open-world chips) filters the grid to books with prose imported. Each matching cover gets an open-book icon badge (`.cover-livereading-badge`) pinned bottom-left, same 18×18px slot as `.cover-battlesim-badge` - when a cover has both badges, the live-reading one is shifted to `left: 26px` via a `data-badge-offset="1"` attribute set in `_makeCoverThumbHTML` rather than overlapping the battle-sim one.

**Font size:** two header buttons (`#liveread-font-dec`/`-inc`, styled off `.inv-close-btn`, not a native `<input type="number">`) plus a live `#liveread-font-pct` readout ("− 100% +") step `.liveread-body`'s font size between 70%-130% in whole 5% increments. Stored and stepped as a whole percent (`liveread-font-pct` in `localStorage`, same tier as `trailCollapsed`), not as a raw rem value, so every step and the max are round numbers. The percent is the source of truth; rem is derived from it (`FONT_SIZE_BASE_REM * pct / 100`) only when writing the panel-scoped `--liveread-font-size` CSS var (`panel.style.setProperty`, not global, so it can't leak into another panel sharing `liveread.css`).

**Reading font:** self-hosted PT Serif (`public/vendor/fonts/pt-serif/`, ~450KB across 16 woff2 subset files, vendored the same way vis-network is rather than pulled from a CDN at runtime) is `.liveread-body`'s font-family - designed for screens (unlike Times New Roman, which is print-hinted only) with native Cyrillic support. `.woff2`/`.woff` are registered in `server/runtime-state.js`'s `MIME` map so static serving doesn't fall through to `application/octet-stream` for either.

**Loading state:** `_showSection()`/`_showExtra()` both replace `#liveread-body` with a `.liveread-loading` indicator (the same `.feed-loading-graph`/`.flg-*` animated graph icon as the activity feed, both defined in `demo.css`) before fetching, then overwrite it with the real HTML once the response resolves - mobile's reader uses its own `mlg-*`-prefixed copy of the same markup/animation (`public/mobile/css/style.css`), since mobile never loads `demo.css`. Not gated behind `reduce-motion`, since it's a functional loading indicator rather than a decorative animation. The indicator only shows for the first section fetched after the panel opens (`_isFirstShowSinceOpen`, reset in `_open()`/`_close()`) - normal page-to-page reading swaps text with no flash, and a cache hit (see below) skips it even on that first show.

**Section cache and prefetch:** `_sectionCache` (a plain in-memory `Map`, keyed `bookId:sec`, never persisted) holds every section response fetched this session. `_fetchSectionData()` checks it before hitting the network, and every successful `_showSection()` fires an unawaited `_prefetchChoices()` for the section's own `choices` array (skipping terminals and already-cached targets) - a reader who clicks a link they were just looking at gets it from cache instantly. The cache doesn't shrink on book switch; stale entries for a previous book just sit unused.

**Hovering an in-text choice link** highlights the matching node on the graph (`network.selectNodes([id])`/`selectNodes([])` on mouseenter/mouseleave), wired fresh after every `_showSection()` re-render since the body's `innerHTML` is fully replaced each time - same pattern as the run-trail's pills and the choice-list buttons in `play.js`.

**Wheel scroll is fixed to one line per tick**, overriding the browser's default OS-multiplied scroll amount entirely (`{ passive: false }` + `e.preventDefault()` on `#liveread-body`'s own `wheel` listener) - every wheel event over the panel is fully captured, so scrolling past the panel's own top/bottom never chains through to scroll whatever's behind it. The per-line step is measured with `Range.getClientRects()` against the panel's own actual rendered text (one rect per wrapped line), not `getComputedStyle().lineHeight` - computed style reports what the CSS asked for, not necessarily the exact box the browser laid text out in (rem-to-px rounding, browser-level text zoom), while `getClientRects()` measures the real on-screen box directly and can't drift from what's actually visible.

**CPU while reading:** every page turn reveals a brand-new, never-before-mapped section, which usually has no already-positioned neighbor for `graph.js`'s `_assignLocalPositions` to place it next to - it falls through to a full `stabilize(300)` physics pass on the whole graph. At normal reading pace (seconds apart) that's well outside `RESTABILIZE_DEBOUNCE_MS`, so a full pass fired on every single page turn, real sustained CPU cost for a slower reader. `liveread.js` calls `graph.js`'s `setLightweightRestabilize(true)` on panel open (`false` on close), which drops the iteration count to 60 while active - a single newly-revealed node doesn't need full-layout convergence, and the reader isn't watching the physics settle anyway. Fast/rapid-fire clicking (e.g. testing) can still land just outside the base 150ms debounce window often enough to fire a fresh pass per click even at the reduced cost, so the debounce itself also widens to 600ms while `_lightweightRestabilize` is active, coalescing bursts into far fewer passes total. If a pass is still pending when the panel closes mid-debounce, it fires at the full 300-iteration cost when it eventually runs (`_lightweightRestabilize` is re-read at fire time, not capture time) - a full-quality settle is exactly what's wanted once reading has actually stopped.

**Data model:** `book_sections(book_id, section_id, html, choices)` - `choices` is a JSON array of target section IDs (numbers, or -1/0 for death/win), parsed once at import time from the source HTML's own `<a href="#section-N">` links, never derived at request time. Canonical and shared across every reader of the book (unlike `state.graph`, which is per-user). Populated by a one-off import script per book; no admin UI yet. `books.has_live_reading` flags which books have imported data.

**Section-id 0 is unusable:** `isTerminal()` reserves numeric `0`/`-1` as the win/death sentinels, so a book whose own numbering starts at "chapter 0" (e.g. book 868) can't have a `book_sections` row for it - `0` can never be a real navigable `state.graph` node. The import folds chapter 0's prose into the start of chapter 1 instead of dropping it, stripping chapter 0's own (now-redundant) "turn to chapter 1" transition first so it doesn't survive as a nonsensical self-referencing choice. This matches how real players had already been mapping the book by hand before any of this existed - `state.graph['1']` already carried chapter 1's own choices, with chapter 0 simply never recorded as its own node (no other way to represent it), so the import doesn't diverge from existing playthroughs.

**UI:** a floating panel (`liveread-panel`, `public/css/liveread.css`), docked right, internally scrollable, toggled by `#liveread-btn`. Deliberately not built on the `.inv-overlay` blocking-modal pattern used by every other panel in the app - it has no full-screen backdrop, so the graph stays visible and interactive underneath while reading.

**Graph-node click preview:** clicking any graph node (`network.on('click', ...)` in `boot.js`) opens a read-only preview of that section's text via `previewSection()` (`liveread.js`), gated on `isSectionMapped()` (`state.js`) - true only for a section colored purple/"Mapped" in the legend, i.e. one the reader has actually read before, in any run ever (`state.graph` is account-wide, not per-run), never a section merely known-as-a-destination (grey/"Discovered") but never visited - clicking one of those silently no-ops, so a reader can't read ahead just by touching the map. Sets a module-level `_previewSec` flag so `_onChoiceClick` can tell preview mode apart from normal reading: an in-text link inside a preview never does real navigation, only ever opens another gated preview (or no-ops if its target isn't mapped either). The "Return to where you left off" link (`liveread-preview-return`) calls `_returnToCurrent()`, which re-renders wherever the actual run stands (current section, else a just-finished run's terminal screen, else closes the panel) - critically it clears `_shownSec` first, since `previewSection()` deliberately never touches `_shownSec` while previewing (it renders directly rather than going through `_showSection()`), so `_showSection()`'s own "already shown" cache guard doesn't silently no-op the return. Mobile's reader.js has the exact same gate (`_onGraphTap`/`_previewSection`/`isSectionMapped`) - the two were kept deliberately in sync after mobile's original version only checked the current run's own `pt.mVisited`, missing sections read in a past, different run.

**`public/js/liveread-shared.js`:** the one shared module between desktop's liveread.js and mobile's reader.js, deliberately zero-import so pulling it into mobile can never drag in anything heavier (see reader.js's own header comment on why mobile doesn't just import liveread.js directly). Owns only the pieces with truly zero platform-specific shape: the win/death `TROPHY_SVG`/`BROKEN_SHIELD_SVG` icon markup and `terminalHeadingKey(win)` (which i18n key the heading uses). Both SVGs use the generic class `end-icon`, not a platform-prefixed one - each platform's own CSS still independently defines that class's size/color/filter rules, scoped under its own wrapper (`.liveread-end` on desktop, `.m-end-achievement` on mobile). Everything else about the run-end screen (DOM ids, panel-vs-pane model, the rest of the markup) stays platform-specific on purpose - unifying it would cost a real DOM-abstraction layer for a screen that's simple enough not to need one.

**Trigger button lives in `#play-btns-bar`, not `#play-btn-row`:** every other panel's trigger (`#charsheet-btn`, `#inventory-btn`, each `#simNNN-btn`) gets dynamically appended to `#play-btn-row` (`charsheet.js`'s `getPlayBtnRow()`), but that row can hold 4-5 buttons at once (Equipment/Inventory/Character Sheet/Battle Simulator) and a `flex-wrap`/`flex-direction:row-reverse` interaction there could stack a button on top of a neighbor instead of cleanly wrapping it to a new row if `#liveread-btn` joined them too (every button in that row also has `flex-shrink:0` to guard against this, but `#liveread-btn` is kept out of that row entirely rather than relying on that alone). It lives as static markup in `index.html`, between `#guide-btn` and `#notebook-btn` inside `#play-bottom-stack`'s `#play-btns-bar` - a row that only ever has 2-3 buttons, so there's no crowding risk there. Styled alongside its siblings in `charsheet.css`, not in `liveread.css`.

**Stays visible-but-disabled, not hidden, when the current book has no live-reading data:** `setLiveReadVisible(visible)` toggles `btn.disabled` and a themed `data-tooltip` ("Not available for this book") instead of `display:none` - `#play-btns-bar` only has 2-3 buttons, so hiding/showing this one on every book switch visibly shifted the row's width and Notebook's position. `registerPanelShortcut`'s (`util.js`) guard had to be updated to also check `btn.disabled`, not just `display === 'none'` - it calls `open()` directly rather than simulating a click, so the native `disabled` attribute alone doesn't block the `R` keyboard shortcut the way it blocks a real click.

**Positioning:** docked right, under `#legend` (`right: 12px; top: calc(var(--legend-h, 260px) + 24px)`), `top` anchor only with `max-height: 50vh` - a single anchor plus a capped height, rather than anchoring both top and bottom, avoids the panel expanding to cover a neighboring floating element (`#run-trail-float`/`#notes-display`/`#dice-roller-wrap`) on short viewports. `--legend-h` is tracked by a `ResizeObserver` in `liveread.js`'s `initLiveRead()` (mirrors `charsheet.js`'s `--play-btn-row-h` tracking) since the legend's real height varies with its collapse toggle and the portal legend row's visibility.

**Reveal-on-arrival:** rendering the current section merges its own `choices` array into `state.graph[sec]` via `play.js`'s exported `commitChoices()` (the same function manual graph edits use) - only the current node's outgoing edges, never the whole graph at once. Clicking an in-panel choice link calls `play.js`'s `navigate()` directly, so XP/mapping/`saveState`/graph-render all fire exactly as for a manually-recorded choice.

**Non-choice in-text links ("extra" content):** source HTML occasionally links to something that isn't a real, choosable section - an unnumbered closing "Epilogue" some books tack on after their actual win section (book 708), or a rules-reference link repeated inline (`#rules`, `#rule-NNN`, book 186/708). Importing one of those as a normal `#section-N` target would register it as a graph node/choice it isn't - the epilogue is just bonus prose hung off an existing win section, not a new decision point. `_onChoiceClick` only routes `href^="#section-"` links through `navigate()`/`commitChoices()`; any other in-text `#...` link is treated as pure text and handled by `_showExtra()`, which fetches that key from `book_sections` (same table, same per-book text/choices row, just never referenced by another section's `choices` array) and renders it inline with a Back link - `_shownSec` is left untouched throughout, so nothing is written to `state.graph`/`pt.path` and the graph is unaffected.

**Terminal sections:** -1/0 have no `book_sections` row; the panel shows a plain end-state message instead of fetching. `renderLiveRead()` falls back to `viewingPt.result` when `currentPlaythrough()` is null, since `endPlaythrough()` clears `activePtIndex` and fires `setOnViewingPtChange` synchronously before the panel's own post-`navigate()` refresh runs.

**Following navigation from outside the panel:** `renderLiveRead()` is wired into two hooks - `boot.js`'s `setOnViewingPtChange` (fires on run-switch events like `endPlaythrough`/`loadRun`) and `play.js`'s `setAfterRenderFn` (fires at the end of every `render()` call). Fast-travel jumps (`boot.js`'s `doJump`) and the sidebar's own `.choice-btn` navigation both push to `pt.path` and call `render()` directly without calling `setViewingPt()`, so both hooks are needed to keep the panel in sync regardless of navigation source. `setAfterRenderFn` is a list (shared with `dice.js`, which also registers a callback there) rather than a single-callback slot.

`render()` fires far more often than the player actually changes section, so `_showSection()` tracks the currently-displayed section (`_shownSec`) and no-ops if `renderLiveRead()` asks for the same one again. Reset to `undefined` on close so a later reopen always re-fetches (the panel could belong to a different book by then).

**Auto-nav suppression:** `play.js`'s `renderPlaythroughPanel()` auto-navigates through any section with exactly one already-known choice (a "straight path", no real decision to make). `liveread.js` calls `play.js`'s `suppressAutoNav(true)`/`(false)` on every panel open/close path (`_open`/`_close`, `setLiveReadVisible(false)`, `renderLiveRead()`'s no-playthrough fallback) so reading always shows every section, straight-path or not. `suppressAutoNav` is ref-counted internally rather than a plain boolean, since `party.js` also wraps SSE-driven state syncs in the same calls.

**Validation checklist for a new (or re-imported) `book_sections` file** - structural checks alone say nothing about whether the prose itself is legible, see [[feedback_book_sections_prose_quality_check]]. All seven run on every import, not just the first:
1. Complete section/chapter-id set for the book's own numbering - no gaps, no duplicates.
2. No choice referencing a nonexistent section id.
3. No choice referencing its own section (self-loop) - most likely from folding a "section 0" prologue into section 1 without stripping its own now-redundant transition line first.
4. Every non-terminal section has a plausible choice count for the book's own established pattern (e.g. always exactly N, or 0 only for a real ending) - a section with fewer choices than every sibling is itself a signal worth checking, not just something to rule out via the other checks.
5. No un-linked plain-text "turn to N" mention anywhere in a section's body - strip existing `<a>` tags first, then regex for the book's own turn-to phrasing. This is the one that's easy to skip because it doesn't fail on *structure* (ids/refs/counts all look fine), only on *content* a human has to actually read to catch. Match verb-form variants too, not just "turn to" - book 200's §317 had "you may do so by **turning to** 41" completely unlinked, missed by a regex that only matched literal "turn to".
6. No literal `|` characters anywhere in the html - always an OCR page-break artifact, never real book punctuation; safe to strip mechanically (regex `\s*\|\s*` → single space).
7. No un-merged mid-sentence paragraph split - flag any section with 2+ `<p>` blocks where one doesn't end in terminal punctuation and the next continues the same sentence, then read each hit manually (some multi-`<p>` sections are legitimately separate choices, not sentence fragments, so this can't be auto-merged blindly). Also manually read any short (3-12 word) paragraph that's mostly short/garbled tokens with no terminal punctuation - a strong signal of leftover OCR noise, especially right after "adventure ends here"/death text.

**Genuine source gaps** (book 202, §169-170): sometimes the supplied scan itself is missing a section - the source jumps straight from one number to another with no intervening page. This isn't an extraction bug and shouldn't be patched by inventing prose. The correct handling (used for book 202) is a `class="section gap"` stub with an explicit `[SOURCE GAP: ...]` placeholder paragraph and no choice links out of it; checklist item 2 above is satisfied because the stub section id still exists as a valid link target, it just has no real content or outgoing choices of its own.

Check `SELECT DISTINCT book_id FROM book_sections` for which books currently have live-reading content imported - this list grows independently of any code change, so it isn't enumerated here.

**`book_frontmatter`** (`book_id` PK, `intro_text`, `rules_text`, `extracted_at`): best-effort text pulled from a book's own PDF front matter (everything before its first numbered section), staged for later manual review - not served to players, no route reads it. Populated by `scripts/extract_frontmatter.py`, which locates the front-matter boundary the same way the live-reading importers do (first page whose own first line is a bare "1") and heuristically splits on a rules-header keyword (falls back to storing the whole front matter as `intro_text` with `rules_text` left null when no header is found). Books whose section numbering doesn't use that "1"-on-its-own-line convention (roman numerals, chapter titles, or a different importer's own convention) fail the boundary check and are skipped rather than storing the whole book as "front matter" - the script sanity-checks this by rejecting any extraction over 15% of the PDF's total text length.

**Combat stat blocks aren't always flattened text.** Book 200's rebuilt scan formats every enemy stat block as a real `<div class="combat-card"><table>...</table></div>` (columns: Enemy/SKILL/STAMINA) instead of the plain-text "NAME SKILL N STAMINA N" pattern every other book's export has used - the first book to do so. Worth checking for on every future import: a structured table is easier to cross-verify programmatically (exact `data-enemy`/`.skill`/`.stamina` extraction, not regex-guessing at prose) than regex-guessing at prose.

**Source-export tag styling:** `<table>`/`.combat-card`/`.shop-table` use `table-layout:fixed; width:100%` (an unconstrained table risks the same width-overflow an unstyled `<pre>` has, just via table auto-sizing instead of `white-space:pre`). `.choices` (a `<br>`-separated option list) and `.listblock` (a line-broken quoted passage, e.g. an inscription) get spacing so they don't read as a formatting glitch. `<pre class="statline"|"stats">` uses `white-space:pre-wrap`, not the tag's `pre` default - plain `white-space:pre` doesn't wrap long lines at all, unlike every other tag here. `<p class="statline"|"stats"|"combat-note"|"source-gap">` share the same left-border "structural, not narrative" accent as `p.choice`/`p.end`/`p.note`.

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
- **+ Add node** - places a freestanding, disconnected node at the exact canvas position of the right-click that opened the menu (`network.DOMtoCanvas(params.pointer.DOM)`, captured into `ctxCanvasPos` in the `oncontext` handler right before `_showBgCtxMenu` runs). Opens `#add-node-modal` (mirrors `#start-node-modal`'s compact layout, but a plain text field rather than `#start-node-modal`'s +/- stepper - the stepper only made sense for renumbering an existing start node, not typing an arbitrary new id; `inputmode="text"` so alphanumeric ids like `115-L` aren't blocked by a numeric-only mobile keyboard) for the section number. Validation - an empty/invalid id, a plain-numeric id above `state.totalSections` (alphanumeric ids skip this check, since they're not part of the sequential numbered range), or an id that already has a `state.graph` entry - all show the same brief red-border flash on the input (`.invalid` class, removed after 800ms, same pattern as `#find-node-input`'s own `.not-found` in the graph toolbar's "jump to section" field) rather than an error message; an already-existing id is never moved or modified. On success, creates `state.graph[id] = { choices: [], manual: true }` (deliberately no `discovered: true` - see `mappedCountFor`/`nodeColor` below for why omitting it is what makes the node read as fully mapped immediately rather than merely discovered), sets `state.positions[id]`, and re-renders. For sections that exist in a book but aren't reachable through any recorded choice (e.g. bonus episodes) - lets them carry a note/color/priority on the map without inventing a fake incoming choice first. `manual: true` is what protects a still-empty freshly-added node from the node-deletion "worth keeping" sweep (see Node deletion above) the moment some unrelated node gets cleaned up elsewhere on the map.
- **Hide / Show background** - toggles `_bgHidden`; saves immediately via `PATCH /api/books/:id/bg`.
- **Move background** - `_bgInMove = true`, cursor = `ns-resize`. `mousemove` adjusts `_bgPosY` via `e.movementY * 0.15`, clamped 0–100. Click or Esc exits move mode and saves. Stored in `user_books.bg_hidden` / `user_books.bg_pos_y`.
- **Connectors** - submenu (`.ctx-submenu-wrap` / `.ctx-submenu-panel`) listing five edge styles: `curvedCW` (Curved), `curvedCCW` (Curved opposite), `cubic` (Cubic bezier), `horizontal` (Horizontal), `straight` (Straight). Clicking an item writes `state.connectorStyle`, calls `saveState()`, and calls `applyConnectorStyle(style)` from `graph.js` to apply the change immediately via `network.setOptions()`. The submenu re-opens with the current style checked (`.ctx-connector-item.active` → `✓` badge). `_updateConnectorMenu()` in `bg.js` syncs the active class each time the menu opens. `_setupCtxSubmenuFlip()` positions the submenu panel to avoid viewport overflow.

**Context menu positioning** (`_positionMenu(menu, x, y)`): sets `left`/`top`, then clamps both axes to viewport bounds (4px padding). Must be called after all item visibility is set so `offsetWidth`/`offsetHeight` are final.

**Node color submenu** (`#ctx-color-wrap`, right-click a node → **Color**): a 4×4 preset swatch grid (`.ctx-color-grid`) plus a native `<input type="color" id="ctx-color-custom">` and a **Clear color** button. `#ctx-color-wrap .ctx-submenu-panel` overrides the shared `.ctx-submenu-panel`'s `min-width: 140px` down to `width: fit-content` since the grid+custom-row are narrower than that. Both the grid and the custom-row are left-aligned (not centered) with matching side padding so the custom swatch lines up exactly under the grid's first column regardless of the Clear button's text width - centering each independently only aligns them when their total widths happen to match.

The global `document.addEventListener('click', hideCtxMenu)` closes the context menu on any outside click. `#ctx-color-custom` (which opens the native OS color picker) has its own dedicated `click` listener calling `e.stopPropagation()`, keeping the menu and `ctxNodeId` alive while the picker is open.

**Sidebar book cover** (`#sidebar-book-info`): shown only at `min-width: 1921px` and only when `_bgHidden === true`. 2:3 aspect ratio, full-width. Updated by `_updateSidebarBookInfo()` - called from `_applyBgPref()` and from the book-open flow after `render()`. `img.src = ''` triggers the `[src=""]` CSS rule to hide it.

**Main page background:** `#landing-bg-a` and `#landing-bg-b` are two `position: fixed; z-index: -1` divs outside `#landing-wrapper`. `_rotateLandingCover()` picks from a shuffled queue of the user's books with covers and crossfades between layers (fade next layer in over 1.5s, then fade old layer out). See "Landing background rotation" under Covers panel below for the full timer/trigger design.

A third div, `#landing-bg-dim` (same `position: fixed; z-index: -1`, painted after `landing-bg-a`/`-b` in DOM order so it sits on top of whichever is currently visible), is a flat `rgba(15,23,42,0.92)` layer that darkens the cover for legibility behind the three landing panels. It's a separate layer rather than baked into `_rotateLandingCover()`'s `backgroundImage`, so it can fade independently of cover rotation: `_updateLandingBgDragUi()` in `covers.js` fades it to `opacity: 0` once `_canDragLandingBg()` is true (all three panels collapsed - the same check that already drives the background-drag affordance), and back to `1` the moment any panel is restored. Every code path that changes a landing panel's collapse state already calls `_updateLandingBgDragUi()` (via `_setLandingPanelCollapsed()` in `prefs.js`), so this needed no new call sites - including the Ctrl+X "collapse/restore all three" shortcut, since it just calls `_setLandingPanelCollapsed()` three times.

---

## Data migration (`state.js › loadState`)

`loadState` applies these fixes to data loaded from the server:

- Adds missing fields (`positions`, `activePtIndex`, `bookName`) for data saved before those fields existed
- Removes self-referential choices (section pointing to itself)
- Migrates old path endings: if a path ends with -1 or 0 (pre-terminal-model data), pops it and sets `completed`/`result` instead, and if that pop left the path empty, defaults it to `[1]`. **That `[1]` fallback must stay nested inside the `isTerminal(last)` branch, never applied unconditionally to every playthrough regardless of path state** - applying it to any empty-path playthrough would stamp real-looking path content onto an untouched open-world series-run placeholder (`startedAt: null`), making any "is this book actually hosting this run" check that relies on path content think the placeholder was genuinely played. See "Completion must only sync onto the book that actually ran it" and the isolated-portal-entry/`_handleNewSeriesRun` notes elsewhere in this doc for related cases. All downstream "is this touched" checks across the codebase (`_syncSeriesRuns`, `handleSaveState`, `processStateXp`, `_seriesRunBook`) key off `pt.startedAt` alone, never `pt.path.length`, since path content alone is not a reliable signal.
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

Portal nodes are rendered as diamonds only in books that belong to an open world series. Non-open-world books are completely unaffected - the `nodeShape` logic in `graph.js` checks `_graphIsOpenWorld` before applying portal styling. Fill color follows the same `nodeColor()` rules as every other node (mapped/discovered/outcome), so a portal's fill reflects its own visited state like any other node. A gold border (`#facc15`, independent of fill) keeps a portal easy to spot even when its fill blends in with a sea of same-colored mapped nodes. The in-app `#legend` (`index.html`) has a matching diamond-shaped "Portal" row, toggled visible/hidden by `setGraphOpenWorld()` in `graph.js` alongside the rest of the open-world graph setup.

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

Every place that creates a target-book playthrough placeholder for a portal (`_syncSeriesRuns`'s pad-to-`needed` loop, and `startPortalRun`'s own fallback in `play.js`) calls `instantiateLoadout()` for `inventory`/`equipment`/`equipmentVisible`. Playthroughs whose `path[0]` gets set by portal entry (rather than a genuine choice made by the player) are marked `portalEntry: true`, so `graph.js`'s `_effectiveStartSec` shows the book's real `state.startSection` as the "START" node rather than the portal's entry section.

Code that reuses an existing playthrough slot (rather than creating a fresh one) and then pushes into its `path` sets `pt.startedAt` first if it isn't already set - `_handleNewSeriesRun` stamps it unconditionally (`if (!pt.startedAt) pt.startedAt = Date.now();`) where `pt` is resolved, before touching `path`, matching the pattern `startPortalRun`/`doJumpCrossBook` use.

### Cross-book behaviours

- **Fast travel / Center on current section:** both work cross-book. If the active run's last position is in a different book, the relevant button navigates to that book first, then performs the action.
- **`_syncSeriesRuns(seriesId)`:** called on every open-world book open. Fetches `GET /api/series/:id/runs` and propagates `completed`, `result`, `is_public` to local `state_data` playthroughs, but only onto a book whose own placeholder for that run index was actually touched (`pt.path.length > 0 || pt.startedAt`). Every book in the series carries a placeholder for every run index so numbers stay aligned; only the book(s) the run actually visited have their placeholder marked complete. Edge cases: (a) local terminal playthrough with no `series_runs` record → pushes completion up; (b) active run's `last_section` absent from local path → restored; (c) surplus portal-paused or empty-placeholder runs beyond series run count → pruned.
- **`completeSeriesRun(seriesRunIndex, result)`:** called from `handleSaveState` on newly-terminal playthroughs. Writes `{ completed: true, result }` to `series_runs`, then calls `_syncSeriesRuns` to propagate immediately to all books. `handleSaveState` only treats a playthrough as newly-terminal if it also has real path content (`newPt.path?.length > 0`).
- **`processStateXp` (`server/db/xp.js`) uses the same "touched" guard, independently.** Its own per-run loop (death_run/win_run/battle_run, first_loss/first_win, share_run, charsheet_saved/charsheet_run, add_charsheet_field) and its reconciliation safety net both skip any playthrough that isn't touched (`pt.path?.length > 0 || pt.startedAt`) before awarding anything for it. `_syncSeriesRuns` sets `pt.charSheet = sr.char_data` unconditionally, outside the touched check, since the character is meant to travel with the series regardless. Uses `startedAt` (not `path.length`) as the alternate signal so a brand-new real run that hasn't made its first choice yet still earns day-one charsheet-edit XP.

**Pre-series runs:** the first time a book's series turns open-world, `migratePreSeriesRuns` (server, one-time) and `_syncSeriesRuns` (client, mirrors the same logic as a fallback) move any pre-existing runs out of `playthroughs` into `state_data.preSeriesRuns`, since open-world's own run slots need `playthroughs[i]` to line up index-for-index with `series_runs`. `activePtIndex` is reindexed (or nulled if the active run itself was migrated). `preSeriesRuns` still counts in `getProfileStats()`/`adminGetUsers()`, still generates `run_completed` (and `first_win`/`first_loss`/`first_battle_death` via `_resolveRunIndex`) entries in `getFeed()` (not gated on `seriesIsOpenWorld` like the `playthroughs` loop is), and is still reachable for public viewing (`getPublicProfile`, `getPublicRun`, `getBookActivity`) via a negative `runIndex` - `-(preSeriesRuns.length - i)` for entry `i` - matching the client's own "Run -N" display convention (`play.js`). The URL route (`publicRunRe` in `server.js`) allows a leading `-` for this reason.

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

**`getPublicSeriesRun()` and `getPublicRun()` both only take the journey layout when `journey.length > 1`** (i.e. the run actually crossed a portal). A single-book open-world run falls back to `_standardRunView()` - the same plain single-graph shape non-open-world runs use - since the segmented/bordered journey styling plus its separate result badge has nothing to visually connect to with only one segment and no portal transitions in the dialog.

### Activity feed (open world)

Open world series runs emit different feed events from per-book runs:

| Event | When | Display |
|-------|------|---------|
| `series_run_started` | Any book in the series starts run N for the first time | `username began series run N of [Series Name] in [Book Name]` |
| `series_run_completed` | A run ends (victory/loss/battle) in any book | `username won/lost/died series run N of [Series Name] in [Book Name]` |

Standard `run_started` and `run_completed` events are **suppressed** for books that belong to an open world series, so only the series-level events appear. The verb follows the same mapping as regular runs (`success` → "won", `death` → "lost", `battle` → "died"). When `is_public` is true on the series run, the verb is a clickable button that opens the journey viewer.

`series_runs` doesn't track which book a run started/ended in (`last_book_id`/`last_section` are nulled on completion - see above), so `getFeed()`'s `_seriesRunBook(seriesId, userId, runIndex, wantEnd)` derives it from each of the series' books' own `state_data.playthroughs[runIndex]`: the started book is whichever has the earliest `pt.startedAt`; the ended book is whichever has `pt.completed && pt.result !== 'portal'` (only ever one, since a portal-paused book's `result` stays `'portal'`). Falls back to the plain series-only wording if no book resolves (e.g. state data missing).

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

Each book object contains: `id`, `name`, `total_sections`, `discoverable_sections`, identifiers (`isbn`, `issn`, `asin`), `pages`, `authors`, `description`, `cover_path`, `is_public`, `created_at`, `rating`, `notebook`, `seriesName`/`isOpenWorld` (via a `LEFT JOIN series`, `_exportRow` in `server/db/misc.js`), and the full `state` object (graph, playthroughs, positions, charSheetTemplate, etc.).

### HTML generator (`buildBookHtml(book, username, itemsById)`)

Produces a self-contained, print-friendly HTML file. Inline CSS only - no external dependencies. `itemsById` is a `Map<id, {name, type}>` used to resolve item names in inventory/equipment; defaults to an empty map (shows "Item #N" fallback). Contains:

- Book metadata table (authors, identifiers, pages, description, discoverable sections if set, series name + open-world flag if the book is in a series)
- Summary stats: mapped sections, discovered-only sections, total runs, wins, losses, battle deaths, in-progress runs
- Playthroughs table: run number, result, date, full section path (`→`-separated; `✝` for death, `★` for victory)
- Per-run `<details>` blocks (collapsed by default): charsheet fields, inventory slots with qty and note, equipment slots with item name, qty, label, and note
- Section map table: every known section with its outgoing choices, priority flag, battle flag, and note (if any)

**Open-world series runs:** in an open-world series, every book carries one `playthroughs` slot per series run so numbers stay aligned across books (`_syncSeriesRuns`, `open-world.js`), but a run only actually happened in the book(s) it visited - a book's own slot for a run it never touched is a padding placeholder with `startedAt: null`. `buildBookHtml` excludes these phantom slots from the stats line (mapped/runs/wins/losses/in-progress) so they don't inflate a book's numbers with runs that happened elsewhere, but still lists them in the Runs table (as "played in another book") so the row numbering matches what the live app shows. A run whose `result` is `'portal'` (left this book for another one mid-run) is treated as still in progress, not finished. A finished run that has a leftover `portalTarget` gets an inline "(continues in another book)" note; one with `portalEntry: true` (started here via a portal from elsewhere) gets "(started via portal)" next to its run label. `state.preSeriesRuns` (a book's run history from before it joined a series - see "Pre-series runs" above) gets its own "Before Joining Series" table and detail blocks, numbered the same negative-index convention the live run list uses, and counts toward the summary stats.

A section counts as **mapped** if it has real recorded choices, not merely a `discovered: true` stub (a section can be flagged `discovered` and still pick up real choices later - checking the flag alone would undercount). This definition is shared between the "Mapped: N" stat and the section map table split (mapped rows vs. greyed "not yet visited" rows), and mirrors the client's own `mappedCount()` (`state.js`) so the exported numbers always match what the app showed at export time. Works correctly for both numeric and alphanumeric section IDs. Filenames in the full export are deduplicated if two books share the same safe name (appends ` (2)`, ` (3)`, etc.). All strings are HTML-escaped.

`safeFilename` also rejects Windows-reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`, `LPT1`-`9`, case-insensitive, with or without an extension) and caps the result at 150 characters.

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

Both `sendAdminEmail` and `sendReplyEmail` use the same template: dark amber header, content in a grey quoted block, CTA button linking to `https://pathmap.net`, footer note. Plain-text fallback is always included.

### Admin SMTP settings (`/api/admin/smtp/test`)

`POST /api/admin/smtp/test` sends a test email to `smtp_user` to verify configuration. Returns `{ ok: true }` on success or `{ error: message }` on failure.

## Automated tests (`test/`)

`node --test` (Node's built-in test runner, no external framework/dev dependency) - `npm test` runs it, auto-discovering the whole `test/` tree recursively.

**Structure:** folder-per-module-domain, not flat - `test/client/<module>/*.test.mjs` for `public/js/*.js`, `test/server/<module>/*.test.mjs` for `server/*.js`. Each file targets one function/concern rather than one giant file per source module.

**Deliberately not covered, and why - two structural blockers, not oversights:**
- **DOM-coupled client code**: most of `public/js/*.js` transitively imports `i18n.js`, which reads `localStorage` at module *top level* (not inside a function) - throws immediately under plain Node with no DOM. `graph.js` and everything downstream of it is skipped for this reason. `state.js` and `sort.js` are covered because they have zero imports of their own.
- **Live-DB-coupled server code**: `server/db/connection.js` opens a connection to the real `database.sqlite` eagerly at `require()` time, hardcoded path, no env-var override - unlike a from-scratch design (inject `db` as a parameter, construct `new Database(':memory:')` in tests), changing this would mean changing how the live server boots, which was explicitly ruled out. So `server/db/*.js` and anything requiring `./db` (including `request-helpers.js`) is skipped. `server/export.js`, `server/html-escape.js`, and `server/impersonation-context.js` are covered because none of them require `./db`.

Going forward: new code should get tests where it fits one of the two testable shapes above (no DOM, no live DB) - see the module's own imports before assuming it's covered-or-not by pattern-matching against this list, since that can change as files are refactored.
