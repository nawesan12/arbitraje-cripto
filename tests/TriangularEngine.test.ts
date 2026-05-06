import { describe, it, expect, beforeAll } from 'vitest';
import type { IExchange } from '../src/types/exchange.js';
import type { Ticker } from '../src/types/index.js';

beforeAll(() => {
  process.env.DRY_RUN = 'true';
  process.env.MIN_NET_PROFIT_PCT = '0';
  process.env.TRADE_SIZE_USD = '100';
  process.env.DEFAULT_TAKER_FEE_PCT = '0.1';
});

function makeAdapter(name: string, tickers: Record<string, Ticker>): IExchange {
  return {
    name,
    capabilities: {
      trade: true,
      withdraw: true,
      deposit: true,
      networks: ['TRC20'],
      hasNativeTicker: true,
    },
    async getTicker(symbol) {
      const t = tickers[symbol];
      if (!t) throw new Error(`no ticker ${symbol}`);
      return t;
    },
    async getBalance() {
      return 0;
    },
    async createOrder() {
      return {
        id: 'x',
        status: 'filled' as const,
        filledAmount: 0,
        averagePrice: 0,
      };
    },
    async testConnection() {
      return true;
    },
    async loadFees(_s) {
      return {
        takerPct: 0.1,
        makerPct: 0.1,
        withdrawByNetwork: {},
        source: 'default' as const,
      };
    },
  };
}

describe('TriangularEngine', () => {
  it('detecta ciclo forward profitable cuando hay misalignment', async () => {
    const { TriangularEngine } = await import(
      '../src/core/TriangularEngine.js'
    );
    const { FeeRegistry } = await import('../src/services/FeeRegistry.js');

    const tickers: Record<string, Ticker> = {
      'USDT/ARS': {
        exchange: 'x',
        symbol: 'USDT/ARS',
        bid: 1000,
        ask: 1000,
        timestamp: 0,
      },
      'BTC/USDT': {
        exchange: 'x',
        symbol: 'BTC/USDT',
        bid: 100,
        ask: 100,
        timestamp: 0,
      },
      // BTC/ARS está sobrevaluado: debería ser 100*1000 = 100,000.
      // Si está en 105,000, hay 5% de profit en forward.
      'BTC/ARS': {
        exchange: 'x',
        symbol: 'BTC/ARS',
        bid: 105_000,
        ask: 105_000,
        timestamp: 0,
      },
    };
    const adapter = makeAdapter('test', tickers);

    const fees = new FeeRegistry([adapter]);
    await fees.hydrate('USDT/ARS');

    const cycles = await TriangularEngine.findCycles(
      adapter,
      'ARS',
      'USDT',
      ['BTC'],
      fees
    );

    expect(cycles.length).toBeGreaterThan(0);
    const forward = cycles.find(
      (c) => c.intermediate === 'BTC' && c.direction === 'forward'
    );
    expect(forward).toBeDefined();
    expect(forward!.netProfitPct).toBeGreaterThan(4);
  });

  it('descarta ciclos sin tickers necesarios', async () => {
    const { TriangularEngine } = await import(
      '../src/core/TriangularEngine.js'
    );
    const { FeeRegistry } = await import('../src/services/FeeRegistry.js');

    const tickers: Record<string, Ticker> = {
      'USDT/ARS': {
        exchange: 'x',
        symbol: 'USDT/ARS',
        bid: 1000,
        ask: 1000,
        timestamp: 0,
      },
    };
    const adapter = makeAdapter('test', tickers);
    const fees = new FeeRegistry([adapter]);
    await fees.hydrate('USDT/ARS');

    const cycles = await TriangularEngine.findCycles(
      adapter,
      'ARS',
      'USDT',
      ['BTC'],
      fees
    );
    expect(cycles).toEqual([]);
  });
});
