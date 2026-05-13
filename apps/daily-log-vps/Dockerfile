# Build context: repo root
FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/ui ./packages/ui

COPY apps/daily-log-vps/package.json apps/daily-log-vps/package-lock.json ./apps/daily-log-vps/
RUN cd apps/daily-log-vps && npm ci

COPY apps/daily-log-vps/frontend/package.json apps/daily-log-vps/frontend/package-lock.json ./apps/daily-log-vps/frontend/
RUN cd apps/daily-log-vps/frontend && npm ci

COPY apps/daily-log-vps ./apps/daily-log-vps

# Compile TypeScript backend → apps/daily-log-vps/dist/
RUN cd apps/daily-log-vps && npx tsc -p tsconfig.json

# Build Vite frontend and copy to ../public (build:frontend script does both)
RUN cd apps/daily-log-vps && npm run build:frontend

# ── Runner ──
FROM node:20-alpine AS runner
WORKDIR /app
COPY apps/daily-log-vps/package.json apps/daily-log-vps/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/daily-log-vps/dist ./dist
COPY --from=builder /app/apps/daily-log-vps/public ./public
ENV PORT=4113 NODE_ENV=production
EXPOSE 4113
CMD ["node", "dist/server.js"]
