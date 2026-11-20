/**
 * Modo de prueba: abrir /games/tetris/ directamente, sin la consola.
 * Se juega igual, pero no se manda ningún evento.
 */
import { appHeader } from "@gameconsole/sdk/theme";
import { TetrisGame } from "../game/TetrisGame";
import { CanvasView } from "../ui/CanvasView";
import { RafLoop } from "../ui/GameLoop";
import { KeyboardInput } from "../ui/KeyboardInput";

export function mountStandalone(root: HTMLElement, howToPlay: string): void {
  root.replaceChildren(appHeader("Tetris", "Modo de prueba, sin la consola (no se mandan eventos)"));
  const stage = document.createElement("div");
  const button = document.createElement("button");
  button.className = "tetris-button";
  button.textContent = "Jugar";
  root.append(stage, button);

  const loop = new RafLoop();
  let input: KeyboardInput | null = null;

  button.addEventListener("click", () => {
    input?.detach();
    loop.stop();
    const game = new TetrisGame();
    const view = new CanvasView(stage, howToPlay);
    input = new KeyboardInput(game, window);
    input.attach();
    game.start();
    loop.start((dt) => {
      game.update(dt);
      view.render(game.snapshot());
      if (game.status === "over") { loop.stop(); button.textContent = "Jugar de nuevo"; }
    });
    button.blur();
  });
}
