import { getConfig } from './index.js';
import { runtimeStore } from '../services/RuntimeStore.js';

/**
 * Lookups efectivos: combinan .env + runtime overrides editados desde Telegram.
 *
 * Regla: runtimeStore tiene prioridad sobre .env. Si runtime devuelve undefined,
 * se usa el valor de .env.
 */

export function effectiveApiKey(exchange: string): {
  apiKey: string;
  secret: string;
  passphrase?: string;
} {
  const cfg = getConfig();
  const ovr = runtimeStore.getApiKey(exchange);
  if (ovr && ovr.apiKey && ovr.secret) return ovr;
  switch (exchange.toLowerCase()) {
    case 'binance':
      return { apiKey: cfg.BINANCE_API_KEY, secret: cfg.BINANCE_API_SECRET };
    case 'bybit':
      return { apiKey: cfg.BYBIT_API_KEY, secret: cfg.BYBIT_API_SECRET };
    case 'okx':
      return {
        apiKey: cfg.OKX_API_KEY,
        secret: cfg.OKX_API_SECRET,
        passphrase: cfg.OKX_API_PASSPHRASE,
      };
    case 'bitso':
      return { apiKey: cfg.BITSO_API_KEY, secret: cfg.BITSO_API_SECRET };
    case 'fiwind':
      return { apiKey: cfg.FIWIND_API_KEY, secret: cfg.FIWIND_API_SECRET };
    case 'satoshitango':
      return {
        apiKey: cfg.SATOSHITANGO_API_KEY,
        secret: cfg.SATOSHITANGO_API_SECRET,
      };
    case 'belo':
      return { apiKey: cfg.BELO_API_KEY, secret: cfg.BELO_API_SECRET };
    default:
      return { apiKey: '', secret: '' };
  }
}

export function effectiveAddress(
  exchange: string,
  asset: string,
  network: string
): string {
  const envKey = `ADDR_${exchange.toUpperCase()}_${asset.toUpperCase()}_${network.toUpperCase()}`;
  const ovr = runtimeStore.getAddress(envKey);
  if (ovr) return ovr;
  const cfg = getConfig() as unknown as Record<string, string | undefined>;
  return cfg[envKey] ?? '';
}

export function listAddressKeys(): string[] {
  // Nombres esperados de envKey según .env.example
  const exchanges = ['BINANCE', 'BYBIT', 'OKX', 'BITSO', 'FIWIND', 'SATOSHITANGO', 'BELO'];
  return exchanges.map((e) => `ADDR_${e}_USDT_TRC20`);
}
