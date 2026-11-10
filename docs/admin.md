# Gamebook Tracker - Admin Panel

The admin panel is the server operator's interface for accounts, catalog entries, announcements, rewards, and maintenance. For player controls, use the [Guide](/guide.html). API ownership, storage, and deployment details belong in the [Technical Reference](/admin/technical).

## Access

Open `http://localhost:3000/admin` on the server machine. The panel and `/api/admin/*` accept real localhost connections only. Forwarded-IP headers do not grant access. No separate admin-panel login is required.

The interface is English-only. Main-app Gamemaster permissions and localhost operator access are separate: actions in the player app still use that account's permissions.

## Navigation and editing

Select a tab to load its contents. **Refresh** reloads the current tab and dashboard. Players, Books, Series, and Anthologies have search, sorting, counts, and clear-search controls. Books, Series, and Anthologies use 50 rows per page.

Player lists initially show recently active accounts, with a control to reveal inactive accounts. Searching includes inactive accounts. Clicking a player or book opens its detail view; **Edit** opens a dialog without leaving the current list.

Editors support Save, Cancel, and Escape. Escape dismisses autocomplete before the editor. While saving, controls and dismissal are disabled. Errors remain visible in the dialog so you can correct or retry the action.

## Dashboard

| Group | What it shows |
|-------|---------------|
| Players | Registered and active accounts, recent registrations, and sign-in sessions |
| Catalog | Playable books, anthology containers, series, attachments, live reading, and simulators |
| Activity | Mapping, playthroughs, outcomes, and simulator usage |
| Gold and coins | Earned, available, and spent balances; upgrades; admin pool; lucky-coin activity |
| Rubies | Earned and held rubies, trades, and shared market supply |
| Diamonds | Completion rewards, balances, trades, and shared market supply |
| Server | Application/database size, memory, CPU, traffic, uptime, and downtime |

A player can have several sessions. Catalog node totals use the most-mapped player copy of each book; playthrough and simulator totals count activity across players. Expand **Stats for Nerds** for the detailed breakdown.

Statistics update while the panel is visible. Background polling pauses when its browser tab is hidden.

### Main-app aggregate widgets

Gamemasters can also see the app-wide XP and average-player-level widgets in the main app. The app widget pools XP and adds players' boost and heartbeat rates. The average widget averages individual player levels and shows the level spread. These are different measures.

## Players

The Players tab shows identity, registration and activity dates, library and run totals, level, currency activity, sessions, approximate location, and the last app domain used. Click a username for account details, refunds, and a searchable library.

| Action | Effect |
|--------|--------|
| **Edit** | Change account details, password, email, public profile, or feed visibility |
| **Clear sessions** | Sign the player out on every device |
| **Lock / Unlock** | Block or restore login; protected accounts cannot be locked |
| **Fateweaver** | Assign or remove author identity and optional display name |
| **Pathmaker** | Assign or remove contributor identity |
| **Lorekeeper** | Assign or remove public-catalog moderation |
| **Squire** | Assign or remove the independent badge and reward qualification |
| **Grant/Revoke Book Access** | Control access to downloadable PDF attachments |
| **Impersonate** | Create a one-time sign-in link for the player's account |
| **Refund** | Refund the latest or all purchases of a selected shop upgrade |
| **Delete** | Permanently remove the player and associated data; unavailable for protected accounts |

Impersonated activity does not earn XP or coins or update the player's presence. Impersonation still opens the player's saved data; make changes only when intended.

Lorekeepers can edit public-book, anthology, and series metadata and public covers without owning a library copy. They cannot edit another creator's private titles, unpublish that creator's public titles, upload restricted attachments, or change other players' progress. Removing a title from their own library affects only their memberships.

Squire adds no permissions. It lowers the public-book or public-anthology completion threshold for diamond rewards to 25 sections, compared with the normal 50. Assignment checks eligible previous completions without revoking existing rewards.

## Books

The Books tab lists standalone books and playable anthology children. Anthology containers have their own tab. Click a book for statistics, playthroughs, ratings, and attachments.

The editor includes title, section counts, pages, identifiers, authors, description, visibility, cover, series, anthology membership, and order. **Discoverable sections** is an optional completion limit; leaving it blank uses the book's total. **Highest section number** supports books whose printed labels have gaps.

The admin series selector searches the global catalog. Selecting **Part of anthology** makes the entry a child of that container. Container books have no independent section total or playthroughs.

### Attachments and covers

- Upload or replace PDF files up to 256 MB each.
- The detail view shows the existing format, size, download link, and removal control.
- File uploads do not award XP.
- Cover controls upload, replace, or remove the image.

Book Access for downloads is separate from Live Reading availability. Reading-access policy is maintained in the server configuration; the panel does not provide a general unlock-policy editor.

### Other actions

| Action | Effect |
|--------|--------|
| **Gift** | Add the book to another player's library; unavailable if already owned |
| **Delete rating** | Remove the selected player's rating |
| **Delete book** | Permanently remove the catalog entry and its data; blocked while other readers retain it |

Player-side **Reset Book** clears that player's progress and per-book progress locks. It does not revoke previously earned XP.

## Series and anthologies

The Series editor changes name, description, visibility, and **Open world series**. Deleting a series unlinks its books and removes the series' memberships and shared run data. Review the confirmation carefully.

The Anthologies editor includes shared bibliographic metadata, cover, attachments, and series membership. Deleting a container leaves its children as standalone entries rather than deleting their adventures. Deletion is blocked while other readers retain the container.

Open-world series share run identity and character possessions across books and use portal connections. This changes playthrough behavior; it is not merely a display grouping. Player instructions are in the Guide.

## Seasons

The Seasons tab shows event windows, live status, rewards, and animated companion previews.

To test an event:

1. Sign in to your administrator account in the main app.
2. In Seasons, select **Test season** on the event card.
3. Return to the main-app tab and move the mouse to view its companion.
4. Use **Test no season** to preview no companion, or **Stop testing, use live season** to restore the live calendar.

The override affects only that account and synchronizes its open sessions. Actual XP rewards continue to follow the live calendar. Previews appear on the main app page, not in the play area. Ensure **Disable seasonal sprites** is off in Ctrl+Y settings to see them.

### Event payout reports

Expand a processed event to see its recipients, qualifying days, and gold paid from the admin pool. Reports remain available after account deletion and update while the tab is open.

If the pool cannot cover every participant in full, the entire event payout is permanently skipped. Its report shows zero paid and the skipped amount.

## Tips and inventory items

Tips can be added, edited, enabled, disabled, classified as real or silly, and deleted. Disabled tips are excluded from the player rotation.

The Inventory tab manages the shared item catalog used by player inventory and equipment pickers. Search or filter items, then add or edit their name, type, description, artwork, and active status. Changing the shared catalog is separate from editing an individual player's possessions.

## Feedback

Feedback is searchable by player, email, and message. Unread threads are highlighted; opening one marks it read. Unsent replies remain available while navigating the open admin page.

- **Reply** stores an admin message and sends email when SMTP is configured.
- **Mark as read** clears the unread state.
- **Delete** hides the thread from the admin inbox. Permanent deletion occurs only after both sides delete it; a later reply can restore a hidden thread.

Attached images open in a viewer; other files have download links. Attachment-enabled replies can be sent through the main-app inbox where available. The admin reply form accepts text.

## Announcements

Create a draft with a title and body, review it, then publish. Drafts and published announcements are searchable and paginated. Pinning an announcement replaces the existing pinned notice.

| Action | Effect |
|--------|--------|
| **New / Edit** | Create or update the title and body |
| **Publish / Unpublish** | Show or hide the announcement in the player feed |
| **Pin / Unpin** | Control the pinned notice without changing publication status |
| **Delete** | Permanently remove the announcement |

Supported body markup:

| Syntax | Result |
|--------|--------|
| `**bold**` | Bold |
| `*italic*` | Italic |
| `***bold italic***` | Bold italic |
| `__underline__` | Underlined |
| `~~strikethrough~~` | Strikethrough |
| `{color:name}text{/color}` | Colored text: red, orange, amber, green, teal, blue, purple, or pink |
| `[label](https://url)` | Link |

## Gold pool and gifts

Each ruby or diamond generated for a player or the app adds one gold coin to the admin pool, including recorded historical generation. Buying, selling and transferring crystals do not add another coin.

**GC Earned** is the pool's lifetime supply generated from platform activity. **GC Available** is the amount currently available after gifts and event payouts. Replacing an attachment does not add another contribution; removing it removes that file's contribution.

To gift a player, use their account's gift action. For a bulk gift, use **Gift gold coins to everyone** in Tools, enter the amount per player level and an optional message, then review the recipients and total cost before confirming. Level 0 receives nothing.

A bulk gift is applied in full or not at all. Changed recipients or levels require a new preview. Retrying a completed request does not send the gift twice.

## Tools and maintenance

| Tool | Use |
|------|-----|
| **XP Configuration** | Change future base XP amounts for event types; save changed values |
| **App Version** | Update the displayed release version; coordinate with the release file |
| **Notepad** | Keep private operator notes |
| **Backups** | Inspect backup files and select files for deletion |
| **Size Ignore Patterns** | Exclude matching paths from application-size and backup-file listings |
| **Vacuum** | Run the confirmed database-maintenance action |

XP settings apply immediately. Failed saves retain unsaved changes for retry. Changing an amount does not recalculate previously earned XP.

Automatic backup ZIPs contain the database only. Preserve uploaded files and protected reading artwork separately for a full server restore. The Technical Reference explains backup storage and restoration.

## SMTP and email

SMTP settings take effect without restarting the server and override environment defaults. Configure host, port, TLS mode, username, optional From address, and password.

- Port **465** normally uses implicit TLS.
- Port **587** normally uses STARTTLS.
- Leaving the password blank preserves the saved password.
- **Test SMTP** sends a test message to the configured SMTP username.

A failed email delivery does not remove the stored feedback reply. Check the displayed transport status and test result before relying on email notifications.
