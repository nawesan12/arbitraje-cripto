import React from 'react';
import { render } from 'ink';
import { loadConfig, getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { buildAdapters } from './adapters/factory.js';
import { RedisService } from './services/RedisService.js';
import { PostgresService } from './services/PostgresService.js';
import { CriptoYaService } from './services/CriptoYaService.js';
import { Scanner } from './services/Scanner.js';
import { FeeRegistry } from './services/FeeRegistry.js';
import { ExecutionService } from './services/ExecutionService.js';
import { Reporter } from './services/Reporter.js';
import { runtimeStore } from './services/RuntimeStore.js';
import { TelegramNotifier } from './notifier/TelegramNotifier.js';
import { IncidentNotifier } from './notifier/IncidentNotifier.js';
import { registerCommands } from './notifier/TelegramCommands.js';
import { App } from './tui/App.js';
import type { IExchange } from './types/exchange.js';

async function main() {
  loadConfig();
  await runtimeStore.load();
  const cfg = getConfig();

  logger.info(
    {
      dryRun: cfg.DRY_RUN,
      symbols: cfg.SYMBOLS,
      enabled: cfg.ENABLED_EXCHANGES,
      headless: process.env.HEADLESS === 'true',
    },
    'OmniArbitraje-AR iniciando'
  );

  // Infra
  const redis = new RedisService();
  await redis.connect();

  const pg = new PostgresService();
  await pg.testConnection();

  const criptoYa = new CriptoYaService();
  const adapters = buildAdapters();
  const adapterMap = new Map<string, IExchange>(
    adapters.map((a) => [a.name, a])
  );

  const fees = new FeeRegistry(adapters);
  await Promise.all(cfg.SYMBOLS.map((s) => fees.hydrate(s)));

  const tg = new TelegramNotifier();
  const incidents = new IncidentNotifier(tg);

  const scanner = new Scanner(adapters, redis, pg, criptoYa, fees);
  const exec = new ExecutionService(adapterMap, pg, redis, incidents);

  scanner.on('error', (err) => {
    incidents.generic('Scanner error', err).catch(() => undefined);
  });

  scanner.on('opportunity', async (route, oppId, autoExecutable) => {
    logger.info(
      { route: route.id, oppId, net: route.netProfitPct, autoExecutable },
      'oportunidad detectada'
    );
    await tg.sendOpportunity(route, autoExecutable, oppId);
    await pg.markOpportunityNotified(oppId);
    if (autoExecutable) {
      exec.execute(route, oppId).catch((err) => {
        logger.error({ err: err.message }, 'execute error');
      });
    }
  });

  scanner.start();

  // Cron interno: reporte diario a las 8:00 AR (UTC-3 → 11:00 UTC)
  const reporter = new Reporter(pg);
  setInterval(async () => {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMins = now.getUTCMinutes();
    if (utcHours === 11 && utcMins < 5) {
      try {
        const r = await reporter.lastN(24);
        await tg.send(reporter.formatHTML(r));
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'reporte diario fail');
      }
    }
  }, 5 * 60_000);

  await tg.send(
    `🟢 <b>OmniArbitraje-AR online</b>\n` +
      `símbolos: ${cfg.SYMBOLS.join(', ')}\n` +
      `adapters: ${adapters.length}\n` +
      `dry_run: ${cfg.DRY_RUN}`
  );

  if (tg.isEnabled() && cfg.TELEGRAM_ENABLE_COMMANDS && tg.bot) {
    registerCommands(tg.bot, scanner, pg, adapters);
    tg.bot.launch().catch((err) => {
      logger.error({ err: err.message }, 'telegram launch error');
    });
  }

  // TUI o headless
  if (process.env.HEADLESS === 'true') {
    logger.info('modo HEADLESS — TUI deshabilitada');
  } else {
    const ink = render(
      React.createElement(App, { scanner, pg, adapters, fees })
    );
    await ink.waitUntilExit();
  }

  // Shutdown
  scanner.stop();
  if (tg.bot) tg.bot.stop('SIGTERM');
  await redis.disconnect();
  await pg.close();
  process.exit(0);
}

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message }, 'uncaughtException');
});


main().catch((err) => {
  logger.fatal({ err: err.message }, 'fatal en main');
  process.exit(1);
});
