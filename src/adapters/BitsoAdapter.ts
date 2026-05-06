import axios, { AxiosInstance } from 'axios';
import crypto from 'node:crypto';
import { BaseAdapter } from './BaseAdapter.js';
import type {
  ExchangeCapabilities,
  ExchangeFees,
} from '../types/exchange.js';
import type {
  OrderRequest,
  OrderResult,
  Ticker,
  WithdrawRequest,
} from '../types/index.js';

/**
 * Bitso REST. Docs: https://docs.bitso.com
 * Endpoint público de ticker: GET /v3/ticker/?book=usdt_ars
 * Endpoint privado requiere firma HMAC-SHA256.
 */
export class BitsoAdapter extends BaseAdapter {
  readonly name = 'bitso';
  readonly capabilities: ExchangeCapabilities = {
    trade: true,
    withdraw: true,
    deposit: true,
    networks: ['TRC20', 'ERC20'],
    hasNativeTicker: true,
  };

  private http: AxiosInstance;
  private apiKey: string;
  private secret: string;

  constructor(apiKey: string, secret: string) {
    super();
    this.apiKey = apiKey;
    this.secret = secret;
    this.http = axios.create({
      baseURL: 'https://api.bitso.com',
      timeout: 8000,
    });
  }

  private bookFor(symbol: string): string {
    const [coin, fiat] = symbol.split('/');
    return `${coin.toLowerCase()}_${fiat.toLowerCase()}`;
  }

  private sign(method: string, path: string, body = ''): Record<string, string> {
    const nonce = String(Date.now());
    const data = nonce + method + path + body;
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return {
      Authorization: `Bitso ${this.apiKey}:${nonce}:${signature}`,
    };
  }

  async getTicker(symbol: string): Promise<Ticker> {
    return this.withRetry('getTicker', async () => {
      const { data } = await this.http.get('/v3/ticker/', {
        params: { book: this.bookFor(symbol) },
      });
      const p = data?.payload;
      if (!p) throw new Error('Bitso ticker payload vacío');
      return {
        exchange: this.name,
        symbol,
        bid: Number(p.bid),
        ask: Number(p.ask),
        timestamp: new Date(p.created_at).getTime(),
      };
    });
  }

  async getBalance(asset: string): Promise<number> {
    if (!this.apiKey || !this.secret) return 0;
    return this.withRetry('getBalance', async () => {
      const path = '/v3/balance/';
      const { data } = await this.http.get(path, {
        headers: this.sign('GET', path),
      });
      const balances: Array<{ currency: string; available: string }> =
        data?.payload?.balances ?? [];
      const target = balances.find(
        (b) => b.currency.toLowerCase() === asset.toLowerCase()
      );
      return target ? Number(target.available) : 0;
    });
  }

  async createOrder(opts: OrderRequest): Promise<OrderResult> {
    return this.withRetry('createOrder', async () => {
      const path = '/v3/orders/';
      const body = JSON.stringify({
        book: this.bookFor(opts.symbol),
        side: opts.side,
        type: opts.type ?? 'market',
        major: opts.amount.toString(),
        price: opts.price?.toString(),
      });
      const { data } = await this.http.post(path, body, {
        headers: {
          'Content-Type': 'application/json',
          ...this.sign('POST', path, body),
        },
      });
      const oid = String(data?.payload?.oid ?? '');
      return {
        id: oid,
        status: 'open',
        filledAmount: 0,
        averagePrice: 0,
      };
    });
  }

  async withdraw(opts: WithdrawRequest): Promise<{ txId: string }> {
    return this.withRetry('withdraw', async () => {
      const path = '/v3/crypto_withdrawal/';
      const body = JSON.stringify({
        currency: opts.asset.toLowerCase(),
        amount: opts.amount.toString(),
        address: opts.address,
        network: opts.network.toLowerCase(),
      });
      const { data } = await this.http.post(path, body, {
        headers: {
          'Content-Type': 'application/json',
          ...this.sign('POST', path, body),
        },
      });
      return { txId: String(data?.payload?.wid ?? '') };
    });
  }

  override async loadFees(_symbol: string): Promise<ExchangeFees> {
    // Fees declaradas por Bitso al 2026 (fuente: https://bitso.com/fees).
    // USDT/ARS: maker 0% / taker 0.65% en mercados de stablecoin AR.
    return {
      takerPct: 0.65,
      makerPct: 0.0,
      withdrawByNetwork: {
        TRC20: 1.0,
        ERC20: 9.0,
      },
      source: 'hardcoded',
    };
  }
}
