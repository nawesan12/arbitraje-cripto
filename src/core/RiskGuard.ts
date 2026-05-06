import { getConfig, type Config } from '../config/index.js';
import { effectiveAddress } from '../config/effective.js';
import { logger } from '../utils/logger.js';
import type { ArbitrageRoute } from '../types/index.js';
import type { IExchange } from '../types/exchange.js';

export interface RiskCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Triple-check obligatorio antes de salir del DRY_RUN y ejecutar trades reales.
 *
 * Verifica:
 *  - DRY_RUN flag (si true → bloquea ejecución real)
 *  - Network permitida
 *  - Whitelist de address destino
 *  - Capabilities de los adapters
 *  - Saldo suficiente en exchange comprador
 */
export class RiskGuard {
  constructor(private adapters: Map<string, IExchange>) {}

  async precheck(route: ArbitrageRoute): Promise<RiskCheckResult> {
    const cfg = getConfig();

    if (cfg.DRY_RUN) {
      return { ok: false, reason: 'dry_run_active' };
    }

    if (route.network === 'ERC20' && !cfg.ALLOW_ERC20) {
      return { ok: false, reason: 'erc20_disabled' };
    }

    const buyer = this.adapters.get(route.buy.exchange);
    const seller = this.adapters.get(route.sell.exchange);
    if (!buyer || !seller) return { ok: false, reason: 'adapter_missing' };
    if (!buyer.capabilities.trade) return { ok: false, reason: 'buyer_no_trade' };
    if (!buyer.capabilities.withdraw) return { ok: false, reason: 'buyer_no_withdraw' };
    if (!seller.capabilities.trade) return { ok: false, reason: 'seller_no_trade' };

    const destAddr = effectiveAddress(route.sell.exchange, 'USDT', route.network);
    if (!destAddr) {
      return {
        ok: false,
        reason: `whitelist_missing:${route.sell.exchange}_USDT_${route.network}`,
      };
    }

    const [, fiat] = route.symbol.split('/');
    try {
      const balanceFiat = await buyer.getBalance(fiat);
      const requiredFiat = route.buy.price * (cfg.TRADE_SIZE_USD / route.buy.price);
      const requiredArs = cfg.TRADE_SIZE_USD * route.buy.price;
      logger.debug(
        { buyer: buyer.name, balanceFiat, requiredArs, requiredFiat },
        'risk balance check'
      );
      if (balanceFiat < requiredArs) {
        return { ok: false, reason: 'insufficient_balance' };
      }
    } catch (err) {
      return { ok: false, reason: `balance_error:${(err as Error).message}` };
    }

    return { ok: true };
  }
}

export function lookupAddress(
  _cfg: Config,
  exchange: string,
  asset: string,
  network: string
): string {
  return effectiveAddress(exchange, asset, network);
}
