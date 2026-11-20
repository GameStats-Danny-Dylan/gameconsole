/**
 * Ayudas de color para el dibujo en canvas: transparencia, aclarar/oscurecer
 * y mezclar. Aceptan #rrggbb y rgb()/rgba(); si no entienden el color, lo
 * devuelven igual. Los resultados se guardan (se piden los mismos cada cuadro).
 */
type RGB = [number, number, number];

const cache = new Map<string, string>();

function memo(key: string, make: () => string): string {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    if (cache.size > 4000) cache.clear();
    cache.set(key, v);
  }
  return v;
}

export function parseColor(color: string): RGB | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** El color con transparencia. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
  return memo(`a${color}|${a}`, () => {
    const rgb = parseColor(color);
    return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : color;
  });
}

/** Aclara (amount > 0) u oscurece (amount < 0) un color. */
export function shade(color: string, amount: number): string {
  const k = Math.round(amount * 100) / 100;
  return memo(`s${color}|${k}`, () => {
    const rgb = parseColor(color);
    if (!rgb) return color;
    const f = (x: number) => Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k));
    return `rgb(${f(rgb[0])}, ${f(rgb[1])}, ${f(rgb[2])})`;
  });
}

/** Mezcla a con b (t = 0: a; t = 1: b). */
export function mix(a: string, b: string, t: number): string {
  const k = Math.round(Math.max(0, Math.min(1, t)) * 50) / 50;
  if (k === 0) return a;
  return memo(`m${a}|${b}|${k}`, () => {
    const x = parseColor(a), y = parseColor(b);
    if (!x || !y) return a;
    const f = (i: number) => Math.round(x[i] + (y[i] - x[i]) * k);
    return `rgb(${f(0)}, ${f(1)}, ${f(2)})`;
  });
}
