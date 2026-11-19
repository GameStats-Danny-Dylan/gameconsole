/**
 * @gameconsole/sdk — lo que usan los juegos y la consola.
 * El tema va aparte (@gameconsole/sdk/theme) porque toca el DOM al cargarse.
 */
export * from "./protocol";
export { MonotonicClock, type Now } from "./events/MonotonicClock";
export { EventStamper, type StamperConfig } from "./events/EventStamper";
export { ConsoleChannel, WindowTransport, type Transport } from "./client/MessageChannel";
export { GameApp, type GameAppOptions, type GameIdentity, type DiscardReason } from "./client/GameApp";
export type { MatchState } from "./client/states";
