/**
 * PanelView — dibuja una foto del PanelStore. Todo el texto entra con
 * textContent (los nombres de jugador los escribe la gente: nunca innerHTML).
 */
import {
  buildRows, duration, KEY_METRICS, liveMatches, METRIC_HELP, METRIC_LABELS, metricValue, PATTERN_HELP,
  PATTERN_LABELS, playerName, type GameRow, type MatchInfo,
} from "../model";
import type { Snapshot } from "../store/PanelStore";

type Child = Node | string | null | false | undefined;

function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

export class PanelView {
  private readonly status: HTMLElement;
  private readonly body: HTMLElement;
  private lastUpdate: Date | null = null;
  private lastErrors: string[] = [];

  constructor(root: HTMLElement) {
    this.status = h("p", { class: "status", "aria-live": "polite" });
    this.body = h("div", { class: "body" });
    root.append(
      h("header", { class: "top" },
        h("div", {},
          h("h1", {}, "Panel de GameConsole"),
          h("p", { class: "sub" }, "Estadísticas calculadas por GameStats · se actualiza cada 3 s")),
        this.status),
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
        tile("Jugándose ahora", String(playing), playing === 1 ? "partida abierta en este momento" : "partidas abiertas en este momento"),
        tile("Partidas terminadas", o ? String(o.matches) : "—", "desde que se encendió el sistema"),
        tile("Jugadores", o ? String(o.players) : "—", "personas distintas (y la computadora)"),
        tile("Una partida dura", o ? duration(o.avgDurationSeconds) : "—", "en promedio")),
      h("section", { "aria-label": "Juegos" },
        h("h2", {}, "Por juego"),
        rows.length
          ? h("div", { class: "games" }, ...rows.map(gameCard))
          : h("p", { class: "empty" }, "Todavía no hay juegos registrados ni partidas.")),
      h("section", { "aria-label": "Partidas en curso" },
        h("h2", {}, "Partidas que se están jugando"),
        liveTable(liveMatches(s.matches), rows)),
      o && h("section", { class: "two" },
        h("div", {},
          h("h2", {}, "Quién ganó más"),
          bars(o.topWinners.map((w) => ({ label: playerName(w.playerId), value: w.wins, unit: w.wins === 1 ? "victoria" : "victorias" })),
            "Nadie ha ganado todavía.")),
        h("div", {},
          h("h2", {}, "Jugadas destacadas"),
          h("p", { class: "muted" }, "Cosas que GameStats encontró en las partidas, y cuántas veces pasaron."),
          bars(o.topPatterns.map((p) => ({
            label: PATTERN_LABELS[p.rule] ?? p.rule, help: PATTERN_HELP[p.rule],
            value: p.count, unit: p.count === 1 ? "vez" : "veces",
          })), "Todavía no pasó nada destacado."))),
    ];
    this.body.replaceChildren(...sections.filter((s): s is Node => s instanceof Node));
  }

  private renderStatus(): void {
    if (!this.lastUpdate) { this.status.textContent = "Conectando…"; return; }
    const secs = Math.max(0, Math.round((Date.now() - this.lastUpdate.getTime()) / 1000));
    const ok = this.lastErrors.length === 0;
    this.status.className = `status ${ok ? "ok" : "bad"}`;
    this.status.replaceChildren(
      h("span", { class: "icon", "aria-hidden": "true" }, ok ? "●" : "▲"),
      ok ? `En vivo · actualizado hace ${secs} s` : `Sin respuesta de ${this.lastErrors.map((e) => e.split(":")[0]).join(", ")}`,
    );
    this.status.title = this.lastErrors.join("\n");
  }
}

function tile(label: string, value: string, hint: string): HTMLElement {
  return h("div", { class: "tile" }, h("span", { class: "label" }, label), h("strong", {}, value), h("span", { class: "hint" }, hint));
}

function gameCard(r: GameRow): HTMLElement {
  const s = r.summary;
  const metricNames = s ? [...(KEY_METRICS[r.gameId] ?? []), ...Object.keys(s.metrics)].filter((m, i, a) => s.metrics[m] && a.indexOf(m) === i).slice(0, 4) : [];
  return h("article", { class: "game" },
    h("header", {},
      r.icon ? h("img", { src: r.icon, alt: "", width: "28", height: "28" }) : h("span", { class: "noicon" }),
      h("h3", {}, r.name),
      h("span", { class: `badge ${r.available ? "on" : "off"}` }, r.available ? "se puede jugar" : "apagado")),
    h("div", { class: "counts" },
      h("div", {}, h("strong", {}, String(r.inProgress)), h("span", {}, "jugándose")),
      h("div", {}, h("strong", {}, String(r.finished)), h("span", {}, "terminadas")),
      h("div", {}, h("strong", {}, s ? duration(s.avgDurationSeconds) : "—"), h("span", {}, "dura en promedio"))),
    s && s.matches > 0 && h("div", { class: "detail" },
      metricNames.length > 0 && h("table", { class: "metrics" },
        h("thead", {}, h("tr", {},
          h("th", {}, "Cada jugador, en una partida"), h("th", {}, "Normalmente"), h("th", {}, "Récord"))),
        h("tbody", {}, ...metricNames.map((m) => h("tr", {},
          h("td", {}, METRIC_LABELS[m] ?? m, METRIC_HELP[m] ? h("small", {}, METRIC_HELP[m]) : null),
          h("td", {}, metricValue(m, s.metrics[m].avg)),
          h("td", {}, metricValue(m, s.metrics[m].max)))))),
      h("h4", {}, "Quién ganó más"),
      bars(s.winners.slice(0, 3).map((w) => ({ label: playerName(w.playerId), value: w.wins, unit: w.wins === 1 ? "victoria" : "victorias" })),
        s.matchesWithoutWinner === s.matches ? "Nadie ganó todavía (empates, partidas cerradas antes o de una sola persona)." : "—"),
      s.matchesWithoutWinner > 0 && h("p", { class: "muted" },
        `${s.matchesWithoutWinner} ${s.matchesWithoutWinner === 1 ? "partida terminó" : "partidas terminaron"} sin ganador (empate, se cerró antes o era de una sola persona)`),
      s.patterns.length > 0 && h("p", { class: "muted" }, "Jugadas destacadas: ",
        s.patterns.slice(0, 3).map((p) => `${PATTERN_LABELS[p.rule] ?? p.rule} (${p.count})`).join(" · "))),
  );
}

/** Lista con barras horizontales de un solo color; el número va escrito al lado. */
function bars(items: { label: string; help?: string; value: number; unit: string }[], empty: string): HTMLElement {
  if (!items.length) return h("p", { class: "empty" }, empty);
  const max = Math.max(...items.map((i) => i.value), 1);
  return h("ol", { class: "bars" }, ...items.map((i) => {
    const tip = `${i.label}: ${i.value} ${i.unit}${i.help ? ` (${i.help})` : ""}`;
    return h("li", { title: tip, "aria-label": tip, tabindex: "0" },
      h("span", { class: "name" }, i.label, i.help ? h("small", {}, i.help) : null),
      h("span", { class: "track" }, h("span", { class: "fill", style: `width:${(i.value / max) * 100}%` })),
      h("span", { class: "value" }, String(i.value)));
  }));
}

function liveTable(matches: MatchInfo[], rows: GameRow[]): HTMLElement {
  if (!matches.length) return h("p", { class: "empty" }, "Nadie está jugando en este momento.");
  const name = (id: string) => rows.find((r) => r.gameId === id)?.name ?? id;
  return h("div", { class: "table-wrap" }, h("table", { class: "live" },
    h("thead", {}, h("tr", {}, h("th", {}, "Juego"), h("th", {}, "Jugadores"),
      h("th", { class: "num", title: "Jugadas y avisos que la partida le mandó a GameStats" }, "Jugadas registradas"),
      h("th", {}, "Código"))),
    h("tbody", {}, ...matches.map((m) => h("tr", {},
      h("td", {}, name(m.gameId)),
      h("td", {}, m.connectedPlayers.map(playerName).join(" vs ") || "—"),
      h("td", { class: "num" }, String(m.eventCount)),
      h("td", { class: "id", title: m.matchId }, m.matchId.slice(-8)))))));
}
