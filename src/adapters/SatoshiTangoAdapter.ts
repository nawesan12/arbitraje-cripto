import axios, { AxiosInstance } from 'axios';
import { BaseAdapter } from './BaseAdapter.js';
import type { ExchangeCapabilities } from '../types/exchange.js';
import type { OrderRequest, OrderResult, Ticker } from '../types/index.js';

/**
 * SatoshiTango — adapter REST nativo (solo lectura).
 *
 * Endpoint público que sí responde:
 *   GET https://api.satoshitango.com/v3/ticker/{fiat}
 *   → { data: { ticker: { USDT: { bid, ask, ... }, BTC: {...}, ... } } }
 *
 * SatoshiTango NO expone API pública para crear órdenes ni hacer withdraws,
 * por lo que `capabilities.trade` y `capabilities.withdraw` quedan en false.
 * Solo participa como fuente de precios para detectar oportunidades cruzadas.
 */
export class SatoshiTangoAdapter extends BaseAdapter {
  readonly name = 'satoshitango';
  readonly capabilities: ExchangeCapabilities = {
    trade: false,
    withdraw: false,
    deposit: true,
    networks: ['TRC20'],
    hasNativeTicker: true,
  };

  private http: AxiosInstance;

  constructor() {
    super();
    this.http = axios.create({
      baseURL: 'https://api.satoshitango.com',
      timeout: 8000,
      headers: { 'User-Agent': 'OmniArbitraje-AR/0.1' },
    });
  }

  async getTicker(symbol: string): Promise<Ticker> {
    return this.withRetry('getTicker', async () => {
      const [coin, fiat] = symbol.split('/');
      const { data } = await this.http.get(`/v3/ticker/${fiat.toUpperCase()}`);
      const entry = data?.data?.ticker?.[coin.toUpperCase()];
      if (!entry) {
        throw new Error(`SatoshiTango: ticker ${symbol} no disponible`);
      }
      return {
        exchange: this.name,
        symbol,
        bid: Number(entry.bid),
        ask: Number(entry.ask),
        timestamp: entry.timestamp ? entry.timestamp * 1000 : Date.now(),
      };
    });
  }

  async getBalance(_asset: string): Promise<number> {
    return 0;
  }

  async createOrder(_opts: OrderRequest): Promise<OrderResult> {
    throw new Error(
      'SatoshiTango: createOrder no soportado (sin API pública de trading)'
    );
  }
}
