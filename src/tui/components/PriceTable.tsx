import React from 'react';
import { Box, Text } from 'ink';
import type { Ticker } from '../../types/index.js';

interface Props {
  tickers: Ticker[];
}

export function PriceTable({ tickers }: Props) {
  if (tickers.length === 0) {
    return <Text dimColor>(sin precios todavía)</Text>;
  }

  const grouped = new Map<string, Ticker[]>();
  for (const t of tickers) {
    const arr = grouped.get(t.symbol) ?? [];
    arr.push(t);
    grouped.set(t.symbol, arr);
  }

  return (
    <Box flexDirection="column">
      {[...grouped.entries()].map(([symbol, list]) => {
        const sorted = [...list].sort((a, b) => a.ask - b.ask);
        const minAsk = Math.min(...sorted.map((t) => t.ask));
        const maxBid = Math.max(...sorted.map((t) => t.bid));
        return (
          <Box key={symbol} flexDirection="column" marginBottom={1}>
            <Text bold underline>
              {symbol}
            </Text>
            <Box flexDirection="row">
              <Box width={20}>
                <Text bold>exchange</Text>
              </Box>
              <Box width={14}>
                <Text bold>bid</Text>
              </Box>
              <Box width={14}>
                <Text bold>ask</Text>
              </Box>
              <Box width={14}>
                <Text bold>spread%</Text>
              </Box>
            </Box>
            {sorted.map((t) => {
              const spread = ((t.ask - t.bid) / t.bid) * 100;
              const isMinAsk = t.ask === minAsk;
              const isMaxBid = t.bid === maxBid;
              return (
                <Box key={`${t.exchange}-${t.symbol}`} flexDirection="row">
                  <Box width={20}>
                    <Text>{t.exchange}</Text>
                  </Box>
                  <Box width={14}>
                    <Text color={isMaxBid ? 'green' : undefined}>
                      {t.bid.toFixed(2)}
                    </Text>
                  </Box>
                  <Box width={14}>
                    <Text color={isMinAsk ? 'green' : undefined}>
                      {t.ask.toFixed(2)}
                    </Text>
                  </Box>
                  <Box width={14}>
                    <Text dimColor>{spread.toFixed(3)}%</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
