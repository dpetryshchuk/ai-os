# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

Personal website for Dmytro Petryshchuk with two main components:

### 1. Static Website (Root)
Hand-coded HTML/CSS site - "the bike to a car" philosophy emphasizing autonomy and creativity over frameworks.

- `index.html` - Main homepage with navigation
- `pages/` - Static pages (watercolors, agentic-development, ima_overview, portfolio)
- `sources/writings/` - Markdown content with dynamic template loader
- `styles.css` - Global styles (Georgia serif, aquamarine links, #FAFAFA background)

**Writings Template**: `sources/writings/template.html` loads markdown via query params (`?page=ima_design`) using marked.js CDN.

### 2. Ima Chatbot (Submodule: `ima/`)
AI coaching agent that helps users understand themselves through patient, curious questioning.

**Stack**:
- FastAPI backend (`ima/app/`)
- PostgreSQL with SQLAlchemy (JSONB for conversation storage)
- OpenRouter API with Llama 3.3 70B model
- Static frontend (`ima/static/`)

**Key Files**:
- `app/main.py` - API endpoints
- `app/config.py` - System prompts and env config
- `app/database.py` - Conversation persistence
- `app/models.py` - SQLAlchemy Conversation model

**API Endpoints**:
- `POST /chat` - Send message (session_id, message) → AI response
- `GET /history/{session_id}` - Retrieve conversation history
- `POST /parse-backstory` - Parse life story text into structured JSON (past/present/future events, themes, projects)

**Deployment**: Railway at ima.dmytropetryshchuk.com

## Commands

### Static Site
No build process - open HTML files directly or serve with any static server.

### Ima Development
```bash
cd ima/app
pip install -r ../requirements.txt
uvicorn main:app --reload
```

### Submodule Setup
```bash
git submodule update --init --recursive
```

## Environment Variables (Ima)
Required in `ima/.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENROUTER_API_KEY` - OpenRouter API key
