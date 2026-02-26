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
COPY packages/stock-price-producer/package.json packages/stock-price-producer/
COPY packages/b3-connector/package.json packages/b3-connector/
COPY packages/opportunity-detector/package.json packages/opportunity-detector/
COPY packages/opportunity-justifier/package.json packages/opportunity-justifier/
COPY packages/shadow-mirror/package.json packages/shadow-mirror/

RUN npm install --workspaces --include-workspace-root

COPY packages/core packages/core/
COPY packages/shared packages/shared/
COPY packages/web packages/web/
COPY packages/producer packages/producer/
COPY packages/consumer packages/consumer/
COPY packages/notifier packages/notifier/
COPY packages/api packages/api/
COPY packages/btc-price-producer packages/btc-price-producer/
COPY packages/stock-price-producer packages/stock-price-producer/
COPY packages/b3-connector packages/b3-connector/
COPY packages/opportunity-detector packages/opportunity-detector/
COPY packages/opportunity-justifier packages/opportunity-justifier/
COPY packages/shadow-mirror packages/shadow-mirror/

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json tsconfig.base.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
