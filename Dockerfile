FROM node:24-alpine

WORKDIR /app

# Farol has no runtime dependencies. Node 24 provides node:sqlite.
COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4400 \
    FAROL_DB_PATH=/data/farol.db \
    FAROL_STEP_DELAY_MS=150

RUN mkdir -p /data && chown -R node:node /data /app

USER node
VOLUME ["/data"]
EXPOSE 4400

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4400/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
