/**
 * players.ts — nombres de los jugadores humanos y su playerId (protocolo, sección 5).
 *
 * playerId = el nombre en minúsculas, sin acentos y con guiones en lugar de
 * espacios o símbolos ("Danny G" -> "danny-g", "José Pérez" -> "jose-perez").
 * La computadora es siempre "cpu", así que ningún humano puede llamarse así.
 */

export const CPU_ID = "cpu";
export const CPU_NAME = "CPU";
export const NAME_MAX_LENGTH = 24;

/** Convierte el nombre que escribe la persona en su playerId. */
export function toPlayerId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // quita los acentos (é -> e, ñ -> n)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")        // espacios y símbolos -> un guion
    .replace(/^-+|-+$/g, "");           // sin guiones al principio ni al final
}

/** Lo que una regla sabe de todos los nombres del formulario. */
interface NameContext {
  name: string;
  playerId: string;
  index: number;
  playerIds: readonly string[];
}

/**
 * Strategy: cada regla revisa un nombre a su manera y devuelve el problema
 * (o null). Agregar una regla = agregar una clase a la lista de NameValidator.
 */
interface NameRule {
  check(c: NameContext): string | null;
}

class RequiredRule implements NameRule {
  check(c: NameContext) { return c.name.trim() === "" ? "Escribe un nombre." : null; }
}

class MaxLengthRule implements NameRule {
  check(c: NameContext) {
    return c.name.trim().length > NAME_MAX_LENGTH ? `Máximo ${NAME_MAX_LENGTH} caracteres.` : null;
  }
}

class UsableIdRule implements NameRule {
  check(c: NameContext) { return c.playerId === "" ? "Usa al menos una letra o un número." : null; }
}

class NotCpuRule implements NameRule {
  check(c: NameContext) { return c.playerId === CPU_ID ? `"${CPU_ID}" está reservado para la computadora.` : null; }
}

/** Dos nombres que dan el mismo playerId ("Ana" y "ana ") cuentan como repetidos. */
class DistinctRule implements NameRule {
  check(c: NameContext) {
    const first = c.playerIds.indexOf(c.playerId);
    return first !== c.index ? "Ese nombre ya lo tiene otro jugador." : null;
  }
}

export class NameValidator {
  private readonly rules: readonly NameRule[] = [
    new RequiredRule(), new MaxLengthRule(), new UsableIdRule(), new NotCpuRule(), new DistinctRule(),
  ];

  /** Un mensaje por nombre (null si está bien), en el mismo orden que `names`. */
  validate(names: readonly string[]): (string | null)[] {
    const playerIds = names.map(toPlayerId);
    return names.map((name, index) => {
      const c: NameContext = { name, playerId: playerIds[index], index, playerIds };
      for (const rule of this.rules) {
        const problem = rule.check(c);
        if (problem) return problem;
      }
      return null;
    });
  }

  isValid(names: readonly string[]): boolean {
    return this.validate(names).every((e) => e === null);
  }
}
