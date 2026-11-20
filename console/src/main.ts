/**
 * Consola de GameConsole: menú dinámico desde el registry, formulario de
 * partida y partidas en iframes. Todas las rutas son relativas
 * (/api/..., /games/..., /panel/).
 */
import "./style.css";
import { GameCatalog } from "./catalog/GameCatalog";
import { EventBus } from "./match/EventBus";
import { IframeFrame } from "./match/MatchFrame";
import { MatchMediator } from "./match/MatchMediator";
import { MatchSessionFactory } from "./match/MatchSessionFactory";
import { EventSender } from "./sending/EventSender";
import { HttpTransport } from "./sending/EventTransport";
import { ConsoleShell } from "./ui/ConsoleShell";

const origin = window.location.origin;
const catalog = GameCatalog.instance();
const bus = new EventBus();
// EventSender (protocolo, sección 6): escucha el bus y manda todo a GameStats.
const sender = new EventSender(new HttpTransport("/api/events"));
sender.attach(bus);
// Al cerrar la pestaña: lo pendiente y el cierre de las partidas abiertas, con sendBeacon.
window.addEventListener("pagehide", () => sender.flushOnUnload());
const mediator = new MatchMediator(window, origin);
mediator.start();
const sessions = new MatchSessionFactory({
  bus, mediator, origin,
  createFrame: (src, title) => new IframeFrame(src, title),
});

new ConsoleShell(document.getElementById("app")!, { catalog, sessions, sender }).mount();
catalog.start();
