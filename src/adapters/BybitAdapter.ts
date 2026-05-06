import { CcxtAdapter } from './CcxtAdapter.js';

export class BybitAdapter extends CcxtAdapter {
  constructor(apiKey: string, secret: string) {
    super({
      name: 'bybit',
      exchangeId: 'bybit',
      apiKey,
      secret,
      capabilities: {
        trade: true,
        withdraw: true,
        deposit: true,
        networks: ['TRC20', 'ERC20'],
        hasNativeTicker: true,
      },
    });
  }
}
