# Scout — production-shaped demo image.
# No npm dependencies are required at runtime; Node's built-in SQLite is used.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    SCOUT_MODE=demo \
    SCOUT_DB_PATH=/app/data/scout.db \
    SCOUT_STEP_DELAY_MS=190

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
