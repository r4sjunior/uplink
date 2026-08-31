/* =========================================================
   worldmap.js — o mapa-múndi, com aproximação.

   Desenha o contorno real dos continentes a partir de
   `assets/worldmap.json` (Natural Earth 110m, domínio público,
   simplificado e pré-projetado por `tools/buildmap.js`).

   COMO A APROXIMAÇÃO FUNCIONA
   O mapa é rasterizado UMA VEZ num atlas de alta resolução e depois
   copiado com recorte. Aproximar é escolher um retângulo menor do
   atlas; deslocar é mover esse retângulo. O custo por quadro é um
   `drawImage`, qualquer que seja a aproximação — e os 1252 vértices
   nunca são percorridos de novo.
   ========================================================= */
import { alpha } from './theme.js';

let dados = null;
let carregando = null;

/* Resolução do atlas. Escolhida para que, na aproximação máxima,
   ainda haja mais de um texel por pixel num painel de 1200 px. */
const ATLAS_W = 3072;
const ATLAS_H = 1536;

let atlas = null;

/* --------------------------------------------------------
   CARGA
   -------------------------------------------------------- */
export function carrega() {
  if (dados || carregando) return carregando || Promise.resolve(dados);
  carregando = fetch('assets/worldmap.json')
    .then(r => r.json())
    .then(j => { dados = j; atlas = null; return j; })
    .catch(e => {
      console.warn('[worldmap] contorno indisponível:', e.message);
      dados = { escala: 4095, poligonos: [] };
      return dados;
    });
  return carregando;
}

export function pronto() { return !!dados; }

/* --------------------------------------------------------
   ATLAS
   -------------------------------------------------------- */
function tracaTerra(ctx, w, h) {
  const S = dados.escala;
  ctx.beginPath();
  for (const p of dados.poligonos) {
    for (let i = 0; i < p.length; i += 2) {
      const x = (p[i] / S) * w;
      const y = (p[i + 1] / S) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

function constroiAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_W; c.height = ATLAS_H;
  const ctx = c.getContext('2d');

  /* --- oceano --- */
  const oceano = ctx.createLinearGradient(0, 0, 0, ATLAS_H);
  oceano.addColorStop(0, '#030b17');
  oceano.addColorStop(0.55, '#04122a');
  oceano.addColorStop(1, '#020712');
  ctx.fillStyle = oceano;
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  /* --- grade: de 15 em 15 graus --- */
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = alpha('#3f7fd0', 0.09);
  ctx.beginPath();
  for (let g = 15; g < 360; g += 15) {
    const x = Math.round((g / 360) * ATLAS_W) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, ATLAS_H);
  }
  for (let g = 15; g < 180; g += 15) {
    const y = Math.round((g / 180) * ATLAS_H) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(ATLAS_W, y);
  }
  ctx.stroke();

  /* equador e Greenwich, um pouco mais fortes */
  ctx.strokeStyle = alpha('#4f93e0', 0.18);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, ATLAS_H / 2); ctx.lineTo(ATLAS_W, ATLAS_H / 2);
  ctx.moveTo(ATLAS_W / 2, 0); ctx.lineTo(ATLAS_W / 2, ATLAS_H);
  ctx.stroke();

  /* --- halo do litoral: dá volume à massa de terra --- */
  ctx.save();
  ctx.shadowColor = 'rgba(90,160,255,0.55)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(90,160,255,0.30)';
  ctx.lineWidth = 2;
  tracaTerra(ctx, ATLAS_W, ATLAS_H);
  ctx.stroke();
  ctx.restore();

  /* --- terra --- */
  const terra = ctx.createLinearGradient(0, 0, 0, ATLAS_H);
  terra.addColorStop(0, '#1b4585');
  terra.addColorStop(0.42, '#143669');
  terra.addColorStop(1, '#0d2450');
  ctx.save();
  ctx.fillStyle = terra;
  tracaTerra(ctx, ATLAS_W, ATLAS_H);
  ctx.fill();

  /* relevo: ruído fino, recortado pela própria terra */
  ctx.clip();
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#8fc4ff' : '#04101f';
    ctx.fillRect(Math.random() * ATLAS_W, Math.random() * ATLAS_H, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* --- litoral nítido por cima --- */
  ctx.strokeStyle = alpha('#8ec2ff', 0.55);
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  tracaTerra(ctx, ATLAS_W, ATLAS_H);
  ctx.stroke();

  return c;
}

/* =========================================================
   A VISTA

   Guardada como centro + aproximação, e não como retângulo: assim
   aproximar em torno do ponteiro é uma conta só, e a vista nunca
   fica com proporção diferente da caixa.
   ========================================================= */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 7;

export function novaVista() { return { cx: 0.5, cy: 0.5, zoom: 1 }; }

/** Converte a vista em retângulo normalizado, preso às bordas do mundo. */
export function normaliza(vista, r) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (vista && vista.zoom) || 1));
  const aspectoCaixa = r.w / r.h;
  const aspectoMundo = 2;                  /* equirretangular: 360 x 180 */

  let w = 1 / z, h = 1 / z;
  if (aspectoCaixa > aspectoMundo) h = w * (aspectoMundo / aspectoCaixa);
  else w = h * (aspectoCaixa / aspectoMundo);

  w = Math.min(1, w); h = Math.min(1, h);
  let x = (vista ? vista.cx : 0.5) - w / 2;
  let y = (vista ? vista.cy : 0.5) - h / 2;
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x: x, y: y, w: w, h: h, z: z };
}

function prende(vista, r) {
  const v = normaliza(vista, r);
  vista.cx = v.x + v.w / 2;
  vista.cy = v.y + v.h / 2;
}

/** Mundo (0..1) para pixel dentro da caixa. */
export function paraPixel(r, vista, x, y) {
  const v = normaliza(vista, r);
  return {
    x: r.x + ((x - v.x) / v.w) * r.w,
    y: r.y + ((y - v.y) / v.h) * r.h
  };
}

/** Pixel dentro da caixa para mundo (0..1). */
export function paraMundo(r, vista, px, py) {
  const v = normaliza(vista, r);
  return {
    x: v.x + ((px - r.x) / r.w) * v.w,
    y: v.y + ((py - r.y) / r.h) * v.h
  };
}

/** Aproxima mantendo fixo o ponto sob o ponteiro. */
export function aproxima(vista, r, px, py, passos) {
  const antes = paraMundo(r, vista, px, py);
  vista.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vista.zoom * Math.pow(1.22, passos)));
  const depois = paraMundo(r, vista, px, py);
  vista.cx += antes.x - depois.x;
  vista.cy += antes.y - depois.y;
  prende(vista, r);
  return vista;
}

/** Desloca a vista em pixels de tela. */
export function desloca(vista, r, dx, dy) {
  const v = normaliza(vista, r);
  vista.cx -= (dx / r.w) * v.w;
  vista.cy -= (dy / r.h) * v.h;
  prende(vista, r);
  return vista;
}

/** Centraliza num ponto do mundo, com aproximação opcional. */
export function centraliza(vista, r, x, y, zoom) {
  vista.cx = x; vista.cy = y;
  if (zoom) vista.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  prende(vista, r);
  return vista;
}

/* --------------------------------------------------------
   DESENHO
   -------------------------------------------------------- */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x,y,w,h}} r        caixa de destino, em pixels
 * @param {{cx,cy,zoom}} vista centro no mundo (0..1) e aproximação
 * @returns {boolean} desenhou?
 */
export function desenha(ctx, r, vista) {
  if (!dados) { carrega(); return false; }
  if (!atlas) atlas = constroiAtlas();

  const v = normaliza(vista, r);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    atlas,
    v.x * ATLAS_W, v.y * ATLAS_H, v.w * ATLAS_W, v.h * ATLAS_H,
    r.x, r.y, r.w, r.h
  );

  /* Vinheta só no mundo inteiro. Aproximado, ela escureceria
     justamente o ponto de interesse. */
  if (v.z < 1.4) {
    const k = (0.5 * (1.4 - v.z) / 1.4).toFixed(3);
    const vin = ctx.createRadialGradient(
      r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.30,
      r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.70
    );
    vin.addColorStop(0, 'rgba(0,0,0,0)');
    vin.addColorStop(1, 'rgba(0,0,0,' + k + ')');
    ctx.fillStyle = vin;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
  return true;
}
