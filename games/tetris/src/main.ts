/**
 * Punto de entrada del juego.
 *
 * - Dentro de la consola (en un iframe): TetrisApp, sobre el SDK. La consola
 *   manda INIT / START / PAUSE / RESUME / STOP y recibe los eventos.
 * - Abierto directamente (/games/tetris/): modo de prueba sin eventos.
 */
import "./style.css";
import { initTheme } from "@gameconsole/sdk/theme";
import manifest from "../public/game.json";
import { TetrisApp } from "./game/TetrisApp";
import { mountStandalone } from "./standalone/setup";

const root = document.getElementById("app")!;
const insideConsole = window.self !== window.top;
initTheme(); // dentro de la consola también: el tema lo elige la persona en cualquier app

if (insideConsole) {
  root.classList.add("embedded");
  root.textContent = "Esperando a la consola…";
  new TetrisApp(root, { manifest }).listen();
} else {
  mountStandalone(root, manifest.howToPlay);
}
