/* =========================================================
   blit.js — cópia crua, sem qualquer transformação de cor.
   Usada pelo passe de CRT para levar o alvo de histórico
   até o buffer de saída.
   ========================================================= */
import { FULLSCREEN_VS } from './common.js';

export const BlitShader = {
  name: 'UplinkBlit',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: FULLSCREEN_VS,
  fragmentShader: /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D( tDiffuse, vUv );
}`
};
