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
    && rm -rf /var/lib/apt/lists/* \
    && git config --global --add safe.directory '*'

COPY aios/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    LANGFUSE_PY=/usr/local/lib/python3.12/site-packages/litellm/integrations/langfuse/langfuse.py && \
    sed -i 's/langfuse\.version\.__version__/langfuse._version.__version__/g' $LANGFUSE_PY && \
    sed -i '/parameters\["sdk_integration"\] = "litellm"/d' $LANGFUSE_PY && \
    sed -i '/if Version(self\.langfuse_sdk_version) >= Version("2\.6\.0"):/d' $LANGFUSE_PY

COPY aios/main.py aios/config.py aios/db.py aios/schemas.py aios/models.py aios/events.py aios/agent.py aios/tasks.py ./
COPY aios/prompts ./prompts
COPY aios/routers ./routers
COPY aios/services ./services
COPY aios/workers ./workers
COPY aios/migrations ./migrations

COPY --from=frontend-builder /app/aios/public ./public

EXPOSE 4116
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4116"]
