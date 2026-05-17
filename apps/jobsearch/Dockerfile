# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/jobsearch/frontend/package.json apps/jobsearch/frontend/package-lock.json ./apps/jobsearch/frontend/
RUN cd apps/jobsearch/frontend && npm ci
COPY apps/jobsearch/frontend ./apps/jobsearch/frontend
RUN cd apps/jobsearch/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app
COPY apps/jobsearch/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/jobsearch/main.py apps/jobsearch/agent.py apps/jobsearch/db.py ./
COPY --from=frontend-builder /app/apps/jobsearch/public ./public
ENV PORT=4111
EXPOSE 4111
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4111"]
