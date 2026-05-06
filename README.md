# OmniArbitraje-AR

Bot de arbitraje cripto **automatizado** para el mercado argentino (USDT/ARS).
Detecta brechas de precio entre exchanges globales (Binance, Bybit, OKX, Weex)
y locales (Bitso, Fiwind, SatoshiTango, Belo), agregando además los datos
públicos de **CriptoYa** como fuente cruzada.

> ⚠️ **DRY_RUN está activado por defecto.** El sistema simula trades sin
> ejecutar órdenes reales hasta que vos lo desactives explícitamente. Leé la
> sección "Riesgos" antes de tocar `DRY_RUN=false`.

---

## Stack

- **Runtime**: Node.js 20+ (TypeScript, ESM)
- **Exchanges**: `ccxt` (Binance / Bybit / OKX) + REST nativo (Bitso) + CriptoYa-backed para los demás
- **Persistencia**: PostgreSQL 16 (snapshots, oportunidades, trades) + Redis 7 (cache + locks)
- **TUI**: Ink (React en terminal) con tabs para Dashboard, Config, Oportunidades, Logs
- **Notificaciones**: Telegram (Telegraf) bidireccional con comandos
- **Infra**: Docker Compose

---

## Arquitectura (alto nivel)

```
┌──────────────┐     ┌────────────┐     ┌──────────────┐
│   Adapters   │ ──▶ │  Scanner   │ ──▶ │ ArbitrageEng │
│ (8 exchanges)│     │ (cada 15s) │     │ + Calculator │
└──────────────┘     └─────┬──────┘     └──────┬───────┘
       │                   │                    │
       │              ┌────▼─────┐              ▼
       │              │  Redis   │      ┌──────────────┐
       │              │  (cache) │      │ Opp. Filter  │
       │              └──────────┘      └──────┬───────┘
       │                                       │
       ▼                                       ▼
┌────────────┐                          ┌─────────────┐
│ Postgres   │ ◀──── snapshots ────────│  Scanner    │
│ snapshots  │ ◀──── opps + trades ────│ (persiste)  │
└────────────┘                          └──────┬──────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                        ┌──────────┐    ┌─────────────┐  ┌────────────┐
                        │ Telegram │    │ ExecService │  │  TUI Ink   │
                        │ alertas  │    │ (DRY_RUN)   │  │  (live)    │
                        └──────────┘    └─────────────┘  └────────────┘
```

---

## Setup rápido

### 1. Clonar y configurar

```bash
git clone <este-repo> omniarbitraje-ar
cd omniarbitraje-ar
cp .env.example .env
```

Editá `.env` y completá lo que necesites. **Sin keys, el bot igual arranca**:
levanta tickers desde CriptoYa, simula trades, y el TUI te muestra precios en
vivo.

### 2. Levantar dependencias (Redis + Postgres) en Docker

```bash
docker compose up -d redis postgres
```

### 3. Instalar deps y correr en modo dev (con TUI)

```bash
npm install
npm run dev
```

El TUI muestra:
- **1·Dashboard**: tabla de precios en vivo + top 5 rutas
- **2·Config**: estado de keys mascaradas + `testConnection` por adapter
- **3·Oportunidades**: últimas 20 detectadas (consulta Postgres)
- **4·Logs**: tail de pino

Atajos: `1-4` cambian de tab, `p` pausa/reanuda scanner, `q` o `Ctrl+C` salen.

### 4. Modo headless (sin TUI)

Útil para correr en servidor:

```bash
HEADLESS=true npm run dev
# o en Docker:
docker compose up app
```

### 5. Build de producción

```bash
npm run build
node dist/index.js
```

---

## Cargar API Keys

Todas las keys se gestionan en el archivo `.env`. Si faltan, ese adapter
aparece como "keys: faltan" en la pantalla **Config** del TUI y queda como
read-only (lectura de tickers vía CriptoYa cuando aplica).

### Por exchange

| Exchange | Vars necesarias |
|----------|-----------------|
| Binance | `BINANCE_API_KEY`, `BINANCE_API_SECRET` |
| Bybit | `BYBIT_API_KEY`, `BYBIT_API_SECRET` |
| OKX | `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE` |
| Weex | `WEEX_API_KEY`, `WEEX_API_SECRET` |
| Bitso | `BITSO_API_KEY`, `BITSO_API_SECRET` |
| Fiwind | `FIWIND_API_KEY`, `FIWIND_API_SECRET` |
| SatoshiTango | `SATOSHITANGO_API_KEY`, `SATOSHITANGO_API_SECRET` |
| Belo | `BELO_API_KEY`, `BELO_API_SECRET` |

### Permisos recomendados en cada exchange

- **Spot trading**: SÍ
- **Withdraw**: SÍ (necesario para arbitraje on-chain)
- **Withdraw whitelist**: activar y agregar las direcciones de los demás exchanges
- **Futures / Margin**: NO (alcance del bot es spot only)

### Whitelist de direcciones de depósito (CRÍTICO)

Cargar en `.env`:

```
ADDR_BINANCE_USDT_TRC20=Tx....
ADDR_BYBIT_USDT_TRC20=Tx....
ADDR_OKX_USDT_TRC20=Tx....
ADDR_BITSO_USDT_TRC20=Tx....
...
```

**Sin estas direcciones, `RiskGuard` rechaza cualquier withdraw aunque
`DRY_RUN=false`.** Es la línea de defensa principal.

---

## Telegram Bot

1. Hablale a [@BotFather](https://t.me/BotFather), `/newbot`, copiá el token.
2. Conseguí tu chat id (mandale algo a [@userinfobot](https://t.me/userinfobot)).
3. Cargá en `.env`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=123456789
   TELEGRAM_ENABLE_COMMANDS=true
   ```
4. Reiniciá el bot. Mandale `/help`.

### Comandos

| Comando | Acción |
|---------|--------|
| `/status` | scanner state, dry_run, símbolos, adapters |
| `/pause` / `/resume` | pausar / reanudar scanner |
| `/threshold <n>` | cambiar `MIN_NET_PROFIT_PCT` en runtime |
| `/balance` | balances ARS+USDT por exchange |
| `/dryrun on` | activa DRY_RUN |
| `/dryrun off` | requiere `/confirm <code>` en 60s |
| `/opps` | últimas 10 oportunidades |
| `/help` | ayuda |

---

## Riesgos del modo automático

El combo **automático + on-chain + spatial** es el más riesgoso. El sistema
incluye estas salvaguardas obligatorias:

1. **DRY_RUN default true.** Para desactivarlo se requiere `.env` + comando
   Telegram + código numérico de 4 dígitos en 60s.
2. **Whitelist de addresses**: sin la address destino en `.env`, no hay withdraw.
3. **Lock distribuido (Redis)**: imposible doble-ejecución del mismo par.
4. **Stop-loss de spread**: si la tx se confirma pero el sell.bid cayó >5%
   versus el momento de detección, se aborta la rama `done` y se loguea.
5. **Cooldown por par**: 5 min default entre intentos de la misma ruta.
6. **ERC20 deshabilitado por default** (fees altos): activar con `ALLOW_ERC20=true`.
7. **Capabilities por adapter**: si `capabilities.trade` o `capabilities.withdraw`
   son false, ese exchange no participa en ejecución real.

> Recomendado: validar al menos 1 semana en `DRY_RUN=true` antes de cambiar.
> Auditar las oportunidades insertadas en `opportunities` y los trades en
> `trades` (con `dry_run=true`).

---

## Tests

```bash
npm test
```

Cubre:
- `PriceCalculator`: cálculo de net profit con fees fijas
- `ArbitrageEngine`: cartesian buy/sell + filtro mismo exchange
- `RiskGuard`: rechazos por whitelist faltante / sin trade

---

## Comandos útiles

```bash
# Ver últimos snapshots
docker exec -it omniarb-postgres psql -U omni -d omniarb -c \
  "SELECT exchange, symbol, bid, ask, captured_at FROM price_snapshots ORDER BY captured_at DESC LIMIT 20;"

# Ver oportunidades del día
docker exec -it omniarb-postgres psql -U omni -d omniarb -c \
  "SELECT detected_at, symbol, buy_exchange, sell_exchange, net_profit_pct FROM opportunities ORDER BY detected_at DESC LIMIT 20;"

# Vaciar redis
docker exec -it omniarb-redis redis-cli FLUSHALL
```

---

## Estructura del proyecto

```
src/
├── index.ts                   # Bootstrap
├── config/                    # Carga + valida .env (zod)
├── types/                     # IExchange, Ticker, Route, Trade, etc
├── adapters/                  # 8 exchanges (ccxt + REST nativo + CriptoYa-backed)
├── services/                  # Redis, Postgres, CriptoYa, Scanner, ExecutionService, TransferTracker
├── core/                      # ArbitrageEngine, PriceCalculator, OpportunityFilter, RiskGuard
├── notifier/                  # TelegramNotifier + TelegramCommands
├── tui/                       # App.tsx + screens (Dashboard, Config, Opportunities, Logs)
└── utils/                     # logger, math
```

---

## Roadmap (fuera de MVP)

- WebSocket streaming
- Estrategias triangular y MEP/CCL
- Hedging sintético con futuros
- UI web
- Multi-usuario
- Auto-rebalanceo

---

## Licencia

MIT (uso personal). El autor no se responsabiliza por pérdidas asociadas al
uso de este software.
