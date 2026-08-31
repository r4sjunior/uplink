/* =========================================================
   buildmap.js — converte o contorno de terra do Natural Earth
   (110m, domínio público) no formato compacto que o jogo desenha.

   O que sai daqui: `assets/worldmap.json`, uma lista de polígonos
   em coordenadas JÁ PROJETADAS e normalizadas (equirretangular,
   0..1), com os vértices em inteiros de 0 a 4095. Isso mantém o
   arquivo pequeno e dispensa qualquer biblioteca de mapas em
   tempo de execução — o jogo só percorre números.

   uso: node tools/buildmap.js [entrada.geojson]
   ========================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = process.argv[2] || path.join(ROOT, 'tools', 'tmp', 'ne_land.json');
const SAIDA = path.join(ROOT, 'assets', 'worldmap.json');

/* escala do inteiro: 4095 = 12 bits, precisão de ~9 km no equador */
const ESCALA = 4095;
/* tolerância do Douglas-Peucker, em graus */
/* Tolerância do Douglas-Peucker, em graus.
   Era 0,62 quando o mapa só aparecia inteiro. Com aproximação até
   7x o litoral simplificado demais vira polígono anguloso na tela,
   então vale gastar alguns quilobytes a mais em vértices. */
const TOLERANCIA = 0.16;
/* área mínima de um polígono para entrar (graus²): corta ilhotas
   que viram um pixel sujo na tela */
const AREA_MIN = 0.55;

/* --------------------------------------------------------
   Douglas-Peucker
   -------------------------------------------------------- */
function distPontoSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifica(pontos, tol) {
  if (pontos.length < 3) return pontos;
  let maior = 0, idx = 0;
  const a = pontos[0], b = pontos[pontos.length - 1];
  for (let i = 1; i < pontos.length - 1; i++) {
    const d = distPontoSegmento(pontos[i], a, b);
    if (d > maior) { maior = d; idx = i; }
  }
  if (maior > tol) {
    const esq = simplifica(pontos.slice(0, idx + 1), tol);
    const dir = simplifica(pontos.slice(idx), tol);
    return esq.slice(0, -1).concat(dir);
  }
  return [a, b];
}

/* área do polígono pela fórmula do shoelace */
function area(pontos) {
  let s = 0;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    s += (pontos[j][0] + pontos[i][0]) * (pontos[j][1] - pontos[i][1]);
  }
  return Math.abs(s / 2);
}

/* --------------------------------------------------------
   conversão
   -------------------------------------------------------- */
const geo = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
const saida = [];
let vertsAntes = 0, vertsDepois = 0, descartados = 0;

for (const f of geo.features) {
  const g = f.geometry;
  if (!g) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

  for (const poly of polys) {
    const anel = poly[0];                 /* só o contorno externo; buracos não importam aqui */
    if (!anel || anel.length < 4) continue;
    vertsAntes += anel.length;

    if (area(anel) < AREA_MIN) { descartados++; continue; }

    const simples = simplifica(anel, TOLERANCIA);
    if (simples.length < 4) { descartados++; continue; }
    vertsDepois += simples.length;

    /* projeção equirretangular normalizada, igual à de core/data.js */
    const plano = [];
    for (const [lon, lat] of simples) {
      const x = Math.round(((lon + 180) / 360) * ESCALA);
      const y = Math.round(((90 - lat) / 180) * ESCALA);
      /* descarta vértices repetidos depois do arredondamento */
      const n = plano.length;
      if (n >= 2 && plano[n - 2] === x && plano[n - 1] === y) continue;
      plano.push(x, y);
    }
    if (plano.length >= 8) saida.push(plano);
  }
}

/* os maiores primeiro: desenhar continentes antes das ilhas evita
   que uma ilha grande cubra a borda de um continente */
saida.sort((a, b) => b.length - a.length);

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify({
  fonte: 'Natural Earth 110m land (domínio público)',
  projecao: 'equirretangular normalizada, inteiros 0..' + ESCALA,
  escala: ESCALA,
  poligonos: saida
}));

const kb = (fs.statSync(SAIDA).size / 1024).toFixed(1);
console.log('polígonos mantidos : ' + saida.length + ' (descartados ' + descartados + ' pequenos)');
console.log('vértices           : ' + vertsAntes + ' → ' + vertsDepois);
console.log('arquivo            : ' + path.relative(ROOT, SAIDA) + '  (' + kb + ' KB)');
