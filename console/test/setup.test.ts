import { describe, expect, it } from "vitest";
import { MatchSetup } from "../src/domain/MatchSetup";
import { MatchContextFactory } from "../src/domain/MatchContextFactory";
import { manifest } from "./fixtures";

const fixedIds = () => new MatchContextFactory(() => "1111-2222");

describe("MatchSetup: el formulario sale del manifiesto", () => {
  it("los modos son los del manifiesto y empieza en el primero", () => {
    const s = new MatchSetup(manifest());
    expect(s.modes).toEqual(["vs-cpu", "local-2p"]);
    expect(s.mode).toBe("vs-cpu");
  });

  it("muestra solo las opciones del modo elegido, con label, labels y default", () => {
    const s = new MatchSetup(manifest());
    expect(s.options()).toEqual([
      { key: "nivel", label: "Nivel", value: "b",
        choices: [{ value: "a", label: "Bajo" }, { value: "b", label: "Medio" }, { value: "c", label: "Alto" }] },
      { key: "segundos", label: "Tiempo", value: 0,
        choices: [{ value: 0, label: "Sin límite" }, { value: 15, label: "15 s" }, { value: 30, label: "30 s" }] },
    ]);
    s.setMode("local-2p");
    expect(s.options().map((o) => o.key)).toEqual(["segundos"]);   // "nivel" solo en vs-cpu
  });

  it("sin labels muestra el valor; sin default (o con uno que no existe) elige el primero", () => {
    const s = new MatchSetup(manifest({
      modes: ["solo"],
      options: [
        { key: "x", label: "X", type: "select", values: [1, 5, 10] },
        { key: "y", label: "Y", type: "select", values: ["p", "q"], default: "nada" },
      ],
    }));
    expect(s.options()).toEqual([
      { key: "x", label: "X", value: 1, choices: [{ value: 1, label: "1" }, { value: 5, label: "5" }, { value: 10, label: "10" }] },
      { key: "y", label: "Y", value: "p", choices: [{ value: "p", label: "p" }, { value: "q", label: "q" }] },
    ]);
  });

  it("no pregunta opciones de un tipo que no conoce ni select sin valores", () => {
    const s = new MatchSetup(manifest({
      options: [
        { key: "color", label: "Color", type: "color" },
        { key: "vacia", label: "Vacía", type: "select", values: [] },
      ],
    }));
    expect(s.options()).toEqual([]);
  });

  it("un juego sin options no tiene opciones", () => {
    expect(new MatchSetup(manifest({ options: undefined })).options()).toEqual([]);
  });

  it("elegir una opción guarda el valor de values con su tipo (número)", () => {
    const s = new MatchSetup(manifest());
    s.setOptionIndex("segundos", 2);
    expect(s.options().find((o) => o.key === "segundos")!.value).toBe(30);
    expect(() => s.setOptionIndex("segundos", 9)).toThrow();
    expect(() => s.setOptionIndex("inventada", 0)).toThrow();
  });

  it("un campo de nombre por humano, vacío al empezar", () => {
    const s = new MatchSetup(manifest());
    expect(s.playerNames()).toEqual([""]);
    expect(s.hasCpu).toBe(true);
    s.setMode("local-2p");
    expect(s.playerNames()).toEqual(["", ""]);
    expect(s.hasCpu).toBe(false);
  });

  it("solo tiene un humano y no tiene cpu", () => {
    const s = new MatchSetup(manifest({ modes: ["solo"] }));
    expect(s.humans).toBe(1);
    expect(s.hasCpu).toBe(false);
  });

  it("cambiar de modo conserva los nombres ya escritos", () => {
    const s = new MatchSetup(manifest());
    s.setMode("local-2p");
    s.setName(0, "Ana");
    s.setName(1, "Beto");
    s.setMode("vs-cpu");
    expect(s.playerNames()).toEqual(["Ana"]);
    s.setMode("local-2p");
    expect(s.playerNames()).toEqual(["Ana", "Beto"]);
  });

  it("no acepta un modo que el juego no tiene", () => {
    expect(() => new MatchSetup(manifest()).setMode("solo")).toThrow();
  });

  it("solo es válido con nombres válidos", () => {
    const s = new MatchSetup(manifest());
    s.setMode("local-2p");
    expect(s.isValid).toBe(false);
    s.setName(0, "Ana");
    s.setName(1, "ana");
    expect(s.isValid).toBe(false);
    expect(() => s.buildContext()).toThrow();
    s.setName(1, "Beto");
    expect(s.isValid).toBe(true);
  });
});

describe("MatchContext (payload de INIT)", () => {
  it("vs-cpu: el humano en el slot 1 y cpu en el 2, con las opciones del modo", () => {
    const s = new MatchSetup(manifest(), fixedIds());
    s.setName(0, " Danny G ");
    s.setOptionIndex("nivel", 2);
    expect(s.buildContext()).toEqual({
      gameId: "fichas",
      matchId: "fichas-1111-2222",
      mode: "vs-cpu",
      players: [
        { playerId: "danny-g", name: "Danny G", kind: "human", slot: 1 },
        { playerId: "cpu", name: "CPU", kind: "cpu", slot: 2 },
      ],
      options: { nivel: "c", segundos: 0 },
    });
  });

  it("local-2p: dos humanos, sin cpu, y sin las opciones de otros modos", () => {
    const s = new MatchSetup(manifest(), fixedIds());
    s.setMode("local-2p");
    s.setName(0, "Ana");
    s.setName(1, "Beto");
    s.setOptionIndex("segundos", 1);
    const ctx = s.buildContext();
    expect(ctx.players).toEqual([
      { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
      { playerId: "beto", name: "Beto", kind: "human", slot: 2 },
    ]);
    expect(ctx.options).toEqual({ segundos: 15 });
  });

  it("gameId es el id del manifiesto, no el gameStatsId", () => {
    const s = new MatchSetup(manifest({ modes: ["solo"] }), fixedIds());
    s.setName(0, "Ana");
    expect(s.buildContext().gameId).toBe("fichas");
  });

  it("cada partida tiene un matchId nuevo con el prefijo del id", () => {
    const s = new MatchSetup(manifest({ modes: ["solo"] }));
    s.setName(0, "Ana");
    const one = s.buildContext().matchId;
    const two = s.buildContext().matchId;
    expect(one).toMatch(/^fichas-[0-9a-f-]{36}$/);
    expect(one).not.toBe(two);
  });

  it("el contexto es una copia: cambiar el formulario después no lo toca", () => {
    const s = new MatchSetup(manifest(), fixedIds());
    s.setName(0, "Ana");
    const ctx = s.buildContext();
    s.setOptionIndex("segundos", 2);
    expect(ctx.options.segundos).toBe(0);
  });
});
