/**
 * newUuid: usa crypto.randomUUID si existe y, si no (página abierta por
 * http://<IP>, que no es contexto seguro), arma un UUID v4 con getRandomValues.
 */
import { describe, expect, test } from "vitest";
import { newUuid, type UuidSource } from "../src/events/uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Como el crypto de una página http://<IP>: tiene getRandomValues pero no randomUUID. */
const insecure: UuidSource = { getRandomValues: crypto.getRandomValues.bind(crypto) };

describe("newUuid", () => {
  test("con crypto.randomUUID disponible, lo usa", () => {
    expect(newUuid({ randomUUID: () => "de-randomuuid", getRandomValues: insecure.getRandomValues })).toBe("de-randomuuid");
  });

  test("sin crypto.randomUUID (http://<IP>), arma un UUID v4 válido y distinto cada vez", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newUuid(insecure)));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
