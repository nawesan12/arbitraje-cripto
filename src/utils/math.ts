export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export function safeDiv(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(b) || b === 0) return fallback;
  return a / b;
}

export function applyFeePct(value: number, feePct: number): number {
  return value * (1 - feePct / 100);
}

/** Genera un id corto random — para Routes y Opportunities en memoria */
export function shortId(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}${prefix ? '_' : ''}${t}${r}`;
}
