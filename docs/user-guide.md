# Gamebook Tracker - Guide

Keep track of every branch, every choice, and every playthrough in your favorite gamebooks. Works with Fighting Fantasy, Choose Your Own Adventure, Lone Wolf, and anything else that uses numbered sections.

---

## Starting the app

The animated graph logo appears while the app starts, including when opened from your phone's home screen. Slow loading keeps waiting. If startup fails, the app automatically retries up to three times with increasing delays; while offline, it waits for you to reconnect. If those attempts fail, press **Try again** to reload manually. Reloading does not clear your login or saved progress.

## Landing page panels

When you first arrive - whether you're logged in or not - the screen is divided into three panels side by side.

### Left - Book covers

A public wall showing all the books, anthologies, and series in the tracker. Click any cover to see its details.

An author's rating shows its vote count beside the average. Both are derived from individual ratings of public books crediting that author, not from separate author votes.

- **Sort** - Latest (default), Oldest, A–Z, Z–A, or Random
- **Filter** - All, Books, Anthologies, Series, or Favorites
- **Search** - searches titles, authors, series names, and child book names; type `anthology` or `series` to filter by type
- **Favorites** - while logged in, hover a cover and click the ★ to save it as a favorite
- The wall refreshes automatically whenever books are added or changed
- For players with PDF access, an anthology's file badges also show when one of its public stories has that file format.

Open the ⚙ settings button or press **Ctrl+Y** to adjust cover titles, background options, animation preferences, seasonal sprites, and feed appearance.

**Hide Cyrillic covers** and **Hide NSFW covers** control the cover wall and rotating background, including backgrounds drawn from My Books. They do not remove books from your library or filter activity-feed entries. NSFW covers are hidden by default, including for signed-out visitors.

### Seasonal events

Seasonal events bring themed mouse companions and temporary bonuses. The notice above the activity feed explains the current event or shows what is coming next. It updates automatically in open tabs.

Use **Disable seasonal sprites** in Settings to hide the companions. This changes the visuals only; event bonuses are independent of that preference.

### Center - Activity feed

Shows what everyone's been up to over the last 30 days. You don't need an account to read it.

Use the buttons beside **Activity** to show or hide runs, achievements, new catalog entries, news, ratings, library additions and player activity. Filters are available to everyone, including guests. Signed-in players' selections are saved to their account and sync across devices; guest selections last for the current session. Turning off **News** also hides pinned announcements.

Live updates change the affected day's content without reloading the whole feed. Unchanged day cards stay in place and your reading position is preserved where possible. Groups you expand stay expanded through live updates, even if temporarily regrouped. Closing a group keeps it closed; reloading the app or switching accounts resets these choices.

Each day's card shows the covers of the public books played that day, faded behind the entries (cycling through more than one if several different books were active). Turn it off via **Show covers in feed** in the Ctrl+Y settings panel if you'd rather keep the feed plain. Days with no cover to show get a faint see-through tint instead, letting the rotating background peek through - toggle that separately with **Transparent background for day cards** if you'd rather those stayed flat too.

- A **tip bar** cycles through helpful hints every 15 seconds (the orange bar counts down)
- Activity is grouped by day (Today / Yesterday / date)
- New books in a series or anthology fold under its heading on the day those books were created. Expand it to see only that day’s new books; older announcements keep their original dates.
- Players with 5 or more entries on the same day are collapsed into one row - click it to expand
- Pinned announcements from the Gamemaster appear at the top when **News** is enabled

**What you'll see in the feed:**

| Event | What it means |
|-------|---------|
| *player* **created / added book** *book* | A new book was added to the library |
| *player* **created / added series** *series* | A series was created or added |
| *player* **began run N of** *book* | Someone started a new playthrough |
| *player* **won / lost / died in** *book* run N | A playthrough ended |
| *player* **won** *book* **run N for the first time** | First ever victory in that book, showing which run achieved it |
| *player* **lost in** *book* **for the first time** | First ever loss (non-battle) in that book |
| *player* **fell in battle in** *book* **for the first time** | First ever battle-death in that book |
| *player* **won in all books of** *series / anthology* | Every book in a collection completed |
| *player* **discovered / visited every section of** *book* | Reached 100% mapping or 100% visiting |
| *player* **reached level N** | Someone leveled up |
| *player* **joined** | A new player registered |

**Clicking things in the feed:**
- **A username** (if that player has a public profile) → see their books and completed playthroughs
- **A book name** → opens that book's activity; if it belongs to a series, a series link appears too
- **The result word** (won / lost / fell in battle / died, if the run is public) → opens a view of that playthrough's path on the graph, with a legend overlay in the top-right corner explaining the node colors

### Right - Login / Books

This is either the login form or your books list, depending on whether you're signed in.

**Collapsing panels:** each side panel has a **‹ / ›** button on its inner edge to fold it away. The feed has its own **▴ / ▾** tab at the top. Your side panel preferences are saved to your account; the feed's collapsed-or-open state only lasts for the current session.

**Keyboard shortcuts (landing page):**

| Shortcut | Action |
|----------|--------|
| **Ctrl+X** | Hide or restore all three panels |
| **F1** | Open the Cheat Sheet |
| **Ctrl+Y** | Landing page settings (cover-title font size/bold/hide Cyrillic, background source, disable seasonal sprites, reduce animations, feed day covers, transparent day cards) |

**Escape:** dismisses open autocomplete suggestions first. Press it again to close the top dialog; dialogs underneath stay open. Saving and uploading can temporarily block dismissal.

**Landing background:** the animated background image behind the panels rotates through book covers. While logged in, right-click anywhere on the background (not on a panel) to get a quick menu with **Hide background** / **Show background**. Your choice is saved to your account. Normally the cover is dimmed so it stays legible behind the panels - collapse all three (**Ctrl+X**) and the dimming lifts, showing the cover at full brightness; bring any panel back and it dims again.

---

## Stats for Nerds

Click **Stats** in the header (visible to everyone) to see live numbers for the whole platform.

| Section | What's shown |
|---------|-------------|
| **Players** | Registered players, Gamemasters, Lorekeepers, Fateweavers, Pathmakers, public profiles, avatars, undos/Fast Travels performed |
| **Books** | Unique books/series/anthologies, total library copies, public/private split, unique authors, average sections and pages per book, total/mapped/discovered sections, books fully visited or discovered |
| **Parties** | Play Together parties created and active, players currently in a party, invites sent/accepted/declined |
| **Gameplay** | Total, active, and finished playthroughs; wins, losses, battle deaths (with percentages); tracked and average play time |
| **XP & Progression** | Total XP earned; platform level and title; average player level and title; level-ups; XP event types/count |
| **Gold Coins & Shop** | Coins earned, spent, and in circulation; upgrades purchased by type |
| **Ratings** | Total votes; separate book, anthology and series vote counts and averages; exact half-star breakdowns from 0.5 to 5, with subtle bars showing each score's share |
| **Forum** | Categories, threads, pinned threads, posts |
| **Server** | CPU model/cores/age/clock/architecture, total RAM |
| **The App** | App age, server uptime and uptime %, total downtime, lines of code, code/database size, JS module count, network traffic, live session averages (CPU, heap, RSS) |
| **Open World** | Open world series (public split), books in them, portal nodes, series runs (completed/public), pre-series runs |

Hover or tap the registered-player total to see the country breakdown, with flags and country names in alphabetical order.

---

## Accounts

- **Log In** - sign in with an existing account
- **Create Account** - register with a username and password

For password resets, the app sends the link to your saved email address. If you have no email saved but used an email address as your username, it sends the link there instead.

Your session is remembered in the browser. Click **Log out** on the books screen to sign out.

---

## Your books

After logging in you land on the **Books** screen.

New accounts start with an empty library. Add books from the public catalog or create your own entries.

Each book card shows a progress bar for sections you've visited across all playthroughs. The fill shows fractional progress, so small gains can move it between whole percentage points. The bar turns green once you've visited every section.

| Button | What it does |
|--------|-------------|
| **Open** | Go into the tracker for that book |
| **✎** | Edit the book details (name, sections, identifiers, cover) |
| **✕** | Delete the book and your progress (asks for confirmation) |

If a Gamemaster shared a book with you, **✎** is visible but grayed out - only the creator can change the book's details.

### Player roles

| Role | Badge |
|------|-------|
| Gamemaster | Blue star |
| Lorekeeper | Purple diamond |
| Pathmaker | Green star |
| Fateweaver | Gold star |
| Squire | Bronze-orange shield |

### Lorekeepers

Lorekeepers have a purple diamond badge and can edit the metadata of any public book, anthology or series, plus covers for public books and anthologies, including titles outside their own library. Like every player, they can remove any book, anthology or series from their own library, regardless of its creator, and delete their own stashes. Removing a library entry preserves other players’ copies and progress. They retain creator permissions for their own private books, anthologies and series. They cannot delete other players' entries, edit other players’ private titles, or make another creator’s public title private. The role does not grant Gamemaster access or PDF upload access. Lorekeepers can also adjust secondary anthology memberships when both the book and anthology are public. Stats for Nerds lists the number of Lorekeepers under Players.

### Creating books

Click **Create Book** at the top of the books screen. As you type the name, a dropdown suggests public books and books already in your library - selecting a public book fills in its details and changes the button to **Add to library**. A book already in your library shows **Already owned** instead.

- **Sections** - total number of sections (minimum 5)
- **Type** - Book (ISBN + ASIN) or Magazine (ISSN)
- **Author(s)** - comma-separated list
- **Pages** - physical page count (not the same as section count)
- **Description** - free-text summary
- **Cover** - optional image upload

Leave any optional fields blank and fill them in later using the **✎** button.

For books with gaps in their section numbering, enter the actual count in **Total sections** and the largest printed label in **Highest section number** when adding or editing the book. For example, 420 total sections and a highest number of 1003 allow section 1003 during play, while progress uses 420. Leave the optional maximum blank for ordinary sequential numbering.

### Stashes

A **stash** is a personal folder for tidying up your books list.

- Click **Create Stash**, give it a name, and optionally add any mix of books, anthologies, and series to it. Empty stashes remain visible, so you can fill them later.
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

The Player XP panel shows your current account progress. Expand it to view the details available for your screen size. The same account bars appear in **My Books** and your profile.

**Keyboard shortcuts (play area):**

| Shortcut | Action |
|----------|--------|
| **I** | Open / close the Inventory panel (not while typing in a text field) |
| **C** | Open / close the Character Sheet (not while typing in a text field) |
| **E** | Open / close the Equipment panel (not while typing in a text field) |
| **S** | Open / close the Battle Simulator, if one is available for the current book (not while typing in a text field) |
| **R** | Open / close Live Reading, if the current book has it (not while typing in a text field) |
| **P** | Open / close Party (not while typing in a text field) |
| **G** | Open / close the Guide (not while typing in a text field) |
| **N** | Open / close the Notebook (not while typing in a text field) |
| **Ctrl+X** | Hide or restore all play-area side panels at once |

**PDF access:** if the book has a PDF and you've been given access (or you're a Gamemaster), a **PDF** link appears next to the book title at the top of the sidebar.

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

### Grid and snap-to-grid

- **Right-click on empty space** → **Grid** → **Show grid** - overlay a fixed-spacing grid across the whole graph. It pans and zooms with the map.
- **Right-click on empty space** → **Grid** → **Fog of grid** - only shows the grid in a circle around each dot, instead of across the whole map. Mutually exclusive with Show grid - turning one on turns the other off.
- **Right-click on empty space** → **Grid** → **Snap to grid** - while on, dropping a dot after dragging it snaps to the nearest grid line. It only affects dots you move after turning it on - nothing already on the map gets nudged. Works independently of the other two. While it's on, zooming out is capped so a grid cell never gets smaller than a comfortable touch target - snapping only feels accurate if you can see where a cell actually starts and ends.

All three work even for books without a cover image, and all are saved per book.

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

The **Undo** button takes you back to the last real decision point. If several sections in a row only had one possible destination, they are skipped together. The remaining allowance is shown in the tracker; extra uses can be purchased in the shop.

### Ending a run

| Button | What it does |
|--------|-------------|
| **★ Win** | Mark this playthrough as a victory |
| **✝ Loss** | Mark this playthrough as a regular death |
| **Battle Death ⚔** | Mark a battle death at your current section; also flags that section as a battle location on the map |

Each one asks you to confirm before it's finalized.

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

Public-run viewers start with the run path and legend collapsed. Expand either when you need it.

---

## The graph

Every section you've ever visited appears on the graph as a dot (called a node). Lines between dots show which sections lead to which.

### Line colors

| Color | Meaning |
|--------|---------|
| Red (thick if you traveled it this run) | This path leads to a dead end |
| Green (thick if you traveled it this run) | This path leads to victory |
| Orange (thick) | You traveled this path in the current or viewed playthrough, with no definite outcome |
| Gray | You didn't travel this path in the current run |

### Dot colors

| Color | Meaning |
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
| Gray (solid) | Seen but not yet mapped |
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
- **Color 🎨** - apply one of 16 colors to the dot
- **Shape** - choose a circle, rounded square, hexagon, triangle, octagon, or trapezoid; outcome and battle outlines remain visible
- **Delete node** - remove this dot and any dead-end descendants (asks for confirmation)

### Fast Travel

Jump directly to a section you've already visited, skipping everything in between. Fast Travel is available during an active playthrough on sections that have been mapped. Choose how you want to get there:

| Mode | Route |
|------|-------|
| High priority | Prefers sections you've marked as high priority |
| Shortest | The quickest path |
| Normal | Avoids both high- and low-priority sections |
| Low priority | Prefers sections you've marked as low priority |

The tracker shows your remaining Fast Travels, and the shop offers extra uses. You can also click **Fast Travel** in the sidebar to enter a section number directly.

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

An edit, rename or removal applies only to the original item in the original run. If you switch runs or the item changes while a dialog is open, that pending action is discarded; reopen it for the current item.

### Adding items

Click **+ Add Item**, then browse or search the list of available items. Click any item to add it. You can also type a short label on it - useful if you want to note a quantity or a specific version of an item.

Search includes the full item catalog, including items you have not scrolled to yet. Hover an item to see its full name in a themed tooltip.

On mobile, **Inventory** and **Equipment** are beside **Notebook** and **Simulator**. You can add and rearrange items, but renaming and on-screen overlays are available on desktop only.

### Changing the order

Drag items around to arrange them however you like. The new order is saved automatically.

### Removing an item

Right-click an item to remove it. On mobile, drag it onto the trash button. Confirming removes the item; canceling keeps it in your inventory.

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

On mobile, tap an empty silhouette slot to choose an item from your inventory. Drag gear between slots to rearrange it, or onto the trash button to return it to inventory. Returning equipped gear does not delete it.

If all 40 inventory slots are full, an item stays equipped unless its whole stack can merge into a matching inventory stack. Free a slot and try again; a failed unequip never discards the item.

### Right-click menu

Right-click an equipped item for options:

- **Show / Hide on screen** - pin the item to the on-screen display alongside your visible inventory items (shown with a small slot badge, like `WEAPON` or `HEAD`, so it's clear at a glance which items are equipped versus just carried)
- **Rename** - give the item a custom name (carries over if it's moved back to inventory)
- **Edit** - change quantity, note, and the "show on screen" flag

### Save as Template

Click **Save as Template** to save the current loadout (including any custom names, notes, and quantities) as the starting equipment for future playthroughs of this book.

---

## Notebook

Click **Notebook** (bottom-center of the graph area) to open a freeform text area shared across all playthroughs for this book.

- **Save** - save your notes and close the window
- **Close / ✕ / click outside / Esc** - close without saving

The **Show in play area** toggle pins your notebook as a see-through overlay on the left side of the graph. Hover over it to start editing; save or move the mouse away to go back to view mode.

---

## Your profile

Click your avatar circle on the Books screen.

- **Username** - change your login name
- **Display name** - Fateweavers only: shown in place of username throughout the site
- **Public profile** - let anyone view your books and completed playthroughs; your username becomes a clickable link in the feed
- **Hide from activity feed** - remove your activity from the feed (playthroughs you've explicitly made public will still appear)
- **Change Password** - enter your current password, then your new one
- **Avatar** - click **Change Avatar**; if the image isn't square, a crop tool lets you choose the right part. Saved as 512×512, max 256 KB

Your current level, title, and progress toward the next level are also shown here.

Public and private profiles show earned roles above a collapsible statistics section. Expand **Statistics** for reading progress, discoveries, mapping, ratings, and simulator battles fought, won, and lost. Public runs are grouped into expandable series, anthologies, and books, with the most recent runs first.

---

## XP display and shops

Your XP bars show your current level, title, and progress. Expand a bar for the details available in that view.

Reward floaties provide optional feedback while you use the app. Use **Disable floaties** in Settings to hide them throughout the app; your account still receives its rewards.

Click a currency balance in **My Books** to open its available shop. The dialog shows current prices, your balance, and any purchase restrictions before you confirm. Unavailable purchases are disabled.

When the Lucky Coin button lights up, click it to claim the waiting coin.

---

## Rating

Rate any book, anthology, or series with 0.5–5 stars (half-star increments).

**Requirements:**
- **Book** - complete at least one playthrough (any outcome)
- **Anthology** - complete at least one playthrough of every book inside it
- **Series** - meet the above requirement for every item in the series

The star widget appears in the book's detail window and the Edit Book dialog when you own the item. Click your current rating to clear it.

Once you've rated something, your stars turn **aqua** to tell them apart from the amber preview you see while hovering.

---

## Editing book details

You can edit a book from two places:
- **Books screen** - click **✎** next to the book
- **Tracker sidebar** - click **✎** next to the book title

Books need a minimum of **5 sections**. You can't lower the section count below the highest section number already in use.

Identifiers (ISBN, ASIN, ISSN) appear next to the section count in the books list. Books that share the same ISBN or ISSN are treated as the same title across all players.

### Discoverable sections

When you've explored everything you can find - every section you know about is fully mapped, but the total is still below the book's printed section count - the edit dialog shows a **Discoverable Sections** field. Set this to the true number of reachable sections to correct the progress bar for everyone tracking the book.

### Book cover

Upload a cover in the Create Book window or the edit dialog. The upload control resizes and compresses the image to meet the 512 KB cover limit while preserving its proportions. Public books show their cover on the covers wall; private books remain private.

### Make public

The **Make public** checkbox (creator only) makes the book findable by other players:
- It appears on the covers wall and in the public book list
- Others can click **+ Add to my library** to start tracking it
- Everyone tracking the book sees your changes immediately
- If you delete it while others are tracking it, ownership passes to the next player

When you open a public book, signed-in players see **+ Add to my library**, or **Open Book** if they already have it. On mobile, **Open Book** opens the mobile reader. Signed-out visitors see **Log in or sign up to add book**, which opens the login screen with the registration option.

### Series

Create a series with **Create Series**. Add a book to a series via the **Series** dropdown in the Edit Book dialog. Books in the same series group together under a collapsible amber header. Suggestions include public series and your own series. A private series belonging only to another account stays hidden; you can create a separate series with the same name.

- Only the creator can edit a series; other players can add a public series to their own library
- **Delete Series** - removes only your series (books stay as standalone items)
- **Delete Series & Contents** - removes the series and its books from your library

Expand a series in **My Books** to rate it directly. The same rating requirements apply as in its detail dialog.

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

Private anthologies stay hidden from other players, even when one of their stories is public. Public anthology previews show only public stories.

**Adding someone else's anthology:** click **+ Add to my library** on any public anthology to add it and all its public stories in one step.

---

## Open World series

An open world series is a continuous adventure that spans multiple books. All books share the same playthrough numbering. Your character sheet, inventory, and equipped items travel with the current playthrough through portals, in either direction and across any number of books. This also applies to private books.

The series has a shared notebook, so notes saved in any book are available in every other book in that open world. Existing distinct notes are retained when you first use the shared notebook.

Simulator character stats travel between compatible rules systems, including reduced health, skills, and spent character resources. Enemies, ongoing fights, combat settings, logs, and history stay with their own book. Different rules systems keep separate simulator characters.

| Normal series | Open World series |
|---------------|------------------|
| Each book has its own independent playthroughs | All books share the same playthrough numbers |
| Character sheet and possessions stay within each book | Character sheet and possessions travel between books |
| A playthrough ends within its book | A playthrough ends wherever it ends, in any book |
| No connections between books | Portal sections link books together |

### Portal sections (◇)

Teal diamond shapes on the graph mark portal sections - they connect a section in one book to a section in another. When your playthrough reaches one, a **Portal destinations** panel appears in the sidebar.

Traveling through a portal:
1. Saves your character sheet and carries your current possessions and compatible simulator character stats
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

Some books come with a built-in **Battle Simulator** that appears automatically when you open them. Use it to resolve an encounter while reading the adventure.

Open its button in the play area, or press **S**. Enter your current character values and any relevant equipment before starting a fight.

On mobile, the simulator loads when you tap its button. If a network-error message appears, reconnect and tap the button again to retry.

**What it does:**
- Set up a fight by entering your character's stats and your enemy's stats
- Click **Roll** to resolve each round - the simulator rolls the dice, applies the book's rules, and updates HP for both sides
- A running log shows every round so you can see exactly what happened
- Your combat history is saved per playthrough

Where a simulator offers **Custom opponents**, type a name to see roster suggestions, then adjust the stats or add another opponent. Printed encounters remain available for their special rules; custom fights do not choose a story destination for you. Opponent setup is locked during an active fight.

**Good to know:**
- Choose a preset for its encounter rules, or use custom opponents where offered
- Some encounters require manual resolution when the source lacks necessary combat values
- Some simulators read your current equipment and character sheet to prefill your stats
- The simulator doesn't affect your section tracker - it's a helper, not a replacement

---

## Live Reading

Books with reading text have a **Read Book** button in the play area. Opening the reader resumes your active run or starts one if none is active. A failed progress load shows recovery controls rather than creating an empty replacement run.

- Click a choice in the text to move forward and update the graph.
- Hover a choice to highlight its destination on the graph.
- Adjust text size with the **− 100% +** control.
- Use the **☰ menu** for available frontmatter and backmatter, then return to your current section.
- With the reader open, click a previously read mapped section to preview it without moving your run. Use **Return to where you left off** to resume.
- Mark the run's outcome through the normal tracker controls.

Clicking a graph section does not open or reopen Live Reading. Unvisited sections cannot be previewed, and unavailable reference material is shown disabled.

Map-driven passages can include the original map and a marker field. Follow the map's connections, enter your chosen marker, and continue. Your selected connections are saved. The tracker does not solve the map or choose a route; marker entry is disabled while previewing an earlier passage.

Reading availability is shown for books and anthology stories. If an unlock is required, a themed dialog shows the cover, description, and gold price before purchase. **Unlock book** is disabled when you cannot afford it. A permanent unlock survives resets, deleted runs, and later reader loads. Free books open without a purchase prompt.

Click reader artwork to open the image viewer. Zoom in or out in 25% steps and drag a zoomed image to pan it.

---

## Play Together

Link two or more players' copies of a book so all progress is shared in real time.

### Starting a party

1. Open the book → click **Play Together**
2. Type a username and click **Invite** (a dropdown suggests matching players as you type)
3. The other player sees an invite card above their books list

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
| **Gold Coin gifted** | When a Gamemaster sends you coins directly |
| **Role assigned** | When a Gamemaster gives you the Lorekeeper, Pathmaker or Fateweaver role |
| **Refund or account adjustment** | When an administrator refunds a purchase or applies a currency adjustment |

Ordinary reward feedback uses floaties rather than adding an inbox notification for every gain.

### Inbox

The **Inbox** button shows a count of unread messages from the Gamemaster. Click it to open your conversations.

- Your messages appear on the right in blue; Gamemaster messages on the left in gray
- Click any conversation to open it; **← Back** to return to the list
- Opening a conversation marks it as read and clears the badge
- Use **+ Attach** below the reply box to attach files to your reply (same file types and 64 MB limit as feedback)
- Wait for all attachments to finish uploading before sending. Remove failed uploads or upload them again.
- Images are shown inline in the message - click one to open the original at full size; other files appear as download links
- Deleting a conversation removes it from your inbox only; it's permanently deleted once both you and the Gamemaster have deleted it
- A new reply brings the conversation back to the recipient's inbox if they previously deleted it.
