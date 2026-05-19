# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY apps/proposals/frontend/package.json ./apps/proposals/frontend/
RUN cd apps/proposals/frontend && npm install
COPY apps/proposals/frontend ./apps/proposals/frontend
RUN cd apps/proposals/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app

COPY apps/proposals/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/proposals/main.py .

COPY --from=frontend-builder /app/apps/proposals/public ./public

EXPOSE 4117
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4117"]
