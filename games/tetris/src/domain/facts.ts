/** Los hechos que publica la partida (el Adapter los traduce a eventos de GameStats). */
import type { PieceType, RotationDirection } from "./Tetromino";

export type Fact =
  | { kind: "spawned"; piece: PieceType }
  | { kind: "moved"; direction: "left" | "right" }
  | { kind: "rotated"; direction: RotationDirection }
  | { kind: "softDrop"; cells: number }
  | { kind: "hardDrop"; cells: number }
  | { kind: "hold"; piece: PieceType }
  | { kind: "placed"; piece: PieceType; hardDrop: boolean }
  | { kind: "tSpin"; lines: number }
  | { kind: "linesCleared"; lines: number; points: number; combo: number }
  | { kind: "allClear"; lines: number }
  | { kind: "levelUp"; level: number }
  | { kind: "stackHeight"; rows: number }
  | { kind: "topOut" };
