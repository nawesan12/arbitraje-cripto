import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import type { IExchange, ExchangeFees } from '../types/exchange.js';

/**
 * Registro de fees por exchange. Se carga una vez al arrancar (consultando
 * cada adapter via loadFees) y refresca opcionalmente cada N minutos.
 *
 * Las consultas que necesitan fees hacen un lookup O(1) en el cache.
 */
export class FeeRegistry {
  private cache = new Map<string, ExchangeFees>();

  constructor(private adapters: IExchange[]) {}

  async hydrate(symbol: string): Promise<void> {
    const cfg = getConfig();
    const results = await Promise.allSettled(
      this.adapters.map(async (a) => [a.name, await a.loadFees(symbol)] as const)
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [name, fees] = r.value;
        this.cache.set(name, fees);
        logger.info(
          {
            exchange: name,
            taker: fees.takerPct,
            maker: fees.makerPct,
            withdraws: fees.withdrawByNetwork,
            source: fees.source,
          },
          'fees cargadas'
        );
      } else {
        logger.warn({ err: r.reason?.message }, 'loadFees fallo');
      }
    }

    // Para los adapters que fallaron, dejamos default
    for (const a of this.adapters) {
      if (!this.cache.has(a.name)) {
        this.cache.set(a.name, {
          takerPct: cfg.DEFAULT_TAKER_FEE_PCT,
          makerPct: cfg.DEFAULT_TAKER_FEE_PCT,
          withdrawByNetwork: {},
          source: 'default',
        });
      }
    }
  }

  takerPct(exchange: string): number {
    const cfg = getConfig();
    return this.cache.get(exchange)?.takerPct ?? cfg.DEFAULT_TAKER_FEE_PCT;
  }

  makerPct(exchange: string): number {
    const cfg = getConfig();
    return this.cache.get(exchange)?.makerPct ?? cfg.DEFAULT_TAKER_FEE_PCT;
  }

  /** Devuelve la fee on-chain en unidades del asset (ej: USDT). */
  withdrawFeeAsset(exchange: string, network: string): number | null {
    const fees = this.cache.get(exchange);
    if (!fees) return null;
    const v = fees.withdrawByNetwork[network.toUpperCase()];
    return typeof v === 'number' ? v : null;
  }

  source(exchange: string): ExchangeFees['source'] {
    return this.cache.get(exchange)?.source ?? 'default';
  }

  snapshot(): Record<string, ExchangeFees> {
    return Object.fromEntries(this.cache.entries());
  }
}
