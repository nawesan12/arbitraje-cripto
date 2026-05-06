import type {
  Ticker,
  OrderRequest,
  OrderResult,
  WithdrawRequest,
} from './index.js';

export interface ExchangeCapabilities {
  trade: boolean;
  withdraw: boolean;
  deposit: boolean;
  networks: string[];
  /** Si false, se usa CriptoYa como fuente de ticker para este exchange */
  hasNativeTicker: boolean;
}

export interface ExchangeFees {
  /** % por orden taker (ej: 0.1 = 0.1%) */
  takerPct: number;
  /** % por orden maker */
  makerPct: number;
  /**
   * Fee on-chain por red. Key = nombre de red (TRC20, ERC20, BSC).
   * Value = unidades del asset (ej: 1.0 = 1 USDT). Si la red no está cargada,
   * se cae al DEFAULT_ONCHAIN_FEE_USD del .env.
   */
  withdrawByNetwork: Record<string, number>;
  /** Fuente del valor: 'native' = consultado al exchange, 'hardcoded' = override del adapter, 'default' = .env */
  source: 'native' | 'hardcoded' | 'default';
}

export interface IExchange {
  readonly name: string;
  readonly capabilities: ExchangeCapabilities;

  getTicker(symbol: string): Promise<Ticker>;
  getBalance(asset: string): Promise<number>;
  createOrder(opts: OrderRequest): Promise<OrderResult>;

  withdraw?(opts: WithdrawRequest): Promise<{ txId: string }>;
  getDepositAddress?(asset: string, network: string): Promise<string>;

  /** Health check: que sea true significa que el adapter puede consultar tickers */
  testConnection(): Promise<boolean>;

  /** Devuelve las fees efectivas. Llamado al arrancar y cacheado por FeeRegistry. */
  loadFees(symbol: string): Promise<ExchangeFees>;
}
