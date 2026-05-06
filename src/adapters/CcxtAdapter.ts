import ccxt, { Exchange } from 'ccxt';
import { BaseAdapter } from './BaseAdapter.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import type {
  ExchangeCapabilities,
  ExchangeFees,
} from '../types/exchange.js';
import type {
  OrderRequest,
  OrderResult,
  Ticker,
  WithdrawRequest,
} from '../types/index.js';

interface CcxtAdapterOpts {
  name: string;
  exchangeId: keyof typeof ccxt;
  apiKey: string;
  secret: string;
  password?: string;
  capabilities: ExchangeCapabilities;
}

/**
 * Adapter genérico basado en ccxt para Binance / Bybit / OKX.
 * Cada exchange particular extiende esta clase y solo cambia el id y capabilities.
 */
export abstract class CcxtAdapter extends BaseAdapter {
  readonly name: string;
  readonly capabilities: ExchangeCapabilities;
  protected client: Exchange;

  constructor(opts: CcxtAdapterOpts) {
    super();
    this.name = opts.name;
    this.capabilities = opts.capabilities;
    const Ctor = ccxt[opts.exchangeId] as unknown as new (
      cfg: Record<string, unknown>
    ) => Exchange;
    this.client = new Ctor({
      apiKey: opts.apiKey,
      secret: opts.secret,
      password: opts.password,
      enableRateLimit: true,
      timeout: 10_000,
    });
  }

  async getTicker(symbol: string): Promise<Ticker> {
    return this.withRetry('getTicker', async () => {
      const t = await this.client.fetchTicker(symbol);
      return {
        exchange: this.name,
        symbol,
        bid: Number(t.bid ?? 0),
        ask: Number(t.ask ?? 0),
        timestamp: Number(t.timestamp ?? Date.now()),
      };
    });
  }

  async getBalance(asset: string): Promise<number> {
    if (!this.capabilities.trade) return 0;
    return this.withRetry('getBalance', async () => {
      const b = await this.client.fetchBalance();
      const free = (b.free as unknown as Record<string, number> | undefined)?.[asset];
      return typeof free === 'number' ? free : 0;
    });
  }

  async createOrder(opts: OrderRequest): Promise<OrderResult> {
    if (!this.capabilities.trade) {
      throw new Error(`${this.name} no tiene capacidad de trading`);
    }
    return this.withRetry('createOrder', async () => {
      const o = await this.client.createOrder(
        opts.symbol,
        opts.type ?? 'market',
        opts.side,
        opts.amount,
        opts.price
      );
      return {
        id: String(o.id),
        status:
          o.status === 'closed'
            ? 'filled'
            : o.status === 'open'
              ? 'open'
              : o.status === 'canceled' || o.status === 'rejected'
                ? 'rejected'
                : 'partial',
        filledAmount: Number(o.filled ?? 0),
        averagePrice: Number(o.average ?? o.price ?? 0),
      };
    });
  }

  async withdraw(opts: WithdrawRequest): Promise<{ txId: string }> {
    if (!this.capabilities.withdraw) {
      throw new Error(`${this.name} no soporta withdraw`);
    }
    return this.withRetry('withdraw', async () => {
      const r = await this.client.withdraw(
        opts.asset,
        opts.amount,
        opts.address,
        undefined,
        { network: opts.network }
      );
      return { txId: String(r.id ?? r.txid ?? '') };
    });
  }

  async getDepositAddress(asset: string, network: string): Promise<string> {
    return this.withRetry('getDepositAddress', async () => {
      const r = await this.client.fetchDepositAddress(asset, { network });
      return String(r.address);
    });
  }

  override async loadFees(symbol: string): Promise<ExchangeFees> {
    const cfg = getConfig();
    let takerPct = cfg.DEFAULT_TAKER_FEE_PCT;
    let makerPct = cfg.DEFAULT_TAKER_FEE_PCT;
    const withdrawByNetwork: Record<string, number> = {};
    let source: ExchangeFees['source'] = 'default';

    try {
      await this.client.loadMarkets();
      const market = this.client.markets?.[symbol];
      if (market) {
        const t = (market as { taker?: number }).taker;
        const m = (market as { maker?: number }).maker;
        if (typeof t === 'number') takerPct = t * 100;
        if (typeof m === 'number') makerPct = m * 100;
        source = 'native';
      }
    } catch (err) {
      logger.warn(
        { exchange: this.name, err: (err as Error).message },
        'loadMarkets falló, fallback a default'
      );
    }

    const [coin] = symbol.split('/');
    try {
      if (this.client.has?.['fetchDepositWithdrawFees']) {
        const fees = await this.client.fetchDepositWithdrawFees([coin]);
        const entry = (fees as Record<string, unknown>)?.[coin] as
          | { networks?: Record<string, { withdraw?: { fee?: number } }> }
          | undefined;
        if (entry?.networks) {
          for (const [net, raw] of Object.entries(entry.networks)) {
            const fee = raw?.withdraw?.fee;
            if (typeof fee === 'number') {
              withdrawByNetwork[net.toUpperCase()] = fee;
            }
          }
          if (Object.keys(withdrawByNetwork).length > 0) source = 'native';
        }
      }
    } catch (err) {
      logger.debug(
        { exchange: this.name, err: (err as Error).message },
        'fetchDepositWithdrawFees no disponible'
      );
    }

    return { takerPct, makerPct, withdrawByNetwork, source };
  }
}
