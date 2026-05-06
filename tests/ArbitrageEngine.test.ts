import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DRY_RUN = 'true';
  process.env.MIN_NET_PROFIT_PCT = '0';
  process.env.TRADE_SIZE_USD = '100';
  process.env.DEFAULT_TAKER_FEE_PCT = '0.1';
  process.env.DEFAULT_ONCHAIN_FEE_USD = '0';
  process.env.BANK_SPREAD_PCT = '0';
  process.env.DEFAULT_NETWORK = 'TRC20';
});

describe('ArbitrageEngine', () => {
  it('genera todas las rutas con sell.bid > buy.ask y descarta mismo exchange', async () => {
    const { ArbitrageEngine } = await import('../src/core/ArbitrageEngine.js');

    const tickers = [
      { exchange: 'a', symbol: 'USDT/ARS', bid: 1000, ask: 1001, timestamp: 0 },
      { exchange: 'b', symbol: 'USDT/ARS', bid: 1010, ask: 1011, timestamp: 0 },
      { exchange: 'c', symbol: 'USDT/ARS', bid: 990, ask: 991, timestamp: 0 },
    ];

    const routes = ArbitrageEngine.findRoutes('USDT/ARS', tickers);
    // Solo a→b y c→b y c→a son las que tienen sell.bid > buy.ask
    // a → b: bid 1010 > ask 1001 ✓
    // c → a: bid 1000 > ask 991 ✓
    // c → b: bid 1010 > ask 991 ✓
    expect(routes.length).toBe(3);
    for (const r of routes) {
      expect(r.buy.exchange).not.toBe(r.sell.exchange);
      expect(r.sell.price).toBeGreaterThan(r.buy.price);
    }
  });

  it('ordena por net profit descendente', async () => {
    const { ArbitrageEngine } = await import('../src/core/ArbitrageEngine.js');

    const tickers = [
      { exchange: 'a', symbol: 'USDT/ARS', bid: 1000, ask: 1000, timestamp: 0 },
      { exchange: 'b', symbol: 'USDT/ARS', bid: 1050, ask: 1050, timestamp: 0 },
      { exchange: 'c', symbol: 'USDT/ARS', bid: 1100, ask: 1100, timestamp: 0 },
    ];

    const routes = ArbitrageEngine.findRoutes('USDT/ARS', tickers);
    for (let i = 1; i < routes.length; i++) {
      expect(routes[i - 1].netProfitPct).toBeGreaterThanOrEqual(
        routes[i].netProfitPct
      );
    }
  });
});
