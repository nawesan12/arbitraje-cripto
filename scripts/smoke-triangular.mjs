// Smoke test del engine triangular con Binance real (lectura solo).
import 'dotenv/config';
import { BinanceAdapter } from '../src/adapters/BinanceAdapter.ts';
import { TriangularEngine } from '../src/core/TriangularEngine.ts';
import { FeeRegistry } from '../src/services/FeeRegistry.ts';

const a = new BinanceAdapter(
  process.env.BINANCE_API_KEY ?? '',
  process.env.BINANCE_API_SECRET ?? ''
);

console.log('Cargando fees nativas...');
const fees = new FeeRegistry([a]);
await fees.hydrate('USDT/ARS');

console.log('Buscando ciclos triangulares en Binance:');
const cycles = await TriangularEngine.findCycles(
  a,
  'ARS',
  'USDT',
  ['BTC', 'USDC', 'ETH'],
  fees
);

for (const c of cycles) {
  console.log(
    `  ${c.intermediate} ${c.direction}: gross=${c.grossProfitPct.toFixed(3)}% net=${c.netProfitPct.toFixed(3)}%`
  );
  for (let i = 0; i < c.legs.length; i++) {
    console.log(
      `    ${i + 1}. ${c.legs[i].side.toUpperCase()} ${c.legs[i].symbol} @ ${c.legs[i].price}`
    );
  }
}

if (cycles.length === 0) {
  console.log('  (ninguno encontrado)');
}

console.log('\nMejor ciclo (top 1):', cycles[0]?.netProfitPct?.toFixed(3) ?? 'n/a', '%');
process.exit(0);
