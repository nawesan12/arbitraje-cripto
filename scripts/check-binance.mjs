// Diagnóstico paso a paso de la API key de Binance.
// Uso: node scripts/check-binance.mjs
// No imprime ninguna credencial completa, solo prefijos/sufijos para confirmar.

import 'dotenv/config';
import crypto from 'node:crypto';

const KEY = process.env.BINANCE_API_KEY ?? '';
const SECRET = process.env.BINANCE_API_SECRET ?? '';
const BASE = 'https://api.binance.com';

function fingerprint(name, v) {
  if (!v) {
    console.log(`  ${name}: VACIA`);
    return;
  }
  console.log(
    `  ${name}: length=${v.length} prefix=${v.slice(0, 4)} suffix=${v.slice(-4)}`
  );
}

console.log('=== Credenciales cargadas desde .env ===');
fingerprint('BINANCE_API_KEY', KEY);
fingerprint('BINANCE_API_SECRET', SECRET);
console.log();

if (!KEY || !SECRET) {
  console.error('Faltan credenciales en .env. Abortando.');
  process.exit(1);
}

console.log('=== 1. /api/v3/ping (público) ===');
{
  const r = await fetch(`${BASE}/api/v3/ping`);
  console.log(`  status: ${r.status}`);
}

console.log('=== 2. /api/v3/time (público — diff con reloj local) ===');
let serverTime = 0;
{
  const r = await fetch(`${BASE}/api/v3/time`);
  const d = await r.json();
  serverTime = d.serverTime;
  console.log(
    `  serverTime: ${serverTime} | local: ${Date.now()} | diff_ms: ${Date.now() - serverTime}`
  );
}

console.log('=== 3. IP saliente (lo que ve internet) ===');
{
  try {
    const r = await fetch('https://api.ipify.org');
    console.log(`  IP saliente: ${(await r.text()).trim()}`);
  } catch (err) {
    console.log(`  no pude resolver IP saliente: ${err.message}`);
  }
}

console.log(
  '=== 4. /api/v3/account (firmado, solo READ) — el que estaba fallando ==='
);
{
  const ts = serverTime || Date.now();
  const query = `timestamp=${ts}&recvWindow=10000`;
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(query)
    .digest('hex');
  const url = `${BASE}/api/v3/account?${query}&signature=${sig}`;
  const r = await fetch(url, { headers: { 'X-MBX-APIKEY': KEY } });
  console.log(`  status: ${r.status}`);
  const text = await r.text();
  if (r.ok) {
    const data = JSON.parse(text);
    console.log(
      `  OK ✓ canTrade=${data.canTrade} canWithdraw=${data.canWithdraw} accountType=${data.accountType}`
    );
    const nz = data.balances.filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    console.log(`  balances no-cero: ${nz.length}`);
    for (const b of nz) console.log(`    ${b.asset}: free=${b.free} locked=${b.locked}`);
  } else {
    console.log(`  body: ${text.slice(0, 300)}`);
    console.log();
    console.log('  Códigos comunes:');
    console.log('    -2014: API-key format inválido (largo o caracteres mal)');
    console.log('    -2015: API-key, IP o permisos inválidos');
    console.log('           → revisá que la IP saliente de arriba esté EXACTA en Binance');
    console.log('           → revisá que la key NO haya sido borrada (Binance la borra si activás permisos sin IP)');
  }
}

console.log('=== 5. /api/v3/ticker/bookTicker?symbol=USDTARS (público) ===');
{
  const r = await fetch(`${BASE}/api/v3/ticker/bookTicker?symbol=USDTARS`);
  const d = await r.json();
  console.log(`  status: ${r.status}`);
  console.log(
    `  USDTARS: bid=${d.bidPrice} bidQty=${d.bidQty} ask=${d.askPrice} askQty=${d.askQty}`
  );
}

console.log('\nListo.');
