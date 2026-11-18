/**
 * Juego mínimo sobre el SDK: muestra cómo se hereda de GameApp.
 * Un botón "Ganar": emite una acción, MATCH_FINISHED y avisa que terminó.
 */
import { GameApp, type MatchContext, type PauseReason, type StopReason } from "@gameconsole/sdk";
import { initTheme } from "@gameconsole/sdk/theme";

const root = document.getElementById("app")!;
initTheme();

/** Template Method: el SDK maneja el protocolo; aquí solo los pasos del juego. */
class HelloApp extends GameApp {
  private player = "";

  protected onInit(ctx: MatchContext): void {
    this.player = ctx.players[0]?.playerId ?? "anonimo";
    root.textContent = `Listo, ${ctx.players[0]?.name ?? "jugador"}.`;
  }

  protected onStart(): void {
    this.emit({ type: "MATCH_STARTED", data: {} });
    this.emit({ type: "PLAYER_JOINED", playerId: this.player, data: {} });
    const button = document.createElement("button");
    button.textContent = "Ganar";
    button.onclick = () => {
      this.emit({ type: "PLAYER_ACTION", action: "BUTTON_PRESSED", playerId: this.player, data: {} });
      this.emit({ type: "MATCH_FINISHED", data: {} });
      this.finish(this.player, "normal");
      root.textContent = "¡Ganaste!";
    };
    root.replaceChildren(button);
  }

  protected onPause(reason: PauseReason): void {
    this.emit({ type: "MATCH_PAUSED", data: { reason } });
  }

  protected onResume(): void {
    this.emit({ type: "MATCH_RESUMED", data: {} });
  }

  protected onStop(_reason: StopReason): void {
    if (this.status === "ready") return; // nunca empezó: el SDK manda FINISHED
    this.emit({ type: "PLAYER_LEFT", playerId: this.player, data: {} });
    this.emit({ type: "MATCH_FINISHED", data: {} });
    root.textContent = "Partida cerrada.";
  }
}

if (window.self !== window.top) {
  new HelloApp({ manifest: { id: "hello", gameStatsId: "hello", gameVersion: "1.0" } }).listen();
  root.textContent = "Esperando a la consola…";
} else {
  root.textContent = "Ejemplo del SDK: ábrelo desde la consola.";
}
