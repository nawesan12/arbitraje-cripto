import { round } from '../utils/math.js';
import type { PostgresService } from './PostgresService.js';

export interface DailyReport {
  windowHours: number;
  oppsTotal: number;
  oppsAuto: number;
  tradesExecuted: number;
  tradesDryRun: number;
  tradesReal: number;
  tradesDone: number;
  tradesAborted: number;
  realizedPnlArs: number;
  topRoutes: Array<{
    buy: string;
    sell: string;
    bestNetPct: number;
    count: number;
  }>;
}

/**
 * Generador de reportes a partir de Postgres. Sin estado propio.
 */
export class Reporter {
  constructor(private pg: PostgresService) {}

  async lastN(hours = 24): Promise<DailyReport> {
    const since = new Date(Date.now() - hours * 60 * 60_000);

    const opps = await this.pg.query<{ total: string }>(
      `SELECT COUNT(*) AS total
         FROM opportunities
         WHERE detected_at > $1`,
      [since]
    );
    const oppsTotal = Number(opps.rows[0].total);

    const trades = await this.pg.query<{
      executed: number;
      dryrun: number;
      real: number;
      done: number;
      aborted: number;
      pnl: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE state NOT IN ('aborted'))::int AS executed,
         COUNT(*) FILTER (WHERE dry_run)::int AS dryrun,
         COUNT(*) FILTER (WHERE NOT dry_run)::int AS real,
         COUNT(*) FILTER (WHERE state = 'done')::int AS done,
         COUNT(*) FILTER (WHERE state = 'aborted')::int AS aborted,
         COALESCE(SUM(realized_pnl_ars), 0) AS pnl
       FROM trades
       WHERE started_at > $1`,
      [since]
    );
    const t = trades.rows[0];

    const top = await this.pg.query<{
      buy_exchange: string;
      sell_exchange: string;
      best_net: string;
      cnt: string;
    }>(
      `SELECT buy_exchange, sell_exchange,
              MAX(net_profit_pct) AS best_net,
              COUNT(*) AS cnt
         FROM opportunities
         WHERE detected_at > $1
         GROUP BY buy_exchange, sell_exchange
         ORDER BY best_net DESC
         LIMIT 5`,
      [since]
    );

    return {
      windowHours: hours,
      oppsTotal,
      oppsAuto: 0, // no lo trackeamos en DB todavía
      tradesExecuted: Number(t.executed),
      tradesDryRun: Number(t.dryrun),
      tradesReal: Number(t.real),
      tradesDone: Number(t.done),
      tradesAborted: Number(t.aborted),
      realizedPnlArs: Number(t.pnl),
      topRoutes: top.rows.map((r) => ({
        buy: r.buy_exchange,
        sell: r.sell_exchange,
        bestNetPct: Number(r.best_net),
        count: Number(r.cnt),
      })),
    };
  }

  formatHTML(r: DailyReport): string {
    const lines = [
      `📊 <b>Reporte últimas ${r.windowHours}h</b>`,
      ``,
      `🎯 <b>${r.oppsTotal}</b> oportunidades detectadas`,
      `🛠 <b>${r.tradesExecuted}</b> trades iniciados (${r.tradesDryRun} dry / ${r.tradesReal} real)`,
      `   ↳ ${r.tradesDone} completados, ${r.tradesAborted} abortados`,
      `💵 PnL realizado: <b>${round(r.realizedPnlArs, 2)} ARS</b>`,
      ``,
      `<b>Top rutas por mejor net%:</b>`,
    ];
    if (r.topRoutes.length === 0) {
      lines.push('  (sin datos)');
    } else {
      for (const rt of r.topRoutes) {
        lines.push(
          `  ${rt.buy} → ${rt.sell}: <b>${round(rt.bestNetPct, 2)}%</b> (${rt.count} veces)`
        );
      }
    }
    return lines.join('\n');
  }
}
