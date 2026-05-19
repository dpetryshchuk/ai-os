# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY onekeyflow/frontend/package.json ./onekeyflow/frontend/
RUN cd onekeyflow/frontend && npm install
COPY onekeyflow/frontend ./onekeyflow/frontend
RUN cd onekeyflow/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app

COPY onekeyflow/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY onekeyflow/*.py .
COPY onekeyflow/routers ./routers
COPY onekeyflow/prompts ./prompts

COPY --from=frontend-builder /app/onekeyflow/public ./public

EXPOSE 4117
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4117"]
