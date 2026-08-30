/* =========================================================
   grade.js — o único ponto da cadeia onde acontece tone
   mapping e conversão para sRGB. Entra linear (HDR), sai em
   espaço de exibição. Depois daqui ninguém mais mexe em gama.

   Ordem: ganho e temperatura em linear -> ACES -> sRGB ->
   lift, gama, saturação e LUT 3D em espaço de exibição.
   ========================================================= */
import { Vector2 } from 'three';
import { FULLSCREEN_VS, COLOR_GLSL } from './common.js';

export const GradeShader = {
  name: 'UplinkGrade',

  uniforms: {
    tDiffuse:  { value: null },
    tLut:      { value: null },
    uRes:      { value: new Vector2( 1920, 1080 ) },
    uExposure: { value: 1.0 },
    uGain:     { value: 1.02 },
    uTemp:     { value: -0.03 },
    uLift:     { value: 0.008 },
    uGamma:    { value: 1.0 },
    uSat:      { value: 1.06 },
    uLutMix:   { value: 0.0 },
    uLutSize:  { value: 32.0 }
  },

  vertexShader: FULLSCREEN_VS,

  fragmentShader: /* glsl */`
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tLut;
uniform float uExposure;
uniform float uGain;
uniform float uTemp;
uniform float uLift;
uniform float uGamma;
uniform float uSat;
uniform float uLutMix;
uniform float uLutSize;

varying vec2 vUv;

${COLOR_GLSL}

/* LUT 3D empacotada como tira 2D (N fatias de NxN lado a lado).
   O meio-texel de recuo impede que o filtro bilinear vaze de uma
   fatia azul para a vizinha. */
vec3 applyLut( vec3 c ) {
  float N = uLutSize;
  c = clamp( c, 0.0, 1.0 );

  float bz = c.b * ( N - 1.0 );
  float b0 = floor( bz );
  float b1 = min( b0 + 1.0, N - 1.0 );
  float f  = bz - b0;

  float u = ( c.r * ( N - 1.0 ) + 0.5 ) / ( N * N );
  float v = ( c.g * ( N - 1.0 ) + 0.5 ) / N;

  vec3 s0 = texture2D( tLut, vec2( u + b0 / N, v ) ).rgb;
  vec3 s1 = texture2D( tLut, vec2( u + b1 / N, v ) ).rgb;
  return mix( s0, s1, f );
}

void main() {

  vec4 texel = texture2D( tDiffuse, vUv );
  vec3 c = max( texel.rgb, vec3( 0.0 ) );

  /* --- domínio linear --------------------------------------------- */
  c *= uGain;
  /* temperatura: negativo esfria (menos vermelho, mais azul) */
  c *= vec3( 1.0 + uTemp, 1.0 - abs( uTemp ) * 0.12, 1.0 - uTemp );

  c = acesFilmic( c, uExposure );
  c = toSRGB( c );

  /* --- domínio de exibição ----------------------------------------
     lift aqui e não em linear: 0.008 em linear viraria ~9% depois da
     gama e lavaria o preto do Uplink. Aqui é 0.8%, exatamente o véu
     de um tubo apagado. */
  c = c * ( 1.0 - uLift ) + uLift;
  c = pow( max( c, vec3( 0.0 ) ), vec3( 1.0 / max( uGamma, 0.05 ) ) );

  float l = dot( c, LUMA );
  c = clamp( mix( vec3( l ), c, uSat ), 0.0, 1.0 );

  if ( uLutMix > 0.001 ) c = mix( c, applyLut( c ), uLutMix );

  gl_FragColor = vec4( c, texel.a );
}`
};
