/**
 * PanelView — dibuja una foto del PanelStore. Todo el texto entra con
 * textContent (los nombres de jugador los escribe la gente: nunca innerHTML).
 *
 * Pestañas, para no tener todo en una sola página larga:
 *   General   totales → clasificación general | jugadas destacadas → partidas en curso
 *   un juego  sus totales → su clasificación | sus jugadas destacadas y sus números
 * La pestaña elegida se mantiene aunque lleguen datos nuevos cada 3 s.
 */
import {
  buildRows, duration, KEY_METRICS, liveMatches, METRIC_HELP, METRIC_LABELS, metricValue, PATTERN_HELP,
  PATTERN_LABELS, playerName, rankByScore, SCORE_RANKED, STANDING_METRIC, type GameRow, type GameSummary, type MatchInfo, type Standing,
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

const TAB_KEY = "gameconsole-panel-tab";
const GENERAL = "general";

export class PanelView {
  private readonly status: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private lastUpdate: Date | null = null;
  private lastErrors: string[] = [];
  private last: Snapshot | null = null;
  private tab: string = readTab();

  constructor(root: HTMLElement) {
    this.status = h("p", { class: "status", "aria-live": "polite" });
    this.tabs = h("nav", { class: "tabs", role: "tablist", "aria-label": "Qué estadísticas ver" });
    this.body = h("div", { class: "body", role: "tabpanel" });
    // Abierto aparte (/panel/): botón para volver a la consola. Dentro de la
    // consola esta cabecera no se muestra (allí el panel se cierra con ✕).
    const back = h("a", { class: "back-link", href: "/", title: "Volver a la consola de juegos" },
      h("span", { class: "btn-icon", "aria-hidden": "true" }, "←"), "Volver a DnD Games");
    root.append(
      appHeader("Estadísticas", "La lista de Santa: calculadas por GameStats · se actualizan cada 3 s", back, this.status),
      this.tabs,
      this.body,
    );
    // "hace N s" avanza aunque no llegue una foto nueva.
    setInterval(() => this.renderStatus(), 1000);
  }

  render(s: Snapshot): void {
    this.last = s;
    this.lastUpdate = s.updatedAt;
    this.lastErrors = s.errors;
    this.renderStatus();

    const rows = buildRows(s.registry, s.overview, s.live);
    if (this.tab !== GENERAL && !rows.some((r) => r.gameId === this.tab)) this.tab = GENERAL;
    this.renderTabs(rows);

    const row = rows.find((r) => r.gameId === this.tab);
    const sections = row ? gamePage(row, s) : generalPage(rows, s);
    this.body.replaceChildren(...sections.filter((x): x is Node => x instanceof Node));
  }

  /** Una pestaña por juego, con cuántas partidas tiene (y un punto si se está jugando). */
  private renderTabs(rows: GameRow[]): void {
    const total = rows.reduce((n, r) => n + r.finished, 0);
    const button = (id: string, label: string, count: number, live: boolean, icon: string | null) => {
      const selected = this.tab === id;
      const b = h("button", { type: "button", role: "tab", class: `tab${selected ? " active" : ""}`, "aria-selected": String(selected) },
        icon ? h("img", { src: icon, alt: "", width: "22", height: "22" }) : h("span", { class: "tab-icon", "aria-hidden": "true" }, "★"),
        label,
        h("span", { class: "tab-count", title: plural(count, "partida terminada", "partidas terminadas") }, String(count)),
        live ? h("span", { class: "live-dot", title: "Se está jugando ahora" }) : null);
      b.addEventListener("click", () => this.select(id));
      return b;
    };
    this.tabs.replaceChildren(
      button(GENERAL, "General", total, rows.some((r) => r.inProgress > 0), null),
      ...rows.map((r) => button(r.gameId, r.name, r.finished, r.inProgress > 0, r.icon)));
  }

  private select(id: string): void {
    this.tab = id;
    try { sessionStorage.setItem(TAB_KEY, id); } catch { /* sin almacenamiento: igual cambia */ }
    if (this.last) this.render(this.last);
    (this.tabs.querySelector(".tab.active") as HTMLElement | null)?.focus();
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

function readTab(): string {
  try { return sessionStorage.getItem(TAB_KEY) ?? GENERAL; } catch { return GENERAL; }
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

/** General: todos los juegos juntos. */
function generalPage(rows: GameRow[], s: Snapshot): Child[] {
  const o = s.overview;
  const playing = rows.reduce((n, r) => n + r.inProgress, 0);
  return [
    o ? null : h("p", { class: "notice" },
      "Este GameStats todavía no tiene estadísticas por juego (llegan con la versión 1.1). Por ahora se muestran las partidas en curso."),

    h("section", { class: "tiles", "aria-label": "Totales" },
      tile("Jugándose ahora", String(playing), playing === 1 ? "partida abierta en este momento" : "partidas abiertas en este momento", "live"),
      tile("Partidas terminadas", o ? String(o.matches) : "—", "en todos los juegos"),
      tile("Jugadores", o ? String(o.players) : "—", "contando a la computadora"),
      tile("Una partida dura", o ? duration(o.avgDurationSeconds) : "—", "en promedio")),

    o && h("section", { class: "split" },
      h("div", { class: "card" },
        sectionHead("Clasificación general", "Todos los juegos juntos. Va primero quien tiene más victorias; si empatan, el de mejor porcentaje."),
        leaderboard(o.standings ?? [], null)),
      h("div", { class: "card" },
        sectionHead("Jugadas destacadas", "Lo que GameStats encontró en las partidas de todos los juegos."),
        highlights(o.topPatterns, "Todavía no pasó nada destacado."))),

    h("section", { class: "card", "aria-label": "Partidas en curso" },
      sectionHead("Partidas que se están jugando", "Se actualiza sola mientras la gente juega."),
      liveTable(liveMatches(s.matches), rows)),
  ];
}

/** Un juego: sus totales, su clasificación, sus jugadas destacadas y sus números. */
function gamePage(r: GameRow, snap: Snapshot): Child[] {
  const s = r.summary;
  const live = liveMatches(snap.matches).filter((m) => m.gameId === r.gameId);
  return [
    h("section", { class: "game-head card" },
      r.icon ? h("img", { src: r.icon, alt: "", width: "48", height: "48" }) : h("span", { class: "noicon" }),
      h("div", { class: "game-title" },
        h("h2", {}, r.name),
        h("span", { class: `badge ${r.available ? "on" : "off"}` }, r.available ? "se puede jugar" : "apagado"))),

    h("section", { class: "tiles", "aria-label": `Totales de ${r.name}` },
      tile("Jugándose ahora", String(r.inProgress), r.inProgress === 1 ? "partida abierta" : "partidas abiertas", "live"),
      tile("Partidas terminadas", String(r.finished), "de este juego"),
      tile("Una partida dura", s ? duration(s.avgDurationSeconds) : "—", "en promedio")),

    !s || s.matches === 0
      ? h("p", { class: "empty card" }, "Todavía no se terminó ninguna partida de este juego. ¡Juega una para ver sus estadísticas!")
      : SCORE_RANKED[r.gameId]
        ? h("section", { class: "card" },
            sectionHead("Clasificación por puntaje",
              `En ${r.name} no se gana ni se pierde: cada partida termina cuando las piezas llegan arriba. Va primero quien hizo la mejor partida; si empatan, el de mejor promedio.`),
            scoreBoard(s.standings ?? [], SCORE_RANKED[r.gameId]))
        : h("section", { class: "card" },
          sectionHead("Clasificación", "Va primero quien tiene más victorias en este juego; si empatan, el de mejor porcentaje."),
          leaderboard(s.standings ?? [], r.gameId),
          s.matchesWithoutWinner > 0 && h("p", { class: "foot" },
            `${plural(s.matchesWithoutWinner, "partida terminó", "partidas terminaron")} sin ganador: empate, se cerró antes o era de una sola persona.`)),

    s && s.matches > 0 && h("section", { class: "pair" },
      h("div", { class: "card" },
        sectionHead("Jugadas destacadas", `Lo que GameStats encontró en las partidas de ${r.name}.`),
        highlights(s.patterns, "Todavía no pasó nada destacado en este juego.")),
      gameNumbers(r.gameId, s)),

    live.length > 0 && h("section", { class: "card", "aria-label": "Partidas en curso" },
      sectionHead("Jugándose ahora", "Se actualiza sola mientras la gente juega."),
      liveTable(live, [r])),
  ];
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
    h("th", { class: "c-rate" }, "% de victorias"));

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

/**
 * Clasificación de un juego sin ganador (Tetris): por puntaje, sin las
 * columnas de ganadas, perdidas y % de victorias, que siempre serían 0.
 */
function scoreBoard(standings: Standing[], cfg: { metric: string; best: string; average: string }): HTMLElement {
  if (!standings.length) return h("p", { class: "empty" }, "Todavía nadie terminó una partida. ¡Juega una para aparecer aquí!");
  const rows = rankByScore(standings, cfg.metric);
  const value = (s: Standing, use: "max" | "avg") => {
    const m = s.metrics[cfg.metric];
    return m ? metricValue(cfg.metric, m[use]) : "—";
  };
  return h("div", { class: "table-scroll" },
    h("table", { class: "leaderboard score-board" },
      h("thead", {}, h("tr", {},
        h("th", { class: "c-pos" }, "#"),
        h("th", {}, "Jugador"),
        h("th", { class: "num" }, "Partidas"),
        h("th", { class: "num c-extra" }, cfg.best),
        h("th", { class: "num c-avg" }, cfg.average))),
      h("tbody", {}, ...rows.map((s, i) => {
        const name = playerName(s.playerId);
        return h("tr", { class: i === 0 ? "leader" : "" },
          h("td", { class: "c-pos" }, position(i + 1)),
          h("td", {}, h("span", { class: "who" }, avatar(s.playerId), h("span", { class: "who-name" }, name))),
          h("td", { class: "num" }, String(s.played)),
          h("td", { class: "num c-extra best" }, value(s, "max")),
          h("td", { class: "num c-avg" }, value(s, "avg")));
      }))));
}

/** Porcentaje de victorias: el número arriba y debajo una barra corta (no se mezcla con la columna de al lado). */
function rateMeter(rate: number, label: string): HTMLElement {
  return h("span", { class: "rate", title: label },
    h("span", { class: "rate-num" }, percent(rate)),
    h("span", { class: "rate-track", "aria-hidden": "true" },
      h("span", { class: "rate-fill", style: `width:${Math.max(0, Math.min(1, rate)) * 100}%` })));
}

/** Patrones como lista: cuántas veces, el nombre y qué significa. */
function highlights(patterns: { rule: string; count: number }[], empty: string): HTMLElement {
  if (!patterns.length) return h("p", { class: "empty" }, empty);
  return h("ul", { class: "highlights" }, ...patterns.map((p) =>
    h("li", {},
      h("span", { class: "hl-count", title: plural(p.count, "vez", "veces") }, String(p.count)),
      h("span", { class: "hl-text" },
        h("strong", {}, PATTERN_LABELS[p.rule] ?? p.rule),
        PATTERN_HELP[p.rule] ? h("small", {}, PATTERN_HELP[p.rule]) : null))));
}

/**
 * Los números del juego: qué hace un jugador en una partida, en promedio y
 * como máximo (récord). Son métricas que calcula GameStats.
 */
function gameNumbers(gameId: string, s: GameSummary): HTMLElement | null {
  const names = [...(KEY_METRICS[gameId] ?? []), ...Object.keys(s.metrics)]
    .filter((m, i, a) => s.metrics[m] && a.indexOf(m) === i).slice(0, 4);
  if (!names.length) return null;
  return h("div", { class: "card" },
    sectionHead("Números del juego", "Lo que hace un jugador en una partida: el promedio de todas y la mejor marca."),
    h("table", { class: "metrics" },
      h("thead", {}, h("tr", {},
        h("th", {}, "Qué se mide"), h("th", { class: "num" }, "Promedio"), h("th", { class: "num" }, "Récord"))),
      h("tbody", {}, ...names.map((m) => h("tr", {},
        h("td", {}, METRIC_LABELS[m] ?? m, METRIC_HELP[m] ? h("small", {}, METRIC_HELP[m]) : null),
        h("td", { class: "num" }, metricValue(m, s.metrics[m].avg)),
        h("td", { class: "num record" }, metricValue(m, s.metrics[m].max)))))));
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
