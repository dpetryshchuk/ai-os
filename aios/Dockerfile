# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY aios/frontend/package.json ./aios/frontend/
RUN cd aios/frontend && npm install
COPY aios/frontend ./aios/frontend
RUN cd aios/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY aios/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY aios/main.py aios/config.py aios/db.py aios/models.py aios/events.py aios/agent.py aios/tasks.py ./
COPY aios/routers ./routers
COPY aios/workers ./workers
COPY aios/alembic ./alembic
COPY aios/alembic.ini .
COPY aios/alembic_daily ./alembic_daily
COPY aios/alembic_daily.ini .

COPY --from=frontend-builder /app/aios/public ./public

EXPOSE 4116
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4116"]
