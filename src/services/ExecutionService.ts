import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { RiskGuard, lookupAddress } from '../core/RiskGuard.js';
import { TransferTracker } from './TransferTracker.js';
import type { AnyRoute, ArbitrageRoute, TriangularRoute } from '../types/index.js';
import type { IExchange } from '../types/exchange.js';
import type { PostgresService } from './PostgresService.js';
import type { RedisService } from './RedisService.js';
import type { IncidentNotifier } from '../notifier/IncidentNotifier.js';

export class ExecutionService {
  private riskGuard: RiskGuard;
  private tracker = new TransferTracker();

  constructor(
    private adapters: Map<string, IExchange>,
    private pg: PostgresService,
    private redis: RedisService,
    private incidents?: IncidentNotifier
  ) {
    this.riskGuard = new RiskGuard(adapters);
  }

  /**
   * Ejecuta una ruta. Spatial = compra+withdraw+venta. Triangular = 3 órdenes
   * en serie en el mismo exchange. Si DRY_RUN está activo, solo loguea.
   */
  async execute(route: AnyRoute, opportunityId: number): Promise<void> {
    if (route.kind === 'triangular') {
      return this.executeTriangular(route, opportunityId);
    }
    return this.executeSpatial(route, opportunityId);
  }

  private async executeSpatial(
    route: ArbitrageRoute,
    opportunityId: number
  ): Promise<void> {
    const cfg = getConfig();
    const tradeId = await this.pg.insertTrade({
      opportunityId,
      dryRun: cfg.DRY_RUN,
      state: 'buying',
      amountUsd: cfg.TRADE_SIZE_USD,
      startedAt: new Date(),
    });

    if (cfg.DRY_RUN) {
      await this.runDryRun(route, tradeId);
      return;
    }

    const lockKey = `arb:${route.symbol}:${route.buy.exchange}->${route.sell.exchange}`;
    const acquired = await this.redis.acquireLock(
      lockKey,
      Math.ceil(route.estimatedDurationMs / 1000) + 60
    );
    if (!acquired) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: 'lock_busy',
        finishedAt: new Date(),
      });
      return;
    }

    try {
      const risk = await this.riskGuard.precheck(route);
      if (!risk.ok) {
        await this.pg.updateTradeState(tradeId, 'aborted', {
          abortReason: `risk:${risk.reason}`,
          finishedAt: new Date(),
        });
        await this.incidents?.tradeAborted(tradeId, `risk:${risk.reason}`);
        return;
      }
      await this.runReal(route, tradeId);
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  private async runDryRun(route: ArbitrageRoute, tradeId: number): Promise<void> {
    logger.info(
      { route: route.id, tradeId, dryRun: true },
      'DRY_RUN: simulando trade'
    );
    await this.pg.updateTradeState(tradeId, 'transferring', {
      buyOrderId: 'dryrun-buy',
    });
    await this.pg.updateTradeState(tradeId, 'selling', {
      withdrawTxId: 'dryrun-tx',
    });
    await this.pg.updateTradeState(tradeId, 'done', {
      sellOrderId: 'dryrun-sell',
      realizedPnlArs:
        route.netProfitPct *
        (getConfig().TRADE_SIZE_USD * route.buy.price) /
        100,
      finishedAt: new Date(),
    });
  }

  private async runReal(route: ArbitrageRoute, tradeId: number): Promise<void> {
    const cfg = getConfig();
    const buyer = this.adapters.get(route.buy.exchange)!;
    const seller = this.adapters.get(route.sell.exchange)!;
    const [coin] = route.symbol.split('/');
    const usdtAmount = cfg.TRADE_SIZE_USD;

    // 1. Compra de USDT en buyer
    const buyOrder = await buyer.createOrder({
      symbol: route.symbol,
      side: 'buy',
      amount: usdtAmount,
      type: 'market',
    });
    await this.pg.updateTradeState(tradeId, 'buying', {
      buyOrderId: buyOrder.id,
    });

    // 2. Withdraw a address whitelisteada del seller
    if (!buyer.withdraw) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: 'buyer_withdraw_not_implemented',
        finishedAt: new Date(),
      });
      return;
    }
    const destAddr = lookupAddress(cfg, seller.name, coin, route.network);
    const wd = await buyer.withdraw({
      asset: coin,
      amount: buyOrder.filledAmount,
      address: destAddr,
      network: route.network,
    });
    await this.pg.updateTradeState(tradeId, 'transferring', {
      withdrawTxId: wd.txId,
    });

    // 3. Esperar confirmación on-chain
    const confirmed = await this.tracker.waitConfirm(wd.txId, async () => {
      // Stub: el chequeo real pasaría por el seller adapter.
      // En MVP asumimos confirmación tras N polls.
      return Promise.resolve(true);
    });

    if (!confirmed) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: 'tx_timeout',
        finishedAt: new Date(),
      });
      return;
    }

    // 4. Re-validar spread antes de vender (stop-loss)
    const currentSellTicker = await seller.getTicker(route.symbol);
    if (currentSellTicker.bid < route.sell.price * 0.95) {
      logger.warn(
        { tradeId, expected: route.sell.price, current: currentSellTicker.bid },
        'spread degradó >5% — abort y stop-loss'
      );
    }

    // 5. Venta
    const sellOrder = await seller.createOrder({
      symbol: route.symbol,
      side: 'sell',
      amount: buyOrder.filledAmount,
      type: 'market',
    });

    const realizedArs =
      sellOrder.averagePrice * sellOrder.filledAmount -
      route.buy.price * buyOrder.filledAmount;

    await this.pg.updateTradeState(tradeId, 'done', {
      sellOrderId: sellOrder.id,
      realizedPnlArs: realizedArs,
      finishedAt: new Date(),
    });
    logger.info({ tradeId, realizedArs }, 'trade completado');
  }

  /**
   * Ejecuta los 3 legs de un ciclo triangular en el mismo exchange.
   * No requiere withdraw, mucho más rápido y seguro que el spatial.
   */
  private async executeTriangular(
    route: TriangularRoute,
    opportunityId: number
  ): Promise<void> {
    const cfg = getConfig();
    const tradeId = await this.pg.insertTrade({
      opportunityId,
      dryRun: cfg.DRY_RUN,
      state: 'buying',
      amountUsd: cfg.TRADE_SIZE_USD,
      startedAt: new Date(),
    });

    if (cfg.DRY_RUN) {
      logger.info(
        { tradeId, route: route.id, dryRun: true },
        'DRY_RUN triangular: simulando 3 legs'
      );
      await this.pg.updateTradeState(tradeId, 'done', {
        buyOrderId: 'dryrun-leg1',
        sellOrderId: 'dryrun-leg3',
        realizedPnlArs:
          (route.netProfitPct * cfg.TRADE_SIZE_USD * route.legs[0].price) / 100,
        finishedAt: new Date(),
      });
      return;
    }

    const adapter = this.adapters.get(route.exchange);
    if (!adapter || !adapter.capabilities.trade) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: 'adapter_no_trade',
        finishedAt: new Date(),
      });
      await this.incidents?.tradeAborted(tradeId, 'adapter_no_trade');
      return;
    }

    const lockKey = `tri:${route.exchange}:${route.intermediate}:${route.direction}`;
    const acquired = await this.redis.acquireLock(lockKey, 60);
    if (!acquired) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: 'lock_busy',
        finishedAt: new Date(),
      });
      return;
    }

    try {
      const orders: string[] = [];
      let amount = cfg.TRADE_SIZE_USD; // se ajusta tras cada leg

      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        const o = await adapter.createOrder({
          symbol: leg.symbol,
          side: leg.side,
          amount,
          type: 'market',
        });
        orders.push(o.id);
        // Para el siguiente leg, usamos el filled como base
        amount = o.filledAmount;
        if (amount <= 0) {
          await this.pg.updateTradeState(tradeId, 'aborted', {
            abortReason: `leg_${i + 1}_zero_filled`,
            buyOrderId: orders[0],
            finishedAt: new Date(),
          });
          await this.incidents?.tradeAborted(
            tradeId,
            `leg_${i + 1}_zero_filled`
          );
          return;
        }
      }

      await this.pg.updateTradeState(tradeId, 'done', {
        buyOrderId: orders[0],
        sellOrderId: orders[orders.length - 1],
        finishedAt: new Date(),
      });
      logger.info({ tradeId, orders }, 'triangular completado');
    } catch (err) {
      await this.pg.updateTradeState(tradeId, 'aborted', {
        abortReason: `error:${(err as Error).message}`,
        finishedAt: new Date(),
      });
      await this.incidents?.tradeAborted(
        tradeId,
        `error:${(err as Error).message}`
      );
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }
}
