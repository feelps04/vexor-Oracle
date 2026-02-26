FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
COPY packages/producer/package.json packages/producer/
COPY packages/consumer/package.json packages/consumer/
COPY packages/notifier/package.json packages/notifier/
COPY packages/api/package.json packages/api/
COPY packages/btc-price-producer/package.json packages/btc-price-producer/
COPY packages/opportunity-detector/package.json packages/opportunity-detector/
COPY packages/opportunity-justifier/package.json packages/opportunity-justifier/
COPY packages/shadow-mirror/package.json packages/shadow-mirror/
COPY packages/b3-connector/package.json packages/b3-connector/

RUN npm install --workspaces --include-workspace-root

COPY packages/core packages/core/
COPY packages/shared packages/shared/
COPY packages/web packages/web/
COPY packages/producer packages/producer/
COPY packages/consumer packages/consumer/
COPY packages/notifier packages/notifier/
COPY packages/api packages/api/
COPY packages/btc-price-producer packages/btc-price-producer/
COPY packages/opportunity-detector packages/opportunity-detector/
COPY packages/opportunity-justifier packages/opportunity-justifier/
COPY packages/shadow-mirror packages/shadow-mirror/
COPY packages/b3-connector packages/b3-connector/

RUN npm run build -w @transaction-auth-engine/shared && npm run build -w @transaction-auth-engine/b3-connector

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json tsconfig.base.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages

CMD ["node", "packages/b3-connector/dist/main.js"]
