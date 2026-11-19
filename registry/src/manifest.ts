/**
 * manifest.ts — la ficha de un juego (game.json) y su validación.
 * Contrato: docs/protocolo.md, sección 2.
 */

export const PROTOCOL = "gameconsole/1";
export const MODES = ["solo", "vs-cpu", "local-2p"] as const;
export type Mode = (typeof MODES)[number];

export interface GameOption {
  key: string;
  label: string;
  type: string;
  [extra: string]: unknown; // values, default, min, max, modes… la consola los muestra sin interpretarlos
}

export interface GameManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  gameStatsId: string;
  gameVersion: string;
  entry: string;
  icon?: string;
  players: { min: number; max: number };
  modes: Mode[];
  options?: GameOption[];
  protocol: string;
}

export type Validation =
  | { ok: true; manifest: GameManifest }
  | { ok: false; error: string };

const ID = /^[a-z0-9-]{1,40}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Ruta relativa al mismo origen ("/games/x/"), nunca una URL completa ni "//otro-sitio". */
const isRelativePath = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//");

/**
 * Revisa el manifiesto que manda un juego. Devuelve el primer problema que
 * encuentra, con un mensaje pensado para quien programa el juego.
 */
export function validateManifest(body: unknown): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });

  if (!isObject(body)) return fail("el manifiesto debe ser un objeto JSON");
  const m = body;

  if (typeof m.id !== "string" || !ID.test(m.id))
    return fail("id debe tener de 1 a 40 caracteres: minúsculas, números o guiones");
  for (const field of ["name", "version", "gameStatsId", "gameVersion"] as const)
    if (!isText(m[field])) return fail(`${field} es obligatorio y debe ser texto`);
  if (m.description !== undefined && typeof m.description !== "string")
    return fail("description debe ser texto");

  if (!isRelativePath(m.entry)) return fail('entry debe ser una ruta relativa, por ejemplo "/games/connect4/"');
  if (m.icon !== undefined && !isRelativePath(m.icon)) return fail("icon debe ser una ruta relativa");

  const p = m.players;
  if (!isObject(p) || !Number.isInteger(p.min) || !Number.isInteger(p.max) ||
      (p.min as number) < 1 || (p.max as number) < (p.min as number))
    return fail("players debe ser { min, max } con enteros y 1 <= min <= max");

  if (!Array.isArray(m.modes) || m.modes.length === 0)
    return fail(`modes debe ser una lista con al menos uno de: ${MODES.join(", ")}`);
  for (const mode of m.modes)
    if (!MODES.includes(mode as Mode)) return fail(`modo desconocido "${String(mode)}"; válidos: ${MODES.join(", ")}`);

  if (m.options !== undefined) {
    if (!Array.isArray(m.options)) return fail("options debe ser una lista");
    for (const [i, o] of m.options.entries())
      if (!isObject(o) || !isText(o.key) || !isText(o.label) || !isText(o.type))
        return fail(`options[${i}] debe tener key, label y type`);
  }

  if (m.protocol !== PROTOCOL) return fail(`protocol debe ser "${PROTOCOL}"`);

  return { ok: true, manifest: m as unknown as GameManifest };
}
