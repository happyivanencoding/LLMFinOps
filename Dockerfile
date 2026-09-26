ARG NODE_IMAGE=node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build && npm prune --omit=dev --no-audit --no-fund
FROM ${NODE_IMAGE}
WORKDIR /app
ARG REVISION=unknown
ENV NODE_ENV=production HOST=0.0.0.0 PORT=43911 FINOPS_DATA=/data FINOPS_SECRETS_DIR=/run/secrets FINOPS_REVISION=${REVISION}
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/sdk ./sdk
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 43911
CMD ["node","server/index.mjs"]
