import { CriptoYaBackedAdapter } from './CriptoYaBackedAdapter.js';

/**
 * Fiwind. La API privada documentada es limitada; usamos CriptoYa para tickers.
 * Cuando el usuario obtenga acceso oficial puede sobrescribir createOrder/withdraw.
 */
export class FiwindAdapter extends CriptoYaBackedAdapter {
  constructor() {
    super({
      name: 'fiwind',
      criptoYaKey: 'fiwind',
      capabilities: {
        trade: false,
        withdraw: false,
        deposit: true,
        networks: ['TRC20'],
        hasNativeTicker: false,
      },
    });
  }
}
