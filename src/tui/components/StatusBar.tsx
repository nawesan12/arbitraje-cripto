import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  dryRun: boolean;
  paused: boolean;
  symbols: string[];
  adapters: number;
  lastTickAt: Date | null;
}

export function StatusBar({
  dryRun,
  paused,
  symbols,
  adapters,
  lastTickAt,
}: Props) {
  const last = lastTickAt
    ? lastTickAt.toISOString().slice(11, 19)
    : '--:--:--';
  return (
    <Box borderStyle="round" paddingX={1} flexDirection="row" gap={2}>
      <Text bold color="cyan">
        OmniArbitraje-AR
      </Text>
      <Text color={dryRun ? 'green' : 'red'}>
        DRY_RUN: {dryRun ? 'ON' : 'OFF'}
      </Text>
      <Text color={paused ? 'yellow' : 'green'}>
        scanner: {paused ? 'paused' : 'running'}
      </Text>
      <Text>símbolos: {symbols.join(',')}</Text>
      <Text>adapters: {adapters}</Text>
      <Text dimColor>último tick: {last}</Text>
    </Box>
  );
}
