/**
 * RetryPolicy — patrón Strategy: cuánto esperar antes de reintentar un envío.
 * El EventSender no sabe la regla; la recibe. Por defecto, la del protocolo
 * (sección 6): 1, 2, 4 y 8 s, y después cada 8 s.
 */
export interface RetryPolicy {
  /** Espera (ms) antes del intento número `attempt` (1 = primer reintento). */
  delay(attempt: number): number;
}

export class BackoffPolicy implements RetryPolicy {
  constructor(private readonly steps: readonly number[] = [1_000, 2_000, 4_000, 8_000]) {}

  delay(attempt: number): number {
    return this.steps[Math.min(Math.max(attempt, 1), this.steps.length) - 1];
  }
}
