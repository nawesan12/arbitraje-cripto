import { EventEmitter } from 'node:events';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { effectiveMinProfit } from '../notifier/TelegramCommands.js';
import { ArbitrageEngine } from '../core/ArbitrageEngine.js';
import { TriangularEngine } from '../core/TriangularEngine.js';
import { OpportunityFilter } from '../core/OpportunityFilter.js';
import type { IExchange } from '../types/exchange.js';
import type {
  AnyRoute,
  ArbitrageRoute,
  Opportunity,
  Ticker,
  TriangularRoute,
} from '../types/index.js';
import type { RedisService } from './RedisService.js';
import type { PostgresService } from './PostgresService.js';
import type { CriptoYaService } from './CriptoYaService.js';
import type { FeeRegistry } from './FeeRegistry.js';

export interface ScannerEvents {
  tick: (snapshot: ScannerSnapshot) => void;
  opportunity: (
    route: AnyRoute,
    opportunityId: number,
    autoExecutable: boolean
  ) => void;
  error: (err: Error) => void;
}

export interface ScannerSnapshot {
  tickers: Ticker[];
  routes: ArbitrageRoute[];
  triangularRoutes: TriangularRoute[];
  at: Date;
}

export class Scanner extends EventEmitter {
  private timer?: NodeJS.Timeout;
  private running = false;
  private paused = false;
  private filter: OpportunityFilter;

  constructor(
    private adapters: IExchange[],
    private redis: RedisService,
    private pg: PostgresService,
    private criptoYa: CriptoYaService,
    private fees: FeeRegistry
  ) {
    super();
    this.filter = new OpportunityFilter(redis, adapters);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const cfg = getConfig();
    const tick = () => {
      this.tick().catch((err) => {
        logger.error({ err: err.message }, 'scanner tick error');
        this.emit('error', err);
      });
    };
    tick();
    this.timer = setInterval(tick, cfg.SCAN_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  pause(): void {
    this.paused = true;
    logger.info('scanner pausado');
  }

  resume(): void {
    this.paused = false;
    logger.info('scanner reanudado');
  }

  isPaused(): boolean {
    return this.paused;
  }

  private async tick(): Promise<void> {
    if (this.paused) return;
    const cfg = getConfig();

    const allTickers: Ticker[] = [];

    // 1. Tickers de adapters nativos
    for (const symbol of cfg.SYMBOLS) {
      const results = await Promise.allSettled(
        this.adapters.map((a) => a.getTicker(symbol))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') allTickers.push(r.value);
        else logger.debug({ err: r.reason?.message }, 'ticker fail');
      }

      // 2. Tickers de CriptoYa (read-only, sin ejecución)
      try {
        const cy = await this.criptoYa.fetchTickers(symbol);
        for (const { ticker } of cy) {
          // Si ya tenemos el mismo exchange con adapter nativo, evitamos duplicar.
          const baseName = ticker.exchange.replace('criptoya:', '');
          if (this.adapters.some((a) => a.name === baseName)) continue;
          allTickers.push(ticker);
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'criptoya tick fail');
      }
    }

    // 3. Cache + persist
    await Promise.all(allTickers.map((t) => this.redis.cacheTicker(t)));
    await this.pg.insertSnapshots(allTickers).catch((err) => {
      logger.warn({ err: err.message }, 'snapshots insert fail');
    });

    // 4. Buscar rutas por símbolo
    const allRoutes: ArbitrageRoute[] = [];
    for (const symbol of cfg.SYMBOLS) {
      const tickersFor = allTickers.filter((t) => t.symbol === symbol);
      const routes = ArbitrageEngine.findRoutes(symbol, tickersFor, this.fees);
      allRoutes.push(...routes);
    }

    // 5. Filtrar y persistir oportunidades
    for (const route of allRoutes) {
      const passes = await this.filter.passes(route);
      if (!passes.ok) continue;

      const opp: Opportunity = {
        kind: 'spatial',
        symbol: route.symbol,
        buyExchange: route.buy.exchange,
        sellExchange: route.sell.exchange,
        buyPrice: route.buy.price,
        sellPrice: route.sell.price,
        network: route.network,
        grossProfitPct: route.grossProfitPct,
        netProfitPct: route.netProfitPct,
        detectedAt: new Date(),
      };
      try {
        const id = await this.pg.insertOpportunity(opp);
        await this.redis.setCooldown(
          `${route.symbol}:${route.buy.exchange}->${route.sell.exchange}`,
          cfg.COOLDOWN_PER_PAIR_MS
        );
        const autoExecutable = this.filter.isAutoExecutable(route);
        this.emit('opportunity', route, id, autoExecutable);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'insert opportunity fail');
      }
    }

    // 6. Detección triangular intra-exchange
    const triRoutes: TriangularRoute[] = [];
    if (cfg.TRIANGULAR_ENABLED) {
      const tradable = this.adapters.filter((a) => a.capabilities.trade);
      const results = await Promise.allSettled(
        tradable.map((a) =>
          TriangularEngine.findCycles(
            a,
            cfg.TRIANGULAR_FIAT,
            cfg.TRIANGULAR_VIA,
            cfg.TRIANGULAR_INTERMEDIATES,
            this.fees
          )
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') triRoutes.push(...r.value);
        else logger.debug({ err: r.reason?.message }, 'triangular fail');
      }

      const minProfit = effectiveMinProfit();
      for (const tri of triRoutes) {
        if (tri.netProfitPct < minProfit) continue;

        const cooldownKey = `tri:${tri.exchange}:${tri.intermediate}:${tri.direction}`;
        if (await this.redis.isOnCooldown(cooldownKey)) continue;

        const opp: Opportunity = {
          kind: 'triangular',
          symbol: `${cfg.TRIANGULAR_VIA}/${cfg.TRIANGULAR_FIAT}`,
          buyExchange: tri.exchange,
          sellExchange: tri.exchange,
          buyPrice: tri.legs[0].price,
          sellPrice: tri.legs[2].price,
          network: 'intra',
          grossProfitPct: tri.grossProfitPct,
          netProfitPct: tri.netProfitPct,
          legs: [...tri.legs],
          detectedAt: new Date(),
        };
        try {
          const id = await this.pg.insertOpportunity(opp);
          await this.redis.setCooldown(cooldownKey, cfg.COOLDOWN_PER_PAIR_MS);
          // Triangular siempre es autoExecutable si el adapter tiene trade
          const autoExecutable =
            this.adapters.find((a) => a.name === tri.exchange)?.capabilities
              .trade ?? false;
          this.emit('opportunity', tri, id, autoExecutable);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'insert tri opportunity fail');
        }
      }
    }

    this.emit('tick', {
      tickers: allTickers,
      routes: allRoutes,
      triangularRoutes: triRoutes,
      at: new Date(),
    });
  }
}
