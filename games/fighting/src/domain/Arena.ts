/**
 * Arena — el escenario: su tamaño lógico (el canvas lo escala), el piso y los
 * límites a los lados. Las coordenadas de un luchador son las de sus pies.
 */
export class Arena {
  constructor(
    readonly stage = "dojo",
    readonly width = 960,
    readonly height = 540,
    readonly floorY = 470,
    readonly margin = 40,
  ) {}

  /** Lo más a la izquierda / derecha que puede estar el centro de un cuerpo de ese ancho. */
  minX(bodyWidth: number): number { return this.margin + bodyWidth / 2; }
  maxX(bodyWidth: number): number { return this.width - this.margin - bodyWidth / 2; }

  clampX(x: number, bodyWidth: number): number {
    return Math.min(this.maxX(bodyWidth), Math.max(this.minX(bodyWidth), x));
  }

  /** Dónde empieza cada lado al comenzar un round: slot 1 a la izquierda, slot 2 a la derecha. */
  spawnX(side: "left" | "right"): number {
    return side === "left" ? this.width * 0.3 : this.width * 0.7;
  }
}
