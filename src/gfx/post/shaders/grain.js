/* =========================================================
   grain.js — grão de filme. Roda por último, em espaço de
   exibição, com semente nova a cada frame (descorrelacionado
   no tempo, sem padrão fixo). Mais forte nas sombras e nos
   meios-tons, quase ausente nos brancos: o texto branco fica
   intacto e a sombra ganha vida.
   ========================================================= */
import { Vector2 } from 'three';
import { FULLSCREEN_VS } from './common.js';

export const GrainShader = {
  name: 'UplinkGrain',

  uniforms: {
    tDiffuse: { value: null },
    uRes:     { value: new Vector2( 1920, 1080 ) },
    uSeed:    { value: new Vector2( 0, 0 ) },
    uAmount:  { value: 0.035 }
  },

  vertexShader: FULLSCREEN_VS,

  fragmentShader: /* glsl */`
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2  uRes;
uniform vec2  uSeed;
uniform float uAmount;

varying vec2 vUv;

const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

float hash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}

void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;

  vec2  sp = gl_FragCoord.xy + uSeed;
  float n  = hash( sp ) * 0.65 + hash( sp * 1.7 + 19.3 ) * 0.35;

  float l = dot( c, LUMA );
  float w = uAmount * ( 0.28 + 0.72 * ( 1.0 - smoothstep( 0.15, 0.92, l ) ) );

  c += ( n - 0.5 ) * w;

  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}`
};
