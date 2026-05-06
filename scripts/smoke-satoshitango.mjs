// Smoke test del SatoshiTangoAdapter (lectura pública).
import 'dotenv/config';
import { SatoshiTangoAdapter } from '../src/adapters/SatoshiTangoAdapter.ts';

const a = new SatoshiTangoAdapter();
const t = await a.getTicker('USDT/ARS');
console.log('ticker:', t);
console.log('spread interno %:', (((t.ask - t.bid) / t.bid) * 100).toFixed(3));
console.log('capabilities:', a.capabilities);
