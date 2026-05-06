import { Redis } from 'ioredis';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Ticker } from '../types/index.js';

const TICKER_TTL_SECONDS = 30;

export class RedisService {
  private client: Redis;

  constructor() {
    const cfg = getConfig();
    this.client = new Redis(cfg.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'redis error');
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    logger.info('redis conectado');
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  private tickerKey(exchange: string, symbol: string): string {
    return `ticker:${exchange}:${symbol}`;
  }

  async cacheTicker(t: Ticker): Promise<void> {
    await this.client.set(
      this.tickerKey(t.exchange, t.symbol),
      JSON.stringify(t),
      'EX',
      TICKER_TTL_SECONDS
    );
  }

  async getTicker(exchange: string, symbol: string): Promise<Ticker | null> {
    const raw = await this.client.get(this.tickerKey(exchange, symbol));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Ticker;
    } catch {
      return null;
    }
  }

  /** Lock distribuido simple. Devuelve true si se adquirió, false si ya existía. */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const ok = await this.client.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return ok === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(`lock:${key}`);
  }

  /** Marca un cooldown por par para evitar reintentos demasiado rápidos */
  async setCooldown(symbol: string, ttlMs: number): Promise<void> {
    await this.client.set(
      `cooldown:${symbol}`,
      '1',
      'PX',
      ttlMs
    );
  }

  async isOnCooldown(symbol: string): Promise<boolean> {
    return (await this.client.exists(`cooldown:${symbol}`)) === 1;
  }
}
