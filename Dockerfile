FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

FROM node:22-slim AS runtime
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
CMD ["node", "src/index.js"]
