@echo off
setlocal

REM ===========================================================
REM OmniArbitraje-AR - Arranque para Windows (Docker Desktop)
REM ===========================================================

echo.
echo ============================================
echo   OmniArbitraje-AR
echo ============================================
echo.

REM 1. Verificar Docker
where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker no esta instalado.
  echo.
  echo Instala Docker Desktop desde:
  echo   https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

REM 2. Verificar que Docker Desktop este corriendo
docker info >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker Desktop no esta corriendo.
  echo Abrilo desde el menu de inicio y volve a correr este script.
  pause
  exit /b 1
)

REM 3. Verificar .env
if not exist ".env" (
  echo [INFO] No existe .env. Copiando desde .env.example...
  copy .env.example .env >nul
  echo.
  echo [ACCION REQUERIDA] Edita el archivo .env con tu editor preferido y completa:
  echo   - TELEGRAM_BOT_TOKEN
  echo   - TELEGRAM_CHAT_ID
  echo   - API keys de los exchanges que quieras usar
  echo.
  echo Cuando termines, volve a ejecutar start.bat
  pause
  exit /b 0
)

REM 4. Crear runtime-overrides.json si no existe (montaje requiere archivo)
if not exist "runtime-overrides.json" (
  echo {"apiKeys":{},"addresses":{},"scalars":{}} > runtime-overrides.json
)

REM 5. Levantar todo
echo [INFO] Construyendo imagen y levantando servicios...
docker compose up -d --build

if errorlevel 1 (
  echo [ERROR] Fallo el arranque. Revisa los logs con: docker compose logs
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Sistema corriendo
echo ============================================
echo.
echo  - App:      controlado por Telegram bot
echo  - Redis:    localhost:16379
echo  - Postgres: localhost:15432
echo.
echo Comandos utiles:
echo   docker compose logs -f app   # ver logs en vivo
echo   docker compose run --rm app-tui  # abrir TUI interactiva
echo   docker compose down          # detener todo
echo   stop.bat                     # detener todo (atajo)
echo.
pause
