FROM node:22.22.3-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm audit --omit=dev --audit-level=high
COPY src ./src

FROM node:22.22.3-slim AS runtime
ENV NODE_ENV=production \
    BIND_ADDRESS=0.0.0.0 \
    PORT=3000 \
    SHORT_DOMAIN=link.desolic.com \
    DEFAULT_REDIRECT=https://desolic.com/ \
    DATABASE_PATH=/data/db.sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json ./
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
