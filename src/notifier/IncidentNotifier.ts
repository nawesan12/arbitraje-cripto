import { logger } from '../utils/logger.js';
import type { TelegramNotifier } from './TelegramNotifier.js';

/**
 * Centraliza alertas operativas críticas y las dispara a Telegram con
 * de-duplicación por clave (no spam si el mismo error se repite).
 *
 * Cada incidente se silencia por COOLDOWN_MS si ya se notificó recientemente.
 */
export class IncidentNotifier {
  private lastSent = new Map<string, number>();
  private static COOLDOWN_MS = 5 * 60_000;

  constructor(private telegram: TelegramNotifier) {}

  private shouldSend(key: string): boolean {
    const now = Date.now();
    const last = this.lastSent.get(key) ?? 0;
    if (now - last < IncidentNotifier.COOLDOWN_MS) return false;
    this.lastSent.set(key, now);
    return true;
  }

  async adapterFailure(name: string, err: Error | string): Promise<void> {
    const msg = typeof err === 'string' ? err : err.message;
    const key = `adapter:${name}`;
    if (!this.shouldSend(key)) return;
    logger.error({ adapter: name, err: msg }, 'incident adapter failure');
    await this.telegram.send(
      `⚠️ <b>Adapter ${name} falla</b>\n<code>${escapeHtml(msg)}</code>`
    );
  }

  async dbDisconnected(err: Error | string): Promise<void> {
    const msg = typeof err === 'string' ? err : err.message;
    if (!this.shouldSend('db')) return;
    logger.error({ err: msg }, 'incident db');
    await this.telegram.send(
      `🔥 <b>Postgres desconectado</b>\n<code>${escapeHtml(msg)}</code>`
    );
  }

  async redisDisconnected(err: Error | string): Promise<void> {
    const msg = typeof err === 'string' ? err : err.message;
    if (!this.shouldSend('redis')) return;
    logger.error({ err: msg }, 'incident redis');
    await this.telegram.send(
      `🔥 <b>Redis desconectado</b>\n<code>${escapeHtml(msg)}</code>`
    );
  }

  async orderRejected(exchange: string, err: Error | string): Promise<void> {
    const msg = typeof err === 'string' ? err : err.message;
    const key = `order:${exchange}`;
    if (!this.shouldSend(key)) return;
    logger.error({ exchange, err: msg }, 'incident order rejected');
    await this.telegram.send(
      `❌ <b>Orden rechazada en ${exchange}</b>\n<code>${escapeHtml(msg)}</code>`
    );
  }

  async tradeAborted(tradeId: number, reason: string): Promise<void> {
    if (!this.shouldSend(`trade:${tradeId}`)) return;
    logger.warn({ tradeId, reason }, 'incident trade aborted');
    await this.telegram.send(
      `🛑 <b>Trade #${tradeId} abortado</b>\nRazón: <code>${escapeHtml(reason)}</code>`
    );
  }

  async generic(title: string, err: Error | string): Promise<void> {
    const msg = typeof err === 'string' ? err : err.message;
    if (!this.shouldSend(`generic:${title}`)) return;
    await this.telegram.send(
      `⚠️ <b>${title}</b>\n<code>${escapeHtml(msg)}</code>`
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
