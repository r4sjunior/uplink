/* =========================================================
   pipeline.js — a cadeia de pós-processamento.

   Ordem, e o porquê de cada posição:

     1. RenderPass        a cena, em half-float linear
     2. GTAO              oclusão de contato; precisa de profundidade,
                          então vem antes de qualquer distorção
     3. Bloom             sangramento do fósforo, ainda em linear
     4. Defocus           desfoque radial mínimo; antes do CRT, senão
                          borraria a máscara de fósforo junto
     5. SMAA / FXAA       o antialiasing vem ANTES do CRT. Depois dele,
                          a máscara de tríades vira serrilha para o
                          filtro e o texto perde definição
     6. CRT               barril, aperture grille, scanline, aberração,
                          persistência, flicker, brilho de vidro, vinheta
     7. Grade             tone mapping ACES, LUT, lift/gamma/gain, saída
                          em sRGB — a conversão de cor acontece aqui, uma
                          única vez
     8. Grain             por último: grão é da película, não do tubo,
                          e precisa ficar por cima de tudo

   Tudo é parametrizável em tempo real por `set('crt.barrel', 0.03)`.
   ========================================================= */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { CFG } from '../../config.js';
import { CRTPass } from './crtpass.js';
import { GradeShader } from './shaders/grade.js';
import { GrainShader } from './shaders/grain.js';
import { DefocusShader } from './shaders/defocus.js';
import { buildLut } from './lut.js';

const LOW = () => CFG.tier === 'low';
const HI = () => CFG.tier === 'high';

/* Passe de oclusão: só no tier que aguenta, e carregado sob demanda
   para não pagar o parse do módulo em máquina fraca. */
async function loadGTAO() {
  try {
    const m = await import('three/addons/postprocessing/GTAOPass.js');
    return m.GTAOPass;
  } catch (e) {
    console.warn('[post] GTAO indisponível, seguindo sem oclusão:', e.message);
    return null;
  }
}

export const Post = {
  async build({ renderer, scene, camera, width, height }) {
    const w = Math.max(1, width || innerWidth);
    const h = Math.max(1, height || innerHeight);

    /* --------------------------------------------------
       composer em half-float: o bloom precisa de faixa
       além de 1.0 para o fósforo sangrar de verdade
       -------------------------------------------------- */
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      samples: (!CFG.post.taa && HI()) ? 4 : 0     /* MSAA no alvo, quando dá */
    }));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);

    const passes = {};

    /* 1. cena */
    passes.render = new RenderPass(scene, camera);
    composer.addPass(passes.render);

    /* 2. oclusão de ambiente */
    if (CFG.post.ao.enabled) {
      const GTAOPass = await loadGTAO();
      if (GTAOPass) {
        const gtao = new GTAOPass(scene, camera, w, h);
        gtao.output = GTAOPass.OUTPUT.Default;
        /* a cena é pequena (uma mesa): o raio precisa ser curto,
           senão a oclusão vira sujeira cinza no bisel inteiro */
        gtao.updateGtaoMaterial({
          radius: CFG.post.ao.radius,
          distanceExponent: 1.6,
          thickness: 0.35,
          scale: CFG.post.ao.intensity,
          samples: HI() ? 16 : 8,
          screenSpaceRadius: false
        });
        gtao.blendIntensity = CFG.post.ao.intensity;
        composer.addPass(gtao);
        passes.gtao = gtao;
      }
    }

    /* 3. bloom */
    if (CFG.post.bloom.enabled) {
      const b = CFG.post.bloom;
      passes.bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h), b.strength, b.radius, b.threshold
      );
      composer.addPass(passes.bloom);
    }

    /* 4. desfoque radial */
    if (CFG.post.dof.enabled) {
      passes.defocus = new ShaderPass(DefocusShader);
      passes.defocus.uniforms.uAperture.value = CFG.post.dof.aperture;
      passes.defocus.uniforms.uFocus.value = CFG.post.dof.focus;
      composer.addPass(passes.defocus);
    }

    /* 5. antialiasing (antes do CRT) */
    if (CFG.post.fxaa || (!HI() && !CFG.post.taa)) {
      passes.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(passes.fxaa);
    }

    /* 6. o tubo */
    if (CFG.post.crt.enabled) {
      const crt = new CRTPass(w, h);
      const c = CFG.post.crt;
      crt.uniforms.uBarrel.value = c.barrel;
      crt.uniforms.uScan.value = c.scanline;
      crt.uniforms.uAperture.value = c.aperture;
      crt.uniforms.uChroma.value = c.chroma;
      crt.uniforms.uVignette.value = c.vignette;
      crt.uniforms.uGlare.value = c.glare;
      crt.uniforms.uFlicker.value = c.flicker;
      /* persistência por canal: o verde do fósforo P22 é o que mais
         retém, o azul é o que menos — é essa assimetria que faz o
         rastro parecer de tubo e não de motion blur */
      crt.uniforms.uKeep.value.set(
        c.persistence * 0.72, c.persistence, c.persistence * 0.46
      );
      composer.addPass(crt);
      passes.crt = crt;
    }

    /* 7. correção de cor e saída */
    passes.grade = new ShaderPass(GradeShader);
    {
      const g = CFG.post.grade;
      const u = passes.grade.uniforms;
      u.uLift.value = g.lift;
      u.uGamma.value = g.gamma;
      u.uGain.value = g.gain;
      u.uSat.value = g.sat;
      u.uTemp.value = g.temp;
      u.uExposure.value = 1.0;
      const lut = buildLut();
      if (lut) {
        u.tLut.value = lut;
        u.uLutSize.value = 32;
        /* a LUT entra por baixo, não por cima: ela dá o desvio frio do
           Uplink sem tomar conta da imagem */
        u.uLutMix.value = 0.72;
      }
    }
    composer.addPass(passes.grade);

    /* 8. grão */
    if (CFG.post.grain.enabled) {
      passes.grain = new ShaderPass(GrainShader);
      passes.grain.uniforms.uAmount.value = CFG.post.grain.amount;
      composer.addPass(passes.grain);
    }

    /* o último passe precisa escrever na tela */
    const last = composer.passes[composer.passes.length - 1];
    last.renderToScreen = true;

    /* --------------------------------------------------
       resolução dependente: uniforms de tamanho
       -------------------------------------------------- */
    let pr = renderer.getPixelRatio();
    function aplicaTamanho(W, H) {
      const dw = W * pr, dh = H * pr;
      if (passes.fxaa) passes.fxaa.material.uniforms.resolution.value.set(1 / dw, 1 / dh);
      if (passes.grade) passes.grade.uniforms.uRes.value.set(dw, dh);
      if (passes.grain) passes.grain.uniforms.uRes.value.set(dw, dh);
      if (passes.defocus) passes.defocus.uniforms.uRes.value.set(dw, dh);
      if (passes.crt) {
        passes.crt.uniforms.uRes.value.set(dw, dh);
        /* O passo da máscara e da scanline é em PIXELS DE TELA, não em
           UV. Amarrar ao pixel físico é o que impede o moiré quando a
           janela muda de tamanho: a tríade sempre ocupa o mesmo número
           de pixels reais. Abaixo de ~2px a máscara vira ruído, então
           ela some por baixo em vez de brigar. */
        const passo = Math.max(2.0, Math.round(dh / 360));
        passes.crt.uniforms.uPitch.value = passo;
        passes.crt.uniforms.uScanPitch.value = Math.max(2.0, Math.round(dh / 340));
        passes.crt.uniforms.uEdge.value = 1.0;
      }
    }
    aplicaTamanho(w, h);

    let tempo = 0;

    /* --------------------------------------------------
       API pública
       -------------------------------------------------- */
    const api = {
      enabled: true,
      composer,
      passes,

      render(dt) {
        tempo += dt;
        if (passes.crt) passes.crt.uniforms.uTime.value = tempo;
        if (passes.grain) {
          /* semente nova por quadro: o grão não pode "grudar" na imagem */
          passes.grain.uniforms.uSeed.value.set(Math.random(), Math.random());
        }
        composer.render(dt);
      },

      setSize(W, H) {
        pr = renderer.getPixelRatio();
        composer.setPixelRatio(pr);
        composer.setSize(W, H);
        if (passes.gtao) passes.gtao.setSize(W, H);
        if (passes.bloom) passes.bloom.setSize(W, H);
        if (passes.crt) passes.crt.setSize(W * pr, H * pr);
        aplicaTamanho(W, H);
      },

      /** set('crt.barrel', 0.03) — ajuste ao vivo, para calibrar sem recarregar. */
      set(path, value) {
        const [grupo, chave] = String(path).split('.');
        const mapa = {
          bloom: { strength: 'strength', radius: 'radius', threshold: 'threshold' },
          crt: {
            barrel: 'uBarrel', scanline: 'uScan', aperture: 'uAperture',
            chroma: 'uChroma', vignette: 'uVignette', glare: 'uGlare',
            flicker: 'uFlicker', pitch: 'uPitch'
          },
          grade: {
            lift: 'uLift', gamma: 'uGamma', gain: 'uGain',
            sat: 'uSat', temp: 'uTemp', exposure: 'uExposure', lutMix: 'uLutMix'
          },
          grain: { amount: 'uAmount' },
          dof: { aperture: 'uAperture', focus: 'uFocus' }
        };

        if (grupo === 'bloom' && passes.bloom) {
          passes.bloom[mapa.bloom[chave]] = value;
          return true;
        }
        if (grupo === 'crt' && passes.crt) {
          if (chave === 'persistence') {
            passes.crt.uniforms.uKeep.value.set(value * 0.72, value, value * 0.46);
            return true;
          }
          const u = mapa.crt[chave];
          if (u && passes.crt.uniforms[u]) { passes.crt.uniforms[u].value = value; return true; }
        }
        const alvo = passes[grupo];
        if (alvo && alvo.uniforms && mapa[grupo] && mapa[grupo][chave]) {
          alvo.uniforms[mapa[grupo][chave]].value = value;
          return true;
        }
        return false;
      },

      dispose() {
        composer.passes.forEach(p => { if (p.dispose) p.dispose(); });
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
    };

    /* respeita ?nopost */
    if (!CFG.post.enabled) {
      api.enabled = false;
      api.render = () => renderer.render(scene, camera);
    }

    return api;
  }
};
