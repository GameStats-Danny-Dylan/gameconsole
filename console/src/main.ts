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
import { ConsoleShell } from "./ui/ConsoleShell";

const origin = window.location.origin;
const catalog = GameCatalog.instance();
/** Aquí se suscribirá el EventSender (siguiente bloque). */
const bus = new EventBus();
const mediator = new MatchMediator(window, origin);
mediator.start();
const sessions = new MatchSessionFactory({
  bus, mediator, origin,
  createFrame: (src, title) => new IframeFrame(src, title),
});

new ConsoleShell(document.getElementById("app")!, { catalog, sessions }).mount();
catalog.start();
