/**
 * Punto de entrada del juego.
 *
 * - Dentro de la consola (en un iframe): lo maneja el SDK. Cuando esté listo,
 *   aquí va `new Connect4App(...)`: una clase que hereda de GameApp y llama a
 *   init / start / pause / resume / stop de Connect4Game (protocolo, sección 9).
 * - Abierto directamente (/games/connect4/): modo de prueba con un formulario.
 */
import "./style.css";
import { mountStandalone } from "./standalone/setup";
import { initTheme } from "./ui/theme";

const root = document.getElementById("app")!;
const insideConsole = window.self !== window.top;
initTheme(); // dentro de la consola también: el tema lo elige la persona en cualquier app

if (insideConsole) {
  // TODO(SDK): conectar con GameApp del SDK de la consola.
  root.classList.add("embedded");
  root.textContent = "Esperando a la consola…";
} else {
  mountStandalone(root);
}
