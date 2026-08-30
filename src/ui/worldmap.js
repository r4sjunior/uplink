/* =========================================================
   worldmap.js — o mapa-múndi.

   Desenha o contorno real dos continentes a partir de
   `assets/worldmap.json` (Natural Earth 110m, domínio público,
   simplificado e pré-projetado por `tools/buildmap.js`).

   O arquivo guarda coordenadas equirretangulares normalizadas em
   inteiros, o que significa que desenhar é só percorrer números e
   multiplicar pela caixa — sem biblioteca de mapas, sem projeção
   em tempo de execução, e cabendo em 12 KB.

   O mapa é rasterizado UMA VEZ para um canvas fora da tela por
   tamanho pedido e depois só copiado. Redesenhar 1252 vértices a
   60 Hz seria desperdício num elemento que não muda.
   ========================================================= */
import { C, alpha } from './theme.js';

let dados = null;
let carregando = null;
const cache = new Map();

/* --------------------------------------------------------
   CARGA
   Assíncrona, mas o desenho nunca espera: enquanto não chega,
   o mapa simplesmente não aparece, e o resto da tela funciona.
   -------------------------------------------------------- */
export function carrega() {
  if (dados || carregando) return carregando || Promise.resolve(dados);
  carregando = fetch('assets/worldmap.json')
    .then(r => r.json())
    .then(j => { dados = j; cache.clear(); return j; })
    .catch(e => {
      console.warn('[worldmap] não foi possível carregar o contorno:', e.message);
      dados = { escala: 4095, poligonos: [] };
      return dados;
    });
  return carregando;
}

export function pronto() { return !!dados; }

/* --------------------------------------------------------
   RASTERIZAÇÃO
   -------------------------------------------------------- */
function chave(w, h, estilo) {
  return w + 'x' + h + ':' + estilo;
}

function rasteriza(w, h, estilo) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!dados || !dados.poligonos.length) return c;

  const S = dados.escala;
  const grande = estilo === 'grande';

  /* --- oceano --- */
  const oceano = ctx.createLinearGradient(0, 0, 0, c.height);
  oceano.addColorStop(0, '#030b17');
  oceano.addColorStop(0.55, '#04122a');
  oceano.addColorStop(1, '#020712');
  ctx.fillStyle = oceano;
  ctx.fillRect(0, 0, c.width, c.height);

  /* --- meridianos e paralelos --- */
  ctx.strokeStyle = alpha('#3f7fd0', grande ? 0.10 : 0.07);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 12; i++) {
    const x = Math.round((i / 12) * c.width) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, c.height);
  }
  for (let i = 1; i < 6; i++) {
    const y = Math.round((i / 6) * c.height) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(c.width, y);
  }
  ctx.stroke();

  /* --- terra --- */
  /* A terra é FUNDO, não conteúdo. No original ela é escura e os nós
     saltam por cima; um mapa claro demais compete com os dados e faz
     os servidores sumirem. */
  const terra = ctx.createLinearGradient(0, 0, 0, c.height);
  terra.addColorStop(0, '#173c79');
  terra.addColorStop(0.45, '#12305f');
  terra.addColorStop(1, '#0c2247');

  ctx.save();
  /* sombra suave sob a massa de terra: dá relevo sem custar nada */
  if (grande) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillStyle = terra;
  ctx.beginPath();
  for (const p of dados.poligonos) {
    for (let i = 0; i < p.length; i += 2) {
      const x = (p[i] / S) * c.width;
      const y = (p[i + 1] / S) * c.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  /* --- litoral --- */
  ctx.strokeStyle = alpha('#5f9ae6', grande ? 0.45 : 0.30);
  ctx.lineWidth = grande ? 1 : 0.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const p of dados.poligonos) {
    for (let i = 0; i < p.length; i += 2) {
      const x = (p[i] / S) * c.width;
      const y = (p[i + 1] / S) * c.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.stroke();

  /* --- vinheta: escurece as bordas e centra o olhar --- */
  const vin = ctx.createRadialGradient(
    c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.22,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72
  );
  vin.addColorStop(0, 'rgba(0,0,0,0)');
  vin.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vin;
  ctx.fillRect(0, 0, c.width, c.height);

  return c;
}

/**
 * Desenha o mapa dentro do retângulo.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} r
 * @param {'grande'|'mini'} [estilo]
 */
export function desenha(ctx, r, estilo = 'grande') {
  if (!dados) { carrega(); return false; }
  const w = Math.round(r.w), h = Math.round(r.h);
  if (w < 4 || h < 4) return false;

  const k = chave(w, h, estilo);
  let c = cache.get(k);
  if (!c) {
    c = rasteriza(w, h, estilo);
    cache.set(k, c);
    /* o cache guarda poucos tamanhos: a janela muda pouco */
    if (cache.size > 6) cache.delete(cache.keys().next().value);
  }
  ctx.drawImage(c, Math.round(r.x), Math.round(r.y));
  return true;
}

/** Converte coordenada normalizada do mundo em pixel dentro do retângulo. */
export function paraPixel(r, x, y) {
  return { x: r.x + x * r.w, y: r.y + y * r.h };
}
