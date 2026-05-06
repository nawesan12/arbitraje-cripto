import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { PostgresService } from '../../services/PostgresService.js';
import type { Opportunity } from '../../types/index.js';

interface Props {
  pg: PostgresService;
  reloadKey: number;
}

const POLL_MS = 3000;

export function Opportunities({ pg, reloadKey }: Props) {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchNow = () => {
      pg.listRecentOpportunities(20)
        .then((rows) => {
          if (cancelled) return;
          setOpps(
            rows.map((r) => ({
              ...r,
              detectedAt:
                r.detectedAt instanceof Date
                  ? r.detectedAt
                  : new Date(r.detectedAt),
            }))
          );
          setError(null);
          setLastFetchAt(new Date());
        })
        .catch((err) => {
          if (cancelled) return;
          setError((err as Error).message);
        });
    };

    fetchNow();
    const id = setInterval(fetchNow, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pg, reloadKey]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2}>
        <Text bold underline>
          Últimas oportunidades
        </Text>
        {lastFetchAt && (
          <Text dimColor>
            (actualizado {lastFetchAt.toISOString().slice(11, 19)})
          </Text>
        )}
      </Box>

      {error && <Text color="red">error: {error}</Text>}
      {!error && opps.length === 0 && <Text dimColor>(sin oportunidades aún)</Text>}

      {opps.length > 0 && (
        <>
          <Box flexDirection="row" marginTop={1}>
            <Box width={10}>
              <Text bold>hora</Text>
            </Box>
            <Box width={12}>
              <Text bold>símbolo</Text>
            </Box>
            <Box width={28}>
              <Text bold>ruta</Text>
            </Box>
            <Box width={12}>
              <Text bold>net %</Text>
            </Box>
            <Box width={12}>
              <Text bold>bruto %</Text>
            </Box>
          </Box>
          {opps.map((o) => (
            <Box
              key={o.id ?? `${o.detectedAt.toISOString()}-${o.buyExchange}`}
              flexDirection="row"
            >
              <Box width={10}>
                <Text>{o.detectedAt.toISOString().slice(11, 19)}</Text>
              </Box>
              <Box width={12}>
                <Text>{o.symbol}</Text>
              </Box>
              <Box width={28}>
                <Text>
                  {o.buyExchange} → {o.sellExchange}
                </Text>
              </Box>
              <Box width={12}>
                <Text color={o.netProfitPct >= 1.5 ? 'green' : 'yellow'}>
                  {o.netProfitPct.toFixed(3)}
                </Text>
              </Box>
              <Box width={12}>
                <Text dimColor>{o.grossProfitPct.toFixed(3)}</Text>
              </Box>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
