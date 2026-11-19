/**
 * Punto de entrada del juego.
 *
 * - Dentro de la consola (en un iframe): Connect4App, sobre el SDK. La consola
 *   manda INIT / START / PAUSE / RESUME / STOP y recibe los eventos.
 * - Abierto directamente (/games/connect4/): modo de prueba con un formulario.
 */
import "./style.css";
import { initTheme } from "@gameconsole/sdk/theme";
import manifest from "../public/game.json";
import { Connect4App } from "./game/Connect4App";
import { mountStandalone } from "./standalone/setup";

const root = document.getElementById("app")!;
const insideConsole = window.self !== window.top;
initTheme(); // dentro de la consola también: el tema lo elige la persona en cualquier app

if (insideConsole) {
  root.classList.add("embedded");
  root.textContent = "Esperando a la consola…";
  new Connect4App(root, { manifest }).listen();
} else {
  mountStandalone(root);
}
