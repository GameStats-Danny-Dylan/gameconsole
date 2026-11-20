/**
 * SendIndicator — el estado del envío a GameStats, en la cabecera.
 * Observer del EventSender: se redibuja cuando cambia su estado.
 */
import type { EventSender, SenderStatus } from "../sending/EventSender";
import { el } from "./dom";

export function sendIndicator(sender: EventSender): HTMLElement {
  const node = el("p", { class: "signal send-status", role: "status" });
  const render = (s: SenderStatus) => {
    const [cls, text, title] =
      s.failing ? ["bad", `No responde · ${s.pending} en espera`, `Se reintenta solo; no se pierde nada. ${s.lastError ?? ""}`] :
      s.pending > 0 ? ["busy", `Enviando ${s.pending}…`, "Mandando los eventos de las partidas a GameStats"] :
      ["ok", "Al día", `${s.sent} eventos enviados${s.rejected ? ` · ${s.rejected} rechazados` : ""}`];
    node.className = `signal send-status ${cls}`;
    node.title = title.trim();
    node.replaceChildren(el("span", { class: "icon", "aria-hidden": "true", text: "●" }), text);
  };
  sender.onChange(render);
  return node;
}
