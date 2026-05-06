import { getConfig } from '../config/index.js';
import { effectiveApiKey } from '../config/effective.js';
import { logger } from '../utils/logger.js';
import type { IExchange } from '../types/exchange.js';

import { BinanceAdapter } from './BinanceAdapter.js';
import { BybitAdapter } from './BybitAdapter.js';
import { OkxAdapter } from './OkxAdapter.js';
import { BitsoAdapter } from './BitsoAdapter.js';
import { FiwindAdapter } from './FiwindAdapter.js';
import { SatoshiTangoAdapter } from './SatoshiTangoAdapter.js';
import { BeloAdapter } from './BeloAdapter.js';

export function buildAdapters(): IExchange[] {
  const cfg = getConfig();
  const enabled = new Set(cfg.ENABLED_EXCHANGES.map((e) => e.toLowerCase()));
  const out: IExchange[] = [];

  if (enabled.has('binance')) {
    const k = effectiveApiKey('binance');
    out.push(new BinanceAdapter(k.apiKey, k.secret));
  }
  if (enabled.has('bybit')) {
    const k = effectiveApiKey('bybit');
    out.push(new BybitAdapter(k.apiKey, k.secret));
  }
  if (enabled.has('okx')) {
    const k = effectiveApiKey('okx');
    out.push(new OkxAdapter(k.apiKey, k.secret, k.passphrase ?? ''));
  }
  if (enabled.has('bitso')) {
    const k = effectiveApiKey('bitso');
    out.push(new BitsoAdapter(k.apiKey, k.secret));
  }
  if (enabled.has('fiwind')) out.push(new FiwindAdapter());
  if (enabled.has('satoshitango')) out.push(new SatoshiTangoAdapter());
  if (enabled.has('belo')) out.push(new BeloAdapter());

  logger.info(
    { adapters: out.map((a) => a.name) },
    `${out.length} adapters cargados`
  );
  return out;
}
