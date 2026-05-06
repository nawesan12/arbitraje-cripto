import { CriptoYaBackedAdapter } from './CriptoYaBackedAdapter.js';

export class BeloAdapter extends CriptoYaBackedAdapter {
  constructor() {
    super({
      name: 'belo',
      criptoYaKey: 'belo',
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
