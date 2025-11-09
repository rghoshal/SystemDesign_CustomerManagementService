## Quick context for AI coding agents

This repository is a small customer-management web app with two main components:

- Backend: Go (single binary) exposing JSON HTTP endpoints on /api (see `backend/main.go`).
  - Uses MySQL/MariaDB as the primary store and Memcached for read caching.
  - Docker image is built from `backend/Dockerfile.backend` and wired into `docker-compose.yml`.
- Frontend: Create React App (React + Tailwind) in `frontend/` that calls the backend at `http://localhost:8080/api`.

Key files to reference when reasoning about code changes

- `docker-compose.yml` — service wiring and environment variables (mariadb, memcached, backend).
- `backend/main.go` — all API handlers, DB access patterns, cache keys, and error responses.
- `backend/schema.sql` — canonical DB schema, constraints and sample queries.
- `backend/Dockerfile.backend` and `backend/go.mod` — build/runtime details for the Go service.
- `frontend/package.json` and `frontend/src/App.js` — frontend scripts, dev server and how UI calls the API.

Architecture notes and important patterns

- Service boundaries: frontend (React) is purely a client talking to backend HTTP JSON API under `/api/*`.
- Persistence: MariaDB stores customers; `schema.sql` creates `customers` with UNIQUE constraints on ID fields
  (aadhar, passport, driving_license, pan_card). The backend relies on SQL uniqueness to catch duplicates.
- Caching: backend uses memcached with keys of the form `customer:<idtype>:<value>` (see `cacheCustomer` in `main.go`).
- Error / response shapes: errors return JSON {"error": "..."}. Successful create returns {"message":..., "customer":...}.

Developer workflows (what actually works in this repo)

- Bring up full stack (recommended for integration/dev):
  - From repo root: `docker-compose up --build` (this builds the backend image using `backend/Dockerfile.backend` and starts mariadb + memcached).
  - The backend exposes port 8080; the frontend dev server runs separately on 3000 during local frontend development.
- Frontend dev: `cd frontend && npm install && npm start` (CRA dev server on 3000). The app expects backend at `http://localhost:8080/api`.
- Backend local dev: `cd backend && go run main.go` (requires Go 1.22 per `go.mod`).
- Build backend image manually: `docker build -f backend/Dockerfile.backend -t customer_backend:local backend/`.

Repository-specific gotchas and conventions

- Env var names and default mismatches: `docker-compose.yml` sets DB_NAME=customerDB but `schema.sql` creates `customer_db` and `main.go` defaults to `customer_db` — be careful when changing DB names.
- Ports: docker-compose maps host 3307 -> container 3306 for MariaDB; backend uses port 8080. Frontend dev is port 3000.
- Client-side rate limiting: the frontend enforces a client-local rate limit (localStorage key `customerCreationTimestamps`, max 10 per hour). This is NOT server-enforced.
- Duplicate handling: backend checks DB error strings for "Duplicate entry" to return 409 Conflict — keep tests aligned with this behaviour.

Useful examples for quick edits or tests

- Create customer (POST): POST /api/customers with JSON body {"name":"A","age":30,"address":"...","aadhar":"1234..."}
- Search customer (GET): GET /api/customers/search?type=aadhar&value=1234
- Memcached keys written on create: `customer:aadhar:<value>` etc. (see `cacheCustomer` in `backend/main.go`).

When changing or extending the backend

- Keep API shapes stable: update `frontend/src/App.js` if you change response fields or status codes.
- Respect DB uniqueness constraints: adding alternate IDs needs schema + code migration and careful testing against `schema.sql`.
- Add memcached writes/invalidations in the same request path where DB is updated to avoid stale reads.

Tests & verification (fast checks an agent can run)

- Smoke test the API after docker-compose up: `curl -sS http://localhost:8080/api/health` should return JSON status.
- Create and read a customer via curl to validate end-to-end behaviour (use payloads that match `schema.sql`).

If you need more context or to update guidance

- Ask for clarification about which workflows you'd like emphasized (CI, linting, or deployment).
- If you modify env names, update `docker-compose.yml`, `backend/main.go` defaults, and note mismatch in this file.

Please review and tell me if any part is unclear or if you'd like this made more prescriptive (e.g., add exact curl examples or automated test steps).
