import type { Telegraf, Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getConfig } from '../config/index.js';
import { effectiveApiKey, effectiveAddress, listAddressKeys } from '../config/effective.js';
import { logger } from '../utils/logger.js';
import { round } from '../utils/math.js';
import { runtimeStore } from '../services/RuntimeStore.js';
import type { Scanner } from '../services/Scanner.js';
import type { PostgresService } from '../services/PostgresService.js';
import { Reporter } from '../services/Reporter.js';
import type { IExchange } from '../types/exchange.js';

/**
 * Estado mutable del bot. Sobrescribe ciertos valores del .env en runtime.
 */
export interface RuntimeState {
  minProfitPctOverride: number | null;
  dryRunOverride: boolean | null;
  pendingDryRunOff: { code: string; expiresAt: number } | null;
  /** Wizard activo por chat: edición pendiente */
  wizard: Map<number, WizardState>;
}

type WizardState =
  | { kind: 'edit_apikey'; exchange: string; step: 'apiKey' | 'secret' | 'passphrase'; partial: { apiKey?: string; secret?: string; passphrase?: string } }
  | { kind: 'edit_address'; envKey: string }
  | { kind: 'edit_threshold' }
  | { kind: 'edit_trade_size' };

export const runtimeState: RuntimeState = {
  minProfitPctOverride: null,
  dryRunOverride: null,
  pendingDryRunOff: null,
  wizard: new Map(),
};

export function effectiveMinProfit(): number {
  return runtimeState.minProfitPctOverride ?? getConfig().MIN_NET_PROFIT_PCT;
}

export function effectiveDryRun(): boolean {
  return runtimeState.dryRunOverride ?? getConfig().DRY_RUN;
}

const EXCHANGES_WITH_KEYS = ['binance', 'bybit', 'okx', 'bitso', 'fiwind', 'satoshitango', 'belo'];

function maskKey(k: string): string {
  if (!k) return '(vacía)';
  if (k.length <= 8) return '•'.repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function maskAddress(a: string): string {
  if (!a) return '(vacía)';
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

export function registerCommands(
  bot: Telegraf,
  scanner: Scanner,
  pg: PostgresService,
  adapters: IExchange[]
): void {
  const cfg = getConfig();
  const allowedChat = cfg.TELEGRAM_CHAT_ID;

  function isAuthorized(ctx: Context): boolean {
    return !allowedChat || String(ctx.chat?.id) === allowedChat;
  }

  // /chatid disponible siempre, sin auth — para descubrir el id la primera vez
  bot.command('chatid', async (ctx) => {
    const id = ctx.chat?.id;
    await ctx.reply(`Tu chat_id es: ${id}\n\nAgregá esto a tu .env:\nTELEGRAM_CHAT_ID=${id}`);
    logger.info({ chatId: id }, '/chatid solicitado');
  });

  // Middleware de autorización para todo lo demás
  bot.use(async (ctx, next) => {
    if (ctx.message && 'text' in ctx.message && ctx.message.text === '/chatid') {
      return next();
    }
    if (!isAuthorized(ctx)) {
      logger.warn({ chatId: ctx.chat?.id }, 'mensaje rechazado: chat no autorizado');
      return;
    }
    return next();
  });

  // ---------- Menú principal ----------
  const mainMenu = () =>
    Markup.inlineKeyboard([
      [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('💰 Balance', 'balance')],
      [Markup.button.callback('📋 Oportunidades', 'opps'), Markup.button.callback('💸 Fees', 'fees')],
      [Markup.button.callback('⚙️ Settings', 'settings_menu'), Markup.button.callback('🔑 API Keys', 'keys_menu')],
      [Markup.button.callback('📬 Addresses', 'addr_menu'), Markup.button.callback('🚨 DRY_RUN', 'dryrun_menu')],
      [Markup.button.callback(scanner.isPaused() ? '▶️ Resume' : '⏸ Pause', 'toggle_pause')],
    ]);

  bot.start(async (ctx) => {
    await ctx.reply(
      '<b>OmniArbitraje-AR</b>\n\n' +
        'Bot conectado. Tocá una opción del menú o escribí /menu.',
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply('Menú principal:', mainMenu());
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '<b>Comandos disponibles</b>',
        '/menu — menú interactivo',
        '/status — estado del scanner',
        '/pause — pausar scanner',
        '/resume — reanudar scanner',
        '/threshold &lt;n&gt; — % min de profit',
        '/balance — balances por exchange',
        '/dryrun on|off — toggle simulación',
        '/opps — últimas 10 oportunidades',
        '/keys — gestionar API keys',
        '/addresses — gestionar whitelist de addresses',
        '/cancel — cancelar wizard activo',
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  // ---------- Status / Balance / Opps / Fees como acciones de botón ----------
  async function showStatus(ctx: Context): Promise<void> {
    const lines = [
      `🤖 <b>OmniArbitraje-AR</b>`,
      `scanner: ${scanner.isPaused() ? 'pausado' : 'corriendo'}`,
      `dry_run: <b>${effectiveDryRun()}</b>`,
      `min_profit_pct: ${effectiveMinProfit()}`,
      `símbolos: ${cfg.SYMBOLS.join(', ')}`,
      `adapters: ${adapters.map((a) => a.name).join(', ')}`,
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
  }

  async function showBalance(ctx: Context): Promise<void> {
    const lines = ['<b>Balances</b>'];
    for (const a of adapters) {
      try {
        const usdt = await a.getBalance('USDT');
        const ars = await a.getBalance('ARS');
        lines.push(`<code>${a.name}</code>: USDT ${round(usdt, 2)} | ARS ${round(ars, 2)}`);
      } catch (err) {
        lines.push(`<code>${a.name}</code>: error ${(err as Error).message}`);
      }
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
  }

  async function showOpps(ctx: Context): Promise<void> {
    const opps = await pg.listRecentOpportunities(10);
    if (opps.length === 0) {
      await ctx.reply('no hay oportunidades aún', mainMenu());
      return;
    }
    const lines = ['<b>Últimas oportunidades</b>'];
    for (const o of opps) {
      lines.push(
        `${o.detectedAt.toISOString().slice(11, 19)} | ${o.symbol} ${o.buyExchange}→${o.sellExchange} | <b>${round(o.netProfitPct, 2)}%</b>`
      );
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
  }

  async function showFees(ctx: Context): Promise<void> {
    const lines = ['<b>Fees efectivas (USDT)</b>'];
    for (const a of adapters) {
      lines.push(`<code>${a.name}</code>: trade=${a.capabilities.trade} withdraw=${a.capabilities.withdraw}`);
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
  }

  // ---------- Submenú: Settings ----------
  function settingsMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`🎯 Threshold: ${effectiveMinProfit()}%`, 'edit_threshold')],
      [Markup.button.callback(`💵 Trade size: $${cfg.TRADE_SIZE_USD}`, 'edit_trade_size')],
      [Markup.button.callback('⏪ Volver', 'main_menu')],
    ]);
  }

  // ---------- Submenú: Keys ----------
  function keysMenu() {
    const buttons = EXCHANGES_WITH_KEYS.map((ex) => {
      const k = effectiveApiKey(ex);
      const status = k.apiKey ? '✓' : '✗';
      return [Markup.button.callback(`${status} ${ex}`, `key_${ex}`)];
    });
    buttons.push([Markup.button.callback('⏪ Volver', 'main_menu')]);
    return Markup.inlineKeyboard(buttons);
  }

  function keyDetailMenu(ex: string) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Editar', `key_edit_${ex}`)],
      [Markup.button.callback('🗑 Borrar override', `key_del_${ex}`)],
      [Markup.button.callback('⏪ Volver', 'keys_menu')],
    ]);
  }

  // ---------- Submenú: Addresses ----------
  function addressesMenu() {
    const buttons = listAddressKeys().map((k) => {
      const v = effectiveAddress(
        k.split('_')[1],
        k.split('_')[2],
        k.split('_')[3]
      );
      const status = v ? '✓' : '✗';
      const label = k.replace('ADDR_', '').replace('_USDT_TRC20', '');
      return [Markup.button.callback(`${status} ${label}`, `addr_${k}`)];
    });
    buttons.push([Markup.button.callback('⏪ Volver', 'main_menu')]);
    return Markup.inlineKeyboard(buttons);
  }

  function addressDetailMenu(envKey: string) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Editar', `addr_edit_${envKey}`)],
      [Markup.button.callback('🗑 Borrar override', `addr_del_${envKey}`)],
      [Markup.button.callback('⏪ Volver', 'addr_menu')],
    ]);
  }

  // ---------- Submenú: DRY_RUN ----------
  function dryRunMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback(effectiveDryRun() ? '🔓 Desactivar DRY_RUN' : '🛡 Activar DRY_RUN', 'dryrun_toggle')],
      [Markup.button.callback('⏪ Volver', 'main_menu')],
    ]);
  }

  // ---------- Callback handlers (botones) ----------
  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Menú principal:', mainMenu());
  });

  bot.action('status', async (ctx) => {
    await ctx.answerCbQuery();
    await showStatus(ctx);
  });

  bot.action('balance', async (ctx) => {
    await ctx.answerCbQuery('consultando...');
    await showBalance(ctx);
  });

  bot.action('opps', async (ctx) => {
    await ctx.answerCbQuery();
    await showOpps(ctx);
  });

  bot.action('fees', async (ctx) => {
    await ctx.answerCbQuery();
    await showFees(ctx);
  });

  bot.action('settings_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('⚙️ Settings', settingsMenu());
  });

  bot.action('keys_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🔑 API Keys (✓ cargada / ✗ vacía)', keysMenu());
  });

  bot.action('addr_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📬 Addresses (✓ cargada / ✗ vacía)', addressesMenu());
  });

  bot.action('dryrun_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(`DRY_RUN actual: <b>${effectiveDryRun()}</b>`, {
      parse_mode: 'HTML',
      ...dryRunMenu(),
    });
  });

  bot.action('pause_30', async (ctx) => {
    scanner.pause();
    setTimeout(() => {
      if (scanner.isPaused()) {
        scanner.resume();
        bot.telegram.sendMessage(allowedChat, '▶️ Auto-resume tras 30min').catch(() => undefined);
      }
    }, 30 * 60_000);
    await ctx.answerCbQuery('pausado 30min');
    await ctx.reply('⏸ Scanner pausado por 30 minutos. Reanudará solo.');
  });

  bot.action('pause_all', async (ctx) => {
    scanner.pause();
    await ctx.answerCbQuery('pausado');
    await ctx.reply('⏹ Scanner pausado. Usá ▶️ Resume del menú para reanudar.', mainMenu());
  });

  bot.action(/^opp_(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const opps = await pg.listRecentOpportunities(50);
    const o = opps.find((x) => x.id === id);
    if (!o) {
      await ctx.answerCbQuery('opp no encontrada');
      return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(
      [
        `<b>Oportunidad #${id}</b>`,
        `${o.symbol} ${o.buyExchange} → ${o.sellExchange}`,
        `compra: ${round(o.buyPrice, 2)} | venta: ${round(o.sellPrice, 2)}`,
        `bruto: ${round(o.grossProfitPct, 3)}% | neto: <b>${round(o.netProfitPct, 3)}%</b>`,
        `red: ${o.network}`,
        `detectada: ${o.detectedAt.toISOString()}`,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  bot.action('toggle_pause', async (ctx) => {
    if (scanner.isPaused()) scanner.resume();
    else scanner.pause();
    await ctx.answerCbQuery(scanner.isPaused() ? 'pausado' : 'reanudado');
    await showStatus(ctx);
  });

  bot.action('edit_threshold', async (ctx) => {
    await ctx.answerCbQuery();
    runtimeState.wizard.set(ctx.chat!.id, { kind: 'edit_threshold' });
    await ctx.reply('Mandá el nuevo % de profit mínimo (ej: 1.5). /cancel para abortar.');
  });

  bot.action('edit_trade_size', async (ctx) => {
    await ctx.answerCbQuery();
    runtimeState.wizard.set(ctx.chat!.id, { kind: 'edit_trade_size' });
    await ctx.reply('Mandá el nuevo trade size en USD (ej: 50). /cancel para abortar.');
  });

  // Detalle de cada key
  for (const ex of EXCHANGES_WITH_KEYS) {
    bot.action(`key_${ex}`, async (ctx) => {
      await ctx.answerCbQuery();
      const k = effectiveApiKey(ex);
      const ovr = runtimeStore.getApiKey(ex);
      await ctx.reply(
        [
          `<b>${ex}</b>`,
          `apiKey: <code>${maskKey(k.apiKey)}</code>`,
          `secret: <code>${maskKey(k.secret)}</code>`,
          k.passphrase !== undefined ? `passphrase: <code>${maskKey(k.passphrase)}</code>` : null,
          `fuente: ${ovr ? 'runtime override' : '.env'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        { parse_mode: 'HTML', ...keyDetailMenu(ex) }
      );
    });

    bot.action(`key_edit_${ex}`, async (ctx) => {
      await ctx.answerCbQuery();
      runtimeState.wizard.set(ctx.chat!.id, {
        kind: 'edit_apikey',
        exchange: ex,
        step: 'apiKey',
        partial: {},
      });
      await ctx.reply(
        `🔒 Vas a editar las keys de <b>${ex}</b>.\n\n` +
          `Mandá ahora el <b>API KEY</b>. Tu mensaje será borrado al recibirlo. ` +
          `/cancel para abortar.`,
        { parse_mode: 'HTML' }
      );
    });

    bot.action(`key_del_${ex}`, async (ctx) => {
      await ctx.answerCbQuery();
      await runtimeStore.removeApiKey(ex);
      await ctx.reply(
        `🗑 Override de ${ex} eliminado. Volvió al valor del .env.\n` +
          `Reiniciá la app para que el adapter tome el valor nuevo.`,
        keysMenu()
      );
    });
  }

  // Detalle de cada address
  for (const envKey of listAddressKeys()) {
    bot.action(`addr_${envKey}`, async (ctx) => {
      await ctx.answerCbQuery();
      const parts = envKey.split('_');
      const v = effectiveAddress(parts[1], parts[2], parts[3]);
      const ovr = runtimeStore.getAddress(envKey);
      await ctx.reply(
        [
          `<b>${envKey}</b>`,
          `valor: <code>${maskAddress(v)}</code>`,
          `fuente: ${ovr ? 'runtime override' : '.env'}`,
        ].join('\n'),
        { parse_mode: 'HTML', ...addressDetailMenu(envKey) }
      );
    });

    bot.action(`addr_edit_${envKey}`, async (ctx) => {
      await ctx.answerCbQuery();
      runtimeState.wizard.set(ctx.chat!.id, { kind: 'edit_address', envKey });
      await ctx.reply(
        `Mandá la nueva address para <b>${envKey}</b>. ` +
          `Tu mensaje será borrado al recibirlo. /cancel para abortar.`,
        { parse_mode: 'HTML' }
      );
    });

    bot.action(`addr_del_${envKey}`, async (ctx) => {
      await ctx.answerCbQuery();
      await runtimeStore.removeAddress(envKey);
      await ctx.reply(`🗑 Override de ${envKey} eliminado.`, addressesMenu());
    });
  }

  bot.action('dryrun_toggle', async (ctx) => {
    await ctx.answerCbQuery();
    if (effectiveDryRun()) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      runtimeState.pendingDryRunOff = {
        code,
        expiresAt: Date.now() + 60_000,
      };
      await ctx.reply(
        `⚠️ Para DESACTIVAR DRY_RUN respondé en 60s con:\n<code>/confirm ${code}</code>`,
        { parse_mode: 'HTML' }
      );
    } else {
      runtimeState.dryRunOverride = true;
      runtimeState.pendingDryRunOff = null;
      await ctx.reply('🛡 DRY_RUN activado. Trades reales deshabilitados.', mainMenu());
    }
  });

  bot.command('confirm', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    const pending = runtimeState.pendingDryRunOff;
    if (!pending || pending.expiresAt < Date.now()) {
      await ctx.reply('no hay confirmación pendiente');
      return;
    }
    if (arg !== pending.code) {
      await ctx.reply('código incorrecto');
      return;
    }
    runtimeState.dryRunOverride = false;
    runtimeState.pendingDryRunOff = null;
    await ctx.reply('🚨 <b>DRY_RUN DESACTIVADO</b>. Trades reales habilitados.', {
      parse_mode: 'HTML',
    });
    logger.warn('DRY_RUN desactivado vía Telegram');
  });

  // ---------- Comandos clásicos ----------
  bot.command('status', async (ctx) => showStatus(ctx));
  bot.command('balance', async (ctx) => showBalance(ctx));
  bot.command('opps', async (ctx) => showOpps(ctx));
  bot.command('keys', async (ctx) => ctx.reply('🔑 API Keys', keysMenu()));
  bot.command('addresses', async (ctx) => ctx.reply('📬 Addresses', addressesMenu()));
  bot.command('pause', async (ctx) => {
    scanner.pause();
    await ctx.reply('⏸ scanner pausado');
  });
  bot.command('resume', async (ctx) => {
    scanner.resume();
    await ctx.reply('▶️ scanner reanudado');
  });
  bot.command('threshold', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    const n = Number(arg);
    if (!Number.isFinite(n) || n < 0) {
      await ctx.reply('uso: /threshold <numero>');
      return;
    }
    runtimeState.minProfitPctOverride = n;
    await ctx.reply(`✅ min_profit_pct = ${n}`);
  });
  bot.command('dryrun', async (ctx) => {
    const arg = String(ctx.message.text.split(' ')[1] ?? '').toLowerCase();
    if (arg === 'on') {
      runtimeState.dryRunOverride = true;
      await ctx.reply('🛡 DRY_RUN activado');
      return;
    }
    if (arg === 'off') {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      runtimeState.pendingDryRunOff = { code, expiresAt: Date.now() + 60_000 };
      await ctx.reply(`⚠️ Para desactivar DRY_RUN respondé en 60s con: /confirm ${code}`);
      return;
    }
    await ctx.reply(`dry_run actual: ${effectiveDryRun()}`);
  });
  bot.command('report', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    const hours = arg ? Math.min(168, Math.max(1, Number(arg))) : 24;
    const reporter = new Reporter(pg);
    const r = await reporter.lastN(hours);
    await ctx.reply(reporter.formatHTML(r), { parse_mode: 'HTML' });
  });

  bot.command('cancel', async (ctx) => {
    runtimeState.wizard.delete(ctx.chat.id);
    await ctx.reply('wizard cancelado');
  });

  // ---------- Procesamiento de wizard (mensajes de texto plano) ----------
  bot.on('text', async (ctx) => {
    const wiz = runtimeState.wizard.get(ctx.chat.id);
    if (!wiz) return;
    if (ctx.message.text.startsWith('/')) return; // comandos pasan al handler propio

    const value = ctx.message.text.trim();

    // Borramos el mensaje del usuario para reducir exposición de secretos
    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch {
      /* ignorar si el bot no tiene permisos de borrar */
    }

    if (wiz.kind === 'edit_threshold') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        await ctx.reply('valor inválido. Mandá un número (ej: 1.5)');
        return;
      }
      runtimeState.minProfitPctOverride = n;
      runtimeState.wizard.delete(ctx.chat.id);
      await ctx.reply(`✅ threshold = ${n}%`, mainMenu());
      return;
    }

    if (wiz.kind === 'edit_trade_size') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        await ctx.reply('valor inválido');
        return;
      }
      await runtimeStore.setScalar('TRADE_SIZE_USD', String(n));
      runtimeState.wizard.delete(ctx.chat.id);
      await ctx.reply(`✅ trade_size = $${n}\nReiniciá para tomar el cambio.`, mainMenu());
      return;
    }

    if (wiz.kind === 'edit_address') {
      await runtimeStore.setAddress(wiz.envKey, value);
      runtimeState.wizard.delete(ctx.chat.id);
      await ctx.reply(`✅ ${wiz.envKey} actualizada (mensaje borrado).`, addressesMenu());
      logger.info({ envKey: wiz.envKey }, 'address actualizada vía Telegram');
      return;
    }

    if (wiz.kind === 'edit_apikey') {
      const partial = wiz.partial;
      if (wiz.step === 'apiKey') {
        partial.apiKey = value;
        const needsPass = wiz.exchange === 'okx';
        wiz.step = 'secret';
        await ctx.reply(`✓ apiKey recibida. Ahora mandá el <b>SECRET</b>.${needsPass ? ' (después te pediré la passphrase)' : ''}`, { parse_mode: 'HTML' });
        return;
      }
      if (wiz.step === 'secret') {
        partial.secret = value;
        if (wiz.exchange === 'okx') {
          wiz.step = 'passphrase';
          await ctx.reply('✓ secret recibido. Mandá la <b>PASSPHRASE</b>.', { parse_mode: 'HTML' });
          return;
        }
        await runtimeStore.setApiKey(wiz.exchange, partial.apiKey!, partial.secret!);
        runtimeState.wizard.delete(ctx.chat.id);
        await ctx.reply(`✅ Keys de ${wiz.exchange} guardadas. Reiniciá la app para reconectar el adapter.`, keysMenu());
        return;
      }
      if (wiz.step === 'passphrase') {
        partial.passphrase = value;
        await runtimeStore.setApiKey(
          wiz.exchange,
          partial.apiKey!,
          partial.secret!,
          partial.passphrase
        );
        runtimeState.wizard.delete(ctx.chat.id);
        await ctx.reply(`✅ Keys de ${wiz.exchange} guardadas.`, keysMenu());
      }
    }
  });
}
