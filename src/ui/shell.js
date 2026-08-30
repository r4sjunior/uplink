/* =========================================================
   shell.js — ESQUELETO (agente de interface substitui).
   Contrato: Shell.init({surface}) async, Shell.update(dt),
             Shell.draw(surface), Shell.currentScreen()
   ========================================================= */
import { Bus, EV } from '../core/bus.js';

export const Shell = {
  _screen: 'boot', _t: 0,
  async init({ surface }) { this._surface = surface; },
  currentScreen() { return this._screen; },
  update(dt) { this._t += dt; this._surface.invalidate(); },
  draw(surface) {
    const c = surface.begin();
    c.fillStyle = '#05080b'; c.fillRect(0, 0, surface.W, surface.H);
    c.fillStyle = '#39ff9e';
    c.font = '600 34px "Courier New", monospace';
    c.fillText('UPLINK :: esqueleto de interface ativo', 80, 120);
    c.font = '400 18px "Courier New", monospace';
    c.fillStyle = '#5f7d72';
    c.fillText('aguardando os módulos dos agentes…  t=' + this._t.toFixed(1) + 's', 80, 160);
    surface.end();
  }
};
