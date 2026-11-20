/**
 * Modo de prueba: el juego abierto directamente, sin consola. Un formulario
 * pide los nombres y los rounds, y la pelea corre con un GameHost local que
 * muestra los eventos en la consola del navegador (no se mandan a GameStats).
 */
import type { ContractEvent, GameEventDraft, GameHost, MatchContext } from "@gameconsole/sdk";
import { EventStamper } from "@gameconsole/sdk";
import { themeToggle } from "@gameconsole/sdk/theme";
import manifest from "../../public/game.json";
import { FightingGame } from "../game/FightingGame";
import { controlsForSlot } from "../input/ControlScheme";
import { KeyboardInput } from "../input/KeyboardInput";
import { CanvasView } from "../ui/CanvasView";

/** Mismas reglas que el SDK para el playerId (protocolo, sección 5). */
export function toPlayerId(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function mountStandalone(root: HTMLElement): void {
  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `<div class="brand"><div><span class="brand-kicker">GameConsole · modo de prueba</span><h1>Pelea</h1></div></div>`;
  header.append(themeToggle());

  const form = document.createElement("form");
  form.className = "setup card";
  form.innerHTML = `
    <div class="names">
      <label class="field"><span>Jugador 1 (izquierda)</span><input name="p1" value="Jugador 1" maxlength="20" required></label>
      <label class="field"><span>Jugador 2 (derecha)</span><input name="p2" value="Jugador 2" maxlength="20" required></label>
    </div>
    <label class="field"><span>Rounds</span>
      <select name="rounds">${manifest.options[0].values.map((v, i) =>
        `<option value="${v}"${v === manifest.options[0].default ? " selected" : ""}>${manifest.options[0].labels[i]}</option>`).join("")}</select>
    </label>
    <p class="setup-error" role="alert"></p>
    <button class="fight-button primary" type="submit">Empezar</button>
    <p class="setup-help">${manifest.howToPlay}</p>`;
  const game = document.createElement("div");
  game.className = "game card";
  game.hidden = true;
  root.replaceChildren(header, form, game);

  let input: KeyboardInput | null = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const names = [String(data.get("p1") ?? "").trim(), String(data.get("p2") ?? "").trim()];
    const ids = names.map(toPlayerId);
    const error = form.querySelector(".setup-error")!;
    if (ids.some((id) => !id || id === "cpu")) { error.textContent = "Escribe un nombre con letras o números."; return; }
    if (ids[0] === ids[1]) { error.textContent = "Los dos jugadores necesitan nombres distintos."; return; }
    error.textContent = "";

    const matchId = `fighting-${crypto.randomUUID()}`;
    const ctx: MatchContext = {
      gameId: "fighting", matchId, mode: "local-2p",
      players: names.map((name, i) => ({ playerId: ids[i], name, kind: "human" as const, slot: i + 1 })),
      options: { rounds: Number(data.get("rounds")) },
    };
    form.hidden = true;
    game.hidden = false;
    input?.detach();
    const codes = new Set([...controlsForSlot(1).codes(), ...controlsForSlot(2).codes()]);
    input = new KeyboardInput(codes).attach();
    const fight = new FightingGame(new LogHost(matchId, () => again()), new CanvasView(game), input);
    fight.init(ctx);
    fight.start();
  });

  const again = () => {
    const b = document.createElement("button");
    b.className = "fight-button";
    b.textContent = "Otra pelea";
    b.addEventListener("click", () => { form.hidden = false; game.hidden = true; b.remove(); });
    game.append(b);
  };
}

/** GameHost de prueba: sella los eventos igual que el SDK y los muestra en la consola del navegador. */
class LogHost implements GameHost {
  private readonly stamper: EventStamper;
  readonly events: ContractEvent[] = [];
  constructor(matchId: string, private readonly onFinish: () => void) {
    this.stamper = new EventStamper({ matchId, gameId: manifest.gameStatsId, gameVersion: manifest.gameVersion });
  }
  emit(draft: GameEventDraft): void {
    const e = this.stamper.stamp(draft);
    this.events.push(e);
    console.info("[pelea]", e.action ?? e.type, e.playerId ?? "", e.data ?? {});
  }
  finish(winner: string | null, reason: string): void {
    console.info("[pelea] FINISHED", { winner, reason });
    this.onFinish();
  }
  error(message: string): void { console.warn("[pelea]", message); }
}
