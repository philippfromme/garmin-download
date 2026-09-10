# Matches the "playwright" version in package.json.
# Bundles all browser OS dependencies so nothing needs installing at runtime.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

# install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# install Google Chrome so the container uses the same channel as local runs,
# keeping the Garmin session fingerprint consistent with the seeded profile
RUN npx playwright install chrome

COPY scripts ./scripts

# run once and exit; scheduling is handled outside the container (host cron)
ENTRYPOINT ["node", "scripts/download.js"]
CMD ["--formats", "fit", "--last", "5"]
