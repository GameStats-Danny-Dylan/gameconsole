/**
 * Copia en TypeScript de las validaciones de contexto que aplica GameStats
 * (gamestats/analytics-scala/.../validation/Validation.scala y Connect4Check.scala).
 * Sirve para probar SIN red que ningún evento del juego se descartaría.
 * Si GameStats cambia sus reglas, esta copia se actualiza.
 */
import type { ContractEvent } from "@gameconsole/sdk";

type Cell = string; // "c,r"
interface Board { discs: Map<Cell, string>; threats: Map<Cell, Set<string>>; turn: string | null; last: { p: string; cell: Cell } | null }
interface State { players: string[]; bots: Set<string>; board: Board; history: Board[]; finished: boolean; paused: boolean }

const key = (c: number, r: number) => `${c},${r}`;
const cloneBoard = (b: Board): Board => ({
  discs: new Map(b.discs),
  threats: new Map([...b.threats].map(([k, v]) => [k, new Set(v)])),
  turn: b.turn, last: b.last,
});

/** Devuelve los motivos de los eventos que Scala descartaría (vacío = todo bien). */
export function scalaRejections(events: ContractEvent[]): string[] {
  const players = [...new Set(events.filter((e) => e.type === "PLAYER_JOINED").map((e) => e.playerId!))];
  let s: State = {
    players: [], bots: new Set(), finished: false, paused: false,
    board: { discs: new Map(), threats: new Map(), turn: null, last: null }, history: [],
  };
  const rejected: string[] = [];
  let afterFinish = false;

  for (const e of events) {
    if (afterFinish) { rejected.push(`${e.eventId}: evento después de MATCH_FINISHED (Go lo rechaza)`); continue; }
    const r = check(s, e, players);
    if (typeof r === "string") rejected.push(`${e.eventId}: ${r}`);
    else s = r;
    if (e.type === "MATCH_FINISHED") afterFinish = true;
  }
  return rejected;
}

function check(s: State, e: ContractEvent, batchPlayers: string[]): State | string {
  // Reglas comunes: pausa
  let paused = s.paused;
  if (e.type === "MATCH_PAUSED") { if (s.paused) return "la partida ya estaba en pausa"; paused = true; }
  if (e.type === "MATCH_RESUMED") { if (!s.paused) return "MATCH_RESUMED sin una pausa antes"; paused = false; }
  if (e.type === "PLAYER_ACTION" && s.paused) return "acción durante la pausa";
  // Reglas comunes: referencias a otros jugadores
  const data = (e.data ?? {}) as Record<string, unknown>;
  for (const k of ["targetId", "overtakenId", "otherId", "lappedId", "attackerId"]) {
    const id = data[k];
    if (typeof id === "string") {
      if (id === e.playerId) return `'${k}' es el mismo jugador que hace la acción`;
      if (!batchPlayers.includes(id)) return `'${k}' ('${id}') no es un jugador de la partida`;
    }
  }
  s = { ...s, paused };
  if (!e.playerId) return s;

  // Connect4Check.seat
  const p = e.playerId;
  if (!s.players.includes(p)) {
    if (s.players.length === 2) return "connect4 es de dos";
    const board = s.board.turn === null ? { ...s.board, turn: p } : s.board;
    s = { ...s, players: [...s.players, p], bots: data.bot === true ? new Set([...s.bots, p]) : s.bots, board };
  }
  if (e.type !== "PLAYER_ACTION") return s;

  const rival = s.players.find((x) => x !== p) ?? null;
  const b = s.board;
  const myTurn = () => b.turn === p;
  if (s.finished) return "la partida ya terminó con el 4 en línea";
  const c = data.column as number, r = data.row as number;

  switch (e.action) {
    case "DISC_DROPPED": {
      const expected = [...b.discs.keys()].filter((k) => k.startsWith(`${c},`)).length + 1;
      if (!myTurn()) return `no es el turno de ${p}`;
      if (expected > 6) return `la columna ${c} está llena`;
      if (r !== expected) return `la ficha cae en la fila ${expected}, no en la ${r}`;
      const moved = cloneBoard(b);
      moved.discs.set(key(c, r), p); moved.turn = rival; moved.last = { p, cell: key(c, r) };
      return { ...s, board: moved, history: [b, ...s.history] };
    }
    case "TURN_TIMEOUT":
      if (!myTurn()) return `no es el turno de ${p}`;
      return { ...s, board: { ...b, turn: rival } };
    case "HINT_USED":
      if (!myTurn()) return `no es el turno de ${p}`;
      return s;
    case "THREAT_CREATED": {
      const owners = b.threats.get(key(c, r)) ?? new Set<string>();
      if (b.discs.has(key(c, r))) return `la casilla (${c}, ${r}) ya está ocupada`;
      if (owners.has(p)) return `${p} ya tenía una amenaza en (${c}, ${r})`;
      const nb = cloneBoard(b); nb.threats.set(key(c, r), new Set([...owners, p]));
      return { ...s, board: nb };
    }
    case "THREAT_BLOCKED": {
      const attacker = data.attackerId as string;
      const owners = b.threats.get(key(c, r)) ?? new Set<string>();
      if (!owners.has(attacker)) return `${attacker} no tiene una amenaza abierta en (${c}, ${r})`;
      if (b.discs.get(key(c, r)) !== p) return `la casilla (${c}, ${r}) no tiene una ficha de ${p}`;
      const nb = cloneBoard(b); const set = new Set(owners); set.delete(attacker); nb.threats.set(key(c, r), set);
      return { ...s, board: nb };
    }
    case "UNDO": {
      if (!(rival && s.bots.has(rival) && !s.bots.has(p))) return "UNDO solo vale para el humano contra la IA";
      if (b.last?.cell !== key(c, r)) return `(${c}, ${r}) no es la última ficha del tablero`;
      const [prev, ...rest] = s.history;
      if (!prev) return "no hay ninguna ficha que deshacer";
      return { ...s, board: prev, history: rest };
    }
    case "CONNECT_FOUR":
      if (b.last?.p !== p) return `${p} no soltó la última ficha`;
      return { ...s, finished: true };
    default:
      return s;
  }
}
