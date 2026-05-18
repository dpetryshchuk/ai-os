# TODO

## Infra

- [ ] DB backups: pg_dump cron + Hetzner Backups (see docs/POSTGRES.md)
- [ ] LiteLLM gateway — unified proxy for all LLM calls across apps
- [ ] Sentry error tracking
- [ ] Shared design system: packages/ui with Tailwind tokens + shadcn components

## Apps

- [ ] **Lookbook** (`look.dmytropetryshchuk.com`) — mobile-style app to photograph interesting design, products at Target, etc. Catalogue, organise, and browse for inspiration later. Spec separately after the talk.
- [ ] **Onekeyflow proposal generator** — Typeform/Typebot webhook → event → worker → AI-generated Pandadoc-style proposal. Self-host Typebot for the form. Spec after AI OS core is built.
- [ ] Agent memory — wire persistent conversation memory into jobsearch agent

## Cleanup

- [ ] Delete local `apps/jobsearch-vps/` (stuck — needs VS Code restart)
- [x] Consolidate all apps into one Vite SPA + one FastAPI — implemented as `aios/` at port 4116

## aios first-deploy checklist

- [ ] Add DNS A record `aios.dmytropetryshchuk.com → 46.225.78.10`
- [ ] Run `docker compose exec aios alembic upgrade head` on VPS (creates `os_events` table)
- [ ] Push branch → verify GitHub Actions deploys `aios` service
- [ ] Smoke-test all pages and agent chat
