# Build context: repo root
FROM node:22-alpine AS builder
WORKDIR /app

COPY packages/ui ./packages/ui

# Backend deps
COPY apps/jobsearch/package.json apps/jobsearch/package-lock.json ./apps/jobsearch/
RUN cd apps/jobsearch-vps && npm ci

# Frontend deps
COPY apps/jobsearch/frontend/package.json apps/jobsearch/frontend/package-lock.json ./apps/jobsearch/frontend/
RUN cd apps/jobsearch/frontend && npm install --legacy-peer-deps

COPY apps/jobsearch-vps ./apps/jobsearch-vps

# Build React frontend → apps/jobsearch/public/ (vite outDir is ../public)
RUN cd apps/jobsearch/frontend && npm run build

# Bundle Mastra server → apps/jobsearch/.mastra/output/index.mjs
RUN cd apps/jobsearch-vps && npx mastra build

# ── Runner ──
FROM node:22-alpine AS runner
WORKDIR /app
COPY apps/jobsearch/package.json apps/jobsearch/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/jobsearch/.mastra/output ./.mastra/output
COPY --from=builder /app/apps/jobsearch/public ./public
ENV PORT=4111 NODE_ENV=production UPLOADS_DIR=/app/uploads
EXPOSE 4111
CMD ["node", ".mastra/output/index.mjs"]
