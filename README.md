# Gamebook Tracker

Map your choices. Keep your characters. See where the next run takes you.

Gamebook Tracker is a browser app for branching adventures such as Fighting Fantasy,
Choose Your Own Adventure, Lone Wolf, and other gamebooks. Build an interactive map as
you play, organize your library, and share discoveries with other players.

[Open the app](https://pathmap.net) · [Player guide](docs/user-guide.md)

To start playing, open the app, create an account, and add a book to your library.
The setup instructions below are for running your own installation.

## What you can do

- **Map your adventures:** track visited sections, choices, endings, and alternate routes
  on an interactive graph with notes, zoom, fast travel, and optional grid controls.
- **Keep every run:** revisit previous attempts, compare progress, and view shared runs.
  Open World series connect books through portals and cross-book journeys.
- **Organize your library:** browse covers, search and filter books, arrange stashes,
  and manage series, anthologies, ratings, and reading progress.
- **Bring your character along:** use customizable character sheets, inventory,
  equipment, item templates, and a notebook.
- **Read and roll:** supported books offer section-by-section reading with linked
  choices and original artwork. Optional battle simulators handle encounters while
  you make the story decisions.
- **Play together:** join shared party runs, follow the live activity feed, visit
  public profiles, and talk in the forums. Library and progress updates sync live
  across connected tabs and devices.
- **Earn rewards:** gain player and job levels, collect currencies, and buy upgrades.
  Seasonal events bring animated mouse companions and event-specific XP bonuses.
- **Make it yours:** adjust the main-page panels, cover wall, graph display,
  animations, seasonal sprites, and reward floaties. Use the mobile interface or
  install the app from a supported browser.
- **Take your data with you:** export an individual book or your whole account.

For controls, shortcuts, and detailed behavior, see the [player guide](docs/user-guide.md).

## Run locally

Requirements:

- Node.js 22 and npm.
- The `zip` command for automatic database backups.
- A browser with JavaScript enabled.

```bash
git clone https://github.com/koldKat/gamebooks.git
cd gamebooks
npm ci
npm start
```

Open `http://localhost:3000`. The app creates its SQLite database and upload directories
on first startup. A fresh checkout starts with a fresh database; the deployed catalog,
reading artwork, and uploaded files are stored separately from the repository.

The operator panel is at `http://localhost:3000/admin` on the server machine. It accepts
real localhost connections only and has no separate panel login. See the
[admin guide](docs/admin.md) for configuration and account management.

### Optional configuration

Create `.env` in the project root as needed:

```dotenv
PORT=3000

# Outgoing email for password resets and feedback replies.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Optional credentials for geographic database updates.
MAXMIND_LICENSE_KEY=
MAXMIND_ACCOUNT_ID=
```

SMTP settings saved in the admin panel take precedence over environment defaults.
Without SMTP, the app runs but cannot send password-reset emails. Set the trusted
public app URL in admin settings when deploying so account links use the correct address.

### Data and backups

The app stores its database in `database.sqlite`, uploaded files under `public/`, and
protected reading artwork in `reading-images/`. These files are excluded from Git.

Database snapshots are compressed into `backups/` at midnight in the server's local
time zone, with 30 days of retention. The server also checks for a missing daily backup
at startup. Database archives do not
include uploaded files or reading artwork; preserve those directories separately when
moving or backing up an installation.

## Development

The server uses Node's HTTP APIs and SQLite through `better-sqlite3`. The frontend uses
vanilla JavaScript ES modules, shared CSS, and vis-network for graphs. Live updates use
Server-Sent Events. There is no frontend build step.

| Command | Purpose |
|---------|---------|
| `npm start` | Start the server |
| `npm test` | Run the Node test suite with two workers |
| `npm run docs:build` | Generate the HTML guides from `docs/*.md` |
| `npm run docs:check` | Check that generated guides match their Markdown sources |

Some simulator tests require an installed roster catalog, which is stored in the
database rather than bundled with the source. They read it without modifying it;
set `GAMEBOOKS_TEST_DATABASE` to select a separate database. Browser checks also need
a compatible Chromium executable and their documented test environment.

The release version is recorded in `VERSION` and the app's admin settings. Static assets
use cache revalidation, so frontend edits do not require version query strings.

## Project layout

| Path | Contents |
|------|----------|
| `server.js`, `server/` | HTTP routes, database modules, live updates, and background jobs |
| `public/js/`, `public/css/` | Main app, reader, graph, and shared UI |
| `public/mobile/` | Mobile play interface |
| `public/js/battlesim/` | Book-specific simulator modules and shared combat engines |
| `admin/` | Local operator interface |
| `test/` | Server, client, and browser checks |
| `docs/` | Player, admin, and technical documentation sources |

## Documentation

- [Player guide](docs/user-guide.md): features, controls, and playing a book.
- [Admin guide](docs/admin.md): catalog, accounts, events, announcements, and operations.
- [Technical reference](docs/technical.md): architecture, storage, APIs, and testing.

Edit the Markdown sources and run `npm run docs:build` to update `public/guide.html`,
`admin/admin-guide.html`, and `admin/technical.html`.
