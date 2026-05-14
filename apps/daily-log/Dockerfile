# Build context: repo root
FROM node:22-alpine AS builder
WORKDIR /app

COPY packages/ui ./packages/ui

COPY apps/daily-log/package.json apps/daily-log/package-lock.json ./apps/daily-log/
RUN cd apps/daily-log && npm ci

COPY apps/daily-log/frontend/package.json apps/daily-log/frontend/package-lock.json ./apps/daily-log/frontend/
RUN cd apps/daily-log/frontend && npm ci

COPY apps/daily-log ./apps/daily-log

# Compile TypeScript backend → apps/daily-log/dist/
RUN cd apps/daily-log && npx tsc -p tsconfig.json

# Build Vite frontend and copy to ../public (build:frontend script does both)
RUN cd apps/daily-log && npm run build:frontend

# ── Runner ──
FROM node:22-alpine AS runner
WORKDIR /app
COPY apps/daily-log/package.json apps/daily-log/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/daily-log/dist ./dist
COPY --from=builder /app/apps/daily-log/public ./public
ENV PORT=4113 NODE_ENV=production
EXPOSE 4113
CMD ["node", "dist/server.js"]
