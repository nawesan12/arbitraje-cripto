import { logger } from '../utils/logger.js';
import { shortId } from '../utils/math.js';
import type { Ticker, TriangularRoute } from '../types/index.js';
import type { IExchange } from '../types/exchange.js';
import type { FeeRegistry } from '../services/FeeRegistry.js';

/**
 * Detección de arbitraje triangular intra-exchange.
 *
 * Modelo (sentido forward):
 *   ARS → USDT (compra USDT/ARS @ ask)
 *       → MID  (compra MID/USDT @ ask)
 *       → ARS  (vende MID/ARS @ bid)
 *
 *   ratio_forward = (1 / ask_USDT_ARS) * (1 / ask_MID_USDT) * bid_MID_ARS * (1 - f)^3
 *
 * Sentido reverse:
 *   ARS → MID  (compra MID/ARS @ ask)
 *       → USDT (vende MID/USDT @ bid)
 *       → ARS  (vende USDT/ARS @ bid)
 *
 *   ratio_reverse = (1 / ask_MID_ARS) * bid_MID_USDT * bid_USDT_ARS * (1 - f)^3
 *
 * Si ratio > 1 → hay profit antes de fees, y net_profit = (ratio - 1) * 100.
 * Las fees ya están incluidas en el cálculo via (1 - f)^3.
 */
export class TriangularEngine {
  /**
   * Para un exchange, busca ciclos triangulares con cada moneda intermedia.
   * `tickers` debe contener al menos USDT/ARS, MID/ARS y MID/USDT por cada MID.
   */
  static async findCycles(
    adapter: IExchange,
    fiat: string,
    via: string, // 'USDT'
    intermediates: string[], // ['BTC','USDC','ETH']
    fees: FeeRegistry
  ): Promise<TriangularRoute[]> {
    const routes: TriangularRoute[] = [];
    const taker = fees.takerPct(adapter.name);
    const f = taker / 100;
    const feeFactor = (1 - f) ** 3;

    // Tickers que necesitamos
    const symbolsNeeded = new Set<string>([`${via}/${fiat}`]);
    for (const mid of intermediates) {
      symbolsNeeded.add(`${mid}/${fiat}`);
      symbolsNeeded.add(`${mid}/${via}`);
    }

    const tickerMap = new Map<string, Ticker>();
    await Promise.all(
      [...symbolsNeeded].map(async (s) => {
        try {
          tickerMap.set(s, await adapter.getTicker(s));
        } catch (err) {
          logger.debug(
            { exchange: adapter.name, symbol: s, err: (err as Error).message },
            'triangular: ticker no disponible'
          );
        }
      })
    );

    const tViaFiat = tickerMap.get(`${via}/${fiat}`);
    if (!tViaFiat) return [];

    for (const mid of intermediates) {
      const tMidFiat = tickerMap.get(`${mid}/${fiat}`);
      const tMidVia = tickerMap.get(`${mid}/${via}`);
      if (!tMidFiat || !tMidVia) continue;

      // FORWARD: ARS → USDT → MID → ARS
      if (tViaFiat.ask > 0 && tMidVia.ask > 0 && tMidFiat.bid > 0) {
        const ratio =
          (1 / tViaFiat.ask) *
          (1 / tMidVia.ask) *
          tMidFiat.bid *
          feeFactor;
        const net = (ratio - 1) * 100;
        if (Number.isFinite(net) && net > -50) {
          routes.push({
            id: shortId('tri'),
            kind: 'triangular',
            exchange: adapter.name,
            baseFiat: fiat,
            intermediate: mid,
            via,
            direction: 'forward',
            legs: [
              {
                symbol: `${via}/${fiat}`,
                side: 'buy',
                price: tViaFiat.ask,
                takerPct: taker,
              },
              {
                symbol: `${mid}/${via}`,
                side: 'buy',
                price: tMidVia.ask,
                takerPct: taker,
              },
              {
                symbol: `${mid}/${fiat}`,
                side: 'sell',
                price: tMidFiat.bid,
                takerPct: taker,
              },
            ],
            grossProfitPct:
              ((1 / tViaFiat.ask) * (1 / tMidVia.ask) * tMidFiat.bid - 1) * 100,
            netProfitPct: net,
            estimatedDurationMs: 5_000,
          });
        }
      }

      // REVERSE: ARS → MID → USDT → ARS
      if (tMidFiat.ask > 0 && tMidVia.bid > 0 && tViaFiat.bid > 0) {
        const ratio =
          (1 / tMidFiat.ask) *
          tMidVia.bid *
          tViaFiat.bid *
          feeFactor;
        const net = (ratio - 1) * 100;
        if (Number.isFinite(net) && net > -50) {
          routes.push({
            id: shortId('tri'),
            kind: 'triangular',
            exchange: adapter.name,
            baseFiat: fiat,
            intermediate: mid,
            via,
            direction: 'reverse',
            legs: [
              {
                symbol: `${mid}/${fiat}`,
                side: 'buy',
                price: tMidFiat.ask,
                takerPct: taker,
              },
              {
                symbol: `${mid}/${via}`,
                side: 'sell',
                price: tMidVia.bid,
                takerPct: taker,
              },
              {
                symbol: `${via}/${fiat}`,
                side: 'sell',
                price: tViaFiat.bid,
                takerPct: taker,
              },
            ],
            grossProfitPct:
              ((1 / tMidFiat.ask) * tMidVia.bid * tViaFiat.bid - 1) * 100,
            netProfitPct: net,
            estimatedDurationMs: 5_000,
          });
        }
      }
    }

    return routes.sort((a, b) => b.netProfitPct - a.netProfitPct);
  }
}
