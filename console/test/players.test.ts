import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, NameValidator, toPlayerId } from "../src/domain/players";

describe("toPlayerId", () => {
  it.each([
    ["Danny G", "danny-g"],
    ["  Ana  ", "ana"],
    ["José Pérez", "jose-perez"],
    ["Peña", "pena"],
    ["MARIO_64!!", "mario-64"],
    ["a   b", "a-b"],
    ["!!!", ""],
  ])("%j -> %j", (name, id) => expect(toPlayerId(name)).toBe(id));
});

describe("NameValidator", () => {
  const v = new NameValidator();

  it("un nombre normal está bien", () => {
    expect(v.validate(["Danny"])).toEqual([null]);
    expect(v.isValid(["Danny", "Ana"])).toBe(true);
  });

  it("el nombre es obligatorio (vacío o solo espacios)", () => {
    expect(v.validate([""])[0]).toMatch(/Escribe un nombre/);
    expect(v.validate(["   "])[0]).toMatch(/Escribe un nombre/);
  });

  it("necesita al menos una letra o un número", () => {
    expect(v.validate(["?!"])[0]).toMatch(/letra o un número/);
  });

  it("nunca puede ser cpu, en ninguna forma", () => {
    for (const name of ["cpu", "CPU", " Cpu "]) expect(v.validate([name])[0]).toMatch(/reservado/);
    expect(v.validate(["cpu 2"])).toEqual([null]);   // "cpu-2" ya no es cpu
  });

  it("los nombres deben ser distintos, comparando el playerId", () => {
    expect(v.validate(["Ana", "ana "])).toEqual([null, expect.stringMatching(/ya lo tiene/)]);
    expect(v.validate(["Danny G", "danny-g"])[1]).toMatch(/ya lo tiene/);
    expect(v.isValid(["Ana", "Ana"])).toBe(false);
  });

  it("dos nombres vacíos dicen que falta el nombre, no que se repite", () => {
    expect(v.validate(["", ""])).toEqual([expect.stringMatching(/Escribe/), expect.stringMatching(/Escribe/)]);
  });

  it("tiene un largo máximo", () => {
    expect(v.validate(["x".repeat(NAME_MAX_LENGTH)])).toEqual([null]);
    expect(v.validate(["x".repeat(NAME_MAX_LENGTH + 1)])[0]).toMatch(/Máximo/);
  });
});
