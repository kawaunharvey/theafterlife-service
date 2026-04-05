# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Enable Yarn 4 via corepack
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (no db push — that requires a live DB)
RUN DATABASE_URI="mongodb://placeholder:27017/placeholder" yarn prisma:generate

# Compile TypeScript — call nest build directly to skip prisma:push
RUN npx nest build

# ── Stage 3: Production image ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

# Only copy what's needed to run
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json yarn.lock .yarnrc.yml prisma.config.ts ./

EXPOSE 3000

# Push schema to DB then start (prisma db push is idempotent for MongoDB)
CMD yarn prisma:push --skip-generate && yarn start
