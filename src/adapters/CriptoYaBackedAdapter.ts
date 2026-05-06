import { BaseAdapter } from './BaseAdapter.js';
import { CriptoYaService } from '../services/CriptoYaService.js';
import type { ExchangeCapabilities } from '../types/exchange.js';
import type {
  OrderRequest,
  OrderResult,
  Ticker,
} from '../types/index.js';

/**
 * Adapter de fallback para exchanges argentinos cuya API privada no es estable
 * o no está pública (Fiwind, SatoshiTango, Belo, Weex). Usa CriptoYa como
 * fuente de tickers y stubea los métodos de trading hasta que el usuario
 * configure las keys reales.
 *
 * Las subclases pueden sobrescribir cualquier método cuando dispongan de
 * documentación oficial de la API.
 */
export class CriptoYaBackedAdapter extends BaseAdapter {
  readonly name: string;
  readonly capabilities: ExchangeCapabilities;
  private criptoYa = new CriptoYaService();
  private criptoYaKey: string;

  constructor(opts: {
    name: string;
    criptoYaKey: string;
    capabilities: ExchangeCapabilities;
  }) {
    super();
    this.name = opts.name;
    this.criptoYaKey = opts.criptoYaKey;
    this.capabilities = opts.capabilities;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const all = await this.criptoYa.fetchTickers(symbol);
    const match = all.find(
      (t) => t.exchange.toLowerCase() === this.criptoYaKey.toLowerCase()
    );
    if (!match) {
      throw new Error(
        `${this.name} no aparece en CriptoYa (${this.criptoYaKey}) para ${symbol}`
      );
    }
    return { ...match.ticker, exchange: this.name };
  }

  async getBalance(_asset: string): Promise<number> {
    return 0;
  }

  async createOrder(_opts: OrderRequest): Promise<OrderResult> {
    throw new Error(
      `${this.name}: createOrder no implementado (capabilities.trade=${this.capabilities.trade})`
    );
  }
}
