# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/home/frontend/package.json ./apps/home/frontend/
RUN cd apps/home/frontend && npm install
COPY apps/home/frontend ./apps/home/frontend
RUN cd apps/home/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app
COPY apps/home/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/home/main.py apps/home/tasks.py ./
COPY --from=frontend-builder /app/apps/home/public ./public
ENV PORT=4114
EXPOSE 4114
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4114"]
