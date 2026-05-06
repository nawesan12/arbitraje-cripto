import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { getConfig } from '../../config/index.js';
import type { IExchange } from '../../types/exchange.js';
import type { FeeRegistry } from '../../services/FeeRegistry.js';

interface Props {
  adapters: IExchange[];
  fees: FeeRegistry;
}

interface Status {
  name: string;
  hasKeys: boolean;
  capabilities: string;
  reachable: 'pending' | 'ok' | 'fail';
}

function maskKey(k: string): string {
  if (!k) return '(vacía)';
  if (k.length <= 8) return '•'.repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function Config({ adapters, fees }: Props) {
  const cfg = getConfig();
  const [statuses, setStatuses] = useState<Status[]>(
    adapters.map((a) => ({
      name: a.name,
      hasKeys: hasKeysFor(a.name, cfg),
      capabilities: capsLabel(a),
      reachable: 'pending',
    }))
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      adapters.map(async (a) => {
        const ok = await a.testConnection().catch(() => false);
        return [a.name, ok] as const;
      })
    ).then((results) => {
      if (cancelled) return;
      setStatuses((prev) =>
        prev.map((s) => {
          const r = results.find(([n]) => n === s.name);
          return r ? { ...s, reachable: r[1] ? 'ok' : 'fail' } : s;
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [adapters]);

  return (
    <Box flexDirection="column">
      <Text bold underline>
        Estado de adapters y keys (.env)
      </Text>
      <Box marginTop={1} flexDirection="row">
        <Box width={16}>
          <Text bold>exchange</Text>
        </Box>
        <Box width={14}>
          <Text bold>keys</Text>
        </Box>
        <Box width={14}>
          <Text bold>conexión</Text>
        </Box>
        <Box width={32}>
          <Text bold>capabilities</Text>
        </Box>
      </Box>
      {statuses.map((s) => (
        <Box key={s.name} flexDirection="row">
          <Box width={16}>
            <Text>{s.name}</Text>
          </Box>
          <Box width={14}>
            <Text color={s.hasKeys ? 'green' : 'red'}>
              {s.hasKeys ? 'cargadas' : 'faltan'}
            </Text>
          </Box>
          <Box width={14}>
            <Text
              color={
                s.reachable === 'ok'
                  ? 'green'
                  : s.reachable === 'fail'
                    ? 'red'
                    : 'yellow'
              }
            >
              {s.reachable}
            </Text>
          </Box>
          <Box width={32}>
            <Text dimColor>{s.capabilities}</Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text bold underline>Fees efectivas (USDT)</Text>
        <Box flexDirection="row">
          <Box width={16}><Text bold>exchange</Text></Box>
          <Box width={10}><Text bold>taker%</Text></Box>
          <Box width={10}><Text bold>maker%</Text></Box>
          <Box width={20}><Text bold>withdraw (TRC20)</Text></Box>
          <Box width={12}><Text bold>fuente</Text></Box>
        </Box>
        {adapters.map((a) => {
          const wd = fees.withdrawFeeAsset(a.name, 'TRC20');
          return (
            <Box key={`fee-${a.name}`} flexDirection="row">
              <Box width={16}><Text>{a.name}</Text></Box>
              <Box width={10}><Text>{fees.takerPct(a.name).toFixed(3)}</Text></Box>
              <Box width={10}><Text>{fees.makerPct(a.name).toFixed(3)}</Text></Box>
              <Box width={20}>
                <Text>{wd === null ? '(default)' : `${wd} USDT`}</Text>
              </Box>
              <Box width={12}>
                <Text
                  color={
                    fees.source(a.name) === 'native'
                      ? 'green'
                      : fees.source(a.name) === 'hardcoded'
                        ? 'cyan'
                        : 'yellow'
                  }
                >
                  {fees.source(a.name)}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Keys cargadas (mascaradas)</Text>
        <Text dimColor>BINANCE_API_KEY: {maskKey(cfg.BINANCE_API_KEY)}</Text>
        <Text dimColor>BYBIT_API_KEY: {maskKey(cfg.BYBIT_API_KEY)}</Text>
        <Text dimColor>OKX_API_KEY: {maskKey(cfg.OKX_API_KEY)}</Text>
        <Text dimColor>BITSO_API_KEY: {maskKey(cfg.BITSO_API_KEY)}</Text>
        <Text dimColor>FIWIND_API_KEY: {maskKey(cfg.FIWIND_API_KEY)}</Text>
        <Text dimColor>SATOSHITANGO_API_KEY: {maskKey(cfg.SATOSHITANGO_API_KEY)}</Text>
        <Text dimColor>BELO_API_KEY: {maskKey(cfg.BELO_API_KEY)}</Text>
        <Text dimColor>TELEGRAM_BOT_TOKEN: {maskKey(cfg.TELEGRAM_BOT_TOKEN)}</Text>
      </Box>
    </Box>
  );
}

function hasKeysFor(name: string, cfg: ReturnType<typeof getConfig>): boolean {
  const map: Record<string, [string, string]> = {
    binance: [cfg.BINANCE_API_KEY, cfg.BINANCE_API_SECRET],
    bybit: [cfg.BYBIT_API_KEY, cfg.BYBIT_API_SECRET],
    okx: [cfg.OKX_API_KEY, cfg.OKX_API_SECRET],
    bitso: [cfg.BITSO_API_KEY, cfg.BITSO_API_SECRET],
    fiwind: [cfg.FIWIND_API_KEY, cfg.FIWIND_API_SECRET],
    satoshitango: [cfg.SATOSHITANGO_API_KEY, cfg.SATOSHITANGO_API_SECRET],
    belo: [cfg.BELO_API_KEY, cfg.BELO_API_SECRET],
  };
  const k = map[name];
  return Boolean(k?.[0] && k?.[1]);
}

function capsLabel(a: IExchange): string {
  const c = a.capabilities;
  const flags = [
    c.trade ? 'trade' : '-',
    c.withdraw ? 'withdraw' : '-',
    c.deposit ? 'deposit' : '-',
  ].join('|');
  return `${flags} • nets:${c.networks.join(',') || '-'}`;
}
