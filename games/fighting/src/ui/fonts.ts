/**
 * fonts.ts — las fuentes del dibujo en canvas: las mismas de la consola
 * (Poppins para carteles y marcador, Inter para los textos), con las del
 * sistema de respaldo mientras no han cargado.
 *
 * Una fuente que solo usa el canvas nunca se descarga sola (el navegador solo
 * baja las que usa el texto de la página), así que preloadFonts las pide y
 * avisa para redibujar cuando llegan. Si no cargan (sin internet), el canvas
 * sigue con la fuente de respaldo y todo se lee igual.
 */
export const FONT_DISPLAY = "'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_BODY = "'Inter', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

export function preloadFonts(onLoaded: () => void): void {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts?.load) return;
  Promise.all([
    fonts.load("italic 800 24px Poppins"),
    fonts.load("700 16px Inter"),
  ]).then(onLoaded, () => { /* sin red: se queda la fuente de respaldo */ });
}
