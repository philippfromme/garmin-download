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
