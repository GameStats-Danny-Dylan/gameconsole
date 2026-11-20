/**
 * Emitter — patrón Observer mínimo y tipado.
 * Quien produce hechos llama a emit(); quien quiere enterarse se suscribe con on()
 * y recibe una función para desuscribirse. El que emite no conoce a los oyentes.
 */
export type Listener<T> = (value: T) => void;

export class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
}
