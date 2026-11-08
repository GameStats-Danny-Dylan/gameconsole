/**
 * model.ts — los datos que llegan de GameStats y cómo se juntan para mostrarlos.
 * Funciones puras (fáciles de probar). No calculan estadísticas: solo cruzan las
 * tres fuentes (Scala, Go y el registry) por gameId.
 */

export interface Ranked { playerId?: string; wins?: number; rule?: string; count?: number }

export interface GameSummary {
  gameId: string;
  matches: number;
  players: number;
  totalEvents: number;
  avgDurationSeconds: number;
  avgEventsPerMatch: number;
  matchesWithoutWinner: number;
  winners: { playerId: string; wins: number }[];
  metrics: Record<string, { avg: number; min: number; max: number }>;
  actions: Record<string, number>;
  patterns: { rule: string; count: number }[];
}

export interface Overview {
  matches: number;
  players: number;
  totalEvents: number;
  avgDurationSeconds: number;
  games: GameSummary[];
  topWinners: { playerId: string; wins: number }[];
  topPatterns: { rule: string; count: number }[];
}

export interface RegisteredGame { id: string; name: string; gameStatsId: string; icon?: string; entry: string }
export interface LiveCount { gameId: string; inProgress: number }
export interface MatchInfo { matchId: string; gameId: string; status: string; eventCount: number; connectedPlayers: string[] }

/** Una fila por juego: lo que muestra su tarjeta. */
export interface GameRow {
  gameId: string;
  name: string;
  icon: string | null;
  available: boolean;     // está registrado (se puede jugar ahora)
  inProgress: number;     // Go
  finished: number;       // Scala
  summary: GameSummary | null;
}

export function buildRows(registry: RegisteredGame[], overview: Overview | null, live: LiveCount[]): GameRow[] {
  const ids = new Set<string>([
    ...registry.map((g) => g.gameStatsId),
    ...(overview?.games ?? []).map((g) => g.gameId),
    ...live.filter((l) => l.inProgress > 0).map((l) => l.gameId),
  ]);
  return [...ids]
    .map((gameId) => {
      const reg = registry.find((g) => g.gameStatsId === gameId);
      const summary = overview?.games.find((g) => g.gameId === gameId) ?? null;
      return {
        gameId,
        name: reg?.name ?? GAME_NAMES[gameId] ?? gameId,
        icon: reg?.icon ?? null,
        available: !!reg,
        inProgress: live.find((l) => l.gameId === gameId)?.inProgress ?? 0,
        finished: summary?.matches ?? 0,
        summary,
      };
    })
    .sort((a, b) => b.inProgress + b.finished - (a.inProgress + a.finished) || a.name.localeCompare(b.name, "es"));
}

/** Partidas que se están jugando ahora mismo (para la tabla en vivo). */
export function liveMatches(matches: MatchInfo[], limit = 12): MatchInfo[] {
  return matches.filter((m) => m.status === "en_curso").slice(-limit).reverse();
}

const GAME_NAMES: Record<string, string> = {
  connect4: "4 en línea", tetris: "Tetris", fighting: "Peleas", racing: "Carreras",
};

/** Nombres de las métricas que calcula GameStats, con palabras de jugador. */
export const METRIC_LABELS: Record<string, string> = {
  // connect4
  discs: "Fichas jugadas", threatsCreated: "Veces a una ficha de ganar", threatsBlocked: "Amenazas tapadas a tiempo",
  centerControl: "Fichas en la columna del centro", hintsUsed: "Pistas pedidas", undos: "Jugadas deshechas",
  turnTimeouts: "Turnos perdidos por tiempo",
  // tetris
  score: "Puntos", lines: "Líneas borradas", tetrises: "Tetris (4 líneas de una vez)", piecesPlaced: "Piezas colocadas",
  piecesPerMinute: "Piezas por minuto", maxLevel: "Nivel más alto", maxCombo: "Mejor combo", tSpins: "Giros en T",
  hardDrops: "Caídas rápidas",
  // fighting
  damageDealt: "Daño causado", accuracy: "Golpes que acertaron", blocks: "Golpes bloqueados", knockdowns: "Derribos",
  roundsWon: "Rounds ganados",
};

/** Explicación corta de cada métrica (se muestra debajo del nombre). */
export const METRIC_HELP: Record<string, string> = {
  threatsCreated: "Tener 3 en línea con el cuarto lugar libre",
  threatsBlocked: "Poner ficha justo donde el rival iba a ganar",
  centerControl: "La columna del centro entra en más líneas de 4",
  accuracy: "De todos los golpes que lanzó",
};

/** Qué significa cada patrón que detecta GameStats. */
export const PATTERN_HELP: Record<string, string> = {
  DOUBLE_THREAT: "Tuvo dos lugares para ganar a la vez: el rival solo puede tapar uno",
  QUICK_WIN: "Ganó usando 7 fichas o menos",
  PERFECT_DEFENSE: "El rival le armó 2 amenazas o más y las tapó todas",
  BACK_TO_BACK: "Hizo dos Tetris seguidos",
  PERFECT_CLEAR: "Dejó el tablero completamente vacío",
  T_SPIN_MASTER: "Hizo 3 giros en T o más",
  COMEBACK: "Iba perdiendo y terminó ganando",
  FLAWLESS_VICTORY: "Ganó un round sin recibir daño",
  COMBO_MASTER: "Encadenó 5 golpes o más sin que el rival respondiera",
};

/** Nombre para mostrar de un jugador: la IA del 4 en línea se llama "cpu". */
export function playerName(id: string): string {
  return id === "cpu" ? "Computadora" : id;
}

/** Las métricas que se muestran primero en cada juego. */
export const KEY_METRICS: Record<string, string[]> = {
  connect4: ["discs", "threatsCreated", "threatsBlocked", "centerControl"],
  tetris: ["score", "lines", "piecesPerMinute", "maxLevel"],
  fighting: ["damageDealt", "accuracy", "maxCombo", "roundsWon"],
};

export const PATTERN_LABELS: Record<string, string> = {
  DOUBLE_THREAT: "Doble amenaza", QUICK_WIN: "Victoria rápida", PERFECT_DEFENSE: "Defensa sin fallas",
  BACK_TO_BACK: "Tetris seguidos", PERFECT_CLEAR: "Tablero limpio", T_SPIN_MASTER: "Maestro del T-spin",
  COMEBACK: "Remontada", FLAWLESS_VICTORY: "Victoria perfecta", COMBO_MASTER: "Maestro del combo",
  CLEAN_RACE: "Carrera limpia", WIRE_TO_WIRE: "De punta a punta",
};

export function metricValue(name: string, v: number): string {
  if (name === "accuracy" || name === "centerControl") return `${Math.round(v * 100)} %`;
  return Number.isInteger(v) ? v.toLocaleString("es") : v.toLocaleString("es", { maximumFractionDigits: 1 });
}

export function duration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}
