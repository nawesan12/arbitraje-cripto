import 'dotenv/config';
import { ConfigSchema, type Config } from './schema.js';

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en .env:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function getConfig(): Config {
  return cached ?? loadConfig();
}

export type { Config } from './schema.js';
