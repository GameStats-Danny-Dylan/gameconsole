# Consola de DnD Games

La página principal (`/`). Muestra los juegos disponibles, arma cada partida, la abre en un iframe y manda sus eventos a GameStats. **No conoce ningún juego de antemano:** los saca del registry, así que un juego nuevo aparece solo.

---

## Contenido

1. [Qué ve la persona](#1-qué-ve-la-persona)
2. [Qué hace por dentro](#2-qué-hace-por-dentro)
3. [Cómo está armada](#3-cómo-está-armada)
4. [Ciclo de una partida](#4-ciclo-de-una-partida)
5. [Envío de eventos (EventSender)](#5-envío-de-eventos-eventsender)
6. [Diseño: temática DnD Games](#6-diseño-temática-dnd-games)
7. [Usabilidad: heurísticas de Nielsen](#7-usabilidad-heurísticas-de-nielsen)
8. [Patrones](#8-patrones)
9. [Pruebas](#9-pruebas)
10. [Cómo correrla](#10-cómo-correrla)

---

## 1. Qué ve la persona

De arriba hacia abajo:

| Parte | Qué tiene |
|---|---|
| **Cabecera** | El logo y "**DnD** Games"; los botones **? Guía**, **📊 Estadísticas** y el de tema claro/oscuro; una guirnalda de luces |
| **Portada** | "¿Qué jugamos hoy?", una frase de qué es, el estado del sistema ("3 juegos disponibles", "GameStats al día"), el botón **🎁 Ver los juegos**, un paisaje nevado y "Cómo funciona" en 3 pasos |
| **Tus partidas** | Las partidas abiertas, una al lado de la otra (aparece cuando hay al menos una). Cada una ocupa el alto de la pantalla: arriba el nombre, el estado y los botones; el resto es el juego, que entra entero sin barra de desplazamiento |
| **Elige un juego** | Una tarjeta por juego, como un regalo envuelto: descripción, modos, un marcador de GameStats (en curso, jugadas, líder) y el botón **🎁 ¡A jugar!** |
| **"Nueva partida" (pantalla completa)** | A la izquierda, "Cómo se juega" (objetivo, paso a paso, controles, consejos); a la derecha, modo, opciones y nombres; abajo, **Cancelar** y **▶ Jugar** |
| **Panel lateral "Estadísticas"** | El panel de GameStats, al lado de las partidas, que siguen corriendo |
| **Avisos** | Mensajes breves abajo: partida abierta, quién ganó, si GameStats deja de responder |

## 2. Qué hace por dentro

1. **Catálogo:** pide al registry los juegos vivos cada 10 s y arma el menú. Si un juego se cae, sale del menú; sus partidas abiertas siguen.
2. **Datos en vivo:** cada 5 s lee de GameStats las partidas en curso, las jugadas y el líder de cada juego (`LiveStats`). No calcula nada: solo muestra.
3. **Formulario de partida:** se genera desde el `game.json` del juego (modos, jugadores y opciones). Los nombres son obligatorios, distintos entre sí y nunca `cpu`.
4. **Partidas en paralelo:** cada una corre en su propio iframe, con `matchId = {juego}-{uuid}`. Se pueden abrir varias a la vez, y también en varias pestañas.
5. **Pausa automática:** si una partida deja de verse (pestaña oculta o fuera de pantalla), se pausa. Al volver no se reanuda sola: se resalta "Reanudar".
6. **Envío de eventos:** todo lo que emiten los juegos llega a GameStats por el `EventSender` (ver la [sección 5](#5-envío-de-eventos-eventsender)).

## 3. Cómo está armada

| Carpeta | Archivos | Qué hacen |
|---|---|---|
| `catalog/` | `GameCatalog`, `RegistryClient`, `LiveStats` | La lista de juegos vivos (registry) y lo que dice GameStats de cada uno |
| `domain/` | `MatchSetup`, `MatchContextFactory`, `players` | Las opciones y los nombres de una partida; arma el `INIT` |
| `match/` | `MatchSession`, `sessionStates`, `MatchMediator`, `MatchSessionFactory`, `MatchFrame`, `EventBus` | Cada partida, sus estados, el reparto de mensajes de los iframes y el bus de eventos |
| `sending/` | `EventSender`, `EventTransport`, `RetryPolicy` | El envío de eventos a GameStats |
| `ui/` | `ConsoleShell` | Arma la página y conecta todas las piezas |
| | `Hero` | La portada con el paisaje y "Cómo funciona" |
| | `GameMenu` | Las tarjetas de juegos |
| | `MatchFormView`, `howTo` | La pantalla "Nueva partida" y el "Cómo se juega" por partes |
| | `MatchGrid`, `MatchTile` | Las partidas abiertas y sus botones |
| | `StatsDrawer` | El panel lateral de estadísticas |
| | `SendIndicator`, `Toasts` | El estado del envío y los avisos |
| | `VisibilityWatcher` | Si cada partida se ve o no (para pausarla) |

## 4. Ciclo de una partida

```
iframe carga ──INIT──► juego listo (READY) ──START──► jugando ⇄ en pausa ──STOP──► terminada
```

- La consola manda `INIT` con el `matchId`, los jugadores y las opciones; con `READY` manda `START`.
- Sin `READY` en 10 s, la partida se cierra con error (y se puede reintentar).
- Después de `STOP`, si el juego no responde `FINISHED` en 2 s, se cierra igual.
- Al cerrarse, la sesión avisa por el bus (`closed`) y el `EventSender` completa lo que falte.
- Cada iframe solo puede hablar por su propia partida: `MatchMediator` comprueba el origen, la ventana y el `matchId` de cada mensaje.

## 5. Envío de eventos (EventSender)

Protocolo, [sección 6](../docs/protocolo.md#6-eventsender).

| Qué | Cómo |
|---|---|
| Separación | Una cola por partida: una partida no frena a otra y no se mezclan eventos |
| Lotes | `POST /api/events` cada 500 ms o al juntar 20 eventos |
| Orden | En el orden en que se generaron; nunca dos envíos de la misma partida a la vez |
| Fallos | Error de red o 5xx: reintenta a los 1, 2, 4 y 8 s, y después cada 8 s, sin perder eventos. 4xx o evento rechazado: se avisa en la consola del navegador y no se reintenta |
| Partida cerrada sin terminar | Cierre de respaldo: `PLAYER_LEFT` por cada persona y `MATCH_FINISHED` sin `data`, solo si hubo `MATCH_STARTED` y no hubo `MATCH_FINISHED`. Sigue la numeración y la hora de la partida (`EventStamper.continueFrom`) |
| Pestaña cerrada | Lo pendiente y los cierres salen con `navigator.sendBeacon`; el envío en curso termina solo (`keepalive`) |
| Estado visible | La portada muestra "GameStats al día", "Enviando…" o "GameStats no responde", y un aviso cuando deja de responder o vuelve |

## 6. Diseño: temática DnD Games

DnD Games (por **D**anny a**n**d **D**ylan) tiene una temática navideña propia, sin personajes ni marcas de terceros.

| Elemento | Cómo es |
|---|---|
| **Letras** | **Poppins** para títulos e **Inter** para textos (Google Fonts; sin internet se usan las del sistema) |
| **Colores** | Rojo navidad, dorado y verde pino. El verde es el botón principal; el rojo, el de cerrar |
| **Modo oscuro** | Noche de invierno: cielo azul noche con estrellas |
| **Modo claro** | Cabaña: papel kraft y crema (sin fondo blanco) |
| **Decoración** | Nieve que cae, colinas nevadas, guirnalda de luces que titilan, nieve acumulada sobre las tarjetas, juegos como regalos con cinta y moño, y un paisaje con pinos en la portada |
| **Botones vs. información** | Los botones tienen relieve e ícono; al pasar el mouse **cambian de color de fondo** y se levantan, así se nota que se pueden pulsar. La información es texto plano con un punto de color o un ícono, sin forma de botón |
| **Jerarquía de botones** | Ayuda ("? Cómo se juega"): sin caja hasta pasar el mouse. Normales (Pausar, Nueva partida, Cancelar): dorado al pasar el mouse. Principal (Jugar, Reanudar, Jugar otra): verde. Peligro (Cerrar): rojo, que se rellena al pasar el mouse |

El tema (claro u oscuro) se elige con el botón de la cabecera y se comparte con el panel y los juegos.

## 7. Usabilidad: heurísticas de Nielsen

La consola está pensada para alguien que la abre por primera vez. Se revisó contra las 10 heurísticas de Nielsen:

| # | Heurística | Cómo se cumple |
|---|---|---|
| 1 | Visibilidad del estado del sistema | La portada muestra los juegos disponibles y el estado del envío a GameStats. Cada partida muestra su estado (Cargando, Jugando, En pausa, Terminada). Avisos breves al abrir una partida, cuando alguien gana o si GameStats deja de responder. Las tarjetas muestran las partidas en curso en vivo |
| 2 | Relación con el mundo real | Todo en español y con palabras de jugador: "¿Qué jugamos hoy?", "Cómo se juega", "Computadora", "En las estadísticas aparecerás como…" |
| 3 | Control y libertad | "Nueva partida" y Estadísticas se cierran con ✕, "Cancelar" o Esc. Pausar/Reanudar, Reiniciar, Nueva partida y Cerrar en cada partida; cada confirmación tiene "Cancelar" |
| 4 | Consistencia y estándares | Los mismos botones, colores, letras y tema en la consola, los juegos y el panel. El botón principal siempre es el verde |
| 5 | Prevención de errores | Nombres obligatorios, distintos y validados al escribir. Cerrar una partida (y reiniciarla si sigue en curso) pide confirmar: los botones se cambian por la pregunta "¿Cerrar la partida? Terminará sin ganador." con **Cancelar** o **Sí, cerrar**, sin ventanas emergentes (Esc cancela) |
| 6 | Reconocer en vez de recordar | "Cómo se juega" por partes antes de empezar y también durante la partida (botón "? Cómo se juega"), con las teclas dibujadas. Si la partida no tiene el teclado, se avisa cómo dárselo; la partida nueva lo recibe sola |
| 7 | Flexibilidad y eficiencia | Teclado en los juegos, Esc para cerrar, "Jugar otra" repite la partida sin volver a llenar el formulario, varias partidas a la vez |
| 8 | Diseño estético y minimalista | Una tarjeta por juego con lo justo; cada partida usa toda la pantalla y solo hay desplazamiento donde hace falta (el "Cómo se juega" largo), no dentro de los juegos |
| 9 | Reconocer, diagnosticar y recuperarse de errores | Los mensajes dicen qué pasó y qué hacer ("El juego no respondió a tiempo. Pulsa «Reintentar»"). Si GameStats no responde, se avisa que no se pierde nada y se reintenta solo |
| 10 | Ayuda y documentación | "Cómo funciona" en 3 pasos en la portada (el botón "? Guía" lleva ahí), "Cómo se juega" de cada juego y explicaciones al pasar el mouse sobre los indicadores |

## 8. Patrones

| Patrón | Dónde |
|---|---|
| **Observer** | `EventBus`: las sesiones publican; el `EventSender` y la pantalla escuchan. `LiveStats` avisa a las tarjetas; el `EventSender` avisa al indicador |
| **Mediator** | `MatchMediator`: reparte los mensajes de todos los iframes |
| **State** | `sessionStates`: qué se puede hacer en cada estado de la partida |
| **Factory** | `MatchSessionFactory`, `MatchContextFactory` |
| **Strategy** | `RetryPolicy` / `BackoffPolicy` |
| **Facade** | `ConsoleShell`: `main.ts` solo llama a `mount()` |
| **Singleton** | `GameCatalog.instance()` |

## 9. Pruebas

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `session.test.ts` | 34 | Ciclo de cada partida, tiempos límite, pausa por visibilidad, cierre |
| `setup.test.ts` | 16 | Formulario desde el manifiesto: modos, opciones, `INIT` |
| `catalog.test.ts` | 15 | Catálogo desde el registry, consultas cada 10 s, sin conexión |
| `mediator.test.ts` | 15 | Mensajes de los iframes: origen, ventana, `matchId` |
| `players.test.ts` | 14 | Nombres: obligatorios, distintos, `cpu` reservado, `playerId` |
| `sender.test.ts` | 10 | EventSender: lotes, colas, reintentos, rechazos, cierre de respaldo, `sendBeacon` |
| `livestats.test.ts` | 3 | Datos en vivo de GameStats para las tarjetas |

**Total: 107 pruebas.**

## 10. Cómo correrla

```bash
npm ci
npm test         # 107 pruebas
npm run build
npm run dev      # en desarrollo; necesita el gateway (docker compose) para /api y /games
```

Con Docker se construye desde la **raíz** del repo, porque usa el SDK: `docker build -f console/Dockerfile .`
