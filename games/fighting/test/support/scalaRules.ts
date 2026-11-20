/**
 * Copia en TypeScript de lo que GameStats revisa en una pelea, para probar SIN
 * red que ningún evento del juego se descartaría:
 *   - el schema de cada evento de fighting (gamestats/contracts/event.schema.json);
 *   - las reglas comunes (analytics-scala/.../validation/Validation.scala);
 *   - las de fighting (analytics-scala/.../validation/FightingCheck.scala).
 * Si GameStats cambia sus reglas, esta copia se actualiza.
 */
import type { ContractEvent } from "@gameconsole/sdk";

type Data = Record<string, unknown>;

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isText = (v: unknown) => typeof v === "string" && v.length > 0;
const MATCH_TYPES = ["MATCH_STARTED", "MATCH_FINISHED", "MATCH_PAUSED", "MATCH_RESUMED"];

/** El schema de un evento de fighting. Devuelve el motivo si no lo cumple. */
export function schemaProblem(e: ContractEvent): string | null {
  const d = (e.data ?? {}) as Data;
  if (e.gameId !== "fighting") return `gameId ${e.gameId}`;
  if (!MATCH_TYPES.includes(e.type) && !isText(e.playerId)) return `${e.type} sin playerId`;
  if (e.type !== "PLAYER_ACTION" && e.action !== undefined) return "action fuera de PLAYER_ACTION";
  if (Number.isNaN(Date.parse(e.timestamp))) return "timestamp inválido";

  switch (e.type) {
    case "MATCH_STARTED":
      if (!isText(d.stage)) return "MATCH_STARTED sin stage";
      if (![1, 3, 5].includes(d.rounds as number)) return "MATCH_STARTED.rounds no es 1, 3 o 5";
      return null;
    case "PLAYER_JOINED":
      return isText(d.character) ? null : "PLAYER_JOINED sin character";
    case "PLAYER_ACTION":
      break;
    default:
      return null;
  }

  const round = () => isInt(d.round, 1, 5) ? null : "round fuera de 1..5";
  switch (e.action) {
    case "ATTACK":
      if (!isText(d.targetId)) return "ATTACK sin targetId";
      if (d.move !== "punch" && d.move !== "kick") return "ATTACK.move";
      if (typeof d.hit !== "boolean") return "ATTACK.hit";
      if (!isInt(d.damage, 0, 100)) return "ATTACK.damage fuera de 0..100";
      if (d.hit === false && d.damage !== 0) return "golpe fallado con daño";
      return round();
    case "COMBO":
      if (!isText(d.targetId)) return "COMBO sin targetId";
      if (!isInt(d.hits, 2, Infinity)) return "COMBO.hits < 2";
      if (!isInt(d.damage, 1, 100)) return "COMBO.damage fuera de 1..100";
      return round();
    case "BLOCK":
      return isText(d.attackerId) ? round() : "BLOCK sin attackerId";
    case "KNOCKDOWN":
      return isText(d.targetId) ? round() : "KNOCKDOWN sin targetId";
    case "ROUND_WON":
      if (!isInt(d.remainingHealth, 1, 100)) return "ROUND_WON.remainingHealth fuera de 1..100";
      if (d.method !== "ko" && d.method !== "timeout") return "ROUND_WON.method";
      return round();
    case "ROUND_DRAW":
      if (d.method !== "double_ko" && d.method !== "timeout") return "ROUND_DRAW.method";
      if (!isText(d.otherId)) return "ROUND_DRAW sin otherId";
      return round();
    default:
      return `acción desconocida ${String(e.action)}`;
  }
}

interface State {
  paused: boolean;
  rounds: number | null;
  wins: Map<string, number>;
  done: Set<number>;
  champion: string | null;
}

/** Devuelve los motivos de los eventos que GameStats descartaría (vacío = todo bien). */
export function scalaRejections(events: ContractEvent[]): string[] {
  const players = [...new Set(events.filter((e) => e.type === "PLAYER_JOINED").map((e) => e.playerId!))];
  const started = events.find((e) => e.type === "MATCH_STARTED");
  let s: State = {
    paused: false,
    rounds: typeof started?.data?.rounds === "number" ? (started.data.rounds as number) : null,
    wins: new Map(), done: new Set(), champion: null,
  };
  const rejected: string[] = [];
  let afterFinish = false;

  for (const e of events) {
    if (afterFinish) { rejected.push(`${e.eventId}: evento después de MATCH_FINISHED (Go lo rechaza)`); continue; }
    const bad = schemaProblem(e);
    if (bad) { rejected.push(`${e.eventId}: ${bad}`); continue; }
    const r = check(s, e, players);
    if (typeof r === "string") rejected.push(`${e.eventId}: ${r}`);
    else s = r;
    if (e.type === "MATCH_FINISHED") afterFinish = true;
  }
  return rejected;
}

function check(s: State, e: ContractEvent, players: string[]): State | string {
  // Reglas comunes: pausa
  let paused = s.paused;
  if (e.type === "MATCH_PAUSED") { if (s.paused) return "la partida ya estaba en pausa"; paused = true; }
  if (e.type === "MATCH_RESUMED") { if (!s.paused) return "MATCH_RESUMED sin una pausa antes"; paused = false; }
  if (e.type === "PLAYER_ACTION" && s.paused) return "acción durante la pausa";
  // Reglas comunes: referencias a otros jugadores
  const data = (e.data ?? {}) as Data;
  for (const k of ["targetId", "overtakenId", "otherId", "lappedId", "attackerId"]) {
    const id = data[k];
    if (typeof id === "string") {
      if (id === e.playerId) return `'${k}' es el mismo jugador que hace la acción`;
      if (!players.includes(id)) return `'${k}' ('${id}') no es un jugador de la partida`;
    }
  }
  s = { ...s, paused };

  // FightingCheck: solo eventos con playerId y action
  if (!e.playerId || !e.action) return s;
  if (s.champion) return `la pelea ya terminó: la ganó ${s.champion}`;
  const round = data.round as number;
  if (s.rounds !== null && round > s.rounds) return `round ${round}, pero la pelea es a ${s.rounds}`;

  const toWin = Math.floor((s.rounds ?? 1) / 2) + 1;
  switch (e.action) {
    case "ROUND_WON": {
      if (s.done.has(round)) return `el round ${round} ya tiene resultado`;
      const wins = new Map(s.wins);
      wins.set(e.playerId, (wins.get(e.playerId) ?? 0) + 1);
      return { ...s, wins, done: new Set([...s.done, round]), champion: wins.get(e.playerId)! >= toWin ? e.playerId : null };
    }
    case "ROUND_DRAW":
      if (s.done.has(round)) return `el round ${round} ya tiene resultado`;
      return { ...s, done: new Set([...s.done, round]) };
    default:
      return s;
  }
}

/** Ganador según GameStats (FightingAnalyzer.winner): el que ganó más rounds; empate -> null. */
export function scalaWinner(events: ContractEvent[]): string | null {
  const wins = new Map<string, number>();
  for (const e of events) if (e.action === "ROUND_WON") wins.set(e.playerId!, (wins.get(e.playerId!) ?? 0) + 1);
  const best = Math.max(0, ...wins.values());
  const top = [...wins].filter(([, n]) => n === best);
  return top.length === 1 ? top[0][0] : null;
}
