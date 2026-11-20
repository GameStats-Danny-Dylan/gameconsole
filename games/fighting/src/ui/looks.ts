/**
 * Cómo se ve cada personaje (diseños propios del juego): piel, pelo, ropa y
 * proporciones. El dominio solo sabe el id del personaje ("brasa", "marea");
 * aquí se elige su aspecto. Agregar un personaje es agregar una entrada.
 *
 *  - Brasa: luchadora de calle, camiseta sin mangas carmesí con ribete
 *    naranja, faja ámbar con puntas al viento, pantalón carbón, guantes cortos
 *    y pelo corto en cresta. Hombros anchos.
 *  - Marea: luchador ágil, chaqueta corta turquesa cruzada, pantalón azul
 *    marino con canilleras claras, vendas blancas en los antebrazos y una
 *    coleta larga que se mueve con él. Más delgado.
 */
export type HairStyle = "crest" | "ponytail";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  topTrim: string;
  pants: string;
  belt: string;
  /** Las puntas de la faja que cuelgan detrás. */
  sash: string | null;
  gloves: string;
  /** Vendas en los antebrazos (null: piel). */
  wraps: string | null;
  shoes: string;
  /** Canilleras (null: pantalón hasta el tobillo). */
  shins: string | null;
  eye: string;
  /** Ancho de hombros y de cadera (px). */
  shoulders: number;
  hips: number;
  /** Color de su lado (marcador, combo, chispas). */
  accent: string;
}

export const LOOKS: Record<string, Look> = {
  brasa: {
    skin: "#c98a5a", hair: "#1c1414", hairStyle: "crest",
    top: "#c3242f", topTrim: "#ff8a1f", pants: "#2b2a33", belt: "#f2a516", sash: "#ff9d1e",
    gloves: "#24222a", wraps: null, shoes: "#1a181f", shins: null, eye: "#1b1010",
    shoulders: 36, hips: 27, accent: "#ff5a36",
  },
  marea: {
    skin: "#e2b48a", hair: "#163848", hairStyle: "ponytail",
    top: "#1aa6c9", topTrim: "#e9fbff", pants: "#1d2b52", belt: "#e9fbff", sash: null,
    gloves: "#f2f5f8", wraps: "#f2f5f8", shoes: "#d5dbe4", shins: "#cfd8e3", eye: "#0e1d26",
    shoulders: 31, hips: 25, accent: "#34c8f0",
  },
};

/** El aspecto de un personaje (si no se conoce, el primero). */
export function lookOf(character: string): Look {
  return LOOKS[character] ?? LOOKS.brasa;
}
