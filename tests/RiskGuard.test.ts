import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IExchange } from '../src/types/exchange.js';
import type { ArbitrageRoute } from '../src/types/index.js';

function makeAdapter(
  name: string,
  caps: Partial<IExchange['capabilities']> = {},
  balance = 1_000_000_000
): IExchange {
  return {
    name,
    capabilities: {
      trade: true,
      withdraw: true,
      deposit: true,
      networks: ['TRC20'],
      hasNativeTicker: true,
      ...caps,
    },
    async getTicker() {
      return {
        exchange: name,
        symbol: 'USDT/ARS',
        bid: 1000,
        ask: 1000,
        timestamp: Date.now(),
      };
    },
    async getBalance() {
      return balance;
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
  };
}

const baseRoute: ArbitrageRoute = {
  id: 'test',
  symbol: 'USDT/ARS',
  buy: { exchange: 'binance', price: 1000 },
  sell: { exchange: 'bitso', price: 1050 },
  network: 'TRC20',
  fees: { takerBuyPct: 0.1, takerSellPct: 0.1, onChainUsd: 1, bankSpreadPct: 0.5 },
  grossProfitPct: 5,
  netProfitPct: 3,
  estimatedDurationMs: 360_000,
};

beforeEach(() => {
  vi.resetModules();
});

describe('RiskGuard', () => {
  it('rechaza cuando DRY_RUN está activo', async () => {
    process.env.DRY_RUN = 'true';
    process.env.MIN_NET_PROFIT_PCT = '1.5';
    process.env.TRADE_SIZE_USD = '100';
    process.env.DEFAULT_NETWORK = 'TRC20';
    const { RiskGuard } = await import('../src/core/RiskGuard.js');

    const guard = new RiskGuard(
      new Map([
        ['binance', makeAdapter('binance')],
        ['bitso', makeAdapter('bitso')],
      ])
    );
    const r = await guard.precheck(baseRoute);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dry_run_active');
  });

  it('rechaza si falta whitelist de address destino', async () => {
    process.env.DRY_RUN = 'false';
    process.env.MIN_NET_PROFIT_PCT = '1.5';
    process.env.TRADE_SIZE_USD = '100';
    process.env.DEFAULT_NETWORK = 'TRC20';
    process.env.ADDR_BITSO_USDT_TRC20 = '';
    const { RiskGuard } = await import('../src/core/RiskGuard.js');

    const guard = new RiskGuard(
      new Map([
        ['binance', makeAdapter('binance')],
        ['bitso', makeAdapter('bitso')],
      ])
    );
    const r = await guard.precheck(baseRoute);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/whitelist_missing/);
  });

  it('rechaza si el buyer no tiene capability de withdraw', async () => {
    process.env.DRY_RUN = 'false';
    process.env.ADDR_BITSO_USDT_TRC20 = 'TXXXXXXXXX';
    const { RiskGuard } = await import('../src/core/RiskGuard.js');

    const guard = new RiskGuard(
      new Map([
        ['binance', makeAdapter('binance', { withdraw: false })],
        ['bitso', makeAdapter('bitso')],
      ])
    );
    const r = await guard.precheck(baseRoute);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('buyer_no_withdraw');
  });
});
