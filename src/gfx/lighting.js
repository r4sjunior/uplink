/* =========================================================
   lighting.js — a luz da sala.

   Regra que organiza tudo: **a tela é a fonte principal**. Não há
   luminária acesa em cima da mesa. O que ilumina o bisel, o teclado
   e as mãos do jogador é o próprio conteúdo da interface.

   Consequência prática: a cor da luz é amostrada da Surface a cada
   poucos quadros. Quando a tela está cheia de verde de terminal, a
   mesa fica esverdeada; quando um alarme vermelho toma a tela, a
   sala inteira avermelha. Isso é o que faz a cena parecer filmada
   em vez de montada.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';

const HI = () => CFG.tier === 'high';
const LOW = () => CFG.tier === 'low';

export function buildLighting({ scene, monitor }) {
  const group = new THREE.Group();
  group.name = 'lighting';

  /* =========================================================
     1. A LUZ DA TELA
     Duas fontes: uma área ampla que banha a mesa e o bisel, e um
     ponto próximo que cria o brilho quente no interior do bisel.
     ========================================================= */
  const screenLight = new THREE.PointLight(0x9fffe0, 0, 2.4, 2.0);
  screenLight.position.set(0, 0.02, 0.16);
  screenLight.castShadow = CFG.gfx.shadows;
  if (screenLight.castShadow) {
    screenLight.shadow.mapSize.set(CFG.gfx.shadowMapSize, CFG.gfx.shadowMapSize);
    screenLight.shadow.bias = -0.0012;
    screenLight.shadow.normalBias = 0.018;
    screenLight.shadow.radius = HI() ? 3 : 1;
    screenLight.shadow.camera.near = 0.02;
    screenLight.shadow.camera.far = 2.6;
  }
  group.add(screenLight);

  /* derrame largo para frente: o que ilumina o teclado e a mesa */
  const spill = new THREE.SpotLight(0x8fffd8, 0, 3.2, Math.PI * 0.44, 0.85, 1.6);
  spill.position.set(0, 0.06, 0.10);
  spill.target.position.set(0, -0.42, 0.62);
  spill.castShadow = false;
  group.add(spill);
  group.add(spill.target);

  /* =========================================================
     2. A JANELA
     Luz fria, direcional, entrando pela esquerda. Define a silhueta
     do monitor contra o fundo e evita que a cena vire um borrão.
     ========================================================= */
  const window = new THREE.DirectionalLight(0x6f9fd0, 0.42);
  window.position.set(-2.6, 1.5, -0.5);
  window.target.position.set(0.1, -0.3, 0.1);
  window.castShadow = CFG.gfx.shadows;
  if (window.castShadow) {
    const d = 1.6;
    window.shadow.mapSize.set(CFG.gfx.shadowMapSize, CFG.gfx.shadowMapSize);
    window.shadow.camera.left = -d;
    window.shadow.camera.right = d;
    window.shadow.camera.top = d;
    window.shadow.camera.bottom = -d;
    window.shadow.camera.near = 0.4;
    window.shadow.camera.far = 6.5;
    window.shadow.bias = -0.0009;
    window.shadow.normalBias = 0.022;
    window.shadow.radius = HI() ? 4 : 2;
  }
  group.add(window);
  group.add(window.target);

  /* =========================================================
     3. PREENCHIMENTO
     Quase nada — só o suficiente para as sombras não serem pretas
     chapadas. O ambiente vem principalmente do envMap.
     ========================================================= */
  const fill = new THREE.HemisphereLight(0x1a2836, 0x0a0806, 0.24);
  group.add(fill);

  /* rebatimento quente da mesa, vindo de baixo */
  const bounce = new THREE.PointLight(0xffb070, 0.10, 1.8, 2.2);
  bounce.position.set(0.1, -0.62, 0.42);
  group.add(bounce);

  /* =========================================================
     4. LED DE ENERGIA
     ========================================================= */
  const led = new THREE.PointLight(0x62ffb4, 0.055, 0.22, 2.4);
  if (monitor && monitor.anchors && monitor.anchors.led) {
    led.position.copy(monitor.anchors.led).add(new THREE.Vector3(0, 0, 0.012));
  }
  group.add(led);

  scene.add(group);

  /* =========================================================
     5. CAMADA DA LUZ DA TELA
     A luz da tela existe para iluminar a SALA. Se ela também
     alcançar o vidro do monitor, o clearcoat devolve um ponto
     especular branco no meio da interface — um artefato que
     nenhuma quantidade de ajuste de intensidade resolve.

     A solução é topológica: a luz vive na camada 1, e a camada 1
     é habilitada em tudo, menos no vidro e na imagem.
     ========================================================= */
  const CAMADA_TELA = 1;
  screenLight.layers.set(CAMADA_TELA);
  spill.layers.set(CAMADA_TELA);
  scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.name === 'crt-glass' || o.name === 'crt-image') return;
    o.layers.enable(CAMADA_TELA);
  });

  /* =========================================================
     ATUALIZAÇÃO
     A amostragem da Surface é cara (lê pixels do canvas), então
     acontece a cada ~6 quadros e o resultado é suavizado. Sem a
     suavização, uma troca de tela viraria um flash.
     ========================================================= */
  const cor = new THREE.Color(0x9fffe0);
  const alvo = new THREE.Color(0x9fffe0);
  let brilho = 0;
  let brilhoAlvo = 0;
  let quadro = 0;
  let ligado = false;           /* o monitor começa apagado e acende no boot */
  let acender = 0;

  /* o boot liga a tela: a luz sobe junto, com um pulso de partida */
  Bus.on(EV.BOOT_DONE, () => { ligado = true; });
  Bus.on(EV.GAME_OVER, () => { ligado = false; });
  Bus.on(EV.GAME_START, () => { ligado = true; });

  /* o alarme e o trace pintam a sala: é o aviso periférico, o
     jogador percebe pelo canto do olho antes de ler a barra */
  let tensao = 0;
  Bus.on(EV.TRACE_TICK, ({ pct }) => { tensao = Math.min(1, pct / 100); });
  Bus.on(EV.TRACE_END, () => { tensao = 0; });
  Bus.on(EV.CONNECT_CLOSE, () => { tensao = 0; });

  return {
    group, screenLight, spill, window, fill, led,

    update(dt, screen) {
      quadro++;

      /* --- acender do monitor: rampa com sobressalto, como tubo real --- */
      if (ligado && acender < 1) acender = Math.min(1, acender + dt * 0.9);
      if (!ligado && acender > 0) acender = Math.max(0, acender - dt * 2.4);
      const kick = acender < 0.35 ? Math.sin(acender * Math.PI / 0.35) * 0.5 : 0;

      /* --- amostra da interface --- */
      if (screen && quadro % (LOW() ? 12 : 6) === 0) {
        const s = screen.sample();
        if (s) {
          alvo.setRGB(
            Math.max(0.04, s.r), Math.max(0.04, s.g), Math.max(0.05, s.b)
          );
          /* a luminância da tela manda na intensidade */
          brilhoAlvo = 0.28 + screen.luminance * 1.65;
        }
      }

      /* --- suavização --- */
      const k = 1 - Math.pow(0.0016, dt);
      cor.lerp(alvo, k);
      brilho += (brilhoAlvo - brilho) * k;

      /* --- tensão do trace: puxa a cor para o vermelho e pulsa --- */
      if (tensao > 0.02) {
        const pulso = 0.5 + 0.5 * Math.sin(performance.now() * 0.001 * (2 + tensao * 9));
        const mistura = tensao * tensao * 0.55;
        cor.lerp(new THREE.Color(0xff2f42), mistura * (0.55 + pulso * 0.45));
      }

      const total = (brilho + kick) * acender;
      screenLight.color.copy(cor);
      screenLight.intensity = total * 1.15;
      spill.color.copy(cor);
      spill.intensity = total * 0.62;
      led.intensity = 0.055 * acender;
      fill.intensity = 0.24 - tensao * 0.06;
    },

    dispose() {
      group.traverse(o => { if (o.dispose) o.dispose(); });
    }
  };
}
