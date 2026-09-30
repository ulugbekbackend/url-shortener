# Linkly - URL Shortener & Analytics

A Bitly-style URL shortener with click analytics, built with FastAPI, React, PostgreSQL and Redis.

## Features

### Core
- **User Authentication**: JWT access tokens with rotating refresh tokens (httpOnly cookie), reuse detection, profile, password change and account deletion
- **URL Shortening**: Short links with custom aliases, password protection, expiry dates and click limits
- **Analytics Dashboard**: Clicks over time, unique visitors, devices, operating systems, browsers, referrers, countries
- **Public API**: API keys for programmatic link management and analytics access
- **Rate Limiting**: Sliding window per IP, user and API key, plus brute-force guards on login and link passwords

### Advanced
- QR codes (PNG/SVG) with custom colors and size
- Bulk CSV import (up to 500 rows) and CSV export
- Tags for organizing links
- Geolocation (GeoLite2, optional)
- Bot traffic filtering
- UTM tracking
- Anonymous links that expire after 7 days
- URL safety checks (no private/local addresses, no redirect loops, blocklist)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│   React 19 + TypeScript + Tailwind CSS + TanStack Query     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (/api, proxied by Vite in dev)
┌────────────────────────▼────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│        FastAPI + SQLAlchemy (async) + Pydantic + JWT         │
└──────┬──────────────────────────────────┬───────────────────┘
       │                                  │ link cache, rate limits,
┌──────▼──────┐                   ┌───────▼───────┐  click stream
│ PostgreSQL  │◄──────────────────┤     Redis     │
│   (data)    │   click worker    │               │
└─────────────┘  (batch inserts)  └───────────────┘
```

Redirects answer from the Redis cache and only append the click to a Redis stream; the click
worker enriches clicks (device, browser, bot, referrer, UTM, geo) and writes them in batches.

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Language | Python | 3.12 |
| Backend Framework | FastAPI | 0.141 |
| ORM / Migrations | SQLAlchemy (async) / Alembic | 2.1 / 1.20 |
| Database | PostgreSQL | 16 |
| Cache / Queue | Redis | 7 |
| Frontend | React | 19 |
| Frontend Language | TypeScript | 6.0 |
| Build Tool | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Server State / Client State | TanStack Query / Zustand | 5 / 5 |
| Charts | Recharts | 3 |
| Runtime | Node.js | 24 LTS |

Exact versions are pinned in `backend/pyproject.toml` and `frontend/package.json`.

## Environment Variables

### Backend (`backend/.env`, copy from `backend/.env.example`)
```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:5433/url_shortener
REDIS_URL=redis://127.0.0.1:6379/0

# At least 32 bytes: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=false                # true in production (https)

BASE_URL=http://localhost:8000     # public base of short links
BACKEND_CORS_ORIGINS=["http://localhost:3000"]

RATE_LIMIT_ANONYMOUS=100           # requests per hour
RATE_LIMIT_USER=1000
RATE_LIMIT_API_KEY=10000
RATE_LIMIT_LOGIN=10                # attempts per IP per 15 minutes
RATE_LIMIT_UNLOCK=10

ANONYMOUS_LINK_TTL_DAYS=7
BLOCKED_DOMAINS=                   # comma-separated
GEOLITE2_PATH=./data/GeoLite2-City.mmdb   # optional
```
`backend/.env.example` lists every setting with comments.

### Frontend (`frontend/.env`, optional)
```bash
# API origin; leave empty in development — the Vite dev server proxies /api to the backend
VITE_API_URL=
# Public base URL of short links (must match the backend BASE_URL)
VITE_SHORT_BASE_URL=http://localhost:8000
# Where the dev-server proxy forwards /api (never exposed to the browser)
API_PROXY_TARGET=http://localhost:8000
```

## How to Run

### Using Docker (Recommended)
```bash
# Backend settings and secrets; set SECRET_KEY, e.g.
#   python -c "import secrets; print(secrets.token_hex(32))"
cp backend/.env.example backend/.env

# Build and start PostgreSQL, Redis, backend, click worker and frontend
docker compose up --build

# Frontend:    http://localhost:3000
# Backend API: http://localhost:8000  (docs at /docs)
```
The backend applies database migrations on start; the worker waits until the backend is
healthy. PostgreSQL is published on port 5433 so it doesn't clash with a local install.

### Behind a reverse proxy
Rate limiting and click analytics use the client IP. Behind nginx or a load balancer, let
uvicorn trust the proxy's `X-Forwarded-For` header by setting `FORWARDED_ALLOW_IPS` to the
proxy's address (default `127.0.0.1`). Also serve over https and keep `COOKIE_SECURE=true`.

### Running Locally
PostgreSQL and Redis still come from Docker: `docker compose up -d postgres redis`.

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env            # then set SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload
```
Or simply `make setup` from the repository root.

#### Click worker
Redirects only queue click events in a Redis stream; the worker enriches them and writes
them to PostgreSQL. Analytics stay empty unless it is running.
```bash
cd backend
python -m app.workers.click_worker
```
Several workers can run at once (they share a Redis consumer group). For country/city data,
download the free [GeoLite2 City](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data)
database and set `GEOLITE2_PATH`; without it geolocation is simply skipped.

#### Frontend
```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000, /api is proxied to the backend
```
The access token lives in memory only; after a reload the session is restored from the
httpOnly refresh cookie. Set `COOKIE_SECURE=false` in `backend/.env` when serving over plain http.

## API Endpoints

Interactive docs: `http://localhost:8000/docs`. Link, stats and tag endpoints accept either a
`Bearer` token or an `X-API-Key` header; account and API-key management need a signed-in user.
Errors always look like `{"error": {"code": "...", "message": "..."}}`.

### Authentication
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/login` - Sign in (sets the refresh cookie)
- `POST /api/v1/auth/refresh` - New access token from the refresh cookie (rotates it)
- `POST /api/v1/auth/logout` - Sign out
- `GET /api/v1/auth/me` - Current user
- `PATCH /api/v1/auth/me` - Update name/email
- `POST /api/v1/auth/change-password` - Change password (signs out other sessions)
- `DELETE /api/v1/auth/me` - Delete the account and all its data

### Links
- `POST /api/v1/links` - Create a link
- `POST /api/v1/links/anonymous` - Create an anonymous link (expires after 7 days)
- `GET /api/v1/links` - List links (`search`, `tag`, `status`, `sort`, `page`, `page_size`)
- `GET /api/v1/links/{id}` - Get a link
- `PATCH /api/v1/links/{id}` - Update a link (only sent fields change; `null` clears)
- `DELETE /api/v1/links/{id}` - Delete a link
- `GET /api/v1/links/{id}/qr` - QR code (`format=png|svg`, `scale`, `dark`, `light`)
- `POST /api/v1/links/bulk` - Import links from CSV (`url,title,tags,custom_code`)
- `GET /api/v1/links/export` - Export links as CSV
- `GET /api/v1/tags` - Tags with link counts

### Analytics
- `GET /api/v1/stats/overview` - Account totals
- `GET /api/v1/stats/timeseries` - Account clicks over time (`interval=hour|day|week`)
- `GET /api/v1/stats/breakdown` - Account breakdown by `dimension`
- `GET /api/v1/stats/links/{id}/summary` - Link totals
- `GET /api/v1/stats/links/{id}/timeseries` - Link clicks over time
- `GET /api/v1/stats/links/{id}/breakdown` - Link breakdown by `dimension`
  (`country`, `city`, `device`, `os`, `browser`, `referrer`, `utm_source`)

All stats accept `from_date`/`to_date`; timeseries and breakdowns exclude bots unless
`include_bots=true`.

### API Keys
- `GET /api/v1/api-keys` - List API keys
- `POST /api/v1/api-keys` - Create an API key (the full key is shown once)
- `DELETE /api/v1/api-keys/{id}` - Revoke an API key

### Redirect
- `GET /{code}` - Redirect to the original URL (a password form for protected links)
- `POST /{code}/unlock` - Submit the password of a protected link

## Testing

Backend tests run against the compose PostgreSQL and Redis, in a separate
`url_shortener_test` database and Redis DB 15; the schema is built from the migrations.

```bash
docker compose up -d postgres redis
make test-db        # once: create the test database
make test           # backend (pytest) and frontend (vitest)
make lint           # ruff, mypy, eslint, tsc, prettier
make format
```
`make help` lists all targets.

## Project Structure

```
url-shortener/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py
│   │   ├── api/              # redirect + /api/v1 routers
│   │   ├── core/             # config, database, redis, security, errors, rate limiting
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/         # links, auth, bulk CSV, URL validation, click enrichment
│   │   └── workers/          # click worker
│   ├── alembic/              # migrations
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/                 # React application
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   ├── components/
│   │   ├── lib/              # API client, config, helpers
│   │   ├── stores/
│   │   ├── test/
│   │   └── types/
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## Design Decisions

1. **URL Shortening Strategy**: 7-character base62 codes from a CSPRNG with collision retry (up to 5 attempts), ~3.5 trillion combinations. Custom aliases are checked for uniqueness and reserved words.

2. **Redirect Hot Path**: Link lookups are cached in Redis (24 h), with negative caching (60 s) against enumeration. The cache is invalidated whenever a link changes. The click counter lives in Redis too, so click limits are enforced atomically without a database write per redirect.

3. **Click Pipeline**: Redirects append to a Redis stream; a consumer-group worker stores clicks in batches. Delivery is at-least-once and a unique stream id makes redelivery a no-op; events left by a crashed worker are claimed by another.

4. **Security Measures**:
   - Passwords hashed with Argon2
   - Refresh tokens stored hashed, rotated on every use; reuse revokes all sessions
   - Access token kept in memory only, refresh token in an httpOnly cookie scoped to `/api/v1/auth`
   - URL validation against private/local addresses and redirect loops
   - Rate limiting per IP/user/API key and brute-force limits on login and link passwords
   - CSV export escapes spreadsheet formulas

5. **Frontend Architecture**:
   - Routes split with React.lazy
   - Zustand for client state, TanStack Query for server state
   - One API client handling tokens, refresh and error shapes

## License

MIT
