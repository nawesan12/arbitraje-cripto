import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import type {
  IExchange,
  ExchangeCapabilities,
  ExchangeFees,
} from '../types/exchange.js';
import type {
  OrderRequest,
  OrderResult,
  Ticker,
  WithdrawRequest,
} from '../types/index.js';

/**
 * Base con utilidades comunes (retry, log de errores).
 * Cada adapter concreto extiende y completa los métodos abstractos.
 */
export abstract class BaseAdapter implements IExchange {
  abstract readonly name: string;
  abstract readonly capabilities: ExchangeCapabilities;

  abstract getTicker(symbol: string): Promise<Ticker>;
  abstract getBalance(asset: string): Promise<number>;
  abstract createOrder(opts: OrderRequest): Promise<OrderResult>;

  withdraw?(opts: WithdrawRequest): Promise<{ txId: string }>;
  getDepositAddress?(asset: string, network: string): Promise<string>;

  async loadFees(_symbol: string): Promise<ExchangeFees> {
    const cfg = getConfig();
    return {
      takerPct: cfg.DEFAULT_TAKER_FEE_PCT,
      makerPct: cfg.DEFAULT_TAKER_FEE_PCT,
      withdrawByNetwork: {},
      source: 'default',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getTicker('USDT/ARS');
      return true;
    } catch (err) {
      logger.warn(
        { exchange: this.name, err: (err as Error).message },
        'testConnection falló'
      );
      return false;
    }
  }

  protected async withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    attempts = 3,
    delayMs = 500
  ): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        logger.debug(
          { exchange: this.name, label, attempt: i + 1, err: (err as Error).message },
          'retry'
        );
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        }
      }
    }
    throw lastErr;
  }
}
