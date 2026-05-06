import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 30_000;
const MAX_WAIT_MS = 45 * 60_000;

/**
 * Polling de confirmación de una transferencia on-chain.
 *
 * Stub: la API real depende del exchange origen/destino. Para una primera
 * versión devolvemos true tras un intervalo simulado o cuando un check
 * externo (provisto al constructor) responde true.
 */
export class TransferTracker {
  async waitConfirm(
    txId: string,
    isConfirmed: () => Promise<boolean>
  ): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      try {
        const ok = await isConfirmed();
        if (ok) {
          logger.info({ txId, ms: Date.now() - started }, 'tx confirmada');
          return true;
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message, txId }, 'check confirm fail');
      }
      await sleep(POLL_INTERVAL_MS);
    }
    logger.error({ txId }, 'tx no confirmada en MAX_WAIT_MS');
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
