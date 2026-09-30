.PHONY: help setup install dev up down logs test test-backend test-frontend test-db lint format clean \
	shell-backend shell-frontend db-migrate db-rollback redis-cli psql

# Backend virtualenv interpreter (Windows venvs use Scripts/, others bin/)
PY := $(if $(wildcard backend/venv/Scripts/python.exe),venv/Scripts/python,venv/bin/python)
COMPOSE := docker compose

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Create the backend venv, then install everything
	cd backend && python -m venv venv
	@# Re-run make so PY is resolved again now that the venv exists
	$(MAKE) install

install: ## Install backend (into backend/venv) and frontend dependencies
	cd backend && $(PY) -m pip install -e ".[dev]"
	cd frontend && npm ci

dev: ## Build and start everything in Docker (foreground)
	$(COMPOSE) up --build

up: ## Start everything in Docker (background)
	$(COMPOSE) up -d

down: ## Stop all containers
	$(COMPOSE) down

logs: ## Follow container logs
	$(COMPOSE) logs -f

test: test-backend test-frontend ## Run all tests

test-db: ## Create the backend test database (needs the postgres container)
	$(COMPOSE) exec -T postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'url_shortener_test'" | grep -q 1 \
		|| $(COMPOSE) exec -T postgres psql -U postgres -c "CREATE DATABASE url_shortener_test"

test-backend: ## Backend tests against the compose PostgreSQL/Redis
	cd backend && $(PY) -m pytest

test-frontend: ## Frontend tests
	cd frontend && npm test

lint: ## Lint and type-check backend and frontend
	cd backend && $(PY) -m ruff check . && $(PY) -m ruff format --check . && $(PY) -m mypy app/
	cd frontend && npm run lint && npm run typecheck && npm run format:check

format: ## Format backend and frontend code
	cd backend && $(PY) -m ruff format . && $(PY) -m ruff check --fix .
	cd frontend && npm run format

clean: ## Stop containers, drop volumes and caches
	$(COMPOSE) down -v
	rm -rf backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache
	rm -rf frontend/dist frontend/node_modules/.vite

shell-backend: ## Shell in the backend container
	$(COMPOSE) exec backend bash

shell-frontend: ## Shell in the frontend container
	$(COMPOSE) exec frontend sh

db-migrate: ## Apply database migrations
	$(COMPOSE) exec backend alembic upgrade head

db-rollback: ## Roll back the last migration
	$(COMPOSE) exec backend alembic downgrade -1

redis-cli: ## Open the Redis CLI
	$(COMPOSE) exec redis redis-cli

psql: ## Open the PostgreSQL CLI
	$(COMPOSE) exec postgres psql -U postgres -d url_shortener
