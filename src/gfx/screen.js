/* =========================================================
   screen.js — a malha da tela do CRT.

   Três camadas curvas encaixadas, todas geradas com a mesma função
   de curvatura para nunca se cruzarem:

     1. máscara do tubo  — a borda preta em volta da imagem
     2. imagem           — a textura vinda de `surface` (a interface)
     3. vidro            — reflexo do ambiente, poeira e digitais

   A curvatura é paramétrica (`CFG.gfx.screenCurve`) mas os UVs
   continuam uniformes: x e y são lineares em (u,v), então a UV que
   o raycast devolve é exatamente `x/W+0.5, y/H+0.5`. A interface
   segue clicável pixel a pixel, mesmo com o vidro abaulado.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Mat } from './materials.js';

/* Dimensões físicas, em metros. Um tubo widescreen de ~21". */
export const SCREEN = {
  IMG_W: 0.460,
  IMG_H: 0.460 * 9 / 16,     /* 0.25875 — a Surface é 16:9 */
  TUBE_W: 0.472,
  TUBE_H: 0.2708,
  OPEN_W: 0.468,             /* vão do bisel */
  OPEN_H: 0.2668,
  BEZEL_W: 0.504,
  BEZEL_H: 0.3028,
  FRONT_Z: 0.020,            /* plano frontal do bisel */
  get SAG() { return CFG.gfx.screenCurve * this.IMG_W * 0.5; }
};

/** Ganho aplicado à imagem antes do tone mapping ACES. */
const SCREEN_GAIN = 1.42;

/**
 * Painel curvo com UVs uniformes.
 * A altura z depende só de (nx, ny) normalizados pelo *tubo de
 * referência*, então camadas de tamanhos diferentes ficam paralelas.
 */
export function curvedPanel(w, h, opts = {}) {
  const {
    refW = SCREEN.TUBE_W, refH = SCREEN.TUBE_H,
    sag = SCREEN.SAG, dz = 0,
    segX = 48, segY = 28,
    kx = 0.60, ky = 0.40
  } = opts;

  const geo = new THREE.PlaneGeometry(w, h, segX, segY);
  const pos = geo.attributes.position;
  const hx = refW / 2, hy = refH / 2;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.min(1, Math.abs(pos.getX(i)) / hx) * Math.sign(pos.getX(i));
    const ny = Math.min(1, Math.abs(pos.getY(i)) / hy) * Math.sign(pos.getY(i));
    const z = sag * (kx * (1 - nx * nx) + ky * (1 - ny * ny));
    pos.setZ(i, z + dz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function segsForTier() {
  if (CFG.tier === 'high') return [72, 42];
  if (CFG.tier === 'medium') return [48, 28];
  return [30, 18];
}

/* --------------------------------------------------------
   amostragem da cor média da interface
   -------------------------------------------------------- */
class ScreenSampler {
  constructor(surface) {
    this.surface = surface;
    this.w = 16; this.h = 9;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.color = new THREE.Color(0.10, 0.22, 0.36);
    this.lum = 0.16;
    this._tmp = new THREE.Color();
    this.ok = true;
  }

  /** Redesenha a miniatura e devolve a cor média em espaço linear. */
  sample() {
    if (!this.ok) return this.color;
    try {
      this.ctx.drawImage(this.surface.canvas, 0, 0, this.w, this.h);
      const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
      let r = 0, g = 0, b = 0;
      const n = this.w * this.h;
      for (let i = 0; i < n; i++) {
        /* sRGB → linear, para a média ser fotometricamente correta */
        const cr = d[i * 4] / 255, cg = d[i * 4 + 1] / 255, cb = d[i * 4 + 2] / 255;
        r += cr <= 0.04045 ? cr / 12.92 : Math.pow((cr + 0.055) / 1.055, 2.4);
        g += cg <= 0.04045 ? cg / 12.92 : Math.pow((cg + 0.055) / 1.055, 2.4);
        b += cb <= 0.04045 ? cb / 12.92 : Math.pow((cb + 0.055) / 1.055, 2.4);
      }
      r /= n; g /= n; b /= n;
      this.lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      /* normaliza a matiz: a *cor* vai para a luz, o brilho vai à parte */
      const m = Math.max(r, g, b, 1e-4);
      this._tmp.setRGB(r / m, g / m, b / m, THREE.LinearSRGBColorSpace);
      /* dessatura um pouco — luz indireta nunca é tão saturada quanto a fonte */
      this.color.copy(this._tmp).lerp(new THREE.Color(1, 1, 1), 0.22);
    } catch (e) {
      this.ok = false;    /* canvas contaminado: mantém a última cor válida */
    }
    return this.color;
  }
}

/* --------------------------------------------------------
   construção
   -------------------------------------------------------- */
export function buildScreen({ surface, renderer }) {
  const group = new THREE.Group();
  group.name = 'crt-screen';
  const [sx, sy] = segsForTier();

  /* --- 1. máscara preta do tubo --- */
  const maskGeo = curvedPanel(SCREEN.TUBE_W, SCREEN.TUBE_H, { segX: Math.round(sx * 0.5), segY: Math.round(sy * 0.5), dz: -0.0022 });
  const mask = new THREE.Mesh(maskGeo, Mat.tubeMask());
  mask.name = 'tube-mask';
  mask.renderOrder = 0;
  group.add(mask);

  /* --- 2. a imagem: a Surface como textura --- */
  const tex = new THREE.CanvasTexture(surface.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  /* SEM mipmap. Cada `needsUpdate` reenvia a textura para a GPU, e com
     mipmap ligado a GPU ainda reconstrói a pirâmide inteira — num
     canvas do tamanho da interface isso é o item mais caro do quadro,
     e ele acontece a cada movimento do mouse.
     A tela ocupa ~86% da altura do viewport, então a minificação é
     pequena e a anisotropia dá conta do cintilar. */
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), CFG.gfx.anisotropy);
  tex.needsUpdate = true;

  const imgMat = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: true,          /* é um objeto fotografado: passa pelo ACES junto com a cena */
    dithering: true
  });
  imgMat.color.setScalar(SCREEN_GAIN);

  const imgGeo = curvedPanel(SCREEN.IMG_W, SCREEN.IMG_H, { segX: sx, segY: sy, dz: 0.0004 });
  const image = new THREE.Mesh(imgGeo, imgMat);
  image.name = 'crt-image';
  image.renderOrder = 1;
  group.add(image);

  /* --- 3. o vidro --- */
  const glassGeo = curvedPanel(SCREEN.TUBE_W - 0.002, SCREEN.TUBE_H - 0.002, { segX: Math.round(sx * 0.6), segY: Math.round(sy * 0.6), dz: 0.0042 });
  const glass = new THREE.Mesh(glassGeo, Mat.screenGlass());
  glass.name = 'crt-glass';
  glass.renderOrder = 3;
  glass.raycast = () => {};    /* o vidro nunca intercepta o ponteiro */
  group.add(glass);

  const sampler = new ScreenSampler(surface);

  return {
    group, image, glass, mask, texture: tex,
    width: SCREEN.IMG_W, height: SCREEN.IMG_H,

    /** A textura da interface mudou: sobe para a GPU no próximo render. */
    markUpdated() { tex.needsUpdate = true; },

    /** Cor média (linear, normalizada) e luminância da interface. */
    sample() { return sampler.sample(); },
    get luminance() { return sampler.lum; },

    /** Brilho global da tela — usado no fade de boot e no game over. */
    setBrightness(v) { imgMat.color.setScalar(SCREEN_GAIN * v); },

    dispose() {
      maskGeo.dispose(); imgGeo.dispose(); glassGeo.dispose();
      tex.dispose(); imgMat.dispose();
    }
  };
}
