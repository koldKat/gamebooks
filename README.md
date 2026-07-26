# Gamebook Tracker

Track every branch, choice, and playthrough in your favourite gamebooks - Fighting Fantasy,
Choose Your Own Adventure, Lone Wolf, and anything else built on numbered sections. Map your
route as an interactive graph, level up, earn Gold Coins, and share your progress with an
activity feed, forums, and public profiles.

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

## Documentation

Full docs live in [`docs/`](docs/):

- [`docs/user-guide.md`](docs/user-guide.md) - how to use the app
- [`docs/admin.md`](docs/admin.md) - admin panel reference
- [`docs/technical.md`](docs/technical.md) - project structure, architecture, and implementation notes
