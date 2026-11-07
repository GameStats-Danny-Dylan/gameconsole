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

/** Nombres en español de las métricas que calcula GameStats. */
export const METRIC_LABELS: Record<string, string> = {
  // connect4
  discs: "Fichas", threatsCreated: "Amenazas creadas", threatsBlocked: "Amenazas tapadas",
  centerControl: "Control del centro", hintsUsed: "Pistas", undos: "Deshacer", turnTimeouts: "Turnos perdidos",
  // tetris
  score: "Puntaje", lines: "Líneas", tetrises: "Tetris", piecesPlaced: "Piezas", piecesPerMinute: "Piezas por minuto",
  maxLevel: "Nivel máximo", maxCombo: "Combo máximo", tSpins: "T-spins", hardDrops: "Hard drops",
  // fighting
  damageDealt: "Daño hecho", accuracy: "Precisión", blocks: "Bloqueos", knockdowns: "Derribos", roundsWon: "Rounds ganados",
};

/** Las métricas que se muestran primero en cada juego. */
export const KEY_METRICS: Record<string, string[]> = {
  connect4: ["discs", "threatsCreated", "threatsBlocked", "centerControl"],
  tetris: ["score", "lines", "piecesPerMinute", "maxLevel"],
  fighting: ["damageDealt", "accuracy", "maxCombo", "roundsWon"],
};

export const PATTERN_LABELS: Record<string, string> = {
  DOUBLE_THREAT: "Doble amenaza", QUICK_WIN: "Victoria rápida", PERFECT_DEFENSE: "Defensa perfecta",
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
