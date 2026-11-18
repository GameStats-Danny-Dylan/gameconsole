/**
 * MatchSetup — el modelo del formulario de una partida, sin DOM.
 *
 * Todo sale del manifiesto (protocolo, sección 2): los modos, las opciones
 * (solo las del modo elegido) y cuántos humanos juegan. La consola no conoce
 * ningún juego por nombre ni qué significa cada opción.
 */
import type { GameManifest, GameOption, MatchContext, Mode } from "@gameconsole/sdk";
import { MatchContextFactory } from "./MatchContextFactory";
import { NameValidator } from "./players";

export type OptionValue = string | number;

export interface OptionChoice {
  value: OptionValue;
  label: string;
}

/** Una opción lista para dibujar: el control y el valor elegido. */
export interface OptionField {
  key: string;
  label: string;
  choices: readonly OptionChoice[];
  value: OptionValue;
}

/** Texto de cada modo del protocolo (no de un juego). */
export const MODE_LABELS: Record<Mode, string> = {
  "solo": "Solo",
  "vs-cpu": "Contra la computadora",
  "local-2p": "2 jugadores",
};

/** Humanos por modo: en local-2p juegan dos personas en el mismo dispositivo. */
export function humansFor(mode: Mode): number {
  return mode === "local-2p" ? 2 : 1;
}

/** En v1 solo hay opciones "select" con valores; las demás no se preguntan ni se mandan. */
function isSupported(o: GameOption): o is GameOption & { values: OptionValue[] } {
  return o.type === "select" && Array.isArray(o.values) && o.values.length > 0;
}

function defaultOf(o: GameOption & { values: OptionValue[] }): OptionValue {
  return o.default !== undefined && o.values.includes(o.default) ? o.default : o.values[0];
}

export class MatchSetup {
  private currentMode: Mode;
  private readonly chosen = new Map<string, OptionValue>();
  private readonly names: string[] = [];
  private readonly validator = new NameValidator();

  constructor(
    readonly manifest: GameManifest,
    private readonly factory = new MatchContextFactory(),
  ) {
    if (manifest.modes.length === 0) throw new Error(`${manifest.id} no tiene modos`);
    this.currentMode = manifest.modes[0];
    for (const o of this.supportedOptions()) this.chosen.set(o.key, defaultOf(o));
    this.fitNames();
  }

  get modes(): readonly Mode[] { return this.manifest.modes; }
  get mode(): Mode { return this.currentMode; }
  get humans(): number { return humansFor(this.currentMode); }
  get hasCpu(): boolean { return this.currentMode === "vs-cpu"; }

  /** Cambia de modo. Los nombres y las opciones ya elegidas se conservan. */
  setMode(mode: Mode): void {
    if (!this.manifest.modes.includes(mode)) throw new Error(`modo no disponible: ${mode}`);
    this.currentMode = mode;
    this.fitNames();
  }

  /** Las opciones que se preguntan en el modo actual. */
  options(): OptionField[] {
    return this.supportedOptions()
      .filter((o) => !o.modes || o.modes.includes(this.currentMode))
      .map((o) => ({
        key: o.key,
        label: o.label,
        choices: o.values.map((value, i) => ({ value, label: o.labels?.[i] ?? String(value) })),
        value: this.chosen.get(o.key)!,
      }));
  }

  /** Elige un valor por su posición en `values` (así no se pierde si era número). */
  setOptionIndex(key: string, index: number): void {
    const o = this.supportedOptions().find((x) => x.key === key);
    if (!o || !(index in o.values)) throw new Error(`valor inválido para ${key}`);
    this.chosen.set(key, o.values[index]);
  }

  /** Los nombres de los humanos del modo actual, en orden de slot. */
  playerNames(): readonly string[] { return this.names.slice(0, this.humans); }

  setName(index: number, name: string): void {
    if (index < 0 || index >= this.humans) throw new Error(`no hay jugador ${index + 1}`);
    this.names[index] = name;
  }

  /** Un mensaje por nombre (null si está bien). */
  nameErrors(): (string | null)[] { return this.validator.validate(this.playerNames()); }

  get isValid(): boolean { return this.validator.isValid(this.playerNames()); }

  /** El payload de INIT. Solo con los nombres válidos. */
  buildContext(): MatchContext {
    if (!this.isValid) throw new Error("hay nombres inválidos");
    const options: Record<string, OptionValue> = {};
    for (const f of this.options()) options[f.key] = f.value;
    return this.factory.create({ manifest: this.manifest, mode: this.currentMode, names: this.playerNames(), options });
  }

  private supportedOptions() {
    return (this.manifest.options ?? []).filter(isSupported);
  }

  /**
   * Agrega los lugares que falten, sin valor puesto. No borra los que sobran:
   * si se pasa de 2 jugadores a 1 y se vuelve, el segundo nombre sigue ahí.
   */
  private fitNames(): void {
    while (this.names.length < this.humans) this.names.push("");
  }
}
