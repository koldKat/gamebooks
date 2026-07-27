# Gamebook Tracker - User Guide

Keep track of every branch, every choice, and every playthrough in your favourite gamebooks. Works with Fighting Fantasy, Choose Your Own Adventure, Lone Wolf, and anything else that uses numbered sections.

---

## Landing page panels

When you first arrive - whether you're logged in or not - the screen is divided into three panels side by side.

### Left - Book covers

A public wall showing all the books, anthologies, and series in the tracker. Click any cover to see its details.

- **Sort** - Latest (default), Oldest, A–Z, Z–A, or Random
- **Filter** - All, Books, Anthologies, Series, or Favorites
- **Search** - searches titles, authors, series names, and child book names; type `anthology` or `series` to filter by type
- **Favorites** - while logged in, hover a cover and click the ★ to save it as a favourite; your first favourite earns **5 XP**
- The wall refreshes automatically whenever books are added or changed

> **Hidden feature:** Press **Ctrl+Y** to adjust the cover-title font size, toggle bold text, hide Cyrillic covers, toggle **Reduce animations** (useful on low-powered devices), and toggle **Show covers in feed** / **Transparent background for day cards**.

### Centre - Activity feed

Shows what everyone's been up to over the last 30 days. You don't need an account to read it.

Each day's card shows the covers of the public books played that day, faded behind the entries (cycling through more than one if several different books were active). Turn it off via **Show covers in feed** in the Ctrl+Y settings panel if you'd rather keep the feed plain. Days with no cover to show get a faint see-through tint instead, letting the rotating background peek through - toggle that separately with **Transparent background for day cards** if you'd rather those stayed flat too.

- A **tip bar** cycles through helpful hints every 15 seconds (the orange bar counts down)
- Activity is grouped by day (Today / Yesterday / date)
- Players with 5 or more entries on the same day are collapsed into one row - click it to expand
- Pinned announcements from the admin always appear at the top

**What you'll see in the feed:**

| Event | What it means |
|-------|---------|
| *user* **created / added book** *book* | A new book was added to the library |
| *user* **created / added series** *series* | A series was created or added |
| *user* **began run N of** *book* | Someone started a new playthrough |
| *user* **won / lost / died in** *book* run N | A playthrough ended |
| *user* **won** *book* **run N for the first time** | First ever victory in that book, showing which run achieved it |
| *user* **lost in** *book* **for the first time** | First ever loss (non-battle) in that book |
| *user* **fell in battle in** *book* **for the first time** | First ever battle-death in that book |
| *user* **won in all books of** *series / anthology* | Every book in a collection completed |
| *user* **discovered / visited every section of** *book* | Reached 100% mapping or 100% visiting |
| *user* **reached level N** | Someone levelled up |
| *user* **joined** | A new player registered |

**Clicking things in the feed:**
- **A username** (if that player has a public profile) → see their books and completed playthroughs
- **A book name** → opens that book's activity; if it belongs to a series, a series link appears too
- **The result word** (won / lost / fell in battle / died, if the run is public) → opens a view of that playthrough's path on the graph, with a legend overlay in the top-right corner explaining the node colours

### Right - Login / Books

This is either the login form or your books list, depending on whether you're signed in.

**Collapsing panels:** each side panel has a **‹ / ›** button on its inner edge to fold it away. The feed has its own **▴ / ▾** tab at the top. Your side panel preferences are saved to your account; the feed's collapsed-or-open state only lasts for the current session.

**Keyboard shortcuts (landing page):**

| Shortcut | Action |
|----------|--------|
| **Ctrl+X** | Hide or restore all three panels |
| **F1** | Open the Cheat Sheet |
| **Ctrl+Y** | Landing page settings (cover-title font size/bold/hide Cyrillic, background source, reduce animations, feed day covers, transparent day cards) |

**Landing background:** the animated background image behind the panels rotates through book covers. While logged in, right-click anywhere on the background (not on a panel) to get a quick menu with **Hide background** / **Show background**. Your choice is saved to your account.

---

## Stats for Nerds

Click **Stats** in the header (visible to everyone) to see live numbers for the whole platform.

| Section | What's shown |
|---------|-------------|
| **Players** | Registered players, admins, authors, contributors, public profiles, avatars, undos/Fast Travels performed |
| **Books** | Unique books/series/anthologies, total library copies, public/private split, unique authors, average sections and pages per book, total/mapped/discovered sections, books fully visited or discovered |
| **Parties** | Play Together parties created and active, players currently in a party, invites sent/accepted/declined |
| **Gameplay** | Total, active, and finished playthroughs; wins, losses, battle deaths (with percentages); tracked and average play time |
| **XP & Progression** | Total XP earned; platform level and title; average player level and title; level-ups; XP event types/count |
| **Gold Coins & Shop** | Coins earned, spent, and in circulation; upgrades purchased by type |
| **Ratings** | Total ratings given; book, anthology, and series ratings counted separately; average book rating; breakdown by star count |
| **Forum** | Categories, threads, pinned threads, posts |
| **Server** | CPU model/cores/age/clock/architecture, total RAM |
| **The App** | App age, server uptime and uptime %, total downtime, lines of code, code/database size, JS module count, network traffic, live session averages (CPU, heap, RSS) |
| **Open World** | Open world series (public split), books in them, portal nodes, series runs (completed/public), pre-series runs |

---

## Demo mode

Click **Demo** on the landing page to try everything without creating an account.

- It loads a ready-made book with a full map, completed playthroughs, and priority markings so you can explore straight away
- Everything works just like a real account - create books, start playthroughs, use Fast Travel and Undo
- **Nothing is saved** - all changes disappear when you close or refresh the page
- A yellow banner at the top reminds you that you're in demo mode. Click **Exit Demo** to go back to the login screen.

---

## Accounts

- **Log In** - sign in with an existing account
- **Create Account** - register with a username and password

Your session is remembered in the browser. Click **Log out** on the books screen to sign out.

---

## Your books

After logging in you land on the **Books** screen.

New accounts include a **Demo Book** - a fully mapped 50-section example with completed playthroughs, notes, and priorities. Delete it any time.

Each book card shows a progress bar for sections you've visited across all playthroughs. The bar turns green once you've visited every section.

| Button | What it does |
|--------|-------------|
| **Open** | Go into the tracker for that book |
| **✎** | Edit the book details (name, sections, identifiers, cover) |
| **✕** | Delete the book and your progress (asks for confirmation) |

If an admin shared a book with you, **✎** is visible but greyed out - only the creator can change the book's details.

### Creating books

Click **Create Book** at the top of the books screen. As you type the name, a dropdown suggests books already in the system - selecting one fills in all the details automatically and changes the button to **Add to library**.

- **Sections** - total number of sections (minimum 5)
- **Type** - Book (ISBN + ASIN) or Magazine (ISSN)
- **Author(s)** - comma-separated list
- **Pages** - physical page count (not the same as section count)
- **Description** - free-text summary
- **Cover** - optional image upload

Leave any optional fields blank and fill them in later using the **✎** button.

### Stashes

A **stash** is a personal folder for tidying up your books list.

- Click **Create Stash**, give it a name, and add any mix of books, anthologies, and series to it
- Stashed items move out of the main list into a collapsible stash section
- Each item can only belong to one stash at a time
- Stashing a **series** moves its visible books along with it
- Deleting a stash does **not** delete what's inside - everything moves back to the main list

Use **Edit Stash** on the stash header to rename it or change its contents later.

---

## The tracker interface

The screen has two areas:

- **Sidebar** (left) - your current section, choices, playthrough history, stats, and controls
- **Graph** (right) - a visual map of every section you've encountered, with lines showing how they connect

**Collapsible panels** - each panel has a **‹ / ›** or **▾** button to fold it away. Your preferences are remembered between sessions.

| Panel | How to collapse it |
|-------|---------|
| Sidebar | **›** button on its right edge |
| Current run path strip | **▾** button in the strip header |
| Legend | **▾** button in the legend header |
| Player XP panel | **▾** button in the panel header |

The Player XP panel shows your level, title, XP bar, and active boosts. On the level row, your **heartbeat XP rate** is shown on the right in aqua - for example **+6.7 heartbeat XP/min** - so you can see at a glance how much passive XP you're earning while the tracker is open. The same rate appears on the books screen and in your profile.

**Keyboard shortcuts (play area):**

| Shortcut | Action |
|----------|--------|
| **I** | Open / close the Inventory panel (not while typing in a text field) |
| **C** | Open / close the Character Sheet (not while typing in a text field) |
| **E** | Open / close the Equipment panel (not while typing in a text field) |
| **S** | Open / close the Battle Simulator, if one is available for the current book (not while typing in a text field) |
| **Ctrl+X** | Hide or restore all play-area side panels at once |

**PDF access:** if the book has a PDF and you've been given access (or you're an admin), a **PDF** link appears next to the book title at the top of the sidebar.

**Sidebar bottom buttons:**

| Button | What it does |
|--------|-------------|
| **Center on Current Section** | Scrolls and zooms the graph to show where you are right now |
| **Find Section** | Type a section number and press Enter to jump to it on the graph |
| **Export Book** | Download a copy of this book's data as a ZIP file |
| **Reset Book** | Wipe all map data and playthrough history for this book |
| **← Home** | Go back to your books list |

### Graph background image

If the book has a cover image, it appears as a faint watermark behind the graph.

- **Right-click on empty space** → **Hide / Show background**
- **Right-click on empty space** → **Move background** - move the mouse up or down to reposition it; click or press **Esc** to confirm
- **Right-click on empty space** → **Connectors** - choose the line style used to draw connections between sections: Curved, Curved (opposite), Cubic bezier, Horizontal, or Straight. The active style has a checkmark. This is a per-book setting and is saved with your progress.

Your preference is saved per book.

---

## Recording a playthrough

### Starting a run

Click **+ New** in the Runs panel to begin a new playthrough. It starts at section 1 by default.

To change the book's **default** starting section permanently: before you start any playthroughs, right-click anywhere on the graph and choose **✎ Edit start node**.

To start **this one run** somewhere else without changing the default - handy for books with more than one real beginning, like a flip/dos-a-dos edition with a second story starting deep in the back - click the **⚑** button next to **+ New** and type the section to start at.

Once you've started runs from 2 or more different sections, **+ New** stops assuming - it shows a quick picker so you can choose which beginning to use, instead of making you reach for the ⚑ button and retype the section number every time. Only known starts are offered (the default plus any section a past run actually began at); the ⚑ option is still in the picker if you want to start somewhere new.

### Recording choices

When you reach a section that hasn't been mapped yet, a text box appears. Type in the section numbers the book offers as choices, separated by commas:

```
34, 67, 112
101-A, 101-B, 202
```

Special values: `-1` = a dead end (loss ending), `0` = a winning ending.

Press **Record & Choose** (or Enter), then click the button for the path you actually took.

- Sections you've already mapped will show the choice buttons straight away
- If there's only one choice, the tracker moves forward automatically

**Alphanumeric sections:** if you type something like `101-A` for the first time, you'll be asked to confirm once. After that, the book switches to alphanumeric mode permanently.

### Undoing a step

The **Undo** button takes you back to the last real decision point. If several sections in a row only had one possible destination, they're all skipped in a single undo instead of clicking through them one at a time. Each playthrough gets a limited number of undos based on your level (you can buy more in the shop):

| Level | Undos available |
|-------|-----------|
| 1–30 | 3 |
| 31–40 | 4 |
| 41–50 | 5 |
| 51–60 | 6 |
| 61–70 | 7 |
| 71–80 | 8 |
| 81–90 | 9 |
| 91–100 | 10 |

### Ending a run

| Button | What it does |
|--------|-------------|
| **★ Win** | Mark this playthrough as a victory |
| **✝ Loss** | Mark this playthrough as a regular death |
| **Battle Death ⚔** | Mark a battle death at your current section; also flags that section as a battle location on the map |

Each one asks you to confirm before it's finalised.

---

## Managing runs

The **Runs** panel in the sidebar lists every playthrough, newest first.

| Button | What it does |
|--------|-------------|
| **Private / Public** (completed runs) | Switch whether this playthrough is visible to others in the activity feed |
| **Load** (a run in progress) | Switch to that playthrough and continue it |
| **Load** (a completed run) | Show that playthrough's path highlighted on the graph |
| **✕** | Delete this playthrough permanently (asks for confirmation) |

You can have several playthroughs going at once; only one is active at a time.

---

## The graph

Every section you've ever visited appears on the graph as a dot (called a node). Lines between dots show which sections lead to which.

### Line colours

| Colour | Meaning |
|--------|---------|
| Red (thick if you travelled it this run) | This path leads to a dead end |
| Green (thick if you travelled it this run) | This path leads to victory |
| Orange (thick) | You travelled this path in the current or viewed playthrough, with no definite outcome |
| Grey | You didn't travel this path in the current run |

### Dot colours

| Colour | Meaning |
|--------|---------|
| Orange (solid) | Where you are right now |
| Blue (solid) | Visited in the current or viewed playthrough |
| Red (solid) | Where a lost playthrough ended |
| Burnt orange (solid) | Where a battle-death playthrough ended |
| Green (solid) | Where a victorious playthrough ended |
| Dark with red outline | This section can lead to a dead end |
| Dark with green outline | This section has a path to victory |
| Dark orange | Flagged as a battle location |
| Purple (solid) | Fully mapped - choices recorded |
| Grey (solid) | Seen but not yet mapped |
| Yellow (solid) | The starting section |

### Moving dots

Drag any dot to reposition it. The position saves automatically.

### Zoom and pan

- **Scroll wheel** - zoom in and out
- **Drag on empty space** - move around the map

Your zoom level and position are saved per book.

### Right-click menu

Right-clicking a dot opens a menu with these options:

- **✎ Edit start node** - change the starting section (only available before any playthroughs have been started)
- **Edit choices** - change the recorded choices for that section
- **Edit note** - add or edit a text note for that section
- **Priority** - mark as High (green ▲), Normal, or Low (red ▽)
- **Fast Travel** - jump directly to that section mid-playthrough (see below)
- **Toggle battle ⚔** - mark or unmark this section as a battle location
- **Color 🎨** - apply one of 16 colours to the dot
- **Delete node** - remove this dot and any dead-end descendants (asks for confirmation)

### Fast Travel

Jump directly to a section you've already visited, skipping everything in between. Fast Travel is available during an active playthrough on sections that have been mapped. Choose how you want to get there:

| Mode | Route |
|------|-------|
| High priority | Prefers sections you've marked as high priority |
| Shortest | The quickest path |
| Normal | Avoids both high- and low-priority sections |
| Low priority | Prefers sections you've marked as low priority |

Each playthrough gets a limited number of Fast Travels (same level table as undos, and you can buy more in the shop). You can also click the **Fast Travel** button in the sidebar to type a section number directly.

### Section notes

Right-click a dot → **Edit note** to attach a text note to that section. Dots with notes show a small green book icon.

The **Show next to node** option in the note window pins your note as a label directly beside the dot on the graph.

---

## Dice roller

The collapsible **Dice** panel sits in the bottom-left corner of the graph area.

- Set the number of dice (1–10) with **−** / **+**
- Choose **d4, d6, d8, d10, d12, d20**, or **d%**
- Click **Throw** - results appear as tiles; the total is shown when you roll more than one die
- `d%` is a percentile roll (two d10 digits; `00` = 100)

The dice count and your last roll are saved per playthrough and restored when you switch back to that run.

---

## Stats (sidebar)

| Stat | Meaning |
|------|---------|
| **Mapped** | Sections where you've recorded choices, shown as a percentage of the total |
| **Discovered** | All sections you've ever seen, shown as a percentage of the total |
| **Missing** | Sections within the book's total that you've never come across (only shown when Mapped equals Discovered). Hover to see the section numbers. |
| **Playthroughs** | Total playthroughs; completed ones broken down as losses (red) and wins (green) |

---

## Character sheet

Click **Character Sheet** (bottom-right of the tracker) to track stats, items, and attributes for the current playthrough.

- Each playthrough has its own separate character sheet
- While a playthrough is in progress, the sheet is fully editable
- When looking back at a finished playthrough, you can see the sheet as it was - but you can't change it

### Field types

| Type | Use for |
|------|---------|
| Number | SKILL, STAMINA, Gold, etc. |
| Boolean | Does your character have this item or ability? (yes/no) |
| Text | Freeform notes |
| List | Inventory (comma-separated items) |
| Enum | Class, faction, stance (choose from a set of options) |

### Saving

| Button | What it does |
|--------|-------------|
| **Save** | Save the current values to this playthrough |
| **Save as template** | Save as the starting values for new playthroughs in this book |
| **Cancel** | Discard any changes you haven't saved yet |

### Compact overlay

Fields you've chosen to show appear as a small text display in the bottom-right corner of the graph - no background, nothing blocking interaction. It updates when you press Save.

---

## Inventory

Click **Inventory** (bottom-right of the tracker screen) to see and manage the items your character is carrying in this playthrough.

Each playthrough has its own separate inventory. If you look back at a finished run, the inventory shows what you had then - you can view it but not change it.

### Adding items

Click **+ Add Item**, then browse or search the list of available items. Click any item to add it. You can also type a short label on it - useful if you want to note a quantity or a specific version of an item.

### Changing the order

Drag items around to arrange them however you like. The new order is saved automatically.

### Removing an item

Right-click an item to remove it.

### Showing an item on screen

Right-click an item and choose **Show on screen** to pin it to the on-screen display in the play area, next to your character sheet. It shows up there with a small blue "ITEM" badge - equipped items get the same treatment but in amber with their slot name instead, so at a glance you can tell what's just carried from what's actually equipped.

### Save as Template

If you always start a book with the same set of items, click **Save as Template**. Future playthroughs of this book will automatically begin with that inventory.

---

## Equipment

Click **Equipment** (bottom-right of the tracker screen) to equip items from your inventory onto a character silhouette - head, chest, weapon, off-hand, back, rings, and more, plus five extra slots for consumables. It's purely visual (no stat effects) and is a handy way to see what your character is carrying or wearing at a glance.

Like the inventory, equipment is **per playthrough**. When viewing a finished run, it's read-only.

### Equipping and unequipping

Click an empty slot to open a picker of items currently in your inventory, then pick one to equip it. Click the **✕** on an equipped item to send it back to your inventory.

### Right-click menu

Right-click an equipped item for options:

- **Show / Hide on screen** - pin the item to the on-screen display alongside your visible inventory items (shown with a small slot badge, like `WEAPON` or `HEAD`, so it's clear at a glance which items are equipped versus just carried)
- **Rename** - give the item a custom name (carries over if it's moved back to inventory)
- **Edit** - change quantity, note, and the "show on screen" flag

### Save as Template

Click **Save as Template** to save the current loadout (including any custom names, notes, and quantities) as the starting equipment for future playthroughs of this book.

---

## Notebook

Click **Notebook** (bottom-centre of the graph area) to open a freeform text area shared across all playthroughs for this book.

- **Save** - save your notes and close the window
- **Close / ✕ / click outside / Esc** - close without saving

The **Show in play area** toggle pins your notebook as a see-through overlay on the left side of the graph. Hover over it to start editing; save or move the mouse away to go back to view mode.

---

## Your profile

Click your avatar circle on the Books screen.

- **Username** - change your login name
- **Display name** - authors only: shown in place of username throughout the site
- **Public profile** - let anyone view your books and completed playthroughs; your username becomes a clickable link in the feed
- **Hide from activity feed** - remove your activity from the feed (playthroughs you've explicitly made public will still appear)
- **Change Password** - enter your current password, then your new one
- **Avatar** - click **Change Avatar**; if the image isn't square, a crop tool lets you choose the right part. Saved as 512×512, max 256 KB

Your current level, title, and progress toward the next level are also shown here.

---

## Levels

You earn XP naturally - playing books, mapping sections, completing playthroughs, sharing books publicly, organising series, uploading avatars, and more. No grinding required.

Rewards appear as floating notices at the bottom-right of the screen:
- `+50 XP` pill for XP gains
- Coin icon for Gold Coin gains
- Orange **LEVEL UP!** pill with your new level and title

Every level you gain adds a permanent **+0.1% XP boost** to all future XP. Shop purchases stack on top.

Your XP bar also shows your **heartbeat XP rate** (the passive XP you earn just for having the tracker open) in aqua on the right of the level row - e.g. **+6.7 heartbeat XP/min**. If you've bought XP boosts in the shop, the boost percentage shows in aqua too, with the total bonus XP shown beside it.

---

## Gold Coins & Shop

You earn **1 Gold Coin (GC) for every 1,000 XP**. You can also earn bonus coins:

| Milestone | Reward |
|-----------|--------|
| Visit every section of a book | 1 GC |
| 24 tracked play hours | 1 GC |
| Every 100 completed runs (across all books) | 1 GC |
| Visit every section of every book in a series | 1 GC per book in the series |
| Visit every section of every book in an anthology | 1 GC per book in the anthology |

Click **GC** in the books screen header to open the shop.

| Item | Cost | Effect | Cap |
|------|------|--------|-----|
| **XP Boost** | 1, 2, 3… GC (goes up each time) | +0.1% to all future XP, permanently | Level × 0.1% |
| **Heartbeat XP** | 1, 2, 3… GC (goes up each time) | +0.1 to idle XP per purchase | Level × 0.1 XP |
| **Extra Undo** | 3, 6, 9… GC (escalates per purchase) | +1 undo per playthrough, permanently | 1 per 10 levels |
| **Fast Travel** | 5, 10, 15… GC (escalates per purchase) | +1 Fast Travel per playthrough, permanently | 1 per 10 levels |

The shop header shows your current balance next to a **"N spent"** pill, so you can see your lifetime total spent at a glance alongside what you have left.

Coins are spent permanently - no refunds. Boosts only apply to XP earned after you buy them.

---

## Rating

Rate any book, anthology, or series with 1–5 stars (half-star increments).

**Requirements:**
- **Book** - complete at least one playthrough (any outcome)
- **Anthology** - complete at least one playthrough of every book inside it
- **Series** - meet the above requirement for every item in the series

The star widget appears in the book's detail window and the Edit Book dialog when you own the item. Click your current rating to clear it. Rating a book for the first time earns **25 XP**; changing or clearing your rating doesn't.

Once you've rated something, your stars turn **aqua** to tell them apart from the amber preview you see while hovering.

---

## Editing book details

You can edit a book from two places:
- **Books screen** - click **✎** next to the book
- **Tracker sidebar** - click **✎** next to the book title

Books need a minimum of **5 sections**. You can't lower the section count below the highest section number already in use.

Identifiers (ISBN, ASIN, ISSN) appear next to the section count in the books list. Books that share the same ISBN or ISSN are treated as the same title across all users.

### Discoverable sections

When you've explored everything you can find - every section you know about is fully mapped, but the total is still below the book's printed section count - the edit dialog shows a **Discoverable Sections** field. Set this to the true number of reachable sections to correct the progress bar and the XP targets for everyone tracking the book.

### Book cover

Upload a cover in the Create Book window or the edit dialog. Images are compressed to a maximum of 256 KB. The cover appears on the public wall once uploaded.

### Make public

The **Make public** checkbox (creator only) makes the book findable by other users:
- It appears on the covers wall and in the public book list
- Others can click **+ Add to my library** to start tracking it
- Everyone tracking the book sees your changes immediately
- If you delete it while others are tracking it, ownership passes to the next user

### Series

Create a series with **Create Series**. Add a book to a series via the **Series** dropdown in the Edit Book dialog. Books in the same series group together under a collapsible amber header.

- Only the creator can edit a series; other users can add a public series to their own library
- The creator earns **150 XP** each time another user adds their series
- **Delete Series** - removes only your series (books stay as standalone items)
- **Delete Series & Contents** - removes the series and its books from your library

### Anthologies

An anthology is a physical book containing several separate adventures - each tracked independently.

**What the anthology holds:** name, cover, ISBN/ISSN/ASIN, page count, authors, description.
**What each story inside holds:** name, section count, authors, description. The stories don't have their own cover, ISBN, or page count - those belong to the anthology.

**Creating an anthology:**

1. Click **Create Anthology** - fill in the name, ISBN, cover, etc.
2. For each story inside, click **Create Book** → set the name and section count → select the anthology in **Part of anthology** → Create.
3. The stories appear nested inside the anthology row in your list.

**To group existing books into an anthology:**

1. Create the anthology first.
2. Click **✎** on each book → set **Part of anthology** → Save.

**Adding someone else's anthology:** click **+ Add to my library** on any public anthology to add it and all its public stories in one step.

---

## Open World series

An open world series is a continuous adventure that spans multiple books. All books share the same playthrough numbering, and your character sheet carries over between them.

| Normal series | Open World series |
|---------------|------------------|
| Each book has its own independent playthroughs | All books share the same playthrough numbers |
| Character sheet stays within each book | Character sheet travels between books |
| A playthrough ends within its book | A playthrough ends wherever it ends, in any book |
| No connections between books | Portal sections link books together |

### Portal sections (◇)

Teal diamond shapes on the graph mark portal sections - they connect a section in one book to a section in another. When your playthrough reaches one, a **Portal destinations** panel appears in the sidebar.

Travelling through a portal:
1. Saves your character sheet to the series playthrough
2. Marks your playthrough as paused at this portal
3. Opens the target book at the destination section

**Adding a portal:** an **Add Portal** button appears below the choices input in open world books. Choose the target book, enter the target section, and optionally add a label.

### Playthrough list in open world books

| Entry | What it means |
|-------|---------|
| Active playthrough | You're currently playing in this book |
| `in [Book] §X ⇒` (teal) | This playthrough is currently active in a different book |
| Portal-paused | Paused here; active somewhere else. Use **View** (not Load) - you need to portal back to resume |
| Completed | Ended somewhere in the series |

### Journey viewer

For completed public series playthroughs, click **⤢ View** to see the full cross-book journey - every book visited, the path through each one, portal transitions, and the final result.

---

## Reset

**Reset Book** wipes all map data and playthrough history for the current book. The book itself is kept. This cannot be undone.

> For open world series, Reset Book resets the **entire series** - all playthroughs and all progress across every book in the series.

To fully remove a book, use **✕** on the Books screen.

---

## Exporting your data

### Export Everything

In your **profile** (click your avatar) → **Export** → **⬇ Export Everything (.zip)**. The archive contains:

- `backup.json` - all your books, maps, playthroughs, notes, ratings, and details in a single file
- `books/Book Title.html` (or `books/Book Title/Book Title.html` for books with a map snapshot) - one readable HTML file per book, with stats, playthroughs, per-run details (charsheet, inventory, equipment), and the full section map
- `books/Book Title/graph.svg` - a snapshot of that book's map, for any book you've started laying out (sharp at any zoom, unlike a regular image)

### Export This Book

In the **sidebar** of any open book → **⬇ Export Book**. The button shows "Exporting..." while the ZIP is being prepared. Contains:

- `Book Title.html` - a readable HTML file with stats, all playthroughs, per-run charsheet/inventory/equipment details, and the section map
- `Book Title.json` - the data for this book only
- `graph.svg` - a snapshot of the current map, for books you've started laying out

The ZIP is saved with the book's real name (e.g. `The Citadel of Chaos.zip`).

---

## Battle Simulators

Some books come with a built-in **Battle Simulator** that appears automatically when you open them. It handles the book's specific combat rules so you can focus on the adventure, not the maths.

When a simulator is available, a panel appears in the play area alongside your tracker - no special setup needed.

**What it does:**
- Set up a fight by entering your character's stats and your enemy's stats
- Click **Roll** to resolve each round - the simulator rolls the dice, applies the book's rules, and updates HP for both sides
- A running log shows every round so you can see exactly what happened
- Your combat history is saved per playthrough

**Good to know:**
- Each simulator follows the exact rules for its specific book (dice counts, damage tables, special abilities)
- Some simulators read your current equipment and character sheet to prefill your stats
- The simulator doesn't affect your section tracker - it's a helper, not a replacement

---

## Play Together

Link two or more users' copies of a book so all progress is shared in real time.

### Starting a party

1. Open the book → click **Play Together**
2. Type a username and click **Invite** (a dropdown suggests matching users as you type)
3. The other user sees an invite card above their books list

### Accepting an invite

Click **Accept** on the invite card. The book is added to your library with the inviter's current progress. If you were already tracking it, your existing progress is replaced by the shared one. Click **Decline** to say no.

### While playing together

- The **Play Together** button turns green and shows your party members' names
- All progress is shared in real time - sections mapped, playthroughs started, choices recorded
- To invite more people, click **Play Together** → use **Invite more**

### Stopping

Click **Play Together** → **Stop Playing Together** (asks for confirmation). Everyone keeps the current shared progress and continues on their own.

---

## Forum

The community forum is at **/forum**. Anyone can read; you need to be logged in to post.

| Sub-forum | Purpose |
|-----------|---------|
| General Discussion | Anything gamebook-related |
| Book Recommendations | Looking for something to read? |
| Playthroughs & Spoilers | Discuss specific books and routes |
| Site Feedback | Bugs, feature requests, suggestions |
| Off Topic | Anything else |

- Click **+ New Thread** to start a thread
- You can attach images, PDFs, text files, and archives when creating a thread or posting a reply
- You can delete your own threads and replies (deleted replies show as *[deleted]*)
- New activity pulses **green** on the Forum button, sub-forum cards, and individual threads

**Formatting your posts:** thread and reply bodies accept a small markup:

| Type this | Get this |
|-----------|----------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `__underline__` | underlined |
| `~~strikethrough~~` | strikethrough |
| `{color:name}text{/color}` | colored text - `name` is one of `red`, `orange`, `amber`, `green`, `teal`, `blue`, `purple`, `pink` |
| `[label](https://url)` | clickable link |

---

## Feedback & Inbox

### Sending feedback

Click **Feedback** in the header → fill in your message → **Send**. You can optionally attach files before sending:

- Click **+ Attach** to pick one or more files
- Supported: images (JPEG, PNG, GIF, WebP, AVIF), PDF, plain text (`.txt .md .csv .json .xml`), archives (`.zip .7z .rar .gz`) - up to 64 MB each
- Large images are compressed automatically before upload
- Each attached file appears in the list with an **✕** to remove it before sending

### Notifications

The **bell 🔔** turns solid green when you have unseen notifications. Click it to see them.

| Notification | When it appears |
|--------------|----------------|
| **Level up** | Each time you gain a level |
| **Gold Coin earned** | XP milestone, level-up reward, 24h playtime, book completed, series/anthology fully completed |
| **Gold Coin gifted** | When an admin sends you coins directly |
| **Role assigned** | When an admin gives you the Author or Contributor role |

### Inbox

The **Inbox** button shows a count of unread messages from the admin. Click it to open your conversations.

- Your messages appear on the right in blue; admin messages on the left in grey
- Click any conversation to open it; **← Back** to return to the list
- Opening a conversation marks it as read and clears the badge
- Use **+ Attach** below the reply box to attach files to your reply (same file types and 64 MB limit as feedback)
- Images are shown inline; other files appear as download links
