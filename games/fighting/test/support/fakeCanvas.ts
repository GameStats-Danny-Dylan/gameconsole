/**
 * Un CanvasRenderingContext2D de mentira para correr el dibujo en Node: acepta
 * cualquier llamada y no dibuja nada. Cuenta las llamadas (para saber que se
 * dibujó algo) y avisa si llega un número que no es finito.
 */
export interface FakeCtx extends CanvasRenderingContext2D {
  readonly calls: number;
  readonly badNumbers: string[];
}

export function fakeContext(): FakeCtx {
  const state: Record<string | symbol, unknown> = {};
  let calls = 0;
  const badNumbers: string[] = [];
  const gradient = { addColorStop() {} };
  const special: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (t: string) => ({ width: t.length * 10 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === "calls") return calls;
      if (prop === "badNumbers") return badNumbers;
      if (typeof prop === "string" && prop in special) { calls++; return special[prop]; }
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls++;
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) badNumbers.push(String(prop));
      };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as FakeCtx;
}
