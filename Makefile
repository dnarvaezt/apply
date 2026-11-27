# Atajos para el día a día. `make` (o `make help`) lista los objetivos.
# La app corre en segundo plano con `make start`: PID en .run/dev.pid y salida en .run/dev.log.

SHELL := /bin/bash
.DEFAULT_GOAL := help

RUN_DIR := .run
PID_FILE := $(RUN_DIR)/dev.pid
LOG_FILE := $(RUN_DIR)/dev.log
DEV_CMD ?= npm run dev

# Artefactos regenerables; nunca incluye data/, .env, .cache (modelos) ni el volumen de Postgres.
CLEAN_PATHS := reports coverage test-results playwright-report blob-report .stryker-tmp \
	apps/web/dist node_modules/.tmp

running = [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null

.PHONY: help env install start stop restart down dev status logs db-up db-down db-logs \
	db-migrate db-reset build typecheck lint format test coverage e2e mutation mut-smoke check \
	clean clean-all

help: ## Lista los objetivos
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

env: ## Crea .env desde .env.example (no pisa uno existente)
	@if [ -f .env ]; then echo ".env ya existe: no se toca"; \
	else cp .env.example .env && echo ".env creado: edita POSTGRES_PASSWORD, DATABASE_URL y las claves"; fi

install: ## Instala dependencias
	npm install

# --- App --------------------------------------------------------------------------------------

start: db-up db-migrate ## Levanta Postgres, migra y arranca API + web en segundo plano
	@if $(running); then echo "Ya corre (PID $$(cat $(PID_FILE))). Usa 'make restart'"; exit 0; fi; \
	mkdir -p $(RUN_DIR); \
	setsid nohup $(DEV_CMD) > $(LOG_FILE) 2>&1 < /dev/null & echo $$! > $(PID_FILE); \
	sleep 1; \
	if $(running); then \
		echo "Arrancó (PID $$(cat $(PID_FILE))). API :3001, web http://localhost:5173 — 'make logs' para ver la salida"; \
	else echo "No arrancó; últimas líneas de $(LOG_FILE):"; tail -n 20 $(LOG_FILE); rm -f $(PID_FILE); exit 1; fi

stop: ## Detiene API + web (Postgres sigue arriba)
	@if $(running); then \
		pid=$$(cat $(PID_FILE)); kill -TERM -- -$$pid 2>/dev/null || kill -TERM $$pid; \
		for _ in $$(seq 1 20); do kill -0 $$pid 2>/dev/null || break; sleep 0.5; done; \
		if kill -0 $$pid 2>/dev/null; then kill -KILL -- -$$pid 2>/dev/null; fi; \
		echo "Detenido (PID $$pid)"; \
	else echo "No estaba corriendo"; fi; \
	rm -f $(PID_FILE)

restart: stop start ## Reinicia API + web

down: stop db-down ## Detiene la app y Postgres (los datos se conservan)

dev: db-up ## Arranca API + web en primer plano (Ctrl+C para salir)
	$(DEV_CMD)

status: ## Muestra si la app y Postgres están corriendo
	@if $(running); then echo "app:      corriendo (PID $$(cat $(PID_FILE)))"; else echo "app:      detenida"; fi
	@docker compose ps --format '{{.Service}}:       {{.State}} ({{.Status}})' 2>/dev/null | grep . || echo "db:       detenida"

logs: ## Sigue la salida de la app (Ctrl+C para salir)
	@if [ -f $(LOG_FILE) ]; then tail -n 100 -f $(LOG_FILE); else echo "Sin logs: corre 'make start'"; fi

# --- Postgres ---------------------------------------------------------------------------------

db-up: ## Levanta Postgres y espera a que esté sano
	@[ -f .env ] || { echo "Falta .env: corre 'make env' y edítalo"; exit 1; }
	npm run db:up

db-down: ## Detiene Postgres (el volumen conserva los datos)
	npm run db:down

db-logs: ## Sigue los logs de Postgres
	docker compose logs -f db

db-migrate: ## Aplica las migraciones
	npm run db:migrate

db-reset: ## BORRA la base de desarrollo (volumen pgdata) y la recrea vacía; pide confirmación
	@read -p "Esto borra todos los datos de la base 'apply'. Escribe 'borrar' para seguir: " ans; \
	[ "$$ans" = "borrar" ] || { echo "Cancelado"; exit 1; }
	$(MAKE) stop
	docker compose down -v
	$(MAKE) db-up db-migrate

# --- Calidad ----------------------------------------------------------------------------------

build: ## Typecheck y build del frontend
	npm run build

typecheck: ## tsc -b
	npm run typecheck

lint: ## Biome
	npm run lint

format: ## Biome con --write
	npm run format

test: ## Vitest (los de integración levantan Postgres efímero)
	npm test

coverage: ## Cobertura (falla bajo el umbral)
	npm run coverage

e2e: ## Playwright sobre una pila efímera
	npm run e2e

mutation: ## Stryker completo (no lo corras junto a otro Stryker, e2e o build)
	@if pgrep -f "stryker run" >/dev/null; then echo "Ya hay un Stryker corriendo: espera a que termine"; exit 1; fi
	npm run mutation

mut-smoke: ## Canario de mutación
	npm run mut:smoke

check: lint typecheck test ## Lint + typecheck + tests

# --- Limpieza ---------------------------------------------------------------------------------

clean: ## Borra reportes, builds y temporales (no toca data/, .env, modelos ni la base)
	@if pgrep -f "stryker run|playwright test" >/dev/null; then echo "Hay Stryker o e2e corriendo: espera antes de limpiar"; exit 1; fi
	@if $(running); then echo "La app está corriendo: 'make stop' antes de limpiar"; exit 1; fi
	rm -rf $(CLEAN_PATHS) $(RUN_DIR)

clean-all: clean ## clean + node_modules (luego 'make install')
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
