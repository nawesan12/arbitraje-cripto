import { getConfig } from '../config/index.js';
import { pct, shortId } from '../utils/math.js';
import type { ArbitrageRoute, Ticker } from '../types/index.js';
import type { FeeRegistry } from '../services/FeeRegistry.js';

export interface CalcInput {
  symbol: string;
  network: string;
  buy: Ticker;
  sell: Ticker;
  tradeSizeUsd: number;
  /** opcional: si está, se usan fees por exchange y por red en lugar de defaults */
  fees?: FeeRegistry;
}

/**
 * Cálculo de profit neto de una ruta de arbitraje spatial.
 *
 * Modelo:
 *   - Ask = precio al que comprás USDT en exchange A (en ARS)
 *   - Bid = precio al que vendés USDT en exchange B (en ARS)
 *   - Gross profit % = (sell.bid - buy.ask) / buy.ask * 100
 *   - Net profit % = gross - takerBuy% - takerSell% - onChain% - bankSpread%
 *
 * Cuando se pasa el FeeRegistry, takerBuy% y takerSell% son los reales del exchange,
 * y la fee on-chain se toma del registry por red (en USDT) si está disponible,
 * sino se cae al DEFAULT_ONCHAIN_FEE_USD.
 */
export class PriceCalculator {
  static calculate(input: CalcInput): ArbitrageRoute {
    const cfg = getConfig();

    const takerBuyPct =
      input.fees?.takerPct(input.buy.exchange) ?? cfg.DEFAULT_TAKER_FEE_PCT;
    const takerSellPct =
      input.fees?.takerPct(input.sell.exchange) ?? cfg.DEFAULT_TAKER_FEE_PCT;

    // Fee on-chain: si el registry tiene info para la red del buyer, usamos esa.
    // Sino, cae al default en USD del .env.
    const buyWithdrawAsset = input.fees?.withdrawFeeAsset(
      input.buy.exchange,
      input.network
    );
    const onChainUsd =
      buyWithdrawAsset !== null && buyWithdrawAsset !== undefined
        ? // asumimos USDT≈USD (precio mid, suficiente para fees)
          buyWithdrawAsset
        : cfg.DEFAULT_ONCHAIN_FEE_USD;

    const bankSpreadPct = cfg.BANK_SPREAD_PCT;

    const buyPrice = input.buy.ask;
    const sellPrice = input.sell.bid;

    const grossProfitPct = pct(sellPrice - buyPrice, buyPrice);
    const onChainEquivalentPct = pct(onChainUsd, input.tradeSizeUsd);

    const netProfitPct =
      grossProfitPct -
      takerBuyPct -
      takerSellPct -
      onChainEquivalentPct -
      bankSpreadPct;

    return {
      id: shortId('rt'),
      symbol: input.symbol,
      buy: { exchange: input.buy.exchange, price: buyPrice },
      sell: { exchange: input.sell.exchange, price: sellPrice },
      network: input.network,
      fees: { takerBuyPct, takerSellPct, onChainUsd, bankSpreadPct },
      grossProfitPct,
      netProfitPct,
      estimatedDurationMs: estimateDuration(input.network),
    };
  }
}

function estimateDuration(network: string): number {
  switch (network.toUpperCase()) {
    case 'TRC20':
      return 6 * 60_000;
    case 'ERC20':
      return 12 * 60_000;
    case 'BSC':
      return 4 * 60_000;
    default:
      return 10 * 60_000;
  }
}
