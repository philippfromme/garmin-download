FROM node:24-alpine

WORKDIR /app

# install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts ./scripts

# run once and exit; scheduling is handled outside the container (host cron)
ENTRYPOINT ["node", "scripts/download.js"]
CMD ["--last", "5"]
