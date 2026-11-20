/**
 * KeyboardInput — traduce el teclado a acciones del juego.
 * ← → mover, ↑ rotar (Z al revés), ↓ bajar, Espacio caída instantánea, C guardar.
 */
import type { TetrisGame } from "../game/TetrisGame";

export class KeyboardInput {
  private readonly onKey = (e: KeyboardEvent): void => { this.handle(e); };

  constructor(private readonly game: TetrisGame, private readonly target: Pick<Window, "addEventListener" | "removeEventListener">) {}

  attach(): void { this.target.addEventListener("keydown", this.onKey); }
  detach(): void { this.target.removeEventListener("keydown", this.onKey); }

  /** Devuelve true si la tecla era del juego (entonces no se deja que la página se desplace). */
  handle(e: Pick<KeyboardEvent, "key" | "preventDefault" | "ctrlKey" | "metaKey" | "altKey">): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    switch (e.key) {
      case "ArrowLeft":  this.game.move("left"); break;
      case "ArrowRight": this.game.move("right"); break;
      case "ArrowUp":
      case "x": case "X": this.game.rotate("cw"); break;
      case "z": case "Z": this.game.rotate("ccw"); break;
      case "ArrowDown":  this.game.softDrop(); break;
      case " ": case "Spacebar": this.game.hardDrop(); break;
      case "c": case "C": case "Shift": this.game.hold(); break;
      default: return false;
    }
    e.preventDefault();
    return true;
  }
}
