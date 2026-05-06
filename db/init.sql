-- OmniArbitraje-AR — Schema inicial
-- Ejecutado automáticamente al primer arranque del container postgres.

CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bid NUMERIC(20, 8) NOT NULL,
  ask NUMERIC(20, 8) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time
  ON price_snapshots (symbol, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_exchange_symbol_time
  ON price_snapshots (exchange, symbol, captured_at DESC);

CREATE TABLE IF NOT EXISTS opportunities (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'spatial',
  symbol TEXT NOT NULL,
  buy_exchange TEXT NOT NULL,
  sell_exchange TEXT NOT NULL,
  buy_price NUMERIC(20, 8) NOT NULL,
  sell_price NUMERIC(20, 8) NOT NULL,
  network TEXT,
  gross_profit_pct NUMERIC(8, 4) NOT NULL,
  net_profit_pct NUMERIC(8, 4) NOT NULL,
  legs JSONB,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración idempotente para DB ya creadas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='opportunities' AND column_name='kind') THEN
    ALTER TABLE opportunities ADD COLUMN kind TEXT NOT NULL DEFAULT 'spatial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='opportunities' AND column_name='legs') THEN
    ALTER TABLE opportunities ADD COLUMN legs JSONB;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_opps_detected_at
  ON opportunities (detected_at DESC);

CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT REFERENCES opportunities (id),
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  state TEXT NOT NULL,
  buy_order_id TEXT,
  sell_order_id TEXT,
  withdraw_tx_id TEXT,
  amount_usd NUMERIC(20, 8),
  realized_pnl_ars NUMERIC(20, 8),
  abort_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trades_open
  ON trades (state)
  WHERE state NOT IN ('done', 'aborted');

CREATE INDEX IF NOT EXISTS idx_trades_started_at
  ON trades (started_at DESC);
