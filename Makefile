.PHONY: help dev test lint format up down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start development environment
	docker-compose up --build

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

test: ## Run all tests
	cd backend && uv run pytest
	cd frontend && npm test

lint: ## Run linters
	cd backend && uv run ruff check .
	cd backend && uv run mypy app/
	cd frontend && npm run typecheck

format: ## Format code
	cd backend && uv run ruff format .
	cd frontend && npm run format

clean: ## Clean up
	docker-compose down -v
	rm -rf backend/.pytest_cache
	rm -rf backend/.mypy_cache
	rm -rf backend/__pycache__
	rm -rf frontend/node_modules/.vite

logs: ## View logs
	docker-compose logs -f

shell-backend: ## Open backend shell
	docker-compose exec backend bash

shell-frontend: ## Open frontend shell
	docker-compose exec frontend sh

db-migrate: ## Run database migrations
	docker-compose exec backend alembic upgrade head

db-rollback: ## Rollback last migration
	docker-compose exec backend alembic downgrade -1

redis-cli: ## Open Redis CLI
	docker-compose exec redis redis-cli

psql: ## Open PostgreSQL CLI
	docker-compose exec postgres psql -U postgres -d url_shortener
