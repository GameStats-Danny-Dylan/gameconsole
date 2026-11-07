/**
 * StandaloneHost — un GameHost para jugar SIN la consola (modo de prueba).
 * Sella cada evento y, si `send` está activo, los manda a /api/events en orden,
 * de a uno por vez por partida (como el EventSender de la consola, pero simple).
 * Dentro de la consola este archivo no se usa: el host es el SDK.
 */
import type { GameEventDraft } from "../adapter/GameStatsAdapter";
import type { GameHost } from "../game/ports";
import { EventStamper, type ContractEvent } from "./EventStamper";

export class StandaloneHost implements GameHost {
  readonly sent: ContractEvent[] = [];
  private queue: ContractEvent[] = [];
  private sending = false;

  constructor(
    private readonly stamper: EventStamper,
    private readonly send: boolean,
    private readonly log: (line: string) => void = (l) => console.log(l),
    private readonly onFinish: (winner: string | null) => void = () => {},
  ) {}

  emit(draft: GameEventDraft): void {
    const event = this.stamper.stamp(draft);
    this.sent.push(event);
    this.log(`${event.type}${event.action ? ` ${event.action}` : ""} ${event.playerId ?? ""} ${JSON.stringify(event.data ?? {})}`);
    if (this.send) {
      this.queue.push(event);
      void this.flush();
    }
  }

  finish(winner: string | null, reason: "normal" | "stopped"): void {
    this.log(`FINISHED ganador=${winner ?? "nadie"} (${reason})`);
    this.onFinish(winner);
  }

  error(message: string, fatal: boolean): void {
    this.log(`${fatal ? "ERROR FATAL" : "aviso"}: ${message}`);
  }

  private async flush(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, 20);
        try {
          const res = await fetch("/api/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(batch),
          });
          const body = await res.json().catch(() => ({}));
          this.log(`→ GameStats: ${res.status} aceptados ${body.accepted ?? "?"}/${batch.length}`);
        } catch (err) {
          this.log(`→ GameStats no responde (${(err as Error).message}); se reintenta en 2 s`);
          this.queue.unshift(...batch);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } finally {
      this.sending = false;
    }
  }
}
