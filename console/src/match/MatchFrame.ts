/**
 * MatchFrame — el iframe de una partida, visto desde la sesión.
 *
 * La sesión solo necesita mandar mensajes, saber cuándo cargó, enfocar y
 * quitar el iframe. Así se prueba sin navegador (con un marco falso) y el
 * HTMLIFrameElement real queda en IframeFrame.
 */
import type { ConsoleMessage } from "@gameconsole/sdk";

export interface MatchFrame {
  /** La ventana del juego: se compara con event.source de cada mensaje. */
  readonly window: unknown;
  post(message: ConsoleMessage, targetOrigin: string): void;
  /** Avisa cada vez que el iframe termina de cargar. */
  onLoad(listener: () => void): void;
  focus(): void;
  remove(): void;
}

export class IframeFrame implements MatchFrame {
  readonly element: HTMLIFrameElement;

  constructor(src: string, title: string) {
    this.element = document.createElement("iframe");
    this.element.className = "match-frame";
    this.element.src = src;
    this.element.title = title;
    this.element.allow = "fullscreen; gamepad";
  }

  get window(): unknown { return this.element.contentWindow; }

  post(message: ConsoleMessage, targetOrigin: string): void {
    this.element.contentWindow?.postMessage(message, targetOrigin);
  }

  onLoad(listener: () => void): void {
    this.element.addEventListener("load", listener);
  }

  focus(): void {
    this.element.focus();
    this.element.contentWindow?.focus();
  }

  remove(): void {
    this.element.remove();
  }
}
