/* =========================================================
   materials.js — biblioteca de materiais PBR da cena.

   Todos os mapas vêm de `textures.js` (procedurais). Os materiais
   são criados uma vez e reutilizados; `Mat.dispose()` limpa tudo.

   Regra de leitura: quase nada nesta cena é liso ou limpo. Cada
   material carrega rugosidade variável e microrrelevo — é isso que
   faz a luz da tela "correr" pelas superfícies em vez de bater
   chapado.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Tex } from './textures.js';

const made = [];
function reg(m) { made.push(m); return m; }
const HI = () => CFG.tier === 'high';
const LOW = () => CFG.tier === 'low';

/* Repetição de textura em metros: mantém a escala do grão coerente
   entre objetos de tamanhos diferentes. */
function repeat(t, x, y) {
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  made.push(c);
  return c;
}

export const Mat = {

  /* ---------- monitor ---------------------------------- */

  /** Bisel: plástico grafite escuro, microarranhado, com verniz fraco. */
  bezel() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x1b1e22,
      map: Tex.plasticColor(11, [27, 29, 33], 9),
      roughness: 1.0,
      roughnessMap: repeat(Tex.plasticRough(11, 0.58, 0.22), 2, 2),
      normalMap: repeat(Tex.plasticNormal(11, 0.85), 3, 3),
      normalScale: new THREE.Vector2(0.42, 0.42),
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.22,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.55,
      dithering: true
    }));
  },

  /** Carcaça: o mesmo plástico, um tom acima e mais fosco (menos tocado). */
  casing() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x212429,
      map: Tex.plasticColor(14, [33, 35, 40], 12),
      roughness: 1.0,
      roughnessMap: repeat(Tex.plasticRough(14, 0.72, 0.18), 1.4, 1.4),
      normalMap: repeat(Tex.plasticNormal(14, 0.8), 2, 2),
      normalScale: new THREE.Vector2(0.5, 0.5),
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.10,
      clearcoatRoughness: 0.7,
      envMapIntensity: 0.4,
      dithering: true
    }));
  },

  /** Máscara preta do tubo, em volta da área de imagem. */
  tubeMask() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.85,
      dithering: true
    }));
  },

  /**
   * Vidro da frente. Blending aditivo: a base é preta, então só o que
   * ele *acrescenta* aparece — reflexo do ambiente, fresnel e a poeira
   * acesa pela própria luz da tela. É como o vidro se comporta de fato
   * sobre uma imagem emissiva.
   */
  screenGlass() {
    /* O vidro é desenhado com mistura ADITIVA por cima da interface.
       Se ele responder a luzes pontuais, o clearcoat devolve um ponto
       especular branco bem no meio da tela — e o bloom transforma esse
       ponto num borrão que engole o texto.

       Um vidro de CRT não precisa de iluminação analítica: o que se vê
       nele é o REFLEXO DO AMBIENTE, a poeira e as digitais. Então o
       material ignora luzes de propósito e trabalha só com o envMap.
       É mais barato e é o que produz a imagem correta. */
    const m = new THREE.MeshBasicMaterial({
      color: 0x0a0f14,
      /* a rugosidade vira máscara de opacidade: onde há poeira e
         digital, o reflexo aparece; no vidro limpo, quase nada */
      alphaMap: Tex.glassRough(),
      map: Tex.dust(),
      envMap: null,                  /* preenchido por applyEnvironment */
      combine: THREE.AddOperation,
      reflectivity: 0.55,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
      dithering: true
    });
    m.userData.isGlass = true;
    return reg(m);
  },

  /** Botões do painel frontal. */
  button() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x2a2e34,
      roughness: 0.52,
      metalness: 0.0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.7
    }));
  },

  /* ---------- metais ----------------------------------- */

  /** Alumínio escovado: estrias horizontais + anisotropia real no tier alto. */
  brushedMetal(color = 0x8d9299) {
    const m = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 1.0,
      roughness: 1.0,
      roughnessMap: repeat(Tex.brushedRough(), 1, 1),
      normalMap: repeat(Tex.brushedNormal(), 1, 1),
      normalScale: new THREE.Vector2(0.3, 0.3),
      envMapIntensity: 1.0
    });
    if (HI()) { m.anisotropy = 0.7; m.anisotropyRotation = 0; }
    return reg(m);
  },

  /** Metal pintado escuro (chassi do modem, haste do monitor). */
  darkMetal() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x15181c,
      metalness: 0.85,
      roughness: 0.46,
      roughnessMap: repeat(Tex.plasticRough(19, 0.5, 0.3), 2, 2),
      envMapIntensity: 0.8
    }));
  },

  /* ---------- mesa e ambiente -------------------------- */

  desk() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: Tex.woodColor(),
      roughnessMap: Tex.woodRough(),
      roughness: 1.0,
      normalMap: Tex.woodNormal(),
      normalScale: new THREE.Vector2(0.55, 0.55),
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.28,       /* verniz da mesa */
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.45
    }));
  },

  wall() {
    return reg(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: Tex.plasterColor(),
      roughness: 0.94,
      normalMap: Tex.plasterNormal(),
      normalScale: new THREE.Vector2(0.8, 0.8),
      metalness: 0.0,
      envMapIntensity: 0.35
    }));
  },

  floor() {
    return reg(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: Tex.concreteColor(),
      roughness: 0.82,
      normalMap: Tex.concreteNormal(),
      normalScale: new THREE.Vector2(0.6, 0.6),
      metalness: 0.0,
      envMapIntensity: 0.3
    }));
  },

  /* ---------- periféricos ------------------------------ */

  keyboardBody() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x1a1d21,
      roughness: 1.0,
      roughnessMap: repeat(Tex.plasticRough(23, 0.66, 0.2), 3, 1.5),
      normalMap: repeat(Tex.plasticNormal(23, 0.7), 4, 2),
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.12,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.5
    }));
  },

  /** Teclas: ABS gasto, com brilho de dedo no topo. */
  keycap() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x24282d,
      roughness: 0.68,
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.20,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.6
    }));
  },

  mouse() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x1d2126,
      roughness: 0.44,
      metalness: 0.0,
      clearcoat: LOW() ? 0.0 : 0.5,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.7
    }));
  },

  mousepad() {
    return reg(new THREE.MeshStandardMaterial({
      color: 0x0e1114,
      roughness: 1.0,
      roughnessMap: Tex.weaveRough(),
      normalMap: Tex.weaveNormal(),
      normalScale: new THREE.Vector2(0.6, 0.6),
      metalness: 0.0,
      envMapIntensity: 0.25
    }));
  },

  /** Borracha dos cabos: fosca, com relevo de extrusão. */
  cable() {
    return reg(new THREE.MeshStandardMaterial({
      color: 0x0c0e11,
      roughness: 0.86,
      roughnessMap: repeat(Tex.plasticRough(29, 0.8, 0.22), 24, 1),
      metalness: 0.0,
      envMapIntensity: 0.35
    }));
  },

  paper() {
    return reg(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: Tex.paperColor(),
      roughness: 0.93,
      metalness: 0.0,
      envMapIntensity: 0.5,
      side: THREE.DoubleSide
    }));
  },

  ceramic() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x2b3138,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.0
    }));
  },

  coffee() {
    return reg(new THREE.MeshPhysicalMaterial({
      color: 0x140c07,
      roughness: 0.08,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.4
    }));
  },

  /* ---------- emissores -------------------------------- */

  /** LED aceso: cor pura acima de 1 para o bloom morder. */
  led(color = 0x53ff9a, gain = 2.6) {
    const c = new THREE.Color(color).multiplyScalar(gain);
    return reg(new THREE.MeshBasicMaterial({ color: c, toneMapped: true }));
  },

  /** Halo do LED — quadradinho com gradiente, sempre voltado ao redor. */
  ledHalo(color = '#53ff9a') {
    return reg(new THREE.MeshBasicMaterial({
      map: Tex.glow(color, 'rgba(0,0,0,0)'),
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true
    }));
  },

  windowPane() {
    return reg(new THREE.MeshBasicMaterial({
      map: Tex.nightWindow(),
      toneMapped: true
    }));
  },

  dispose() {
    for (const m of made) m.dispose();
    made.length = 0;
  }
};

/**
 * Aplica o mapa de ambiente.
 *
 * `scene.environment` alcança os materiais PBR sozinho, mas NÃO chega ao
 * `MeshBasicMaterial` — e é justamente ele que o vidro usa, para não
 * responder a luzes pontuais. Então o vidro recebe o mapa na mão.
 */
export function applyEnvironment(scene, envTexture, intensity = 1) {
  scene.environment = envTexture;
  scene.environmentIntensity = intensity;
  scene.traverse(o => {
    if (o.isMesh && o.material && o.material.userData && o.material.userData.isGlass) {
      o.material.envMap = envTexture;
      o.material.needsUpdate = true;
    }
  });
}
