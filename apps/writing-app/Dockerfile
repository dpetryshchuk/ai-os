# Build context: repo root
FROM node:22-alpine AS builder
WORKDIR /app

# packages/ui is needed by the frontend's tailwind config and CSS imports
COPY packages/ui ./packages/ui

# Install backend deps (cache layer — re-runs only if package files change)
COPY apps/writing-app/package.json apps/writing-app/package-lock.json ./apps/writing-app/
RUN cd apps/writing-app && npm ci

# Install frontend deps
COPY apps/writing-app/frontend/package.json apps/writing-app/frontend/package-lock.json ./apps/writing-app/frontend/
RUN cd apps/writing-app/frontend && npm ci

# Copy all source and build
COPY apps/writing-app ./apps/writing-app

# Compile TypeScript backend → apps/writing-app/dist/
RUN cd apps/writing-app && npx tsc -p tsconfig.json

# Build Vite frontend → apps/writing-app/public/ (outDir is ../public in vite.config)
RUN cd apps/writing-app/frontend && npm run build

# ── Runner ──
FROM node:22-alpine AS runner
# git and openssh-client are needed at runtime for git pull / git push
RUN apk add --no-cache git openssh-client
# allow git operations on the /repo volume mount (owned by host user, not container root)
RUN git config --global --add safe.directory /repo
WORKDIR /app
COPY apps/writing-app/package.json apps/writing-app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/writing-app/dist ./dist
COPY --from=builder /app/apps/writing-app/public ./public
ENV PORT=4112 NODE_ENV=production
EXPOSE 4112
CMD ["node", "dist/server.js"]
