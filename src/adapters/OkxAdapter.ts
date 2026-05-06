import { CcxtAdapter } from './CcxtAdapter.js';

export class OkxAdapter extends CcxtAdapter {
  constructor(apiKey: string, secret: string, passphrase: string) {
    super({
      name: 'okx',
      exchangeId: 'okx',
      apiKey,
      secret,
      password: passphrase,
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
