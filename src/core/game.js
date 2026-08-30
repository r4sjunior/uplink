/* =========================================================
   game.js — ESQUELETO (agente de simulação substitui).
   Contrato: Game.init() async, Game.tick(dtReal), Game.state,
             Game.newGame(handle), Game.load(), Game.save(), Game.hasSave()
   ========================================================= */
import { Bus, EV } from './bus.js';
import { CFG } from '../config.js';

export const Game = {
  state: { time: 0, speed: 1, credits: 0, handle: '—', started: false },
  async init() {},
  newGame(handle) { this.state.handle = handle; this.state.started = true; Bus.emit(EV.GAME_START, this.state); },
  load() { return false }, save() { return false }, hasSave() { return false },
  tick(dt) {
    if (!this.state.started) return;
    this.state.time += dt * this.state.speed * CFG.sim.minutesPerSecond;
    Bus.emit(EV.TICK, { dt, gameMinutes: this.state.time, speed: this.state.speed });
  }
};
