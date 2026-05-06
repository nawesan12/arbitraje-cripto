export interface Ticker {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
}

export interface OrderResult {
  id: string;
  status: 'open' | 'filled' | 'partial' | 'rejected';
  filledAmount: number;
  averagePrice: number;
}

export interface WithdrawRequest {
  asset: string;
  amount: number;
  address: string;
  network: string;
}

export interface ArbitrageRoute {
  id: string;
  symbol: string;
  buy: { exchange: string; price: number };
  sell: { exchange: string; price: number };
  network: string;
  fees: {
    takerBuyPct: number;
    takerSellPct: number;
    onChainUsd: number;
    bankSpreadPct: number;
  };
  grossProfitPct: number;
  netProfitPct: number;
  estimatedDurationMs: number;
  kind?: 'spatial';
}

export interface TriangularLeg {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  takerPct: number;
}

export interface TriangularRoute {
  id: string;
  kind: 'triangular';
  exchange: string;
  baseFiat: string; // 'ARS'
  intermediate: string; // 'BTC' | 'USDC' | 'ETH'
  via: string; // 'USDT'
  direction: 'forward' | 'reverse';
  legs: [TriangularLeg, TriangularLeg, TriangularLeg];
  grossProfitPct: number;
  netProfitPct: number;
  estimatedDurationMs: number;
}

export type AnyRoute = ArbitrageRoute | TriangularRoute;

export interface Opportunity {
  id?: number;
  kind: 'spatial' | 'triangular';
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  network: string;
  grossProfitPct: number;
  netProfitPct: number;
  detectedAt: Date;
  /** Para triangular: detalle de los 3 legs */
  legs?: TriangularLeg[];
}

export type TradeState =
  | 'buying'
  | 'transferring'
  | 'selling'
  | 'done'
  | 'aborted';

export interface Trade {
  id?: number;
  opportunityId?: number;
  dryRun: boolean;
  state: TradeState;
  buyOrderId?: string;
  sellOrderId?: string;
  withdrawTxId?: string;
  amountUsd?: number;
  realizedPnlArs?: number;
  abortReason?: string;
  startedAt: Date;
  finishedAt?: Date;
}
