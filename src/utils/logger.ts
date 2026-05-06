import pino from 'pino';
import { getConfig } from '../config/index.js';

const config = getConfig();

const ringBuffer: string[] = [];
const RING_MAX = 500;

class MemoryTransport {
  write(line: string) {
    ringBuffer.push(line.trim());
    if (ringBuffer.length > RING_MAX) ringBuffer.shift();
  }
}

const memTransport = new MemoryTransport();

export const logger = pino(
  {
    level: config.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    {
      level: config.LOG_LEVEL,
      stream: pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      }),
    },
    { level: config.LOG_LEVEL, stream: memTransport as never },
  ])
);

/** Devuelve las últimas N líneas en el ring buffer (para la TUI Logs screen) */
export function getRecentLogs(n = 100): string[] {
  return ringBuffer.slice(-n);
}
