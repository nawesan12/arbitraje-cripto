import { effectiveMinProfit } from '../notifier/TelegramCommands.js';
import type { ArbitrageRoute } from '../types/index.js';
import type { IExchange } from '../types/exchange.js';
import type { RedisService } from '../services/RedisService.js';

export class OpportunityFilter {
  constructor(
    private redis: RedisService,
    private adapters: IExchange[]
  ) {}

  private get adapterByName(): Map<string, IExchange> {
    return new Map(this.adapters.map((a) => [a.name, a]));
  }

  async passes(route: ArbitrageRoute): Promise<{ ok: boolean; reason?: string }> {
    if (route.netProfitPct < effectiveMinProfit()) {
      return { ok: false, reason: 'below_threshold' };
    }

    const cooldownKey = `${route.symbol}:${route.buy.exchange}->${route.sell.exchange}`;
    if (await this.redis.isOnCooldown(cooldownKey)) {
      return { ok: false, reason: 'cooldown' };
    }

    const buyer = this.adapterByName.get(route.buy.exchange);
    const seller = this.adapterByName.get(route.sell.exchange);
    if (!buyer || !seller) {
      return { ok: false, reason: 'adapter_missing' };
    }

    // No descartamos aunque la punta sea read-only: la señal igual se notifica.
    // El ExecutionService valida capabilities antes de actuar.
    return { ok: true };
  }

  /** True si ambas puntas pueden ejecutar trade real */
  isAutoExecutable(route: ArbitrageRoute): boolean {
    const buyer = this.adapterByName.get(route.buy.exchange);
    const seller = this.adapterByName.get(route.sell.exchange);
    return Boolean(
      buyer?.capabilities.trade &&
        seller?.capabilities.trade &&
        buyer?.capabilities.withdraw
    );
  }
}
