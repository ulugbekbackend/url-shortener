# Linkly - URL Shortener & Analytics

A production-ready Bitly-style URL shortener with comprehensive analytics, built with FastAPI, React, PostgreSQL, and Redis.

## Features

### Core
- **User Authentication**: JWT-based auth with rotating refresh tokens, registration, login, logout
- **URL Shortening**: Create short links with custom aliases, password protection, expiry dates, click limits
- **Analytics Dashboard**: Real-time metrics including total clicks, unique visitors, device breakdowns, countries, referrers
- **Public API**: API keys for programmatic link management and analytics access
- **Rate Limiting**: Per IP/user/API key with sliding window algorithm

### Advanced
- QR code generation with customization
- Bulk CSV import/export
- Tagging system for organizing links
- Geolocation tracking (GeoLite2)
- Bot traffic filtering
- UTM parameter builder
- Custom aliases with validation
- Link expiration and click limits
- Password-protected links

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                       │
│  React 19 + TypeScript + Tailwind CSS + TanStack Query      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                     Backend (FastAPI)                         │
│  FastAPI + SQLAlchemy + Pydantic + JWT Auth                 │
└──────┬─────────────────────────────────┬────────────────────┘
       │                                 │
┌──────▼──────┐                  ┌───────▼───────┐
│ PostgreSQL  │                  │    Redis      │
│  (Data)     │                  │  (Cache/Queue)│
└─────────────┘                  └───────────────┘
```

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Backend Framework | FastAPI | Latest Stable |
| Language | Python | 3.12+ |
| Database | PostgreSQL | 16+ |
| Cache | Redis | 7+ |
| ORM | SQLAlchemy | 2.x Async |
| Frontend | React | 18.x |
| Frontend Language | TypeScript | Latest Stable |
| Styling | Tailwind CSS | 3.x |
| State Management | Zustand | Latest |
| Queries | TanStack Query | 5.x |
| Runtime | Node.js | 20.x LTS |
| Package Manager | uv (Python) | Latest |
| Package Manager | npm (JS) | Latest |

## Environment Variables

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost/dbname

# Redis
REDIS_URL=redis://localhost:6379

# JWT
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Security
PASSWORD_SALT=your-salt-here

# GeoIP
GEOLITE2_PATH=/path/to/GeoLite2-City.mmdb

# External APIs
BLOCKED_DOMAINS=example.com,test.com

# Rate Limiting
RATE_LIMIT_ANONYMOUS=100
RATE_LIMIT_USER=1000
RATE_LIMIT_API_KEY=10000

# Application
FRONTEND_URL=http://localhost:3000
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```

### Frontend (.env)
```bash
# API Configuration
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

## How to Run

### Using Docker (Recommended)
```bash
# Copy example environment files
cp .env.example .env
# Update .env with your values

# Build and start all services
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Running Locally

#### Backend
```bash
cd backend
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e ".[dev]"
uvicorn app.main:app --reload
```

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
npm install
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Links
- `POST /api/v1/links` - Create new link (authenticated)
- `POST /api/v1/links/anonymous` - Create new link (anonymous)
- `GET /api/v1/links` - List user's links
- `GET /api/v1/links/{id}` - Get specific link
- `PATCH /api/v1/links/{id}` - Update link
- `DELETE /api/v1/links/{id}` - Delete link

### Analytics
- `GET /api/v1/stats/overview` - Account-wide overview
- `GET /api/v1/stats/links/{id}/summary` - Link summary
- `GET /api/v1/stats/links/{id}/timeseries` - Time series data
- `GET /api/v1/stats/links/{id}/breakdown` - Breakdown by dimension

### API Keys
- `GET /api/v1/api-keys` - List API keys
- `POST /api/v1/api-keys` - Create API key
- `DELETE /api/v1/api-keys/{id}` - Revoke API key

### Redirect
- `GET /{code}` - Redirect to original URL

## Testing

```bash
# Backend tests
cd backend
uv run pytest

# Frontend tests
cd frontend
npm test

# Linting
make lint

# Format code
make format
```

## Project Structure

```
linkly/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── redis.py
│   │   │   └── security.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── api/
│   │       └── v1/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/                 # React application
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── stores/
│   │   └── types/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## Design Decisions

1. **URL Shortening Strategy**: Used base62 encoding with 7-character codes generated from random values with collision retry up to 5 attempts. This provides ~56 billion possible combinations.

2. **Redirect Hot Path Caching**: Implemented Redis-based caching for link lookups with negative caching to prevent database hammering during enumeration attacks. Cache TTL set to 24 hours for positive results and 60 seconds for negative results.

3. **Security Measures**: 
   - Passwords hashed with Argon2
   - Refresh tokens stored hashed in database
   - Reused refresh token detection
   - URL validation to prevent loops and private IP access
   - Rate limiting per IP/user/API key

4. **Frontend Architecture**: 
   - Split routes with React.lazy for optimal loading
   - Zustand for client state management
   - TanStack Query for server state management
   - Comprehensive error handling and loading states
   - Responsive design supporting mobile to desktop

## License

MIT
