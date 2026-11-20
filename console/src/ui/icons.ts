/**
 * icons.ts — los íconos de la consola, dibujados a mano en SVG con el mismo
 * trazo (2 px, puntas redondeadas) y el color del texto (currentColor). Así
 * todos se ven de la misma familia y siguen el tema claro u oscuro, en vez de
 * emojis que cambian según el sistema operativo.
 *
 * Son trazos fijos (no vienen de ningún manifiesto) y se arman con
 * createElementNS, sin innerHTML.
 */
const PATHS = {
  gift: "M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9ZM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3.5-5-1s3 1 5 1Zm0 0c1.5-3 5-3.5 5-1s-3 1-5 1Z",
  windows: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4H9z",
  chart: "M4 20h16M7 20V11M12 20V5M17 20v-6",
  gamepad: "M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.8A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4ZM8 10.5v3M6.5 12h3M15.5 11.5h.01M17.5 13h.01",
  cloud: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18ZM9.5 13.5l2 2 3.5-3.5",
  cpu: "M7 9h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm5-5v5M9.5 13.5h.01M14.5 13.5h.01M10 16.5h4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21a7 7 0 0 1 14 0",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01",
  steps: "M9 6h11M9 12h11M9 18h11M4 5l1 1 2-2M4 11l1 1 2-2M4 17l1 1 2-2",
  keyboard: "M3 7h18v11H3zM6.5 10.5h.01M10 10.5h.01M13.5 10.5h.01M17 10.5h.01M8 14.5h8",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z",
  snow: "M12 2v20M4.2 7l15.6 10M4.2 17 19.8 7M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
} as const;

export type IconName = keyof typeof PATHS;

const NS = "http://www.w3.org/2000/svg";

export function icon(name: IconName, cls = "icon-svg"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
