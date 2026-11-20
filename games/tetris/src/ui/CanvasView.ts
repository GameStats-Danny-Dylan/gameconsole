/**
 * CanvasView — dibuja la partida: tablero, pieza, sombra, siguientes, guardada,
 * puntaje, nivel y líneas. Solo lee un Snapshot; nunca toca la partida.
 */
import type { Snapshot } from "../game/TetrisGame";
import { Piece, type PieceType } from "../domain/Tetromino";

export interface GameView {
  render(snapshot: Snapshot): void;
}

const COLORS: Record<PieceType, string> = {
  I: "#22d3ee", O: "#facc15", T: "#a855f7", S: "#22c55e", Z: "#ef4444", J: "#3b82f6", L: "#f97316",
};
const CELL = 30;

export class CanvasView implements GameView {
  private readonly board: HTMLCanvasElement;
  private readonly next: HTMLCanvasElement;
  private readonly hold: HTMLCanvasElement;
  private readonly values: Record<"score" | "level" | "lines", HTMLElement>;
  private readonly overlay: HTMLElement;
  private last = "";

  constructor(root: HTMLElement, howToPlay: string) {
    root.innerHTML = `
      <div class="tetris card" tabindex="0" aria-label="Tetris">
        <div class="tetris-board-wrap">
          <canvas class="tetris-board" width="${10 * CELL}" height="${20 * CELL}"></canvas>
          <div class="tetris-overlay" hidden></div>
        </div>
        <aside class="tetris-side">
          <section><h3>Siguientes</h3><canvas class="tetris-next" width="96" height="${3 * 66}"></canvas></section>
          <section><h3>Guardada (C)</h3><canvas class="tetris-hold" width="96" height="66"></canvas></section>
          <dl class="tetris-stats">
            <div><dt>Puntaje</dt><dd data-v="score">0</dd></div>
            <div><dt>Nivel</dt><dd data-v="level">1</dd></div>
            <div><dt>Líneas</dt><dd data-v="lines">0</dd></div>
          </dl>
          <p class="tetris-help"></p>
        </aside>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    this.board = q("canvas.tetris-board");
    this.next = q("canvas.tetris-next");
    this.hold = q("canvas.tetris-hold");
    this.overlay = q(".tetris-overlay");
    this.values = { score: q('[data-v="score"]'), level: q('[data-v="level"]'), lines: q('[data-v="lines"]') };
    q(".tetris-help").textContent = howToPlay;
  }

  render(s: Snapshot): void {
    // Solo se vuelve a dibujar si algo cambió (la gravedad mueve la pieza pocas veces por segundo).
    const key = JSON.stringify([s.status, s.piece, s.board, s.next, s.hold, s.score, s.level, s.lines]);
    if (key === this.last) return;
    this.last = key;

    const g = this.board.getContext("2d")!;
    const css = getComputedStyle(this.board);
    g.fillStyle = css.getPropertyValue("--surface-2").trim() || "#f4f6fb";
    g.fillRect(0, 0, this.board.width, this.board.height);
    g.strokeStyle = css.getPropertyValue("--line").trim() || "#dfe3ee";
    g.lineWidth = 1;
    for (let x = 1; x < 10; x++) { g.beginPath(); g.moveTo(x * CELL + .5, 0); g.lineTo(x * CELL + .5, 20 * CELL); g.stroke(); }
    for (let y = 1; y < 20; y++) { g.beginPath(); g.moveTo(0, y * CELL + .5); g.lineTo(10 * CELL, y * CELL + .5); g.stroke(); }

    s.board.forEach((row, y) => row.forEach((c, x) => { if (c) this.block(g, x, y, COLORS[c]); }));
    if (s.pieceType && s.status !== "over") {
      g.globalAlpha = .25;
      for (const c of s.ghost) this.block(g, c.x, c.y, COLORS[s.pieceType]);
      g.globalAlpha = 1;
    }
    if (s.pieceType) for (const c of s.piece) this.block(g, c.x, c.y, COLORS[s.pieceType]);

    this.mini(this.next, s.next);
    this.mini(this.hold, s.hold ? [s.hold] : []);
    this.values.score.textContent = String(s.score);
    this.values.level.textContent = String(s.level);
    this.values.lines.textContent = String(s.lines);

    const text = s.status === "paused" ? "Pausa" : s.status === "over" ? "Fin de la partida" : "";
    this.overlay.hidden = text === "";
    this.overlay.textContent = text;
  }

  private block(g: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL): void {
    g.fillStyle = color;
    g.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    g.fillStyle = "rgb(255 255 255 / .28)";
    g.fillRect(x * size + 1, y * size + 1, size - 2, 5);
  }

  /** Piezas pequeñas apiladas en un canvas (siguientes y guardada). */
  private mini(canvas: HTMLCanvasElement, pieces: PieceType[]): void {
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const size = 16;
    pieces.forEach((type, i) => {
      const cells = Piece.at(type, 0, 0, 0).cells();
      const minX = Math.min(...cells.map((c) => c.x)), maxX = Math.max(...cells.map((c) => c.x));
      const minY = Math.min(...cells.map((c) => c.y));
      const ox = (canvas.width / size - (maxX - minX + 1)) / 2 - minX;
      for (const c of cells) this.block(g, c.x + ox, c.y - minY + 0.8 + i * 4.1, COLORS[type], size);
    });
  }
}

