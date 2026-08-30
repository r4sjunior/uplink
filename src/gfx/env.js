/* =========================================================
   env.js — mapa de ambiente procedural.

   O vidro do monitor, o verniz do bisel e o metal só ficam
   convincentes se tiverem algo para refletir. Uma sala real
   reflete: o teto, a janela, a parede atrás.

   Em vez de carregar um HDRI de vários megabytes, montamos uma
   cena mínima de emissores — teto, janela noturna, parede fria,
   chão escuro — e deixamos o PMREMGenerator convertê-la no mapa
   pré-filtrado que o PBR consome. Custa uma vez, no arranque, e
   não pesa no repositório.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';

/* Um plano emissor, orientado por um alvo. */
function panel(w, h, color, intensity, pos, lookAt) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
  );
  m.position.copy(pos);
  if (lookAt) m.lookAt(lookAt);
  return m;
}

/* Gradiente vertical, para o "céu" da sala não ser chapado. */
function gradientDome() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, '#141a22');   /* teto: cinza-azulado fraco */
  g.addColorStop(0.42, '#0a0e13');
  g.addColorStop(0.62, '#070a0e');
  g.addColorStop(1.00, '#04060a');   /* chão: quase preto */
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/* =========================================================
   CONSTRUÇÃO
   ========================================================= */
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const scene = new THREE.Scene();

  /* fundo em gradiente */
  const dome = gradientDome();
  scene.background = dome;

  /* --- a janela: a única fonte grande e fria da sala --- */
  scene.add(panel(
    2.6, 1.7, 0x2f4a6b, 1.35,
    new THREE.Vector3(-2.4, 0.55, -0.6),
    new THREE.Vector3(0, 0.2, 0)
  ));

  /* --- luminária de teto, distante e amarelada, quase apagada --- */
  scene.add(panel(
    1.2, 1.2, 0xffd9a8, 0.35,
    new THREE.Vector3(0.6, 2.3, -0.4),
    new THREE.Vector3(0, 0, 0)
  ));

  /* Nada de emissor na frente do monitor: o vidro usa mistura aditiva,
     então qualquer painel colocado ali é REFLETIDO de volta na tela e
     vira uma mancha de cor sobre a interface. A luz da própria tela é
     tratada em lighting.js, que é o lugar certo dela. */

  /* --- rebatimento da mesa, quente e fraco, vindo de baixo --- */
  scene.add(panel(
    2.0, 1.4, 0x3a2c1e, 0.22,
    new THREE.Vector3(0, -0.62, 0.2),
    new THREE.Vector3(0, 0.3, 0)
  ));

  /* --- LEDs e equipamento de fundo: pontinhos que dão vida ao reflexo --- */
  const pontos = [
    [0x39ff9e, new THREE.Vector3(1.7, -0.28, -1.1)],
    [0xff4d5e, new THREE.Vector3(1.55, -0.18, -1.2)],
    [0x4fa8ff, new THREE.Vector3(-1.8, -0.34, -1.0)],
    [0xffb648, new THREE.Vector3(1.9, 0.10, -1.4)]
  ];
  pontos.forEach(([cor, pos]) => {
    scene.add(panel(0.06, 0.03, cor, 3.0, pos, new THREE.Vector3(0, 0, 0)));
  });

  const rt = pmrem.fromScene(scene, 0.04, 0.1, 20);

  /* a cena de ambiente só existia para gerar o mapa */
  scene.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
  dome.dispose();
  pmrem.dispose();

  return rt.texture;
}
