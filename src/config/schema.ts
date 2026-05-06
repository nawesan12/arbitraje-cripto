import { z } from 'zod';

const boolStr = z
  .string()
  .transform((v) => v.toLowerCase() === 'true')
  .pipe(z.boolean());

const numStr = z.string().transform((v) => Number(v)).pipe(z.number());

const csvStr = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

export const ConfigSchema = z.object({
  // Modo
  DRY_RUN: boolStr.default('true'),
  MIN_NET_PROFIT_PCT: numStr.default('1.5'),
  TRADE_SIZE_USD: numStr.default('50'),
  SCAN_INTERVAL_MS: numStr.default('15000'),
  COOLDOWN_PER_PAIR_MS: numStr.default('300000'),

  // Pares y exchanges
  SYMBOLS: csvStr.default('USDT/ARS'),
  ENABLED_EXCHANGES: csvStr.default(
    'binance,bybit,okx,bitso,fiwind,satoshitango,belo'
  ),

  TRIANGULAR_ENABLED: boolStr.default('true'),
  TRIANGULAR_VIA: z.string().default('USDT'),
  TRIANGULAR_INTERMEDIATES: csvStr.default('BTC,USDC,ETH'),
  TRIANGULAR_FIAT: z.string().default('ARS'),

  // Redes
  DEFAULT_NETWORK: z.string().default('TRC20'),
  ALLOW_ERC20: boolStr.default('false'),

  // Whitelist (todas opcionales; el RiskGuard valida en runtime)
  ADDR_BINANCE_USDT_TRC20: z.string().default(''),
  ADDR_BYBIT_USDT_TRC20: z.string().default(''),
  ADDR_OKX_USDT_TRC20: z.string().default(''),
  ADDR_BITSO_USDT_TRC20: z.string().default(''),
  ADDR_FIWIND_USDT_TRC20: z.string().default(''),
  ADDR_SATOSHITANGO_USDT_TRC20: z.string().default(''),
  ADDR_BELO_USDT_TRC20: z.string().default(''),

  // Keys (opcionales)
  BINANCE_API_KEY: z.string().default(''),
  BINANCE_API_SECRET: z.string().default(''),
  BYBIT_API_KEY: z.string().default(''),
  BYBIT_API_SECRET: z.string().default(''),
  OKX_API_KEY: z.string().default(''),
  OKX_API_SECRET: z.string().default(''),
  OKX_API_PASSPHRASE: z.string().default(''),
  BITSO_API_KEY: z.string().default(''),
  BITSO_API_SECRET: z.string().default(''),
  FIWIND_API_KEY: z.string().default(''),
  FIWIND_API_SECRET: z.string().default(''),
  SATOSHITANGO_API_KEY: z.string().default(''),
  SATOSHITANGO_API_SECRET: z.string().default(''),
  BELO_API_KEY: z.string().default(''),
  BELO_API_SECRET: z.string().default(''),

  // CriptoYa
  CRIPTOYA_VOLUME: numStr.default('0.1'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),
  TELEGRAM_ENABLE_COMMANDS: boolStr.default('true'),

  // Infra
  REDIS_URL: z.string().default('redis://localhost:6379'),
  POSTGRES_URL: z
    .string()
    .default('postgres://omni:omni@localhost:5432/omniarb'),

  // Fees
  DEFAULT_TAKER_FEE_PCT: numStr.default('0.1'),
  DEFAULT_ONCHAIN_FEE_USD: numStr.default('1.5'),
  BANK_SPREAD_PCT: numStr.default('0.5'),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_FILE: z.string().default('./logs/omniarb.log'),
});

export type Config = z.infer<typeof ConfigSchema>;
