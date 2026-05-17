# Freewrite Web App Design

> **For agentic workers:** Use superpowers:writing-plans to turn this into an implementation plan.

**Goal:** Add a distraction-free freewriting section to the writing-app at `/freewrite`, with timer, backspace-disable, video journaling with speech-to-text, sidebar history, and AI chat integration.

**Architecture:** New `freewrite.py` router + `FREEWRITE_DIR` volume added to the existing `writing-app` service. New `/freewrite` React route in the writing-app frontend. No new Docker service or port.

**Tech Stack:** FastAPI (Python 3.12), React + Vite + Tailwind, `python-multipart` + `aiofiles` for file uploads, MediaRecorder API + Web Speech API (Chrome) for video/transcription, `@fontsource/lato` for typography.

---

## Architecture

Freewrite is a section of the writing-app, not a standalone service.

```
Browser → Caddy (write.dmytropetryshchuk.com)
              → reverse_proxy localhost:4112
                    → FastAPI (writing-app)
                          ├── /api/essays/**     ← existing essay routes
                          ├── /api/freewrite/**  ← new freewrite routes
                          └── serves React SPA (/ and /freewrite)
```

### Backend changes (`apps/writing-app/`)

| File | Change |
|---|---|
| `freewrite.py` | New file — all freewrite API routes as an `APIRouter` |
| `main.py` | `app.include_router(freewrite_router, prefix="/api/freewrite")` |
| `requirements.txt` | Add `aiofiles`, `python-multipart` (if not already present) |

### Infrastructure changes

`docker-compose.yml` — add to `writing-app` service:
```yaml
environment:
  FREEWRITE_DIR: /freewrite
volumes:
  - ${FREEWRITE_DIR:-/home/dima/freewrite}:/freewrite
```

---

## Data Model

Pure filesystem, no database. All files live under `FREEWRITE_DIR`.

```
$FREEWRITE_DIR/
  {uuid}-{YYYY-MM-DD-HH-mm-ss}.md          ← text entry (plain UTF-8, no frontmatter)
  {uuid}-{YYYY-MM-DD-HH-mm-ss}.md          ← video entry (contains literal "Video Entry")
  videos/
    {uuid}-{YYYY-MM-DD-HH-mm-ss}/
      {uuid}-{YYYY-MM-DD-HH-mm-ss}.webm    ← recorded video (MediaRecorder .webm)
      transcript.md                         ← speech transcript (optional, plain text)
```

**Entry ID** is `{uuid}-{YYYY-MM-DD-HH-mm-ss}` — extracted from the filename. UUID ensures uniqueness; timestamp enables chronological sorting.

**Text entry** — plain UTF-8 text, exactly what the user typed. No YAML frontmatter.

**Video entry** — the `.md` file contains only the string `"Video Entry"` as a marker. The actual content is the video + transcript in the `videos/` subdirectory.

---

## API

All routes under `/api/freewrite/`. `FREEWRITE_DIR` is read from env, injected as a FastAPI dependency.

| Method | Path | What |
|---|---|---|
| `GET` | `/entries` | List all entries, newest first. Returns `[{id, created_at, is_video, preview}]` |
| `POST` | `/entries` | Create new text entry. Returns `{id}` |
| `GET` | `/entries/{id}` | Get entry text content |
| `PUT` | `/entries/{id}` | Save entry text (auto-save on every keystroke) |
| `DELETE` | `/entries/{id}` | Delete entry file + video directory if present |
| `POST` | `/entries/{id}/video` | Upload `.webm` + optional transcript (multipart form) |
| `GET` | `/entries/{id}/video` | Stream `.webm` video file |
| `GET` | `/health` | `{"ok": true}` (reuses writing-app health route) |

**`GET /entries` response shape:**
```json
[
  {
    "id": "6910BBDE-75FC-415C-ABB9-C76644B037B2-2026-05-17-14-30-00",
    "created_at": "2026-05-17T14:30:00",
    "is_video": false,
    "preview": "First line of the entry text..."
  }
]
```

**`POST /entries/{id}/video` fields:**
- `video`: file field — `.webm` blob
- `transcript`: optional text field — finalized speech transcript

Path safety: `{id}` is validated against the pattern `[A-F0-9-]+-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}` (case-insensitive) before any filesystem operation. Rejects path traversal attempts.

---

## Frontend

New `/freewrite` route in the writing-app's React SPA. Entirely separate from the essay editor — no shared state or components beyond the router.

### File structure (`apps/writing-app/frontend/src/`)

```
pages/
  Freewrite.tsx          ← top-level page, orchestrates all state
components/freewrite/
  Editor.tsx             ← full-screen textarea
  BottomNav.tsx          ← fades out when timer running, reappears on hover
  Timer.tsx              ← MM:SS display, click/scroll/double-click controls
  Sidebar.tsx            ← entry history list
  EntryItem.tsx          ← single entry row in sidebar
  VideoRecorder.tsx      ← full-screen recording overlay
  VideoPlayer.tsx        ← playback for video entries
  ChatPopover.tsx        ← ChatGPT / Claude tab-opener
hooks/freewrite/
  useAutoSave.ts         ← debounced PUT on text change (500ms)
  useTimer.ts            ← countdown logic, scroll-to-adjust
  useSpeechRecognition.ts ← Web Speech API wrapper
  useEntries.ts          ← fetch/create/delete entries
```

### Editor behavior

- Full-screen `<textarea>`, max-width 650px, centered, no border/outline
- New entry starts with `\n\n` (two leading newlines)
- Placeholder text cycles through 8 options on each new entry: "Begin writing", "Pick a thought and go", "Start typing", "What's on your mind", "Just start", "Type your first thought", "Start with one sentence", "Just say it"
- Auto-save: `useAutoSave` debounces 500ms, calls `PUT /api/freewrite/entries/{id}` on every text change
- Font family cycles: Lato → Arial → System → Serif (button in bottom nav)
- Font size cycles: 16 → 18 → 20 → 22 → 24 → 26px
- Line height: 1.5× font size
- Dark/light theme toggle, stored in `localStorage` under key `freewrite_theme`

### Timer

- Default: 15 minutes (900 seconds)
- Displayed as `MM:SS`
- Click: toggle start/pause
- Double-click: reset to 15:00
- Scroll wheel over timer: ±5 minute increments, clamped 0–45 minutes
- When running: bottom nav bar fades to opacity 0 (CSS transition), reappears on hover or when timer ends
- When timer hits 0: auto-stops, nav fades back in

### Backspace disable

- Toggle button in bottom nav: "Backspace On" / "Backspace Off"
- When disabled: `keydown` event listener on `document` swallows `event.key === "Backspace"` and `event.key === "Delete"` by calling `event.preventDefault()`
- Listener added/removed via `useEffect` when toggle changes

### Bottom nav buttons (left to right)

1. **Sidebar toggle** — show/hide entry history
2. **Timer** — `MM:SS` display, click/double-click/scroll controls
3. **Backspace toggle** — "Backspace On" / "Backspace Off"
4. **Font** — cycles family on click
5. **Camera** — opens video recording overlay
6. **Chat** — opens popover with ChatGPT + Claude buttons
7. **Theme** — 🌙/☀️ dark/light toggle

### Chat popover

Opens above the Chat button. Two buttons: "ChatGPT" and "Claude". Each opens a new browser tab:

- ChatGPT: `https://chat.openai.com/?prompt={encodeURIComponent(chatgptPrompt + "\n\n" + entryText)}`
- Claude: `https://claude.ai/new?q={encodeURIComponent(claudePrompt + "\n\n" + entryText)}`

Guard: if entry text is fewer than 350 characters, show the message "Please free write for at minimum 5 minutes first. Then click this. Trust." and hide the AI buttons.

Prompts are copied verbatim from the original macOS app (`aiChatPrompt` and `claudePrompt` strings in `ContentView.swift`).

### Sidebar

Left panel, slides in/out. Lists entries newest-first fetched from `GET /api/freewrite/entries`.

- Text entry row: shows first line as preview + relative timestamp
- Video entry row: shows video icon + relative timestamp
- Active entry highlighted
- Click: loads entry into editor (saves current entry first)
- Delete button (shown on hover): calls `DELETE /api/freewrite/entries/{id}`

### Video recording overlay

Full-screen overlay rendered on top of everything.

**Flow:**
1. User clicks camera icon
2. Browser requests camera + microphone permissions
3. Live `<video>` preview renders (camera feed, muted)
4. "Start Recording" button — starts `MediaRecorder` (codec: `video/webm;codecs=vp9,opus`) + `SpeechRecognition`
5. Timer counts up from `0:00`
6. `SpeechRecognition` runs with `interimResults: true`, `continuous: true`. Interim results shown as live caption below preview. Final results appended to transcript with `\n\n` paragraph breaks on silence >1.2s.
7. "Stop Recording" button — stops `MediaRecorder`, finalizes transcript, assembles blobs into `Blob`
8. `POST /api/freewrite/entries/{id}/video` with `video` (Blob) + `transcript` (string)
9. Overlay closes, sidebar refreshes

**Web Speech API availability:** If `window.SpeechRecognition` is undefined (non-Chrome), recording proceeds without transcription. No error shown — transcript field simply omitted from the upload.

**Permissions error:** If camera/mic denied, overlay shows an error message with a link to browser settings.

### Video player

Rendered in place of the textarea when a video entry is selected from the sidebar.

- `<video>` element with controls, fills available width
- Transcript displayed below video (if present)
- "Back to writing" button returns to text editor view

---

## Tests

`apps/writing-app/tests/test_freewrite.py` — pytest + httpx `AsyncClient` with `ASGITransport`, `tmp_path` fixture for isolated filesystem.

Tests to cover:
- `GET /entries` returns empty list when dir is empty
- `POST /entries` creates `.md` file, returns valid id
- `PUT /entries/{id}` writes text to file
- `GET /entries/{id}` returns written text
- `DELETE /entries/{id}` removes file
- `POST /entries/{id}/video` saves `.webm` + `transcript.md`
- `GET /entries/{id}/video` streams file bytes
- Path traversal rejected on `{id}` with `..`
- `GET /entries` returns video entry with `is_video: true`

---

## Deployment

No new Docker service. Changes to `docker-compose.yml` writing-app service only:

```yaml
writing-app:
  environment:
    FREEWRITE_DIR: /freewrite
  volumes:
    - ${WRITING_DIR:-/tmp/writing}:/repo
    - ${SSH_DIR:-/tmp/ssh}:/root/.ssh:ro
    - ${FREEWRITE_DIR:-/home/dima/freewrite}:/freewrite
```

Add `FREEWRITE_DIR=/home/dima/freewrite` to `.env` on the VPS.

No Caddy changes — already reverse-proxies `write.dmytropetryshchuk.com` to port 4112.
