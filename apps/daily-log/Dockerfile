# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/daily-log/frontend/package.json apps/daily-log/frontend/package-lock.json ./apps/daily-log/frontend/
RUN cd apps/daily-log/frontend && npm ci
COPY apps/daily-log/frontend ./apps/daily-log/frontend
RUN cd apps/daily-log/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app
COPY apps/daily-log/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/daily-log/main.py apps/daily-log/db.py ./
COPY --from=frontend-builder /app/apps/daily-log/public ./public
ENV PORT=4113
EXPOSE 4113
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4113"]
