import pg from 'pg';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type {
  Opportunity,
  Ticker,
  Trade,
  TradeState,
} from '../types/index.js';

const { Pool } = pg;

export class PostgresService {
  private pool: pg.Pool;

  constructor() {
    const cfg = getConfig();
    this.pool = new Pool({
      connectionString: cfg.POSTGRES_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    this.pool.on('error', (err) => {
      logger.error({ err: err.message }, 'postgres pool error');
    });
  }

  /** Para queries específicas desde otros servicios (ej: Reporter) */
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async testConnection(): Promise<void> {
    const r = await this.pool.query('SELECT 1 AS ok');
    if (r.rows[0]?.ok !== 1) throw new Error('postgres no respondió');
    logger.info('postgres conectado');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async insertSnapshots(tickers: Ticker[]): Promise<void> {
    if (tickers.length === 0) return;
    const values: unknown[] = [];
    const placeholders = tickers
      .map((t, i) => {
        const off = i * 5;
        values.push(
          t.exchange,
          t.symbol,
          t.bid,
          t.ask,
          new Date(t.timestamp)
        );
        return `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5})`;
      })
      .join(', ');

    await this.pool.query(
      `INSERT INTO price_snapshots (exchange, symbol, bid, ask, captured_at)
       VALUES ${placeholders}`,
      values
    );
  }

  async insertOpportunity(o: Opportunity): Promise<number> {
    const r = await this.pool.query(
      `INSERT INTO opportunities
       (kind, symbol, buy_exchange, sell_exchange, buy_price, sell_price, network,
        gross_profit_pct, net_profit_pct, legs, notified, detected_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        o.kind,
        o.symbol,
        o.buyExchange,
        o.sellExchange,
        o.buyPrice,
        o.sellPrice,
        o.network,
        o.grossProfitPct,
        o.netProfitPct,
        o.legs ? JSON.stringify(o.legs) : null,
        false,
        o.detectedAt,
      ]
    );
    return r.rows[0].id as number;
  }

  async markOpportunityNotified(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE opportunities SET notified = TRUE WHERE id = $1`,
      [id]
    );
  }

  async listRecentOpportunities(limit = 20): Promise<Opportunity[]> {
    const r = await this.pool.query(
      `SELECT id, kind, symbol, buy_exchange, sell_exchange, buy_price, sell_price,
              network, gross_profit_pct, net_profit_pct, legs, detected_at
         FROM opportunities
         ORDER BY detected_at DESC
         LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      id: row.id,
      kind: row.kind ?? 'spatial',
      symbol: row.symbol,
      buyExchange: row.buy_exchange,
      sellExchange: row.sell_exchange,
      buyPrice: Number(row.buy_price),
      sellPrice: Number(row.sell_price),
      network: row.network,
      grossProfitPct: Number(row.gross_profit_pct),
      netProfitPct: Number(row.net_profit_pct),
      legs: row.legs ?? undefined,
      detectedAt: row.detected_at,
    }));
  }

  async insertTrade(t: Trade): Promise<number> {
    const r = await this.pool.query(
      `INSERT INTO trades
       (opportunity_id, dry_run, state, amount_usd, started_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [t.opportunityId, t.dryRun, t.state, t.amountUsd, t.startedAt]
    );
    return r.rows[0].id as number;
  }

  async updateTradeState(
    id: number,
    state: TradeState,
    extra: Partial<Pick<
      Trade,
      | 'buyOrderId'
      | 'sellOrderId'
      | 'withdrawTxId'
      | 'realizedPnlArs'
      | 'abortReason'
      | 'finishedAt'
    >> = {}
  ): Promise<void> {
    const sets = ['state = $2'];
    const values: unknown[] = [id, state];
    let idx = 3;
    if (extra.buyOrderId !== undefined) {
      sets.push(`buy_order_id = $${idx++}`);
      values.push(extra.buyOrderId);
    }
    if (extra.sellOrderId !== undefined) {
      sets.push(`sell_order_id = $${idx++}`);
      values.push(extra.sellOrderId);
    }
    if (extra.withdrawTxId !== undefined) {
      sets.push(`withdraw_tx_id = $${idx++}`);
      values.push(extra.withdrawTxId);
    }
    if (extra.realizedPnlArs !== undefined) {
      sets.push(`realized_pnl_ars = $${idx++}`);
      values.push(extra.realizedPnlArs);
    }
    if (extra.abortReason !== undefined) {
      sets.push(`abort_reason = $${idx++}`);
      values.push(extra.abortReason);
    }
    if (extra.finishedAt !== undefined) {
      sets.push(`finished_at = $${idx++}`);
      values.push(extra.finishedAt);
    }
    await this.pool.query(
      `UPDATE trades SET ${sets.join(', ')} WHERE id = $1`,
      values
    );
  }
}
