/**
 * HitBox — un rectángulo alineado a los ejes (x, y = esquina de arriba a la
 * izquierda). Sirve para el cuerpo de un luchador y para el alcance de un golpe.
 * Es inmutable: moverlo devuelve otro.
 */
export class HitBox {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
  ) {
    if (width < 0 || height < 0) throw new Error("una HitBox no puede tener tamaño negativo");
  }

  get left(): number { return this.x; }
  get right(): number { return this.x + this.width; }
  get top(): number { return this.y; }
  get bottom(): number { return this.y + this.height; }
  get centerX(): number { return this.x + this.width / 2; }

  /** Se tocan si se superponen (compartir solo un borde no cuenta). */
  intersects(other: HitBox): boolean {
    return this.left < other.right && other.left < this.right
      && this.top < other.bottom && other.top < this.bottom;
  }

  translate(dx: number, dy: number): HitBox {
    return new HitBox(this.x + dx, this.y + dy, this.width, this.height);
  }
}
