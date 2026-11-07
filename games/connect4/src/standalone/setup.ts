/**
 * Modo de prueba: jugar el 4 en línea abriendo /games/connect4/ directamente,
 * sin la consola. Muestra un formulario (modo, nombres, dificultad, reloj),
 * hace de "consola" con botones de pausa y cierre, y muestra los eventos.
 */
import { PrologStrategy } from "../ai/MoveStrategy";
import { Connect4Game } from "../game/Connect4Game";
import type { MatchContext } from "../game/ports";
import { DomBoardView } from "../ui/DomBoardView";
import { EventStamper } from "./EventStamper";
import { StandaloneHost } from "./StandaloneHost";

/** "Danny G" -> "danny-g" (protocolo, sección 5). */
export function toPlayerId(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "jugador";
}

export function mountStandalone(root: HTMLElement): void {
  root.innerHTML = `
    <form class="setup">
      <h1>4 en línea <small>modo de prueba, sin consola</small></h1>
      <fieldset>
        <legend>Modo</legend>
        <label><input type="radio" name="mode" value="vs-cpu" checked> Contra la computadora (Prolog)</label>
        <label><input type="radio" name="mode" value="local-2p"> 2 personas en esta pantalla</label>
      </fieldset>
      <label>Jugador 1 (rojo, empieza) <input name="p1" value="Danny" required maxlength="30"></label>
      <label class="only-2p">Jugador 2 (amarillo) <input name="p2" value="Dylan" maxlength="30"></label>
      <label class="only-cpu">Dificultad
        <select name="difficulty"><option value="easy">Fácil</option><option value="medium" selected>Media</option><option value="hard">Difícil</option></select>
      </label>
      <label>Tiempo por turno
        <select name="turnSeconds"><option value="0" selected>Sin límite</option><option value="15">15 s</option><option value="30">30 s</option><option value="60">60 s</option></select>
      </label>
      <label class="check"><input type="checkbox" name="send" checked> Mandar los eventos a GameStats (/api/events)</label>
      <p class="setup-error" aria-live="polite"></p>
      <button class="c4-button primary">Jugar</button>
    </form>`;

  const form = root.querySelector("form")!;
  const sync = () => {
    const mode = (form.elements.namedItem("mode") as RadioNodeList).value;
    form.dataset.mode = mode;
  };
  form.addEventListener("change", sync);
  sync();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const mode = data.get("mode") as MatchContext["mode"];
    const p1 = String(data.get("p1") ?? "").trim() || "Jugador 1";
    const p2 = String(data.get("p2") ?? "").trim() || "Jugador 2";
    const players: MatchContext["players"] = [{ playerId: toPlayerId(p1), name: p1, kind: "human", slot: 1 }];
    if (mode === "local-2p") {
      if (toPlayerId(p1) === toPlayerId(p2)) {
        root.querySelector(".setup-error")!.textContent = "Los dos jugadores necesitan nombres distintos.";
        return;
      }
      players.push({ playerId: toPlayerId(p2), name: p2, kind: "human", slot: 2 });
    }
    const ctx: MatchContext = {
      gameId: "connect4",
      matchId: `connect4-${crypto.randomUUID()}`,
      mode,
      players,
      options: { difficulty: data.get("difficulty"), turnSeconds: Number(data.get("turnSeconds")) },
    };
    play(root, ctx, data.get("send") === "on");
  });
}

function play(root: HTMLElement, ctx: MatchContext, send: boolean): void {
  root.innerHTML = `
    <div class="dev-bar">
      <button class="c4-button" data-act="pause">Pausar</button>
      <button class="c4-button" data-act="resume">Reanudar</button>
      <button class="c4-button" data-act="stop">Cerrar partida</button>
      <button class="c4-button" data-act="new">Nueva partida</button>
    </div>
    <div class="game"></div>
    <details class="dev-log"><summary>Eventos para GameStats (<span class="count">0</span>) · ${ctx.matchId}</summary><ol></ol></details>`;

  const list = root.querySelector(".dev-log ol")!;
  const count = root.querySelector(".dev-log .count")!;
  const log = (line: string) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
    count.textContent = String(list.children.length);
  };

  const host = new StandaloneHost(new EventStamper(ctx.matchId), send, log);
  const game = new Connect4Game(host, new DomBoardView(root.querySelector(".game")!), new PrologStrategy());
  game.init(ctx);
  game.start();

  root.querySelector(".dev-bar")!.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === "pause") game.pause("user");
    if (act === "resume") game.resume();
    if (act === "stop") game.stop("user");
    if (act === "new") { game.stop("closed"); mountStandalone(root); }
  });
  // Como haría la consola: si la pestaña se oculta, pausa.
  document.addEventListener("visibilitychange", () => { if (document.hidden) game.pause("hidden"); });
}
