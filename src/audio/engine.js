/* =========================================================
   engine.js — ESQUELETO (agente de áudio substitui).
   Contrato: Audio.init() async, Audio.update(dt), Audio.play(name, opts)
   ========================================================= */
import { Bus, EV } from '../core/bus.js';
import { CFG } from '../config.js';

export const Audio = {
  ctx: null, ready: false,
  async init() {
    Bus.on(EV.SFX, ({ name, ...o }) => this.play(name, o));
    const unlock = () => {
      if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.ready = true;
    };
    addEventListener('pointerdown', unlock, { once: false });
    addEventListener('keydown', unlock, { once: false });
  },
  play(name, opts) { /* agente de áudio implementa */ },
  update(dt) {}
};
