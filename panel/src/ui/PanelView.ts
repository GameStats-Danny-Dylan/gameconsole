/**
 * PanelView — dibuja una foto del PanelStore. Todo el texto entra con
 * textContent (los nombres de jugador los escribe la gente: nunca innerHTML).
 *
 * Orden de la página: totales → clasificación general y jugadas destacadas →
 * una tarjeta por juego (su clasificación y sus números) → partidas en curso.
 */
import {
  buildRows, duration, KEY_METRICS, liveMatches, METRIC_HELP, METRIC_LABELS, metricValue, PATTERN_HELP,
  PATTERN_LABELS, playerName, STANDING_METRIC, type GameRow, type MatchInfo, type Standing,
} from "../model";
import type { Snapshot } from "../store/PanelStore";
import { appHeader } from "@gameconsole/sdk/theme";

type Child = Node | string | null | false | undefined;

function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es")} ${n === 1 ? one : many}`;
const percent = (x: number) => `${Math.round(x * 100)} %`;

export class PanelView {
  private readonly status: HTMLElement;
  private readonly body: HTMLElement;
  private lastUpdate: Date | null = null;
  private lastErrors: string[] = [];

  constructor(root: HTMLElement) {
    this.status = h("p", { class: "status", "aria-live": "polite" });
    this.body = h("div", { class: "body" });
    // Abierto aparte (/panel/): botón para volver a la consola. Dentro de la
    // consola esta cabecera no se muestra (allí el panel se cierra con ✕).
    const back = h("a", { class: "back-link", href: "/", title: "Volver a la consola de juegos" },
      h("span", { class: "btn-icon", "aria-hidden": "true" }, "←"), "Volver a DnD Games");
    root.append(
      appHeader("Estadísticas", "La lista de Santa: calculadas por GameStats · se actualizan cada 3 s", back, this.status),
      this.body,
    );
    // "hace N s" avanza aunque no llegue una foto nueva.
    setInterval(() => this.renderStatus(), 1000);
  }

  render(s: Snapshot): void {
    this.lastUpdate = s.updatedAt;
    this.lastErrors = s.errors;
    this.renderStatus();

    const rows = buildRows(s.registry, s.overview, s.live);
    const playing = rows.reduce((n, r) => n + r.inProgress, 0);
    const o = s.overview;

    const sections: Child[] = [
      o ? null : h("p", { class: "notice" },
        "Este GameStats todavía no tiene estadísticas por juego (llegan con la versión 1.1). Por ahora se muestran las partidas en curso."),

      h("section", { class: "tiles", "aria-label": "Totales" },
        tile("Jugándose ahora", String(playing), playing === 1 ? "partida abierta en este momento" : "partidas abiertas en este momento", "live"),
        tile("Partidas terminadas", o ? String(o.matches) : "—", "desde que se encendió el sistema"),
        tile("Jugadores", o ? String(o.players) : "—", "contando a la computadora"),
        tile("Una partida dura", o ? duration(o.avgDurationSeconds) : "—", "en promedio")),

      o && h("section", { class: "split" },
        h("div", { class: "card" },
          sectionHead("Clasificación general", "Todos los juegos juntos. Gana posiciones quien tiene más victorias; si empatan, el de mejor porcentaje."),
          leaderboard(o.standings ?? [], null)),
        h("div", { class: "card" },
          sectionHead("Jugadas destacadas", "Lo que GameStats encontró en las partidas."),
          highlights(o.topPatterns))),

      h("section", { "aria-label": "Juegos" },
        h("h2", { class: "section-title" }, "Por juego"),
        rows.length
          ? h("div", { class: "games" }, ...rows.map(gameCard))
          : h("p", { class: "empty" }, "Todavía no hay juegos registrados ni partidas.")),

      h("section", { class: "card", "aria-label": "Partidas en curso" },
        sectionHead("Partidas que se están jugando", "Se actualiza sola mientras la gente juega."),
        liveTable(liveMatches(s.matches), rows)),
    ];
    this.body.replaceChildren(...sections.filter((x): x is Node => x instanceof Node));
  }

  private renderStatus(): void {
    if (!this.lastUpdate) { this.status.textContent = "Conectando…"; return; }
    const secs = Math.max(0, Math.round((Date.now() - this.lastUpdate.getTime()) / 1000));
    const ok = this.lastErrors.length === 0;
    this.status.className = `status ${ok ? "ok" : "bad"}`;
    this.status.replaceChildren(
      h("span", { class: "icon", "aria-hidden": "true" }, ok ? "●" : "▲"),
      ok ? `En vivo · hace ${secs} s` : `Sin respuesta de ${this.lastErrors.map((e) => e.split(":")[0]).join(", ")}`,
    );
    this.status.title = this.lastErrors.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function sectionHead(title: string, help: string): HTMLElement {
  return h("div", { class: "section-head" }, h("h2", {}, title), h("p", {}, help));
}

function tile(label: string, value: string, hint: string, kind = ""): HTMLElement {
  return h("div", { class: `tile ${kind}` }, h("span", { class: "label" }, label), h("strong", {}, value), h("span", { class: "hint" }, hint));
}

const ROBOT = "M7 9h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm5-5v5M9.5 13.5h.01M14.5 13.5h.01";

/** Círculo con la inicial del jugador (o un robot para la computadora). */
function avatar(playerId: string): HTMLElement {
  if (playerId === "cpu") {
    const a = h("span", { class: "avatar cpu", "aria-hidden": "true" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ROBOT);
    svg.append(path);
    a.append(svg);
    return a;
  }
  return h("span", { class: "avatar", "aria-hidden": "true" }, playerId.charAt(0).toUpperCase());
}

/** La posición: 1, 2 y 3 llevan medalla (oro, plata, bronce). */
function position(n: number): HTMLElement {
  const medal = ["gold", "silver", "bronze"][n - 1];
  return h("span", { class: `pos${medal ? ` ${medal}` : ""}`, title: medal ? `Puesto ${n}` : "" }, String(n));
}

/**
 * Tabla de clasificación. `game` agrega la columna propia del juego (por
 * ejemplo, amenazas por partida en el 4 en línea).
 */
function leaderboard(standings: Standing[], game: string | null): HTMLElement {
  if (!standings.length) return h("p", { class: "empty" }, "Todavía nadie terminó una partida. ¡Juega una para aparecer aquí!");
  const extra = game ? STANDING_METRIC[game] : undefined;
  const showExtra = !!extra && standings.some((s) => s.metrics[extra.metric]);

  const head = h("tr", {},
    h("th", { class: "c-pos" }, "#"),
    h("th", {}, "Jugador"),
    h("th", { class: "num" }, "Partidas"),
    h("th", { class: "num" }, "Ganadas"),
    h("th", { class: "num" }, "Perdidas"),
    h("th", { class: "num c-nores", title: "Empates, partidas que se cerraron antes o de un solo jugador" }, "Sin ganador"),
    showExtra && h("th", { class: "num c-extra" }, extra!.label),
    h("th", { class: "c-rate" }, "Victorias"));

  const body = standings.map((s, i) => {
    const name = playerName(s.playerId);
    const metric = extra && s.metrics[extra.metric];
    return h("tr", { class: i === 0 && s.wins > 0 ? "leader" : "" },
      h("td", { class: "c-pos" }, position(i + 1)),
      h("td", {}, h("span", { class: "who" }, avatar(s.playerId),
        h("span", { class: "who-name" }, name, s.playerId === "cpu" ? h("small", {}, "IA de Prolog") : null))),
      h("td", { class: "num" }, String(s.played)),
      h("td", { class: "num win" }, String(s.wins)),
      h("td", { class: "num" }, String(s.losses)),
      h("td", { class: "num c-nores muted-num" }, String(s.noResult)),
      showExtra && h("td", { class: "num c-extra" }, metric ? metricValue(extra!.metric, metric[extra!.use]) : "—"),
      h("td", { class: "c-rate" }, rateMeter(s.winRate, `${name}: ganó ${s.wins} de ${s.played}`)));
  });

  return h("div", { class: "table-scroll" },
    h("table", { class: "leaderboard" }, h("thead", {}, head), h("tbody", {}, ...body)));
}

/** Porcentaje de victorias: el número y una barra corta de un solo color. */
function rateMeter(rate: number, label: string): HTMLElement {
  return h("span", { class: "rate", title: label },
    h("span", { class: "rate-track", "aria-hidden": "true" },
      h("span", { class: "rate-fill", style: `width:${Math.max(0, Math.min(1, rate)) * 100}%` })),
    h("span", { class: "rate-num" }, percent(rate)));
}

/** Patrones como lista: cuántas veces, el nombre y qué significa. */
function highlights(patterns: { rule: string; count: number }[]): HTMLElement {
  if (!patterns.length) return h("p", { class: "empty" }, "Todavía no pasó nada destacado.");
  return h("ul", { class: "highlights" }, ...patterns.map((p) =>
    h("li", {},
      h("span", { class: "hl-count", title: plural(p.count, "vez", "veces") }, String(p.count)),
      h("span", { class: "hl-text" },
        h("strong", {}, PATTERN_LABELS[p.rule] ?? p.rule),
        PATTERN_HELP[p.rule] ? h("small", {}, PATTERN_HELP[p.rule]) : null))));
}

function gameCard(r: GameRow): HTMLElement {
  const s = r.summary;
  const metricNames = s ? [...(KEY_METRICS[r.gameId] ?? []), ...Object.keys(s.metrics)].filter((m, i, a) => s.metrics[m] && a.indexOf(m) === i).slice(0, 4) : [];
  return h("article", { class: "game card" },
    h("header", {},
      r.icon ? h("img", { src: r.icon, alt: "", width: "40", height: "40" }) : h("span", { class: "noicon" }),
      h("h3", {}, r.name),
      h("span", { class: `badge ${r.available ? "on" : "off"}` }, r.available ? "se puede jugar" : "apagado")),
    h("div", { class: "counts" },
      h("div", {}, h("strong", {}, String(r.inProgress)), h("span", {}, "jugándose")),
      h("div", {}, h("strong", {}, String(r.finished)), h("span", {}, "terminadas")),
      h("div", {}, h("strong", {}, s ? duration(s.avgDurationSeconds) : "—"), h("span", {}, "dura en promedio"))),
    s && s.matches > 0 && h("div", { class: "game-body" },
      h("div", {},
        h("h4", {}, "Clasificación"),
        leaderboard(s.standings ?? [], r.gameId),
        s.matchesWithoutWinner > 0 && h("p", { class: "foot" },
          `${plural(s.matchesWithoutWinner, "partida terminó", "partidas terminaron")} sin ganador: empate, se cerró antes o era de una sola persona.`)),
      metricNames.length > 0 && h("div", {},
        h("h4", {}, "Los números de una partida"),
        h("table", { class: "metrics" },
          h("thead", {}, h("tr", {},
            h("th", {}, "Cada jugador, en una partida"), h("th", { class: "num" }, "Normalmente"), h("th", { class: "num" }, "Récord"))),
          h("tbody", {}, ...metricNames.map((m) => h("tr", {},
            h("td", {}, METRIC_LABELS[m] ?? m, METRIC_HELP[m] ? h("small", {}, METRIC_HELP[m]) : null),
            h("td", { class: "num" }, metricValue(m, s.metrics[m].avg)),
            h("td", { class: "num" }, metricValue(m, s.metrics[m].max)))))))),
  );
}

function liveTable(matches: MatchInfo[], rows: GameRow[]): HTMLElement {
  if (!matches.length) return h("p", { class: "empty" }, "Nadie está jugando en este momento.");
  const name = (id: string) => rows.find((r) => r.gameId === id)?.name ?? id;
  return h("div", { class: "table-scroll" }, h("table", { class: "live" },
    h("thead", {}, h("tr", {}, h("th", {}, "Juego"), h("th", {}, "Jugadores"),
      h("th", { class: "num", title: "Jugadas y avisos que la partida le mandó a GameStats" }, "Jugadas registradas"),
      h("th", {}, "Código"))),
    h("tbody", {}, ...matches.map((m) => h("tr", {},
      h("td", {}, h("span", { class: "live-dot", "aria-hidden": "true" }), name(m.gameId)),
      h("td", {}, m.connectedPlayers.map(playerName).join(" vs ") || "—"),
      h("td", { class: "num" }, String(m.eventCount)),
      h("td", { class: "id", title: m.matchId }, m.matchId.slice(-8)))))));
}
