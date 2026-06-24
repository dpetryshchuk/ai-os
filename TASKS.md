# AIOS Overnight Tasks
> Last updated: 2026-06-24

## Completed ✅
- [x] Langfuse traces working (LiteLLM 1.89.3 + langfuse 4.x compat — patched in Dockerfile)
- [x] First-message "..." bug fixed (was Langfuse crash killing the stream)
- [x] pgvector RAG pipeline — embeddings table, Celery embed tasks, semantic search
- [x] Backfill ran — 209 documents embedded (3 notes, 206 job postings)

## In Progress 🔄
- [ ] Knowledge base tab — browse + edit /vault (core-aios-kb Obsidian vault)
- [ ] Finances tab — port personal-finances dashboard into AIOS
- [ ] Proposals form redesign — cleaner, more readable
- [ ] Home page: recent Fathom meetings (meetings saved to vault by webhook)
- [ ] Evermemos paradigm in Ima chats — end-of-session memory capture
- [ ] Embeddings tracked in Langfuse traces
- [ ] Architecture.html — full rewrite explaining every piece technically
- [ ] Infra cleanup + Terraform tutorial section
- [ ] Codebase cleanup pass

## Queue 📋
- [ ] events.py inline (16 lines, used in 2 places)
- [ ] Add `/api/finances/*` router serving ledger.csv + data.js
- [ ] Wire Ima semantic_search tool to also search vault files
- [ ] Home page: show events log (scrapes, embeds) not just health
- [ ] Fathom meetings → embed into vector search on save
- [ ] Real-time build on frontend change (Ima already wired for this)
