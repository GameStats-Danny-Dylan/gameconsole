/**
 * Consola de GameConsole: menú dinámico desde el registry y formulario de partida.
 * Todas las rutas son relativas (/api/..., /games/..., /panel/).
 */
import "./style.css";
import { GameCatalog } from "./catalog/GameCatalog";
import { ConsoleShell } from "./ui/ConsoleShell";

const catalog = GameCatalog.instance();
new ConsoleShell(document.getElementById("app")!, catalog).mount();
catalog.start();
