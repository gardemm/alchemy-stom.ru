# alhimiya-stom.ru — Project Guide

## Stack
- **Frontend:** HTML + Tailwind CDN + vanilla JS (`public/`)
- **Backend:** Node.js 20 + Express (`server.js`)
- **Deployment:** Docker + Traefik (Let's Encrypt), GitHub Actions CI/CD

## Local dev
```bash
npm install
npm run dev   # node --watch server.js → http://localhost:3000
```

## Production deploy
Push to `master` → GitHub Actions → SSH → `git pull` + `docker compose up -d --build web`.

Required GitHub Secrets:
- `SSH_PRIVATE_KEY` — private key for `ubuntu@<server>`
- `SERVER_HOST` — IP or hostname of the server
- `DEPLOY_FOLDER` — absolute path to the repo on the server (e.g. `/srv/alhimiya-stom.ru`)

## ENV variables (production)
Set in `docker-compose.yml` environment section or via `.env` on the server:
| Variable | Required | Description |
|---|---|---|
| `PORT` | no | HTTP port inside container (default 3000) |
| `NOINDEX` | no | Set `"true"` to add `X-Robots-Tag: noindex` on all pages |
| `TELEGRAM_BOT_TOKEN` | no | Bot token for new-lead notifications |
| `TELEGRAM_CHAT_ID` | no | Chat ID for Telegram notifications |

## Data persistence
`leads.jsonl` is written to `/usr/src/app/data/leads.jsonl` inside the container, backed by the `leads_data` Docker named volume. The volume survives `docker compose up --build`.

To read leads on the server:
```bash
docker exec alhimiya_web cat data/leads.jsonl
```

## Key files
- `server.js` — Express app: static serving, rate limiting, platform detection, lead capture, Telegram notify
- `public/index.html` — landing page (Tailwind CDN, vanilla JS)
- `public/main.js` — frontend logic for the URL analysis form
- `NOTES.md` — conversion optimization roadmap (do not deploy)
