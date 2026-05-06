#!/usr/bin/env bash
set -e

# ===========================================================
# OmniArbitraje-AR — Arranque para Linux/macOS
# ===========================================================

echo
echo "============================================"
echo "  OmniArbitraje-AR"
echo "============================================"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker no está instalado."
  echo "  Mac:    brew install --cask docker"
  echo "  Linux:  https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker daemon no está corriendo. Abrilo y volvé a correr."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "[INFO] No existe .env. Copiando desde .env.example..."
  cp .env.example .env
  echo
  echo "[ACCIÓN REQUERIDA] Editá .env y completá:"
  echo "  - TELEGRAM_BOT_TOKEN"
  echo "  - TELEGRAM_CHAT_ID"
  echo "  - API keys de los exchanges"
  echo
  echo "Cuando termines: ./start.sh"
  exit 0
fi

if [ ! -f "runtime-overrides.json" ]; then
  echo '{"apiKeys":{},"addresses":{},"scalars":{}}' > runtime-overrides.json
fi

echo "[INFO] Construyendo imagen y levantando servicios..."
docker compose up -d --build

echo
echo "============================================"
echo "  Sistema corriendo"
echo "============================================"
echo
echo "  - App:      controlado por Telegram bot"
echo "  - Redis:    localhost:16379"
echo "  - Postgres: localhost:15432"
echo
echo "Comandos:"
echo "  docker compose logs -f app   # ver logs en vivo"
echo "  docker compose run --rm app-tui  # abrir TUI"
echo "  ./stop.sh                    # detener todo"
echo
