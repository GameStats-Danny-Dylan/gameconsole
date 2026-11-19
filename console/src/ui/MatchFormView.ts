/**
 * MatchFormView — el formulario de una partida, dibujado desde MatchSetup.
 *
 * Solo dibuja lo que dice el modelo (modos, opciones del modo elegido y un
 * campo por jugador humano) y le pasa lo que escribe la persona. Las reglas
 * viven en el modelo, así se prueban sin navegador.
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { MatchSetup, MODE_LABELS } from "../domain/MatchSetup";
import { CPU_ID, NAME_MAX_LENGTH, toPlayerId } from "../domain/players";
import { el } from "./dom";

interface NameRow {
  input: HTMLInputElement;
  hint: HTMLElement;
  error: HTMLElement;
  touched: boolean;
}

export class MatchFormView {
  readonly element = el("dialog", { class: "match-dialog", "aria-labelledby": "match-title" });
  private setup: MatchSetup | null = null;
  private rows: NameRow[] = [];
  private submitted = false;

  private readonly form = el("form", { class: "match-form", novalidate: true });
  private readonly title = el("h2", { id: "match-title" });
  private readonly subtitle = el("p", { class: "muted" });
  private readonly unavailable = el("p", {
    class: "notice warn", role: "status",
    text: "Este juego ya no está en el registry. Cierra el formulario y elige otro.",
  });
  private readonly modeBox = el("fieldset", { class: "field-group" });
  private readonly optionsBox = el("div", { class: "field-group" });
  private readonly playersBox = el("fieldset", { class: "field-group" });
  private readonly startButton = el("button", { type: "submit", class: "btn primary", text: "Jugar" });

  constructor(private readonly onStart: (ctx: MatchContext, manifest: GameManifest) => void) {
    const cancel = el("button", { type: "button", class: "btn", text: "Cancelar" });
    cancel.addEventListener("click", () => this.close());
    this.form.append(
      el("header", {}, this.title, this.subtitle),
      this.unavailable, this.modeBox, this.optionsBox, this.playersBox,
      el("footer", {}, cancel, this.startButton),
    );
    this.form.addEventListener("submit", (e) => { e.preventDefault(); this.submit(); });
    this.element.append(this.form);
    this.element.addEventListener("close", () => { this.setup = null; });
  }

  /** El id del juego del formulario abierto, o null. */
  get openGameId(): string | null { return this.setup?.manifest.id ?? null; }

  open(manifest: GameManifest): void {
    this.setup = new MatchSetup(manifest);
    this.submitted = false;
    this.title.textContent = `Nueva partida: ${manifest.name}`;
    this.subtitle.textContent = manifest.description ?? "";
    this.setAvailable(true);
    this.renderModes();
    this.renderModeDependent();
    if (!this.element.open) this.element.showModal();
    this.rows[0]?.input.focus();
  }

  close(): void {
    if (this.element.open) this.element.close();
  }

  /** El juego se fue del registry mientras el formulario estaba abierto. */
  setAvailable(available: boolean): void {
    this.unavailable.hidden = available;
    this.startButton.disabled = !available;
  }

  private renderModes(): void {
    const s = this.setup!;
    this.modeBox.replaceChildren(el("legend", { text: "Modo" }));
    if (s.modes.length === 1) {
      this.modeBox.append(el("p", { class: "fixed-value", text: MODE_LABELS[s.mode] ?? s.mode }));
      return;
    }
    const list = el("div", { class: "segmented", role: "radiogroup" });
    for (const mode of s.modes) {
      const radio = el("input", { type: "radio", name: "mode", value: mode, checked: mode === s.mode });
      radio.addEventListener("change", () => { s.setMode(mode); this.renderModeDependent(); });
      list.append(el("label", {}, radio, el("span", { text: MODE_LABELS[mode] ?? mode })));
    }
    this.modeBox.append(list);
  }

  /** Lo que cambia con el modo: las opciones que se preguntan y los jugadores. */
  private renderModeDependent(): void {
    const s = this.setup!;

    this.optionsBox.replaceChildren();
    for (const field of s.options()) {
      const id = `opt-${field.key}`;
      const select = el("select", { id, name: field.key });
      field.choices.forEach((c, i) =>
        select.append(el("option", { value: String(i), text: c.label, selected: c.value === field.value })));
      select.addEventListener("change", () => s.setOptionIndex(field.key, Number(select.value)));
      this.optionsBox.append(el("div", { class: "field" }, el("label", { for: id, text: field.label }), select));
    }
    this.optionsBox.hidden = this.optionsBox.childElementCount === 0;

    this.playersBox.replaceChildren(el("legend", { text: s.humans === 1 ? "Jugador" : "Jugadores" }));
    const names = s.playerNames();
    this.rows = names.map((name, i) => {
      const id = `player-${i + 1}`;
      const input = el("input", {
        id, type: "text", name: id, placeholder: "Escribe tu nombre", required: true,
        maxlength: NAME_MAX_LENGTH, autocomplete: "off", spellcheck: "false", "aria-describedby": `${id}-error`,
      });
      input.value = name;   // vacío la primera vez; si cambió de modo, lo que ya escribió
      const row: NameRow = {
        input, touched: name !== "",
        hint: el("small", { class: "hint" }),
        error: el("small", { class: "error", id: `${id}-error`, "aria-live": "polite" }),
      };
      input.addEventListener("input", () => { s.setName(i, input.value); this.refreshNames(); });
      input.addEventListener("blur", () => { row.touched = true; this.refreshNames(); });
      this.playersBox.append(el("div", { class: "field" },
        el("label", { for: id, text: s.humans === 1 ? "Tu nombre" : `Jugador ${i + 1}` }), input, row.hint, row.error));
      return row;
    });
    if (s.hasCpu)
      this.playersBox.append(el("div", { class: "field cpu-row" },
        el("span", { class: "label", text: `Jugador ${s.humans + 1}` }),
        el("p", { class: "fixed-value", text: `Computadora (${CPU_ID})` })));
    this.refreshNames();
  }

  /** Errores y playerId de cada nombre. Un error se muestra al salir del campo o al intentar jugar. */
  private refreshNames(): void {
    const errors = this.setup!.nameErrors();
    this.rows.forEach((row, i) => {
      const show = (row.touched || this.submitted) ? errors[i] : null;
      row.error.textContent = show ?? "";
      row.input.setAttribute("aria-invalid", String(show !== null));
      const pid = toPlayerId(row.input.value);
      row.hint.textContent = pid ? `Se guarda como «${pid}»` : "";
    });
  }

  private submit(): void {
    const s = this.setup;
    if (!s || this.startButton.disabled) return;
    this.submitted = true;
    this.refreshNames();
    if (!s.isValid) {
      this.rows[s.nameErrors().findIndex((e) => e !== null)]?.input.focus();
      return;
    }
    const ctx = s.buildContext();
    const manifest = s.manifest;
    this.close();
    this.onStart(ctx, manifest);
  }
}
