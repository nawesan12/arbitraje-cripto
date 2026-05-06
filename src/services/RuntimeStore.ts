import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const FILE = path.resolve(process.cwd(), 'runtime-overrides.json');

export interface RuntimeOverrides {
  apiKeys: Partial<Record<string, { apiKey: string; secret: string; passphrase?: string }>>;
  addresses: Partial<Record<string, string>>; // key: ADDR_BINANCE_USDT_TRC20 → value
  scalars: Partial<Record<string, string>>; // any other override (threshold, trade_size)
}

const EMPTY: RuntimeOverrides = { apiKeys: {}, addresses: {}, scalars: {} };

/**
 * Persistencia en archivo plano JSON (gitignored) para overrides en runtime
 * editables desde el bot de Telegram. Se mergea con .env al arrancar.
 *
 * Decisión de diseño: NO mutamos .env desde el bot. .env queda como source of
 * truth para deploy / docker-compose; runtime-overrides.json es solo para
 * cambios live durante la sesión.
 */
export class RuntimeStore {
  private data: RuntimeOverrides = structuredClone(EMPTY);

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      const parsed = JSON.parse(raw) as RuntimeOverrides;
      this.data = {
        apiKeys: parsed.apiKeys ?? {},
        addresses: parsed.addresses ?? {},
        scalars: parsed.scalars ?? {},
      };
      logger.info({ file: FILE }, 'runtime overrides cargadas');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('sin runtime-overrides.json, partimos en blanco');
      } else {
        logger.warn(
          { err: (err as Error).message },
          'no pude leer runtime-overrides.json'
        );
      }
    }
  }

  private async persist(): Promise<void> {
    await fs.writeFile(FILE, JSON.stringify(this.data, null, 2), {
      mode: 0o600,
    });
  }

  setApiKey(
    exchange: string,
    apiKey: string,
    secret: string,
    passphrase?: string
  ): Promise<void> {
    this.data.apiKeys[exchange.toLowerCase()] = { apiKey, secret, passphrase };
    return this.persist();
  }

  getApiKey(exchange: string):
    | { apiKey: string; secret: string; passphrase?: string }
    | undefined {
    return this.data.apiKeys[exchange.toLowerCase()];
  }

  removeApiKey(exchange: string): Promise<void> {
    delete this.data.apiKeys[exchange.toLowerCase()];
    return this.persist();
  }

  setAddress(envKey: string, address: string): Promise<void> {
    this.data.addresses[envKey.toUpperCase()] = address;
    return this.persist();
  }

  getAddress(envKey: string): string | undefined {
    return this.data.addresses[envKey.toUpperCase()];
  }

  removeAddress(envKey: string): Promise<void> {
    delete this.data.addresses[envKey.toUpperCase()];
    return this.persist();
  }

  setScalar(key: string, value: string): Promise<void> {
    this.data.scalars[key] = value;
    return this.persist();
  }

  getScalar(key: string): string | undefined {
    return this.data.scalars[key];
  }

  snapshot(): RuntimeOverrides {
    return structuredClone(this.data);
  }
}

export const runtimeStore = new RuntimeStore();
