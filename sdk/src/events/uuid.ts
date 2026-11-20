/**
 * newUuid — un UUID v4 al azar, para armar matchId.
 *
 * crypto.randomUUID() solo existe en contextos seguros (HTTPS o localhost).
 * Si la consola se abre desde otra computadora con http://<IP de la PC>:8000,
 * no está y crear una partida fallaría. El respaldo arma el mismo formato con
 * crypto.getRandomValues, que existe en cualquier página.
 */
export type UuidSource = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

export function newUuid(source: UuidSource = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();

  const b = source.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
