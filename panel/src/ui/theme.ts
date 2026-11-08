/**
 * Tema claro / oscuro de GameConsole (el mismo archivo está en games/connect4/).
 *
 * Se guarda en localStorage con la misma clave en todas las apps. Como todas
 * se sirven desde el mismo origen (el gateway), elegir el tema en una lo cambia
 * en las demás, también en las pestañas que ya estaban abiertas (evento
 * "storage"). Si la persona nunca eligió, se sigue el tema del sistema.
 *
 * index.html aplica el tema con un script corto antes de pintar, para que la
 * página no aparezca un instante en el tema equivocado.
 */
export type Theme = "light" | "dark";
export const THEME_KEY = "gameconsole-theme";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<(t: Theme) => void>();

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export function currentTheme(): Theme {
  return stored() ?? (media.matches ? "dark" : "light");
}

function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
  listeners.forEach((f) => f(t));
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* se aplica igual, sin recordarlo */ }
  apply(t);
}

let started = false;
/** Aplica el tema y escucha cambios del sistema y de otras pestañas. */
export function initTheme(): void {
  if (started) return;
  started = true;
  apply(currentTheme());
  media.addEventListener("change", () => { if (!stored()) apply(currentTheme()); });
  window.addEventListener("storage", (e) => { if (e.key === THEME_KEY) apply(currentTheme()); });
}

const SUN = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.6 9.6 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z"/></svg>`;

/**
 * Botón sol / luna. Muestra el tema al que se va a cambiar (la luna en el tema
 * claro, el sol en el oscuro), como en la mayoría de las páginas.
 */
export function themeToggle(): HTMLButtonElement {
  initTheme();
  const b = document.createElement("button");
  b.type = "button";
  b.className = "theme-toggle";
  const icon = document.createElement("span");
  icon.className = "theme-icon";
  const text = document.createElement("span");
  text.className = "theme-text";
  b.append(icon, text);

  const render = (t: Theme) => {
    const next = t === "dark" ? "claro" : "oscuro";
    icon.innerHTML = t === "dark" ? SUN : MOON;     // SVG fijo, sin datos de nadie
    text.textContent = t === "dark" ? "Claro" : "Oscuro";
    b.setAttribute("aria-label", `Cambiar a tema ${next}`);
    b.title = `Cambiar a tema ${next}`;
  };
  render(currentTheme());
  listeners.add(render);
  b.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));
  return b;
}

/** Logo de GameConsole: un control con 4 fichas en línea. */
export const LOGO = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><linearGradient id="gc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#gc-g)"/><circle cx="8.5" cy="16" r="2.6" fill="#fff"/><circle cx="13.5" cy="16" r="2.6" fill="#fff" opacity=".85"/><circle cx="18.5" cy="16" r="2.6" fill="#fff" opacity=".7"/><circle cx="23.5" cy="16" r="2.6" fill="#fff" opacity=".55"/></svg>`;

/** Encabezado común: logo, nombre de la app y el botón de tema. */
export function appHeader(title: string, subtitle: string, ...extra: HTMLElement[]): HTMLElement {
  const header = document.createElement("header");
  header.className = "app-header";
  const brand = document.createElement("div");
  brand.className = "brand";
  const logo = document.createElement("span");
  logo.className = "brand-logo";
  logo.innerHTML = LOGO;
  const names = document.createElement("div");
  const small = document.createElement("span");
  small.className = "brand-kicker";
  small.textContent = "GameConsole";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  names.append(small, h1);
  if (subtitle) {
    const sub = document.createElement("p");
    sub.className = "brand-sub";
    sub.textContent = subtitle;
    names.append(sub);
  }
  brand.append(logo, names);
  const tools = document.createElement("div");
  tools.className = "header-tools";
  tools.append(...extra, themeToggle());
  header.append(brand, tools);
  return header;
}
