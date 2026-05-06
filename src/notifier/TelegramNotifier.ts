import { Markup, Telegraf } from 'telegraf';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { round } from '../utils/math.js';
import type { AnyRoute, ArbitrageRoute, TriangularRoute } from '../types/index.js';

export class TelegramNotifier {
  readonly bot: Telegraf | null;
  private chatId: string;

  constructor() {
    const cfg = getConfig();
    this.chatId = cfg.TELEGRAM_CHAT_ID;
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      this.bot = null;
      logger.warn('Telegram deshabilitado (falta TELEGRAM_BOT_TOKEN)');
      return;
    }
    this.bot = new Telegraf(cfg.TELEGRAM_BOT_TOKEN);
    if (!cfg.TELEGRAM_CHAT_ID) {
      logger.warn(
        'TELEGRAM_BOT_TOKEN cargado pero falta TELEGRAM_CHAT_ID. ' +
          'Hablale al bot y mandá /chatid para descubrirlo.'
      );
    }
  }

  isEnabled(): boolean {
    return this.bot !== null;
  }

  async sendOpportunity(
    route: AnyRoute,
    autoExecutable: boolean,
    opportunityId: number
  ): Promise<void> {
    if (!this.bot || !this.chatId) return;
    const msg =
      route.kind === 'triangular'
        ? formatTriangular(route, autoExecutable)
        : formatOpportunity(route, autoExecutable);
    const kb = autoExecutable
      ? Markup.inlineKeyboard([
          [Markup.button.callback('⏸ Pausar 30min', 'pause_30')],
          [Markup.button.callback('⏹ Pausar bot', 'pause_all')],
          [Markup.button.callback(`📋 Ver opp #${opportunityId}`, `opp_${opportunityId}`)],
        ])
      : Markup.inlineKeyboard([
          [Markup.button.callback('📊 Status', 'status')],
        ]);
    try {
      await this.bot.telegram.sendMessage(this.chatId, msg, {
        parse_mode: 'HTML',
        ...kb,
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'telegram send fail');
    }
  }

  async send(text: string): Promise<void> {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.telegram.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'telegram send fail');
    }
  }
}

function formatTriangular(r: TriangularRoute, autoExecutable: boolean): string {
  const tag = autoExecutable ? '🚀 <b>AUTO</b>' : '📡 <b>INFO</b>';
  const arrow = (l: { side: string; symbol: string; price: number }) =>
    `${l.side === 'buy' ? '🟢' : '🔴'} ${l.side.toUpperCase()} ${l.symbol} @ ${round(l.price, 4)}`;
  return [
    `${tag} <i>triangular intra-exchange</i>`,
    `<b>🔺 ${r.exchange.toUpperCase()} — ${r.baseFiat} → ${r.via} → ${r.intermediate} → ${r.baseFiat}</b>`,
    `<i>(${r.direction})</i>`,
    ``,
    `1. ${arrow(r.legs[0])}`,
    `2. ${arrow(r.legs[1])}`,
    `3. ${arrow(r.legs[2])}`,
    ``,
    `<b>Profit bruto</b>: ${round(r.grossProfitPct, 3)}%`,
    `<b>Profit neto</b>:  <b>${round(r.netProfitPct, 3)}%</b>`,
    `<b>Duración est.</b>: ~${Math.round(r.estimatedDurationMs / 1000)}s`,
  ].join('\n');
}

function formatOpportunity(r: ArbitrageRoute, autoExecutable: boolean): string {
  const tag = autoExecutable ? '🚀 <b>AUTO</b>' : '📡 <b>INFO</b>';
  const tagDesc = autoExecutable
    ? 'el bot puede ejecutar (si DRY_RUN=false)'
    : 'señal informativa — punta read-only';
  return [
    `${tag} <i>${tagDesc}</i>`,
    `<b>💰 Oportunidad ${r.symbol}</b>`,
    ``,
    `<b>Comprar</b>:  <code>${r.buy.exchange}</code> @ ${round(r.buy.price, 2)}`,
    `<b>Vender</b>:    <code>${r.sell.exchange}</code> @ ${round(r.sell.price, 2)}`,
    `<b>Red</b>:       ${r.network}`,
    ``,
    `<b>Profit bruto</b>: ${round(r.grossProfitPct, 3)}%`,
    `<b>Profit neto</b>:  <b>${round(r.netProfitPct, 3)}%</b>`,
    `<b>Duración est.</b>: ${Math.round(r.estimatedDurationMs / 60000)} min`,
  ].join('\n');
}
