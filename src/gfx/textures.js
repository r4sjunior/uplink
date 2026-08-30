/* =========================================================
   textures.js — geração PROCEDURAL de todas as texturas da cena.

   Nada de arquivo externo: ruído de valor, arranhões, poeira,
   digitais no vidro, grade de fósforo, trama de tecido, madeira,
   metal escovado e reboco saem daqui, desenhados em canvas 2D e
   entregues como CanvasTexture já com colorSpace correto.

   Tudo é cacheado por chave — chamar duas vezes devolve a mesma
   textura. O tamanho base é escalado pelo tier (ver `px()`).
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';

/* --------------------------------------------------------
   utilidades numéricas
   -------------------------------------------------------- */

/** PRNG determinístico (mulberry32) — a cena precisa ser idêntica a cada carga. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => v < 0 ? 0 : (v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/** Escala de resolução por tier. `px(1024)` → 1024 / 512 / 256. */
export function px(base) {
  const f = CFG.tier === 'high' ? 1 : (CFG.tier === 'medium' ? 0.5 : 0.25);
  return Math.max(64, Math.round(base * f));
}

let MAX_ANISO = 4;
/** O stage informa a anisotropia real suportada logo após criar o renderer. */
export function setAnisotropy(n) { MAX_ANISO = Math.max(1, Math.min(n, CFG.gfx.anisotropy)); }

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* --------------------------------------------------------
   ruído de valor tileável + fbm
   -------------------------------------------------------- */

function latticeSample(g, n, x, y) {
  const fx = x * n, fy = y * n;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const sx = smooth(fx - x0), sy = smooth(fy - y0);
  const i0 = ((x0 % n) + n) % n, j0 = ((y0 % n) + n) % n;
  const i1 = (i0 + 1) % n, j1 = (j0 + 1) % n;
  const a = g[j0 * n + i0], b = g[j0 * n + i1];
  const c = g[j1 * n + i0], d = g[j1 * n + i1];
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

/**
 * Campo fbm tileável, normalizado em 0..1.
 * @returns {Float32Array} size*size
 */
export function fbm(size, opts = {}) {
  const { octaves = 5, freq = 4, gain = 0.5, lacunarity = 2, seed = 1, ridged = false, stretchX = 1, stretchY = 1 } = opts;
  const out = new Float32Array(size * size);
  const rnd = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = Math.max(2, Math.round(freq * Math.pow(lacunarity, o)));
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) {
      const v = (y / size) * stretchY;
      for (let x = 0; x < size; x++) {
        const u = (x / size) * stretchX;
        let s = latticeSample(g, n, u, v);
        if (ridged) s = 1 - Math.abs(s * 2 - 1);
        out[y * size + x] += s * amp;
      }
    }
    total += amp;
    amp *= gain;
  }
  const inv = 1 / total;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

/** Escreve um campo escalar num canvas em tons de cinza (ou via mapa de cor). */
export function fieldToCanvas(field, size, map) {
  const c = canvas2d(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (map) {
      const col = map(v, i % size, (i / size) | 0);
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = col.length > 3 ? col[3] : 255;
    } else {
      const g = clamp01(v) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Converte um canvas de altura (usa o canal vermelho) em normal map tangencial. */
export function normalFromCanvas(src, strength = 1.6) {
  const size = src.width;
  const sctx = src.getContext('2d');
  const sd = sctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = sd[i * 4] / 255;

  const out = canvas2d(size, size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      /* Sobel */
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/* --------------------------------------------------------
   fábrica de texturas com cache
   -------------------------------------------------------- */
const cache = new Map();
const born = [];

function tex(key, build, { srgb = false, repeat = [1, 1], aniso = true, mips = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.CanvasTexture(build());
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso ? MAX_ANISO : 1;
  t.needsUpdate = true;
  cache.set(key, t);
  born.push(t);
  return t;
}

/** Libera todas as texturas geradas (usado no dispose do stage). */
export function disposeTextures() {
  for (const t of born) t.dispose();
  born.length = 0;
  cache.clear();
}

/* --------------------------------------------------------
   desenhos auxiliares
   -------------------------------------------------------- */

/** Riscos finos e aleatórios — a marca de um objeto que já foi usado. */
function drawScratches(ctx, size, { count = 90, seed = 7, light = 'rgba(255,255,255,0.20)', dark = 'rgba(0,0,0,0.22)', maxLen = 0.34, curve = 0.5 } = {}) {
  const rnd = rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size;
    const ang = rnd() * Math.PI * 2;
    const len = size * (0.015 + rnd() * maxLen);
    const bow = (rnd() - 0.5) * len * curve;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const mx = (x + ex) / 2 - Math.sin(ang) * bow, my = (y + ey) / 2 + Math.cos(ang) * bow;
    ctx.lineWidth = Math.max(0.5, size / 900 * (0.5 + rnd() * 2.2));
    ctx.strokeStyle = rnd() < 0.55 ? dark : light;
    ctx.globalAlpha = 0.25 + rnd() * 0.75;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------
   catálogo público
   -------------------------------------------------------- */
export const Tex = {

  /* ---- plástico do bisel / carcaça ---------------------- */

  /** Rugosidade do plástico: base + granulação + arranhões. */
  plasticRough(seed = 11, base = 0.62, grain = 0.16) {
    return tex('plasticRough' + seed + base, () => {
      const S = px(1024);
      const f = fbm(S, { octaves: 6, freq: 10, seed, gain: 0.55 });
      const c = fieldToCanvas(f, S, (v) => {
        const g = clamp01(base + (v - 0.5) * grain) * 255;
        return [g, g, g];
      });
      const ctx = c.getContext('2d');
      drawScratches(ctx, S, { count: Math.round(S / 7), seed: seed + 3, light: 'rgba(255,255,255,0.30)', dark: 'rgba(0,0,0,0.16)' });
      return c;
    });
  },

  /** Microrrugosidade em normal map — o plástico nunca é liso. */
  plasticNormal(seed = 11, strength = 0.9) {
    return tex('plasticNormal' + seed + strength, () => {
      const S = px(1024);
      const f = fbm(S, { octaves: 6, freq: 24, seed: seed + 91, gain: 0.5 });
      const h = fieldToCanvas(f, S);
      const ctx = h.getContext('2d');
      drawScratches(ctx, S, { count: Math.round(S / 6), seed: seed + 17, light: 'rgba(255,255,255,0.55)', dark: 'rgba(0,0,0,0.45)', maxLen: 0.22 });
      return normalFromCanvas(h, strength);
    });
  },

  /** Variação sutil de cor do plástico (manchas de molde e desgaste). */
  plasticColor(seed = 11, tint = [26, 28, 32], amp = 10) {
    return tex('plasticColor' + seed + tint.join(), () => {
      const S = px(512);
      const f = fbm(S, { octaves: 5, freq: 5, seed: seed + 200 });
      return fieldToCanvas(f, S, (v) => [
        clamp01((tint[0] + (v - 0.5) * amp) / 255) * 255,
        clamp01((tint[1] + (v - 0.5) * amp) / 255) * 255,
        clamp01((tint[2] + (v - 0.5) * amp) / 255) * 255
      ]);
    }, { srgb: true });
  },

  /* ---- vidro do monitor --------------------------------- */

  /**
   * Poeira acumulada no vidro: partículas finas, alguns flocos maiores
   * e nuvens leves na parte de baixo (onde ela sempre se junta).
   */
  dust() {
    return tex('dust', () => {
      const S = px(1024);
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);

      /* nuvem difusa, mais densa embaixo e nos cantos */
      const f = fbm(S, { octaves: 5, freq: 3, seed: 55 });
      const img = ctx.getImageData(0, 0, S, S);
      const d = img.data;
      for (let y = 0; y < S; y++) {
        const vy = y / S;
        const grav = Math.pow(vy, 2.2) * 0.55 + 0.06;
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const v = clamp01((f[i] - 0.46) * 2.2) * grav;
          const g = v * 60;
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      /* partículas */
      const rnd = rng(88);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < S * 2.2; i++) {
        const x = rnd() * S, y = rnd() * S;
        const r = (0.25 + rnd() * rnd() * 2.6) * (S / 1024);
        const a = 0.10 + rnd() * 0.75;
        ctx.fillStyle = `rgba(255,252,244,${a})`;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.4, r), 0, 6.2832); ctx.fill();
      }
      /* alguns fiapos */
      for (let i = 0; i < 14; i++) {
        const x = rnd() * S, y = rnd() * S, ang = rnd() * 6.2832;
        const len = S * (0.006 + rnd() * 0.03);
        ctx.strokeStyle = 'rgba(255,250,240,0.42)';
        ctx.lineWidth = Math.max(0.6, S / 1400);
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.6 + 6, y + Math.sin(ang) * len * 0.6, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      return c;
    });
  },

  /**
   * Marcas de dedo e limpeza malfeita no vidro: arcos concêntricos de
   * digital, borrões de pano e um brilho oleoso. Vira mapa de rugosidade.
   */
  smudge() {
    return tex('smudge', () => {
      const S = px(1024);
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      const rnd = rng(404);

      /* borrões de pano: arcos largos e suaves */
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const cx = rnd() * S, cy = rnd() * S;
        const r = S * (0.10 + rnd() * 0.26);
        const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.13)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.05)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rnd() * 3.14); ctx.scale(1, 0.42 + rnd() * 0.4);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      /* três digitais: elipses de arcos concêntricos */
      for (let f = 0; f < 3; f++) {
        const cx = S * (0.18 + rnd() * 0.64), cy = S * (0.30 + rnd() * 0.55);
        const rot = (rnd() - 0.5) * 1.4;
        const rx = S * (0.030 + rnd() * 0.014), ry = rx * (1.32 + rnd() * 0.3);
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.lineWidth = Math.max(0.7, S / 1100);
        for (let k = 1; k <= 13; k++) {
          const t = k / 13;
          ctx.strokeStyle = `rgba(255,255,255,${0.16 * (1 - t * 0.55)})`;
          ctx.beginPath();
          const a0 = -0.5 + rnd() * 0.4, a1 = a0 + 4.4 + rnd() * 1.4;
          ctx.ellipse(0, ry * 0.06 * k * 0.2, rx * t, ry * t, 0, a0, a1);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      return c;
    });
  },

  /**
   * Rugosidade absoluta do vidro: espelho quase perfeito (0.05) onde
   * está limpo, subindo até ~0.42 nas digitais e nos borrões de pano.
   */
  glassRough() {
    return tex('glassRough', () => {
      const src = Tex.smudge().image;
      const S = src.width;
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgb(13,13,13)';       /* 0.05 de rugosidade base */
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.95;
      ctx.drawImage(src, 0, 0);
      /* a poeira também espalha a luz refletida */
      ctx.globalAlpha = 0.55;
      ctx.drawImage(Tex.dust().image, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      return c;
    });
  },

  /** Grade de fósforo (aperture grille) — usada como microrrelevo do vidro. */
  phosphorNormal() {
    return tex('phosphorNormal', () => {
      const S = px(512);
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const period = 3;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const p = (x % period) / period;
          /* trincas verticais + fios de sustentação horizontais */
          let v = 0.5 + Math.cos(p * 6.2832) * 0.28;
          if (y % 137 === 0 || y % 137 === 1) v -= 0.30;
          const i = (y * S + x) * 4;
          const g = clamp01(v) * 255;
          d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return normalFromCanvas(c, 0.35);
    });
  },

  /* ---- metal -------------------------------------------- */

  /** Metal escovado: estrias horizontais finas → rugosidade anisotrópica. */
  brushedRough() {
    return tex('brushedRough', () => {
      const S = px(1024);
      const f = fbm(S, { octaves: 5, freq: 6, seed: 71, stretchX: 0.06, stretchY: 9 });
      const c = fieldToCanvas(f, S, (v) => {
        const g = clamp01(0.34 + (v - 0.5) * 0.42) * 255;
        return [g, g, g];
      });
      const ctx = c.getContext('2d');
      const rnd = rng(72);
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < S * 0.9; i++) {
        const y = rnd() * S;
        ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = Math.max(0.5, S / 1500);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return c;
    });
  },

  brushedNormal() {
    return tex('brushedNormal', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 4, freq: 8, seed: 73, stretchX: 0.05, stretchY: 12 });
      return normalFromCanvas(fieldToCanvas(f, S), 0.55);
    });
  },

  /* ---- madeira / mesa ----------------------------------- */

  woodColor() {
    return tex('woodColor', () => {
      const S = px(1024);
      const grain = fbm(S, { octaves: 6, freq: 3, seed: 21, stretchX: 1, stretchY: 14 });
      const warp = fbm(S, { octaves: 3, freq: 4, seed: 22 });
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          /* anéis: coordenada distorcida passada por uma função periódica */
          const w = (x / S) * 6 + (warp[i] - 0.5) * 1.5 + grain[i] * 0.8;
          const rings = Math.abs(Math.sin(w * 3.14159)) ;
          const t = clamp01(rings * 0.55 + grain[i] * 0.55);
          /* nogueira escura, quase preta na sombra */
          const r = lerp(28, 74, t), g = lerp(19, 48, t), b = lerp(13, 31, t);
          d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      drawScratches(ctx, S, { count: Math.round(S / 12), seed: 25, light: 'rgba(190,170,150,0.16)', dark: 'rgba(0,0,0,0.20)', maxLen: 0.5, curve: 0.15 });
      return c;
    }, { srgb: true, repeat: [2, 1] });
  },

  woodRough() {
    return tex('woodRough', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 5, freq: 3, seed: 21, stretchX: 1, stretchY: 14 });
      return fieldToCanvas(f, S, (v) => {
        const g = clamp01(0.38 + (v - 0.5) * 0.34) * 255;
        return [g, g, g];
      });
    }, { repeat: [2, 1] });
  },

  woodNormal() {
    return tex('woodNormal', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 5, freq: 5, seed: 26, stretchX: 0.5, stretchY: 16 });
      return normalFromCanvas(fieldToCanvas(f, S), 0.5);
    }, { repeat: [2, 1] });
  },

  /* ---- parede e chão ------------------------------------ */

  plasterColor() {
    return tex('plasterColor', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 6, freq: 4, seed: 31 });
      const g2 = fbm(S, { octaves: 3, freq: 22, seed: 32 });
      return fieldToCanvas(f, S, (v, x, y) => {
        const i = y * S + x;
        const t = clamp01(v * 0.7 + g2[i] * 0.3);
        return [lerp(17, 30, t), lerp(19, 33, t), lerp(23, 38, t)];
      });
    }, { srgb: true, repeat: [3, 2] });
  },

  plasterNormal() {
    return tex('plasterNormal', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 6, freq: 14, seed: 33 });
      return normalFromCanvas(fieldToCanvas(f, S), 0.7);
    }, { repeat: [3, 2] });
  },

  concreteColor() {
    return tex('concreteColor', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 6, freq: 5, seed: 41 });
      const c = fieldToCanvas(f, S, (v) => {
        const t = clamp01(v);
        return [lerp(12, 26, t), lerp(13, 27, t), lerp(15, 30, t)];
      });
      drawScratches(c.getContext('2d'), S, { count: 40, seed: 43, light: 'rgba(120,125,135,0.10)', dark: 'rgba(0,0,0,0.24)', maxLen: 0.6 });
      return c;
    }, { srgb: true, repeat: [6, 6] });
  },

  concreteNormal() {
    return tex('concreteNormal', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 6, freq: 10, seed: 42 });
      return normalFromCanvas(fieldToCanvas(f, S), 0.5);
    }, { repeat: [6, 6] });
  },

  /* ---- tecido ------------------------------------------- */

  /** Trama de tecido para o mousepad — fio sobre fio, com pelo solto. */
  weaveRough() {
    return tex('weaveRough', () => {
      const S = px(512);
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const n = fbm(S, { octaves: 4, freq: 18, seed: 61 });
      const period = Math.max(3, Math.round(S / 96));
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const cx = Math.cos((x / period) * 6.2832) * 0.5 + 0.5;
          const cy = Math.cos((y / period) * 6.2832) * 0.5 + 0.5;
          const over = ((((x / period) | 0) + ((y / period) | 0)) % 2) === 0;
          const w = over ? cx : cy;
          const v = clamp01(0.70 + (w - 0.5) * 0.22 + (n[i] - 0.5) * 0.18);
          const g = v * 255;
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c;
    }, { repeat: [4, 3] });
  },

  weaveNormal() {
    return tex('weaveNormal', () => {
      const S = px(512);
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const period = Math.max(3, Math.round(S / 96));
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const cx = Math.cos((x / period) * 6.2832) * 0.5 + 0.5;
          const cy = Math.cos((y / period) * 6.2832) * 0.5 + 0.5;
          const over = ((((x / period) | 0) + ((y / period) | 0)) % 2) === 0;
          const g = (over ? cx * 0.8 + 0.2 : cy * 0.8 + 0.2) * 255;
          const i = (y * S + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return normalFromCanvas(c, 1.1);
    }, { repeat: [4, 3] });
  },

  /* ---- papel -------------------------------------------- */

  paperColor() {
    return tex('paperColor', () => {
      const S = px(512);
      const f = fbm(S, { octaves: 5, freq: 12, seed: 81 });
      const c = fieldToCanvas(f, S, (v) => {
        const t = clamp01(v);
        return [lerp(150, 178, t), lerp(146, 172, t), lerp(132, 156, t)];
      });
      /* linhas de texto impresso, quase ilegíveis — só a mancha tipográfica */
      const ctx = c.getContext('2d');
      const rnd = rng(82);
      ctx.fillStyle = 'rgba(30,30,34,0.55)';
      const m = S * 0.14;
      let y = m;
      while (y < S - m) {
        let x = m;
        const words = 4 + (rnd() * 7) | 0;
        for (let w = 0; w < words; w++) {
          const ww = S * (0.02 + rnd() * 0.075);
          if (x + ww > S - m) break;
          ctx.fillRect(x, y, ww, Math.max(1, S / 220));
          x += ww + S * 0.014;
        }
        y += S * 0.031;
        if (rnd() < 0.08) y += S * 0.03;
      }
      return c;
    }, { srgb: true });
  },

  /* ---- LEDs e emissores --------------------------------- */

  /** Gradiente radial suave: halo de LED, brilho de janela. */
  glow(colorA = '#ffffff', colorB = 'rgba(255,255,255,0)') {
    return tex('glow' + colorA + colorB, () => {
      const S = 128;
      const c = canvas2d(S, S);
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, colorA);
      g.addColorStop(0.35, colorA);
      g.addColorStop(1, colorB);
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      return c;
    }, { srgb: true, mips: true, aniso: false });
  },

  /** Vista noturna pela janela: céu, prédios distantes, luzes acesas. */
  nightWindow() {
    return tex('nightWindow', () => {
      const W = px(512), H = Math.round(W * 0.62);
      const c = canvas2d(W, W);
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, W);
      g.addColorStop(0, '#0a1526');
      g.addColorStop(0.55, '#132542');
      g.addColorStop(1, '#1d3355');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);

      const rnd = rng(909);
      /* silhuetas de prédios */
      let x = 0;
      while (x < W) {
        const bw = W * (0.05 + rnd() * 0.12);
        const bh = W * (0.16 + rnd() * 0.44);
        const top = W - bh;
        ctx.fillStyle = `rgba(6,10,18,${0.75 + rnd() * 0.2})`;
        ctx.fillRect(x, top, bw, bh);
        /* janelas acesas */
        const cols = Math.max(1, (bw / (W * 0.022)) | 0);
        const rows = Math.max(1, (bh / (W * 0.03)) | 0);
        for (let cix = 0; cix < cols; cix++) {
          for (let riy = 0; riy < rows; riy++) {
            if (rnd() < 0.24) {
              const wx = x + W * 0.006 + cix * W * 0.022;
              const wy = top + W * 0.008 + riy * W * 0.03;
              ctx.fillStyle = rnd() < 0.75 ? 'rgba(255,214,138,0.85)' : 'rgba(160,200,255,0.8)';
              ctx.fillRect(wx, wy, W * 0.010, W * 0.014);
            }
          }
        }
        x += bw + W * 0.004;
      }
      /* neblina */
      ctx.fillStyle = 'rgba(30,60,105,0.28)';
      ctx.fillRect(0, W * 0.55, W, W * 0.45);
      void H;
      return c;
    }, { srgb: true, aniso: true });
  }
};
