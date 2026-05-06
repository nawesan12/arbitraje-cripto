import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { getRecentLogs } from '../../utils/logger.js';

export function Logs() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setLines(getRecentLogs(40));
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold underline>
        Logs (últimos 40)
      </Text>
      {lines.map((l, i) => (
        <Text key={i} wrap="truncate">
          {l}
        </Text>
      ))}
    </Box>
  );
}
