/**
 * Modo de prueba: jugar el 4 en línea abriendo /games/connect4/ directamente,
 * sin la consola. Muestra un formulario (modo, nombres, dificultad, reloj),
 * hace de "consola" con botones de pausa, reinicio y cierre, y muestra los eventos.
 */
import { MinThinkTime, PrologStrategy } from "../ai/MoveStrategy";
import { Connect4Game } from "../game/Connect4Game";
import type { MatchContext } from "../game/ports";
import { DomBoardView } from "../ui/DomBoardView";
import { EventStamper } from "@gameconsole/sdk";
import { appHeader } from "@gameconsole/sdk/theme";
import { StandaloneHost } from "./StandaloneHost";

/** "Danny G" -> "danny-g" (protocolo, sección 5). */
export function toPlayerId(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "jugador";
}

const ROBOT = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 16h5"/></svg>`;
const PEOPLE = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.8 19.5c.6-3.3 3-5 5.7-5s5.1 1.7 5.7 5M14.5 14.6c2.6-.4 5.6.9 6.4 4.4"/></svg>`;

/** Grupo de botones de radio con forma de "pastillas" (control segmentado). */
function segmented(name: string, options: [string, string][], checked: string): string {
  return `<div class="segmented" role="radiogroup">${options.map(([value, label]) =>
    `<label><input type="radio" name="${name}" value="${value}"${value === checked ? " checked" : ""}><span>${label}</span></label>`,
  ).join("")}</div>`;
}

export function mountStandalone(root: HTMLElement): void {
  root.innerHTML = `
    <form class="setup card">
      <div class="setup-head">
        <h2>Nueva partida</h2>
        <p>Elige cómo quieres jugar. Modo de prueba: sin la consola.</p>
      </div>

      <fieldset class="modes">
        <legend>Modo</legend>
        <label class="mode-card">
          <input type="radio" name="mode" value="vs-cpu" checked>
          <span class="mode-icon">${ROBOT}</span>
          <span class="mode-text"><strong>Contra la computadora</strong><small>La IA de Prolog decide cada jugada</small></span>
        </label>
        <label class="mode-card">
          <input type="radio" name="mode" value="local-2p">
          <span class="mode-icon">${PEOPLE}</span>
          <span class="mode-text"><strong>2 personas</strong><small>En esta pantalla, por turnos</small></span>
        </label>
      </fieldset>

      <div class="names">
        <label class="field"><span><i class="swatch red"></i>Jugador 1 · empieza</span><input name="p1" placeholder="Escribe tu nombre" maxlength="30" autocomplete="off"></label>
        <label class="field only-2p"><span><i class="swatch yellow"></i>Jugador 2</span><input name="p2" placeholder="Escribe tu nombre" maxlength="30" autocomplete="off"></label>
      </div>

      <div class="field only-cpu"><span>Dificultad</span>
        ${segmented("difficulty", [["easy", "Fácil"], ["medium", "Media"], ["hard", "Difícil"]], "medium")}
      </div>
      <div class="field"><span>Tiempo por turno</span>
        ${segmented("turnSeconds", [["0", "Sin límite"], ["15", "15 s"], ["30", "30 s"], ["60", "60 s"]], "0")}
      </div>

      <label class="switch"><input type="checkbox" name="send" checked><span class="switch-track"></span>Guardar la partida en las estadísticas (GameStats)</label>
      <p class="setup-error" aria-live="polite"></p>
      <button class="c4-button primary big">Jugar</button>
    </form>`;
  root.prepend(appHeader("4 en línea", "Conecta 4 fichas en línea antes que tu rival"));

  const form = root.querySelector("form")!;
  const sync = () => {
    const mode = (form.elements.namedItem("mode") as RadioNodeList).value;
    form.dataset.mode = mode;
  };
  const error = root.querySelector<HTMLElement>(".setup-error")!;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  /** Marca el campo con el problema, muestra el aviso y lo deja listo para escribir. */
  const fail = (field: HTMLInputElement, message: string) => {
    field.setAttribute("aria-invalid", "true");
    error.textContent = message;
    field.focus();
  };
  form.addEventListener("input", (e) => {
    (e.target as HTMLElement).removeAttribute("aria-invalid");
    error.textContent = "";
  });
  form.addEventListener("change", sync);
  sync();
  input("p1").focus();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const mode = data.get("mode") as MatchContext["mode"];
    const p1 = String(data.get("p1") ?? "").trim();
    const p2 = String(data.get("p2") ?? "").trim();
    // Nombres obligatorios: solo espacios o símbolos tampoco sirven (no dan un playerId).
    if (!/[\p{L}\p{N}]/u.test(p1)) return fail(input("p1"), "Escribe el nombre del jugador 1.");
    if (mode === "vs-cpu" && toPlayerId(p1) === "cpu") return fail(input("p1"), "Ese nombre es el de la computadora: elige otro.");
    const players: MatchContext["players"] = [{ playerId: toPlayerId(p1), name: p1, kind: "human", slot: 1 }];
    if (mode === "local-2p") {
      if (!/[\p{L}\p{N}]/u.test(p2)) return fail(input("p2"), "Escribe el nombre del jugador 2.");
      if (toPlayerId(p1) === toPlayerId(p2)) return fail(input("p2"), "Los dos jugadores necesitan nombres distintos.");
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
    <div class="dev-bar" role="toolbar" aria-label="Partida">
      <button class="c4-button ghost" data-act="pause">Pausar</button>
      <button class="c4-button ghost" data-act="resume">Reanudar</button>
      <span class="spacer"></span>
      <button class="c4-button ghost" data-act="restart" title="Termina esta partida y empieza otra con las mismas opciones">Reiniciar</button>
      <button class="c4-button ghost" data-act="stop">Terminar</button>
      <button class="c4-button ghost" data-act="new" title="Vuelve a elegir modo, nombres y dificultad">Nueva partida</button>
    </div>
    <div class="game card"></div>
    <details class="dev-log"><summary>Eventos para GameStats (<span class="count">0</span>) · ${ctx.matchId}</summary><ol></ol></details>`;
  root.prepend(appHeader("4 en línea", ctx.mode === "vs-cpu" ? "Contra la computadora" : "2 personas en esta pantalla"));

  const list = root.querySelector(".dev-log ol")!;
  const count = root.querySelector(".dev-log .count")!;
  const log = (line: string) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
    count.textContent = String(list.children.length);
  };

  const host = new StandaloneHost(new EventStamper({ matchId: ctx.matchId, gameId: "connect4", gameVersion: "1.0" }), send, log);
  const game = new Connect4Game(host, new DomBoardView(root.querySelector(".game")!), new MinThinkTime(new PrologStrategy()));
  game.init(ctx);
  game.start();

  // Como haría la consola: si la pestaña se oculta, pausa.
  const onHidden = () => { if (document.hidden) game.pause("hidden"); };
  document.addEventListener("visibilitychange", onHidden);
  const leave = () => { game.stop("closed"); document.removeEventListener("visibilitychange", onHidden); };

  root.querySelector(".dev-bar")!.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "pause") game.pause("user");
    if (act === "resume") game.resume();
    if (act === "stop") game.stop("user");
    // Reiniciar = cerrar esta partida y abrir otra nueva (otro matchId): para
    // GameStats son dos partidas distintas, la primera sin ganador.
    if (act === "restart") { leave(); play(root, { ...ctx, matchId: `connect4-${crypto.randomUUID()}` }, send); }
    if (act === "new") { leave(); mountStandalone(root); }
  });
}
