import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DRY_RUN = 'true';
  process.env.MIN_NET_PROFIT_PCT = '1.5';
  process.env.TRADE_SIZE_USD = '100';
  process.env.DEFAULT_TAKER_FEE_PCT = '0.1';
  process.env.DEFAULT_ONCHAIN_FEE_USD = '1';
  process.env.BANK_SPREAD_PCT = '0.5';
});

describe('PriceCalculator', () => {
  it('calcula net profit aplicando taker buy + sell + onchain + spread', async () => {
    const { PriceCalculator } = await import('../src/core/PriceCalculator.js');

    const route = PriceCalculator.calculate({
      symbol: 'USDT/ARS',
      network: 'TRC20',
      buy: {
        exchange: 'binance',
        symbol: 'USDT/ARS',
        bid: 999,
        ask: 1000,
        timestamp: Date.now(),
      },
      sell: {
        exchange: 'bitso',
        symbol: 'USDT/ARS',
        bid: 1030,
        ask: 1031,
        timestamp: Date.now(),
      },
      tradeSizeUsd: 100,
    });

    // Gross = (1030 - 1000) / 1000 * 100 = 3
    expect(route.grossProfitPct).toBeCloseTo(3, 5);

    // onChainEquivalentPct = 1 / 100 * 100 = 1
    // net = 3 - 0.1 - 0.1 - 1 - 0.5 = 1.3
    expect(route.netProfitPct).toBeCloseTo(1.3, 5);
  });

  it('puede dar net profit negativo si las fees superan el spread', async () => {
    const { PriceCalculator } = await import('../src/core/PriceCalculator.js');

    const route = PriceCalculator.calculate({
      symbol: 'USDT/ARS',
      network: 'TRC20',
      buy: {
        exchange: 'a',
        symbol: 'USDT/ARS',
        bid: 1000,
        ask: 1000,
        timestamp: 0,
      },
      sell: {
        exchange: 'b',
        symbol: 'USDT/ARS',
        bid: 1005,
        ask: 1005,
        timestamp: 0,
      },
      tradeSizeUsd: 100,
    });

    expect(route.netProfitPct).toBeLessThan(0);
  });
});
