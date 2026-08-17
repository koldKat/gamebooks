# Gamebook Tracker

Track every branch, choice, and playthrough in your favourite gamebooks - Fighting Fantasy,
Choose Your Own Adventure, Lone Wolf, and anything else built on numbered sections. Map your
route as an interactive graph, level up, earn Gold Coins, and share your progress with an
activity feed, forums, and public profiles.

## Features

- **Interactive graph** - every section you visit is plotted as a node; choices become edges,
  colour-coded by line/dot, with fast travel, zoom/pan, right-click actions, section notes, an
  optional grid overlay with snap-to-grid and fog-of-grid, and manually-added nodes for sections
  reachable outside your recorded path
- **Character sheet & inventory** - custom fields, equipment slots, item templates, and a
  compact overlay for quick reference mid-playthrough
- **Runs & progress** - start/undo/end runs, reset a book, and keep a running history of every
  attempt
- **Levels & Gold Coins** - earn XP and coins for exploring, discovering sections, and completing
  runs; spend coins in the shop; a public "Stats for Nerds" panel shows live server/app internals
- **Open World series** - portal sections link books together into one connected world, with a
  cross-book journey viewer
- **Series & anthologies** - group books by reading order or under a shared anthology/magazine
  entry, with per-anthology cover art and a book allowed to belong to more than one
- **Battle Simulators** - dice-driven combat simulators for select books
- **Live reading** - read a book's actual prose section-by-section in-app, with clickable
  in-text choices that build your graph as you go, for select books
- **Social features** - a public activity feed, forums, Play Together (live shared party runs),
  public profiles, ratings, and a feedback/inbox system
- **Export** - download your data per-book or for your whole account
- **Demo mode** - try the tracker without an account
- **Multi-platform tracking** - the same account works across every domain this app is deployed
  on; the admin panel records which domain each user last signed in from

See [`docs/user-guide.md`](docs/user-guide.md) for the full walkthrough of every feature above.

## Tech stack

- **Server**: plain Node.js (no framework), `server.js` + `server/`
- **Database**: SQLite via `better-sqlite3`
- **Frontend**: vanilla ES modules under `public/js/`, versioned with `?v=N` cache-busting
- **Email**: Nodemailer (optional - only needed for password reset / notification emails)
- **Geolocation**: `geoip-lite`, with an optional MaxMind GeoLite2 database for better accuracy

## Requirements

- Node.js v22 (see `.nvmrc` - `better-sqlite3` is built against this version)

## Setup

```bash
git clone https://github.com/koldKat/gamebooks.git
cd gamebooks
npm install
```

Create a `.env` file in the project root for optional integrations:

```bash
# Optional: improves geoip-lite's accuracy with a MaxMind GeoLite2 download.
# Leave unset to fall back to the bundled free database.
MAXMIND_LICENSE_KEY=
MAXMIND_ACCOUNT_ID=

# Optional: enables outgoing email (password reset, notifications).
# Leave unset to run without email support.
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Optional: HTTP port (defaults to 3000)
PORT=
```

Start the server:

```bash
npm start
```

The SQLite database (`database.sqlite`) is created automatically on first run.

## Scripts

| Command                 | Description                                  |
|--------------------------|-----------------------------------------------|
| `npm start`              | Start the server                              |
| `npm test`                | Run the test suite (`node --test`)            |
| `npm run check:versions`  | Verify `?v=N` cache-busting versions are consistent across all imports |
| `npm run docs:build`      | Regenerate the HTML docs from `docs/*.md`     |
| `npm run docs:check`      | Fail if the HTML docs are stale relative to their markdown source |

## Documentation

Full docs live in [`docs/`](docs/) as the single source of truth - each is
regenerated into a styled HTML page (sticky table of contents, scroll-spy,
anchor links) by `npm run docs:build` (see `scripts/generate-docs.js`).
Never hand-edit the generated `.html` files; edit the `.md` source and
rebuild.

- [`docs/user-guide.md`](docs/user-guide.md) → `public/guide.html` - how to use the app
- [`docs/admin.md`](docs/admin.md) → `admin/admin-guide.html` - admin panel reference
- [`docs/technical.md`](docs/technical.md) → `admin/technical.html` - project structure, architecture, and implementation notes
