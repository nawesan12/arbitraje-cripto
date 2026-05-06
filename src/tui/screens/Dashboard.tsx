import React from 'react';
import { Box, Text } from 'ink';
import { PriceTable } from '../components/PriceTable.js';
import type { ArbitrageRoute, Ticker } from '../../types/index.js';

interface Props {
  tickers: Ticker[];
  topRoutes: ArbitrageRoute[];
}

export function Dashboard({ tickers, topRoutes }: Props) {
  return (
    <Box flexDirection="column">
      <PriceTable tickers={tickers} />

      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>
          Top rutas (net profit %)
        </Text>
        {topRoutes.length === 0 && <Text dimColor>(ninguna por encima de 0%)</Text>}
        {topRoutes.slice(0, 5).map((r) => (
          <Box key={r.id} flexDirection="row">
            <Box width={20}>
              <Text>
                {r.buy.exchange} → {r.sell.exchange}
              </Text>
            </Box>
            <Box width={12}>
              <Text>{r.symbol}</Text>
            </Box>
            <Box width={14}>
              <Text color={r.netProfitPct > 1.5 ? 'green' : 'yellow'}>
                {r.netProfitPct.toFixed(3)}%
              </Text>
            </Box>
            <Box width={14}>
              <Text dimColor>bruto {r.grossProfitPct.toFixed(3)}%</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
