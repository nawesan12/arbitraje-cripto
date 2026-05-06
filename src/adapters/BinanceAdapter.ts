import { CcxtAdapter } from './CcxtAdapter.js';

export class BinanceAdapter extends CcxtAdapter {
  constructor(apiKey: string, secret: string) {
    super({
      name: 'binance',
      exchangeId: 'binance',
      apiKey,
      secret,
      capabilities: {
        trade: true,
        withdraw: true,
        deposit: true,
        networks: ['TRC20', 'ERC20', 'BSC'],
        hasNativeTicker: true,
      },
    });
  }
}
