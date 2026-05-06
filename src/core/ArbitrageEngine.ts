import { getConfig } from '../config/index.js';
import { PriceCalculator } from './PriceCalculator.js';
import type { ArbitrageRoute, Ticker } from '../types/index.js';
import type { FeeRegistry } from '../services/FeeRegistry.js';

export class ArbitrageEngine {
  static findRoutes(
    symbol: string,
    tickers: Ticker[],
    fees?: FeeRegistry
  ): ArbitrageRoute[] {
    const cfg = getConfig();
    const routes: ArbitrageRoute[] = [];

    for (const buy of tickers) {
      for (const sell of tickers) {
        if (buy.exchange === sell.exchange) continue;
        if (!Number.isFinite(buy.ask) || !Number.isFinite(sell.bid)) continue;
        if (buy.ask <= 0 || sell.bid <= 0) continue;
        if (sell.bid <= buy.ask) continue;

        const route = PriceCalculator.calculate({
          symbol,
          network: cfg.DEFAULT_NETWORK,
          buy,
          sell,
          tradeSizeUsd: cfg.TRADE_SIZE_USD,
          fees,
        });
        routes.push(route);
      }
    }

    return routes.sort((a, b) => b.netProfitPct - a.netProfitPct);
  }
}
