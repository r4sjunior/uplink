/* =========================================================
   common.js — pedaços de GLSL compartilhados pelos passes
   de pós-processamento do UPLINK.
   ========================================================= */

/* Vertex shader único de quad em tela cheia. */
export const FULLSCREEN_VS = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

/* Luminância Rec.709 e utilidades de espaço de cor.
   O tone mapping replica exatamente o ACESFilmic do Three.js para que
   ligar e desligar o pós-processamento não mude a cor de base. */
export const COLOR_GLSL = /* glsl */`
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

vec3 rrtAndOdtFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

vec3 acesFilmic( vec3 color, float exposure ) {
  const mat3 ACES_IN = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  const mat3 ACES_OUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
  );
  color *= exposure / 0.6;
  color = ACES_IN * color;
  color = rrtAndOdtFit( color );
  color = ACES_OUT * color;
  return clamp( color, 0.0, 1.0 );
}

/* linear -> sRGB (mesma curva do renderer). Aplicada UMA única vez. */
vec3 toSRGB( vec3 c ) {
  c = max( c, vec3( 0.0 ) );
  return mix( pow( c, vec3( 0.41666 ) ) * 1.055 - 0.055, c * 12.92, vec3( lessThanEqual( c, vec3( 0.0031308 ) ) ) );
}`;
