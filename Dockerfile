FROM node:24-alpine

WORKDIR /app

# install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts ./scripts

# run once and exit; docker-compose.yml schedules restarts through Ofelia
ENTRYPOINT ["node", "scripts/download.js"]
CMD ["--last", "5"]
