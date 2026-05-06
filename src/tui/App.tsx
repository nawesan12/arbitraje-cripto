import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { StatusBar } from './components/StatusBar.js';
import { Dashboard } from './screens/Dashboard.js';
import { Config } from './screens/Config.js';
import { Opportunities } from './screens/Opportunities.js';
import { Logs } from './screens/Logs.js';
import type { Scanner, ScannerSnapshot } from '../services/Scanner.js';
import type { PostgresService } from '../services/PostgresService.js';
import type { FeeRegistry } from '../services/FeeRegistry.js';
import type { IExchange } from '../types/exchange.js';
import { getConfig } from '../config/index.js';
import { effectiveDryRun } from '../notifier/TelegramCommands.js';

type Tab = 'dashboard' | 'config' | 'opps' | 'logs';

interface Props {
  scanner: Scanner;
  pg: PostgresService;
  adapters: IExchange[];
  fees: FeeRegistry;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '1·Dashboard' },
  { key: 'config', label: '2·Config' },
  { key: 'opps', label: '3·Oportunidades' },
  { key: 'logs', label: '4·Logs' },
];

export function App({ scanner, pg, adapters, fees }: Props) {
  const { exit } = useApp();
  const cfg = getConfig();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [snapshot, setSnapshot] = useState<ScannerSnapshot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onTick = (s: ScannerSnapshot) => setSnapshot(s);
    const onOpp = () => setReloadKey((k) => k + 1);
    scanner.on('tick', onTick);
    scanner.on('opportunity', onOpp);
    return () => {
      scanner.off('tick', onTick);
      scanner.off('opportunity', onOpp);
    };
  }, [scanner]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
    if (input === '1') setTab('dashboard');
    if (input === '2') setTab('config');
    if (input === '3') setTab('opps');
    if (input === '4') setTab('logs');
    if (input === 'p') (scanner.isPaused() ? scanner.resume() : scanner.pause());
  });

  return (
    <Box flexDirection="column">
      <StatusBar
        dryRun={effectiveDryRun()}
        paused={scanner.isPaused()}
        symbols={cfg.SYMBOLS}
        adapters={adapters.length}
        lastTickAt={snapshot?.at ?? null}
      />
      <Box flexDirection="row" gap={2} paddingX={1}>
        {TABS.map((t) => (
          <Text key={t.key} color={t.key === tab ? 'cyan' : undefined} bold={t.key === tab}>
            {t.label}
          </Text>
        ))}
        <Text dimColor>(p:pausar  q:salir)</Text>
      </Box>
      <Box marginTop={1} paddingX={1}>
        {tab === 'dashboard' && (
          <Dashboard
            tickers={snapshot?.tickers ?? []}
            topRoutes={snapshot?.routes ?? []}
          />
        )}
        {tab === 'config' && <Config adapters={adapters} fees={fees} />}
        {tab === 'opps' && <Opportunities pg={pg} reloadKey={reloadKey} />}
        {tab === 'logs' && <Logs />}
      </Box>
    </Box>
  );
}
