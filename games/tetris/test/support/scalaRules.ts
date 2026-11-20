/**
 * Copia en TypeScript de lo que exige GameStats a un evento de tetris:
 *  - contracts/event.schema.json (campos y rangos de cada acción),
 *  - Validation.scala + TetrisCheck.scala (reglas de contexto),
 *  - las reglas de Go (catálogo de acciones, playerId, orden).
 * Sirve para probar SIN red que ningún evento del juego se descartaría.
 * Si GameStats cambia sus reglas, esta copia se actualiza.
 */
import type { ContractEvent } from "@gameconsole/sdk";

export const TETRIS_ACTIONS = [
  "PIECE_SPAWNED", "PIECE_MOVED", "PIECE_ROTATED", "SOFT_DROP", "HARD_DROP", "HOLD", "PIECE_PLACED",
  "LINES_CLEARED", "T_SPIN", "ALL_CLEAR", "LEVEL_UP", "STACK_HEIGHT", "TOP_OUT",
] as const;

const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Motivo si el `data` rompe el schema; null si está bien. */
export function schemaProblem(e: ContractEvent): string | null {
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (e.type === "MATCH_STARTED") return int(d.startLevel, 1, 15) ? null : "startLevel debe ser entero de 1 a 15";
  if (e.type !== "PLAYER_ACTION") return null;
  switch (e.action) {
    case "PIECE_SPAWNED": case "HOLD": return PIECES.includes(d.piece as string) ? null : "piece inválida";
    case "PIECE_MOVED": return ["left", "right"].includes(d.direction as string) ? null : "direction inválida";
    case "PIECE_ROTATED": return ["cw", "ccw"].includes(d.direction as string) ? null : "direction inválida";
    case "SOFT_DROP": return int(d.cells, 1, 20) ? null : "cells fuera de 1-20";
    case "HARD_DROP": return int(d.cells, 0, 20) ? null : "cells fuera de 0-20";
    case "PIECE_PLACED": return PIECES.includes(d.piece as string) && typeof d.hardDrop === "boolean" ? null : "piece/hardDrop inválidos";
    case "LINES_CLEARED":
      return int(d.lines, 1, 4) && int(d.points, 0, Infinity) && int(d.combo, 0, Infinity) ? null : "lines/points/combo inválidos";
    case "T_SPIN": return int(d.lines, 0, 3) ? null : "lines fuera de 0-3";
    case "ALL_CLEAR": return int(d.lines, 1, 4) ? null : "lines fuera de 1-4";
    case "LEVEL_UP": return int(d.level, 2, 30) ? null : "level fuera de 2-30";
    case "STACK_HEIGHT": return int(d.rows, 0, 20) ? null : "rows fuera de 0-20";
    case "TOP_OUT": return typeof e.data === "object" && e.data !== null ? null : "TOP_OUT exige data";
    default: return `acción "${e.action}" no es de tetris`;
  }
}

/** Devuelve los motivos de los eventos que GameStats rechazaría o descartaría (vacío = todo bien). */
export function scalaRejections(events: ContractEvent[]): string[] {
  const out: string[] = [];
  const started = events.find((e) => e.type === "MATCH_STARTED");
  const startLevel = (started?.data?.startLevel as number | undefined) ?? 1;
  const batchPlayers = [...new Set(events.filter((e) => e.type === "PLAYER_JOINED").map((e) => e.playerId!))];

  let player: string | null = null, level = startLevel, toppedOut = false, paused = false, finished = false;
  let lastTime = -Infinity;
  const ids = new Set<string>();

  for (const e of events) {
    const bad = (m: string) => out.push(`${e.eventId}: ${m}`);
    // Go
    if (finished) { bad("evento después de MATCH_FINISHED"); continue; }
    if (e.gameId !== "tetris") bad(`gameId ${e.gameId}`);
    if (ids.has(e.eventId)) bad("eventId repetido");
    ids.add(e.eventId);
    const t = Date.parse(e.timestamp);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(e.timestamp) || Number.isNaN(t)) bad("timestamp no es RFC3339");
    if (t <= lastTime) bad("timestamp no crece");
    lastTime = t;
    const needsPlayer = !["MATCH_STARTED", "MATCH_FINISHED", "MATCH_PAUSED", "MATCH_RESUMED"].includes(e.type);
    if (needsPlayer && !e.playerId) bad("falta playerId");
    if ((e.type === "PLAYER_ACTION") !== (e.action !== undefined)) bad("action solo en PLAYER_ACTION");
    // Schema
    const sp = schemaProblem(e);
    if (sp) bad(sp);
    // Contexto común
    if (e.type === "MATCH_PAUSED") { if (paused) bad("ya estaba en pausa"); paused = true; }
    if (e.type === "MATCH_RESUMED") { if (!paused) bad("MATCH_RESUMED sin pausa"); paused = false; }
    if (e.type === "PLAYER_ACTION" && paused) bad("acción durante la pausa");
    // TetrisCheck
    if (e.playerId) {
      if (player !== null && player !== e.playerId) bad("tetris es de un jugador");
      else if (toppedOut) bad("evento después de TOP_OUT");
      else {
        player = e.playerId;
        if (e.action === "LEVEL_UP") {
          const l = (e.data as { level: number }).level;
          if (l <= level) bad(`el nivel ${l} no es mayor que ${level}`); else level = l;
        }
        if (e.action === "TOP_OUT") toppedOut = true;
      }
      if (!batchPlayers.includes(e.playerId)) bad("jugador sin PLAYER_JOINED");
    }
    if (e.type === "MATCH_FINISHED") finished = true;
  }
  if (!started) out.push("falta MATCH_STARTED");
  if (events.filter((e) => e.type === "MATCH_FINISHED").length > 1) out.push("MATCH_FINISHED repetido");
  return out;
}
