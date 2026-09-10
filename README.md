# garmin-download

Downloads all activities from Garmin Connect in GPX, TCX, and FIT formats using Playwright for browser automation.

## Usage

Set credentials via `.env` or enter them when prompted:

```
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=yourpassword
```

```bash
npm run download          # headless
npm run download:headed   # with browser visible
npm run download:fit      # FIT format only
npm run download:last 10  # only the N most recent activities
```

Use `--last <n>` to limit the download to the n most recent activities:

```bash
npm run download -- --last 10
npm run download:fit -- --last 5
```

Files are saved to `data/gpx/`, `data/tcx/`, and `data/fit/`. Already-downloaded activities are skipped.

## Running on a server with Docker

Garmin's login is protected against automation (bot checks, CAPTCHA, MFA), so
the container never logs in itself. Instead you log in **once** to create a
saved session in `.browser-data/`, then the container reuses it on every run.

### 1. Seed the session (once, on a machine with a display)

```bash
npm install
npm run download:fit -- --last 5 -- --headed
```

This creates `.browser-data/` containing the authenticated Garmin session.

### 2. Copy the project to the server

Copy the project folder — including `.browser-data/` and a filled-in `.env` —
to the server, e.g. `/opt/garmin-download`.

### 3. Point the output at your Traverse data

The `data` volume in `docker-compose.yml` is mapped to the folder the Traverse
container reads from, so downloaded FIT files land where Traverse watches for
them and its index rebuilds automatically:

```yaml
volumes:
  - ./.browser-data:/app/.browser-data
  - /home/philippfromme/docker/traverse/data:/app/data
```

### 4. Build and start

```bash
docker compose up -d --build
```

This builds the image, runs an initial download, and starts the Ofelia
scheduler. `garmin-download` runs once and stops; Ofelia restarts that same
stopped container on schedule (see the `ofelia.job-run` labels in
`docker-compose.yml`, default 04:00 daily). Because Ofelia just starts the
existing container, all credentials and volumes stay in the service definition —
nothing is duplicated in the scheduler.

To trigger a run manually or change the arguments:

```bash
docker compose run --rm garmin-download            # default: --formats fit --last 5
docker compose run --rm garmin-download --last 20  # override arguments
```

Check the scheduler and the last run:

```bash
docker logs ofelia            # scheduled-run history
docker logs garmin-download   # output of the most recent download
```

The saved session lasts a long time but will eventually expire. When it does,
the run fails instead of hanging — re-seed by repeating step 1 and copying the
refreshed `.browser-data/` back to the server. Ofelia can email or Slack you on
failures (see its logging drivers) so you know when to re-seed.

## Releasing

```
npm run release
```

Uses [np](https://github.com/sindresorhus/np) to bump the version, create a git
tag, and push. The GitHub Action then builds and publishes the Docker image to
GHCR.
