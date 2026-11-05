# garmin-download

Downloads your Garmin Connect FIT activities and daily health data through Garmin's official [Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/). No browser session or Garmin password is needed.

## Setup

Create a Personal API key in Garmin Connect. Copy `.env.example` to `.env`, then set the key:

```dotenv
GARMIN_PERSONAL_API_KEY=your-key
GARMIN_TIME_ZONE=Europe/Berlin
```

Keep `.env` private. Garmin displays the key only once. Keys expire after the period selected when you create them (at most one year); replace the key in `.env` before it expires. The downloader obtains a short-lived access token automatically for each run.

## Usage

```bash
npm install
npm run download                 # all FIT activities plus the last seven health days
npm run download:fit             # FIT activities only
npm run download:wellness        # health only, last seven days
npm run download -- --last 10    # newest ten FIT activities plus health
npm run download:wellness -- --wellness-from 2026-01-01 --wellness-to 2026-10-19
```

`--wellness-days N` changes the rolling health window. `--no-wellness` skips health downloads. `--wellness-from` and optional `--wellness-to` select an inclusive historical range; already saved historical days are skipped, so a backfill can be resumed. Set `GARMIN_TIME_ZONE` to the zone used for Garmin calendar dates. `GARMIN_DATA_DIR` can point to another output root, for example for a test run.

Activities are extracted from Garmin's original ZIP files into `data/fit/`. Existing FIT files are skipped. Daily health records go to `data/wellness/YYYY-MM-DD.json`. The last seven days are refreshed because late device syncs can change them. New records have `schemaVersion: 2` and contain the official daily summary, sleep, heart rate, HRV, and Pulse Ox responses. These provide the metrics used by Traverse's Health page. If a recent legacy health file is replaced, a one-time copy is saved as `YYYY-MM-DD.legacy.json` in the same directory. Older files remain usable in Traverse.

Each request has a 30-second deadline. Transient network errors, HTTP 429, and server errors are retried. A failed health request leaves the existing daily file intact. A failed job exits nonzero so the scheduler can report it.

## Docker

The supplied `docker-compose.yml` builds the image from this checkout and maps its `data` volume to Traverse's data directory. Adjust the host path to match your server, then run:

```bash
docker compose up -d --build
```

The downloader runs once and exits. Ofelia starts the stopped downloader container daily at 04:00. To run it manually:

```bash
docker compose run --rm garmin-download
docker compose run --rm garmin-download --last 20
docker compose run --rm garmin-download --wellness-only --wellness-from 2026-01-01 --wellness-to 2026-10-19
```

The Personal API documents original activity files, but no GPX or TCX export endpoints. Existing GPX and TCX files are unaffected; this downloader produces FIT only.

## Releasing

```bash
npm run release
```

This uses `np` to bump the version, create a tag, and push. A pushed `v*` tag makes the GitHub Action publish `ghcr.io/philippfromme/garmin-download` with the version and `latest` tags. Publishing does not update the server. The supplied Compose file builds locally; to deploy a GHCR image instead, change its `image` to the desired GHCR tag and remove `build`.
