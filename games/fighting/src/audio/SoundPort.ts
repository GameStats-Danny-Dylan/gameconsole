/**
 * SoundPort — lo que el juego necesita del sonido, como interfaz. En el
 * navegador es SoundBank (WebAudio); en las pruebas, uno que solo anota.
 */
export type SoundName = "punch" | "kick" | "block" | "ko" | "bell" | "whoosh";

export interface SoundPort {
  play(name: SoundName): void;
  /** Pausa: lo que sonaba se detiene y no suena nada nuevo. */
  pause(): void;
  resume(): void;
  readonly muted: boolean;
  /** Avisa cuando cambia algo que se muestra (silenciar con M). */
  onChange?: () => void;
}

/** Sin sonido (pruebas, o si el navegador no tiene WebAudio). */
export const SILENT_SOUND: SoundPort = {
  play() {},
  pause() {},
  resume() {},
  muted: false,
};
