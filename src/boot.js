/* =========================================================
   boot.js — orquestrador. Liga simulação, interface, gráficos
   e áudio; roda o laço principal. Não contém regra de jogo
   nem desenho: só fiação e tempo.
   ========================================================= */
import { CFG } from './config.js';
import { Bus, EV } from './core/bus.js';
import { Surface } from './ui/surface.js';
import { Stage } from './gfx/stage.js';
import { Shell } from './ui/shell.js';
import { Game } from './core/game.js';
import { Audio } from './audio/engine.js';

const surface = new Surface(CFG.ui.width, CFG.ui.height, CFG.ui.ss);

/* --------- métricas expostas ao harness de QA --------- */
const perf = { fps: 0, frames: 0, ms: 0, draws: 0, tris: 0, calls: 0, redraws: 0 };
window.__UPLINK_STATS = () => ({
  fps: Math.round(perf.fps),
  frameMs: +perf.ms.toFixed(2),
  drawCalls: perf.calls,
  triangles: perf.tris,
  uiRedraws: perf.redraws,
  tier: CFG.tier,
  screen: Shell.currentScreen ? Shell.currentScreen() : '?'
});
window.__UPLINK = { CFG, Bus, EV, surface, Stage, Shell, Game, Audio, perf };

/* --------- laço --------- */
let last = performance.now();
let acc = 0;
let fpsAcc = 0, fpsFrames = 0;
const REDRAW_DT = 1 / CFG.ui.maxRedrawHz;
let redrawAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const t0 = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          /* aba voltou do background */

  /* 1. simulação (tempo de jogo, tem sua própria escala interna) */
  Game.tick(dt);

  /* 2. animações de interface + redesenho controlado */
  Shell.update(dt);
  redrawAcc += dt;
  if (surface.dirty && redrawAcc >= REDRAW_DT) {
    redrawAcc = 0;
    Shell.draw(surface);
    Stage.markSurfaceUpdated();
    perf.redraws++;
  }

  /* 3. áudio e 3D */
  Audio.update(dt);
  Stage.render(dt, now / 1000);

  /* 4. métricas */
  perf.ms = performance.now() - t0;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { perf.fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
  const info = Stage.renderer && Stage.renderer.info;
  if (info) { perf.calls = info.render.calls; perf.tris = info.render.triangles; }
}

/* --------- arranque --------- */
async function main() {
  const host = document.getElementById('stage');

  await Game.init();                       /* mundo, save, dados */
  await Stage.init({ surface, host });     /* renderer, cena, monitor */
  await Shell.init({ surface });           /* interface */
  await Audio.init();                      /* som */

  window.addEventListener('resize', () => Stage.resize());
  Stage.resize();

  /* primeiro desenho garantido */
  Shell.draw(surface);
  Stage.markSurfaceUpdated();

  requestAnimationFrame(frame);

  /* o harness de QA espera por isto */
  const ready = () => {
    document.body.classList.add('ready');
    const l = document.getElementById('preload');
    if (l) l.classList.add('gone');
    window.__UPLINK_READY = true;
  };
  /* dois frames para o primeiro render de verdade sair */
  requestAnimationFrame(() => requestAnimationFrame(ready));
}

main().catch(err => {
  console.error('[boot] falha fatal:', err);
  const p = document.getElementById('preload');
  if (p) p.innerHTML = '<pre style="color:#ff5a5a;padding:2rem;white-space:pre-wrap;font:12px monospace">' +
    'FALHA NA INICIALIZAÇÃO\n\n' + (err && err.stack ? err.stack : err) + '</pre>';
  window.__UPLINK_READY = true;   /* deixa o QA capturar o erro em vez de estourar timeout */
});
