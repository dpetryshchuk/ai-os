# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/writing-app/frontend/package.json apps/writing-app/frontend/package-lock.json ./apps/writing-app/frontend/
RUN cd apps/writing-app/frontend && npm ci
COPY apps/writing-app/frontend ./apps/writing-app/frontend
RUN cd apps/writing-app/frontend && npm run build

FROM python:3.12-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/*
RUN git config --global --add safe.directory /repo
WORKDIR /app
COPY apps/writing-app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/writing-app/main.py .
COPY --from=frontend-builder /app/apps/writing-app/public ./public
ENV PORT=4112
EXPOSE 4112
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4112"]
