/**
 * dom.ts — crear elementos sin innerHTML. Todo lo que viene de un manifiesto
 * se pone como texto (textContent), nunca como HTML.
 */
type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs & { class?: string; text?: string } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.className = String(value);
    else if (name === "text") node.textContent = String(value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
