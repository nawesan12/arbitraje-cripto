import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Ticker } from '../types/index.js';

/**
 * Cliente de la API pública de CriptoYa (https://criptoya.com/api).
 *
 * Endpoint clave: GET https://criptoya.com/api/{coin}/{fiat}/{volume}
 *   → devuelve { exchangeName: { ask, totalAsk, bid, totalBid, time }, ... }
 *
 * Lo usamos como fuente de tickers cruzada para el mercado AR.
 */
export class CriptoYaService {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: 'https://criptoya.com/api',
      timeout: 8000,
      headers: { 'User-Agent': 'OmniArbitraje-AR/0.1' },
    });
  }

  /**
   * Devuelve los tickers de todos los exchanges que reporta CriptoYa para el par dado.
   * Cada ticker se etiqueta con el nombre del exchange tal como lo devuelve la API.
   */
  async fetchTickers(
    symbol: string
  ): Promise<{ exchange: string; ticker: Ticker }[]> {
    const cfg = getConfig();
    const [coin, fiat] = symbol.split('/');
    if (!coin || !fiat) {
      throw new Error(`Símbolo inválido para CriptoYa: ${symbol}`);
    }

    const url = `/${coin.toLowerCase()}/${fiat.toLowerCase()}/${cfg.CRIPTOYA_VOLUME}`;
    try {
      const { data } = await this.http.get<Record<string, RawCriptoYaQuote>>(url);
      const out: { exchange: string; ticker: Ticker }[] = [];
      const now = Date.now();
      for (const [name, q] of Object.entries(data)) {
        if (!q || typeof q !== 'object') continue;
        const ask = pickNumber(q.totalAsk ?? q.ask);
        const bid = pickNumber(q.totalBid ?? q.bid);
        if (!Number.isFinite(ask) || !Number.isFinite(bid)) continue;
        out.push({
          exchange: name,
          ticker: {
            exchange: `criptoya:${name}`,
            symbol,
            bid,
            ask,
            timestamp: q.time ? q.time * 1000 : now,
          },
        });
      }
      return out;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, symbol },
        'CriptoYa fetch falló'
      );
      return [];
    }
  }
}

interface RawCriptoYaQuote {
  ask?: number | string;
  totalAsk?: number | string;
  bid?: number | string;
  totalBid?: number | string;
  time?: number;
}

function pickNumber(v: number | string | undefined): number {
  if (v === undefined || v === null) return NaN;
  return typeof v === 'number' ? v : Number(v);
}
