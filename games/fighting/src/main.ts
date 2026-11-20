/**
 * Punto de entrada del juego.
 *
 * - Dentro de la consola (en un iframe): FightingApp, sobre el SDK. La consola
 *   manda INIT / START / PAUSE / RESUME / STOP y recibe los eventos.
 * - Abierto directamente (/games/fighting/): modo de prueba con un formulario.
 */
import "./style.css";
import { initTheme } from "@gameconsole/sdk/theme";
import manifest from "../public/game.json";
import { FightingApp } from "./game/FightingApp";
import { mountStandalone } from "./standalone/setup";

const root = document.getElementById("app")!;
const insideConsole = window.self !== window.top;
initTheme(); // dentro de la consola también: el tema lo elige la persona en cualquier app

if (insideConsole) {
  root.classList.add("embedded");
  root.textContent = "Esperando a la consola…";
  new FightingApp(root, { manifest }).listen();
} else {
  mountStandalone(root);
}
