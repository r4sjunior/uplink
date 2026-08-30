/* =========================================================
   defocus.js — profundidade de campo do tier alto.

   Deliberadamente NÃO é um bokeh por profundidade: a tela do
   monitor é um plano quase paralelo à câmera, então um DOF
   por z borraria o texto inteiro de uma vez. O que se quer é
   a curvatura de campo da lente — centro cravado, extremos
   levemente fora de foco. Isso é radial, não por z, e por
   construção não pode tocar no miolo da imagem.
   ========================================================= */
import { Vector2 } from 'three';
import { FULLSCREEN_VS } from './common.js';

export const DefocusShader = {
  name: 'UplinkDefocus',

  uniforms: {
    tDiffuse:  { value: null },
    uRes:      { value: new Vector2( 1920, 1080 ) },
    uAperture: { value: 0.0009 },
    uFocus:    { value: 1.0 }
  },

  vertexShader: FULLSCREEN_VS,

  fragmentShader: /* glsl */`
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2  uRes;
uniform float uAperture;
uniform float uFocus;

varying vec2 vUv;

void main() {
  vec2  p = vUv * 2.0 - 1.0;
  float r = length( p ) * 0.7071067;                    /* 0 no centro, 1 no canto */

  float onset = clamp( 0.52 / max( uFocus, 0.2 ), 0.05, 0.95 );
  float t     = smoothstep( onset, 1.0, r );
  float rad   = uAperture * 2400.0 * t * t;             /* raio em pixels */

  vec3 c = texture2D( tDiffuse, vUv ).rgb;

  if ( rad > 0.35 ) {
    vec2 e = rad / uRes;
    vec3 s = c;
    s += texture2D( tDiffuse, vUv + vec2(  1.0000,  0.0000 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2(  0.5000,  0.8660 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2( -0.5000,  0.8660 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2( -1.0000,  0.0000 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2( -0.5000, -0.8660 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2(  0.5000, -0.8660 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2(  0.0000,  0.5000 ) * e ).rgb;
    s += texture2D( tDiffuse, vUv + vec2(  0.0000, -0.5000 ) * e ).rgb;
    c = mix( c, s / 9.0, clamp( t, 0.0, 1.0 ) );
  }

  gl_FragColor = vec4( c, 1.0 );
}`
};
